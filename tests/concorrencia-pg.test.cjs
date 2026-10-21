// FIN-01 com PostgreSQL real e duas conexões ao mesmo tempo (o PGlite tem uma conexão só).
// Sobe um cluster temporário local; se o PostgreSQL não estiver instalado, o teste é pulado e o
// motivo aparece no relatório (CI do GitHub tem PostgreSQL no ubuntu-latest).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
const {BASE_SQL,SQL_FILES,id,STAFF,FIN}=require('./financeiro-db-fixture.cjs');

function binDir(){
 try{return execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim()}catch{}
 const root='/usr/lib/postgresql';
 try{const v=fs.readdirSync(root).sort((a,b)=>Number(b)-Number(a))[0];if(v)return path.join(root,v,'bin')}catch{}
 return null;
}
const bin=binDir(),hasPg=!!bin&&fs.existsSync(path.join(bin||'','initdb'));
const asRoot=typeof process.getuid==='function'&&process.getuid()===0;
const wrap=(cmd,args)=>asRoot?['runuser',['-u','postgres','--',cmd,...args]]:[cmd,args];
function run(cmd,args,{input,env}={}){
 const [c,a]=wrap(cmd,args);
 return new Promise((resolve,reject)=>{
  const p=spawn(c,a,{env:{...process.env,...env}});let out='',err='';
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
  p.on('close',code=>code===0?resolve(out.trim()):reject(Object.assign(Error(err||out),{code})));
  if(input!==undefined){p.stdin.end(input)}
 });
}

