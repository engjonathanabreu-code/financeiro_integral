from pathlib import Path
import psycopg,json,time,urllib.request,urllib.error,urllib.parse,base64,hmac,hashlib,concurrent.futures,os
# Este ensaio só aceita socket PostgreSQL local e API loopback, com identidades sintéticas.
root=Path(os.environ['FINANCEIRO_TEST_DIR']).resolve();repo=Path(__file__).resolve().parents[2]
socket=root/'socket'
api=os.environ.get('FINANCEIRO_TEST_API','http://127.0.0.1:3457')
assert urllib.parse.urlparse(api).scheme=='http' and urllib.parse.urlparse(api).hostname in ('127.0.0.1','localhost')
assert socket.is_dir()

def db():return psycopg.connect(host=str(socket),port=int(os.environ.get('FINANCEIRO_TEST_PORT','55443')),dbname='postgres',autocommit=True)
def uid(n):return '00000000-0000-4000-8000-'+str(n).zfill(12)
def jwt(n):
 enc=lambda value:base64.urlsafe_b64encode(json.dumps(value,separators=(',',':')).encode()).rstrip(b'=')
 raw=enc({'alg':'HS256','typ':'JWT'})+b'.'+enc({'role':'authenticated','sub':uid(n),'exp':int(time.time())+3600})
 return (raw+b'.'+base64.urlsafe_b64encode(hmac.new(b'isolated-test-only-not-a-production-key-20261124',raw,hashlib.sha256).digest()).rstrip(b'=')).decode()
def post(name,payload,n=1,timeout=5):
 headers={'Content-Type':'application/json'}
 if n:headers['Authorization']='Bearer '+jwt(n)
 req=urllib.request.Request(api+'/rpc/'+name,data=json.dumps(payload).encode(),headers=headers)
 started=time.monotonic()
 try:
  with urllib.request.urlopen(req,timeout=timeout) as response:return response.status,json.load(response),time.monotonic()-started
 except urllib.error.HTTPError as exc:return exc.code,json.load(exc),time.monotonic()-started
 except Exception as exc:return type(exc).__name__,str(exc),time.monotonic()-started
with db() as c:
 c.execute("select set_config('request.jwt.claim.sub',%s,false)",(uid(2),))
 req=c.execute('select financeiro_save_invoice_request(%s,null)',(json.dumps({'id':uid(890),'title':'Reparo ABS sintético via HTTP','description':'Peças 315 e mão de obra 80','category':'budget','status':'Pendente','estimatedValue':395,'neededAt':'2026-11-18'}),)).fetchone()[0]
 req=next(r for r in req if r['id']==uid(890))
 before=c.execute("select dados from financeiro_estado_modulos where chave='budgetRecords'").fetchone()[0]
payload={'p_id':req['id'],'p_esperado':req,'p_aprovar':True,'p_resposta':'Aprovado e pago'}
with concurrent.futures.ThreadPoolExecutor() as pool:
 future=pool.submit(post,'financeiro_revisar_solicitacao',payload,1,8)
 time.sleep(1)
 with db() as c:
  stuck=c.execute("select pid,backend_start from pg_stat_activity where usename='authenticator' and state='active' and query like '%financeiro_revisar_solicitacao%'").fetchall()
  assert stuck,'PostgREST 14.5 não reproduziu a espera de 40001'
  assert c.execute("select dados from financeiro_estado_modulos where chave='budgetRecords'").fetchone()[0]==before
  c.execute((repo/'supabase/migrations/20261124202434_financeiro_revisao_conflito_sem_retry.sql').read_text())
  # A orientação oficial exige encerrar os backends antigos: aqui isso é somente local.
  for pid,start in stuck:
   c.execute('select pg_terminate_backend(pid) from pg_stat_activity where pid=%s and backend_start=%s and usename=%s',(pid,start,'authenticator'))
 result=future.result(timeout=10)
 print('BASELINE: HTTP em repetição confirmado; backend local interrompido, sem conversão.',flush=True)
status,data,elapsed=post('financeiro_revisar_solicitacao',payload)
assert status==409 and data['code']=='PT409',(status,data)
assert elapsed<2,elapsed
with db() as c:
 assert c.execute("select dados from financeiro_estado_modulos where chave='budgetRecords'").fetchone()[0]==before
 assert c.execute("select r->>'status' from financeiro_estado_modulos m cross join lateral jsonb_array_elements(m.dados) r where chave='invoiceRequests' and r->>'id'=%s",(req['id'],)).fetchone()[0]=='Pendente'
 c.execute((repo/'supabase/migrations/20261124202455_financeiro_converter_orcamento_fechados.sql').read_text())
status,data,elapsed=post('financeiro_revisar_solicitacao',payload)
assert status==200,(status,data)
approved=next(r for r in data if r['id']==req['id'])
assert approved['status']=='Aprovada' and approved['response']=='Aprovado e pago'
with db() as c:
 current=c.execute("select dados from financeiro_estado_modulos where chave='budgetRecords'").fetchone()[0]
 assert current[:-1]==before and current[-1]['invoiceRequestId']==req['id']
 assert current[-1]['limit']==395
status,retry,_=post('financeiro_revisar_solicitacao',payload)
assert status==200 and next(r for r in retry if r['id']==req['id'])==approved
with db() as c:assert c.execute("select dados from financeiro_estado_modulos where chave='budgetRecords'").fetchone()[0]==current
assert post('financeiro_revisar_solicitacao',payload,n=2)[0]==403
assert post('financeiro_revisar_solicitacao',payload,n=None)[0] in (401,403)
summary={'postgrest_version':'14.5','closed_budget_guard':'real','baseline_infinite_retry_reproduced':True,'phase1_http_status':409,'phase1_request_pending':True,'phase2_http_status':200,'phase2_seconds':round(elapsed,4),'previous_closed_budgets_unchanged':True,'converted_budget_count':1,'retry_idempotent':True,'staff_and_anon_denied':True,'production_requests_sent':0}
(root/'http-result.json').write_text(json.dumps(summary,indent=2))
print(json.dumps(summary),flush=True)
