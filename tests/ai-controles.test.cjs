const test = require('node:test');
const assert = require('node:assert/strict');
const agent = require('../api/agente-financeiro');
const health = require('../api/ai-health');
const receipt = require('../api/ai-receipt');
const classify = require('../api/ai-classify');
const account = require('../api/ai-account');
const receivables = require('../api/ai-receivables');
const vehicle = require('../api/ai-vehicle');
const { foto } = require('./veiculos-fixtures.cjs');

const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\nfixture').toString('base64');
const actor = '00000000-0000-4000-8000-000000000001';
const urlQuota = '/rest/v1/rpc/financeiro_reservar_cota_ia';
const response = () => ({
  statusCode: 200, body: null, chunks: [], ended: false, setHeader() {},
  status(n) { this.statusCode = n; return this; },
  json(b) { this.body = b; return this; },
  write(s) { this.chunks.push(JSON.parse(s)); },
  end() { this.ended = true; }
});
async function call(handler, body = {}, method = 'POST') {
  const res = response();
  await handler({ method, headers: { authorization: 'Bearer fixture' }, body }, res);
  return res;
}
function mocks(t) {
  const before = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'fixture-key';
  agent._test.cache.clear();
  t.after(() => {
    if (before === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = before;
    agent._test.cache.clear();
  });
  const fixture = {
    routes: [], providerCalls: 0, requests: [], profile: 'Administrador',
    quota: () => Response.json(true),
    provider: () => Response.json({ status:'completed', model:'mock', output_text:'OK' }),
    parcels: () => Response.json([])
  };
  t.mock.method(global, 'fetch', async (url, opts) => {
    const target = new URL(url);
    if (target.hostname === 'api.openai.com') {
      fixture.providerCalls++;
      assert.ok(opts.signal instanceof AbortSignal);
      return fixture.provider(opts);
    }
    assert.equal(opts.headers.Authorization, 'Bearer fixture');
    if (target.pathname.endsWith('/auth/v1/user')) return Response.json({ id:actor });
    if (target.pathname.endsWith('/profiles')) return Response.json([{ id:actor, tipo:fixture.profile, setor:fixture.profile, ativo:true }]);
    if (target.pathname === urlQuota) {
      fixture.routes.push(JSON.parse(opts.body).p_rota);
      return fixture.quota();
    }
    if (target.pathname.endsWith('/financeiro_consultor_base')) return Response.json({cashflow:[]});
    if (target.pathname.endsWith('/fin_receb_parcelas')) {
      fixture.requests.push(target.searchParams.get('id'));
      return fixture.parcels(target);
    }
    throw Error('Unexpected request to '+target.pathname);
  });
  return fixture;
}
const requestedPeriod={ start:'2026-10-01',end:'2026-10-02' };

test('health GET is status only, POST needs ADM and reserves its own quota before the probe', async t => {
  const f = mocks(t);
  f.profile='Comercial';
  const status=await call(health,{},'GET');
  assert.equal(status.statusCode,200);
  assert.deepEqual({configured:status.body.configured,tested:status.body.tested,connected:status.body.connected},{configured:true,tested:false,connected:null});
  assert.equal((await call(health)).statusCode,403);
  assert.equal(f.providerCalls,0);
  assert.deepEqual(f.routes,[]);
  f.profile='Administrador';
  assert.equal((await call(health)).body.connected,true);
  assert.equal(f.providerCalls,1);
  f.quota=()=>Response.json(false);
  assert.equal((await call(health)).statusCode,429);
  assert.equal(f.providerCalls,1);
  assert.deepEqual(f.routes,['conexao','conexao']);
  delete process.env.OPENAI_API_KEY;
  assert.equal((await call(health,{},'GET')).body.configured,false);
  assert.equal((await call(health)).statusCode,503);
  assert.deepEqual(f.routes,['conexao','conexao']);
});

test('each inference requires the matching quota; invalid documents and missing key do not consume it', async t => {
  const f=mocks(t);
  assert.equal((await call(receipt,{image:'data:application/pdf;base64,eA=='})).statusCode,415);
  assert.deepEqual(f.routes,[]);
  f.quota=()=>Response.json(false);
  for (const [handler,body,route] of [
    [receipt,{image:pdf},'comprovantes'],
    [account,{image:pdf},'contas'],
    [classify,{rows:[{description:'fixture'}]},'extratos'],
    [receivables,{file:pdf},'recebimentos'],
    [vehicle,{image:foto.dataUrl},'veiculos'],
    [agent,{...requestedPeriod,question:'Compare os indicadores',stream:true},'agente']
  ]) {
    const r=await call(handler,body);
    assert.equal(r.statusCode,429,route);
    assert.equal(r.body.error||r.body.codigo,'AI_QUOTA_EXCEEDED');
    assert.equal(f.routes.at(-1),route);
  }
  assert.equal(f.providerCalls,0);
  f.quota=()=>Response.json({allowed:true});
  assert.equal((await call(receipt,{image:pdf})).statusCode,503);
  const n=f.routes.length;
  delete process.env.OPENAI_API_KEY;
  assert.equal((await call(receipt,{image:pdf})).statusCode,503);
  assert.equal((await call(agent,{...requestedPeriod,question:'Compare os indicadores'})).body.modo,'indicadores');
  assert.equal(f.providerCalls,0);
  assert.equal(f.routes.length,n);
});

test('timeout and provider failure are stable and do not expose provider responses', async t => {
  const f=mocks(t);
  f.provider=()=>{throw new DOMException('erro confidencial','TimeoutError')};
  const timeout=await call(receipt,{image:pdf});
  assert.equal(timeout.statusCode,504);
  assert.equal(timeout.body.error,'AI_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(timeout.body),/confidencial|fixture-key/);
  f.provider=()=>Response.json({error:{message:'segredo do provedor'}},{status:429});
  const upstream=await call(classify,{rows:[{description:'fixture'}]});
  assert.equal(upstream.statusCode,503);
  assert.doesNotMatch(JSON.stringify(upstream.body),/segredo/);
  f.provider=()=>Response.json({status:'incomplete',output_text:'{"value":50}'});
  assert.equal((await call(receipt,{image:pdf})).statusCode,502);
  f.provider=()=>Response.json({status:'completed',output_text:'{}'});
  assert.equal((await call(receipt,{image:pdf})).statusCode,502);
});

test('stream accepts fragmented CRLF and ends with a stable error before an incomplete answer can be accepted', async t => {
  const f=mocks(t), encoder=new TextEncoder();
  const partial='data: '+JSON.stringify({type:'response.output_text.delta',delta:'Parcial'})+'\r\n\r\n';
  f.provider=()=>new Response(new ReadableStream({start(c) {
    c.enqueue(encoder.encode(partial.slice(0,-1)));
    c.enqueue(encoder.encode(partial.slice(-1)));
    c.close();
  }}));
  const r=await call(agent,{ ...requestedPeriod, question:'Qual o saldo?', stream:true });
  assert.equal(r.chunks[0].type,'meta');
  assert.deepEqual(r.chunks[1],{type:'delta',text:'Parcial'});
  assert.equal(r.chunks[2].type,'error');
  assert.equal(r.chunks[2].codigo,'AI_INVALID_RESPONSE');
  assert.equal(r.ended,true);
});

test('Agente follows smaller API pages until empty and does not cache a partial query', async t => {
  const f=mocks(t);
  const rows=Array.from({length:1003},(_,i)=>({
    id:(i+1).toString().padStart(5,'0'),vencimento:'2026-10-01',
    valor_previsto:1,status:'Pendente',valor_liquidado:0
  }));
  f.parcels=url=>{
    const cursor=(url.searchParams.get('id')||'gt.').slice(3);
    return Response.json(rows.filter(x=>x.id>cursor).slice(0,250));
  };
  const first=await call(agent,{...requestedPeriod,mode:'indicadores'});
  assert.equal(first.statusCode,200);
  assert.equal(f.requests.length,6);
  assert.equal(f.requests.at(-1),'gt.01003');
  assert.deepEqual(f.routes,[]);
  assert.equal((await call(agent,{...requestedPeriod,mode:'indicadores'})).statusCode,200);
  assert.equal(f.requests.length,6);
  agent._test.cache.clear();
  f.parcels=()=>Response.json([rows[0]]);
  assert.equal((await call(agent,{...requestedPeriod,mode:'indicadores'})).body.codigo,'FINANCE_BASE_INCOMPLETE');
  assert.equal(agent._test.cache.size,0);
});