test('salvamentos simultâneos reais: UPSERT antigo perde uma alteração; função versionada não',{skip:hasPg?false:'PostgreSQL local indisponível (initdb não encontrado)'},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fin-pg-'));const data=path.join(dir,'data');const port=String(20000+Math.floor(Math.random()*20000));
 if(asRoot)execFileSync('chown',['-R','postgres:postgres',dir]);
 const psql=(sql,extra=[])=>run(path.join(bin,'psql'),['-h',dir,'-p',port,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-q',...extra],{input:sql});
 let started=false;
 try{
  await run(path.join(bin,'initdb'),['-D',data,'-A','trust','-U','postgres','--no-sync','-E','UTF8']);
  await run(path.join(bin,'pg_ctl'),['-D',data,'-o',`-k ${dir} -p ${port} -c listen_addresses=''`,'-w','-l',path.join(dir,'log'),'start']);started=true;
  const files=[...SQL_FILES,'auditoria_acessos_20261005.sql','financeiro_modulos_revisao_20261021.sql'].map(f=>fs.readFileSync(path.join(__dirname,'../supabase',f),'utf8'));
  const seed=`select set_config('request.jwt.claim.sub','${id(1)}',false);insert into financeiro_estado_modulos(chave,dados,updated_at) values('trips','[{"id":1,"city":"A"},{"id":2,"city":"B"}]',now());`;
  // A migration aplicada sobre o estado anterior (como em produção): primeiro o esquema e os dados.
  await psql(BASE_SQL+';'+files[0]+';'+files[1]+';'+seed+';'+files[2]);
  await psql(files[3]);
  const as=(n,sql)=>`set role authenticated;select set_config('request.jwt.claim.sub','${id(n)}',false);${sql}`;
  const trips=async()=>JSON.parse(await psql(`select dados from financeiro_estado_modulos where chave='trips'`));
  const A=JSON.stringify([{id:1,city:'A-editado'},{id:2,city:'B'}]),B=JSON.stringify([{id:1,city:'A'},{id:2,city:'B-editado'}]);

  // 1) Reprodução do achado: duas gravações diretas partindo da mesma leitura retornam sucesso
  //    e só a última fica (o que a auditoria observou).
  const legacy=sql=>psql(as(STAFF,`begin;select pg_sleep(0.3);${sql};commit;`));
  await Promise.all([legacy(`update financeiro_estado_modulos set dados='${A}' where chave='trips'`),legacy(`update financeiro_estado_modulos set dados='${B}' where chave='trips'`)]);
  const lost=(await trips()).map(t=>t.city);
  assert.ok(lost.join()!=='A-editado,B-editado','sem controle de versão uma das alterações some');

  // 2) Correção: as duas sessões partem da mesma revisão. A segunda espera o bloqueio da linha e,
  //    quando a primeira confirma, recebe "conflito" com a versão atual, sem gravar nada.
  // Volta ao estado inicial: a etapa acima termina aleatoriamente com os dados de A ou de B, e um
  // salvamento idêntico ao estado atual (corretamente) não gera revisão nova.
  await psql(`update financeiro_estado_modulos set dados='[{"id":1,"city":"A"},{"id":2,"city":"B"}]' where chave='trips'`);
  const rev=Number(await psql(`select revisao from financeiro_estado_modulos where chave='trips'`));
  const done={};
  const first=psql(as(STAFF,`begin;select financeiro_salvar_modulo('trips','${A}',${rev})::text;select txid_current()::text||' '||pg_backend_pid();select pg_sleep(1.2);commit;select 'commit-ok';`)).then(r=>{done.first=process.hrtime.bigint();return r});
  // Só começa a segunda quando a primeira já gravou e segura a linha (sem depender de tempo fixo).
  let seen='';for(let i=0;i<200;i++){seen=await psql(`select string_agg(pid||':'||state||':'||left(query,60),' | ') from pg_stat_activity where state='active' and query like '%pg_sleep(1.2)%' and pid<>pg_backend_pid()`);if(seen)break;await new Promise(r=>setTimeout(r,25))}
  const second=psql(as(FIN,`select (financeiro_salvar_modulo('trips','${B}',${rev}))::text;`)).then(r=>{done.second=process.hrtime.bigint();return r});
  const [r1,r2]=await Promise.all([first,second]);
  const saved=JSON.parse(r1.split('\n')[1]);assert.equal(saved.status,'salvo');assert.equal(saved.revisao,rev+1);assert.match(r1,/commit-ok$/);
  assert.ok(seen,'a primeira sessão estava segurando a linha quando a segunda começou');
  const conflict=JSON.parse(r2.split('\n').pop());
  assert.equal(conflict.status,'conflito');assert.equal(conflict.revisao,rev+1);
  assert.deepEqual(conflict.dados.map(t=>t.city),['A-editado','B']);
  // A prova de que a segunda esperou o commit da primeira é o servidor devolver a revisão e os dados
  // já confirmados pela primeira (asserções acima); o término dos processos psql no cliente varia com a carga.
  assert.ok(done.first&&done.second);
  // O cliente mescla sobre a versão devolvida e grava a próxima revisão: as duas alterações ficam.
  const merged=JSON.stringify([{id:1,city:'A-editado'},{id:2,city:'B-editado'}]);
  const r3=JSON.parse((await psql(as(FIN,`select financeiro_salvar_modulo('trips','${merged}',${rev+1})::text;`))).split('\n').pop());
  assert.equal(r3.status,'salvo');
  assert.deepEqual((await trips()).map(t=>t.city),['A-editado','B-editado']);
  assert.equal(Number(await psql(`select revisao from financeiro_modulos_sinal where chave='trips'`)),rev+2);

  // 3) Dez gravações paralelas da mesma revisão: exatamente uma vence.
  const cur=rev+2;
  const many=await Promise.all(Array.from({length:10},(_,i)=>psql(as(STAFF,`select financeiro_salvar_modulo('trips','[{"id":1,"city":"P${i}"},{"id":2,"city":"Q"}]',${cur})->>'status';`))));
  assert.equal(many.filter(x=>/salvo/.test(x)).length,1);assert.equal(many.filter(x=>/conflito/.test(x)).length,9);
 }finally{
  if(started)await run(path.join(bin,'pg_ctl'),['-D',data,'-m','immediate','-w','stop']).catch(()=>{});
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
