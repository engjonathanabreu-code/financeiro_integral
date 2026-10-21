// FIN-01/FIN-02: revisão por módulo, salvamento com versão esperada e bloqueio de gravações antigas.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,login,id,ADM,STAFF,FIN,INATIVO}=require('./financeiro-db-fixture.cjs');
const sql=f=>fs.readFileSync(path.join(__dirname,'../supabase',f),'utf8');

async function prepared({faseB=false}={}){
 const db=await setup();
 await db.exec('create publication supabase_realtime');
 await db.exec(`select set_config('request.jwt.claim.sub','${id(ADM)}',false)`);
 const seed={trips:[{id:1,city:'A',status:'Planejada'},{id:2,city:'B'}],budgetRecords:[{id:1,name:'Campo',active:true,history:[]}],hrPeople:[{id:1,name:'Pessoa sintética'}],invoiceRequests:[],cashflow:[{id:1,value:3}]};
 for(const [k,v] of Object.entries(seed))await db.query('insert into financeiro_estado_modulos(chave,dados,updated_at) values($1,$2,now())',[k,JSON.stringify(v)]);
 await db.exec(sql('auditoria_acessos_20261005.sql'));
 await db.exec(sql('financeiro_modulos_revisao_20261021.sql'));
 if(faseB)await db.exec(sql('financeiro_modulos_revisao_bloqueio_20261021.sql'));
 return db;
}
const salvar=async(db,chave,dados,revisao)=>(await db.query('select financeiro_salvar_modulo($1,$2,$3) r',[chave,JSON.stringify(dados),revisao])).rows[0].r;
const linha=async(db,chave)=>(await db.query('select revisao::int,dados from financeiro_estado_modulos where chave=$1',[chave])).rows[0];
const sinal=async(db,chave)=>{await db.exec('reset role');const r=(await db.query('select revisao::int from financeiro_modulos_sinal where chave=$1',[chave])).rows[0];return r?.revisao};

test('Fase A: revisão existente é preservada, sinal criado e dados intactos',async()=>{
 const db=await prepared();
 try{
  const rows=(await db.query('select m.chave,m.revisao::int r,s.revisao::int s from financeiro_estado_modulos m left join financeiro_modulos_sinal s using(chave) order by 1')).rows;
  assert.ok(rows.length>=5);for(const r of rows){assert.equal(r.r,1,r.chave);assert.equal(r.s,1,r.chave)}
  assert.deepEqual((await linha(db,'trips')).dados,[{id:1,city:'A',status:'Planejada'},{id:2,city:'B'}]);
  assert.ok((await db.query("select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='financeiro_modulos_sinal'")).rows.length);
  // Reaplicar a migration não muda nada (idempotente).
  await db.exec(sql('financeiro_modulos_revisao_20261021.sql'));assert.equal((await linha(db,'trips')).revisao,1);
 }finally{await db.close()}
});

test('salvamento com revisão esperada: segundo salvamento da mesma versão vira conflito, sem gravar',async()=>{
 const db=await prepared();
 try{
  await login(db,STAFF);
  const a=await salvar(db,'trips',[{id:1,city:'A2',status:'Planejada'},{id:2,city:'B'}],1);
  assert.equal(a.status,'salvo');assert.equal(a.revisao,2);
  const b=await salvar(db,'trips',[{id:1,city:'A',status:'Planejada'},{id:2,city:'B2'}],1);
  assert.equal(b.status,'conflito');assert.equal(b.revisao,2);assert.deepEqual(b.dados,a.dados,'devolve a versão atual para reconciliar');
  assert.deepEqual((await linha(db,'trips')).dados[0].city,'A2','a alteração do primeiro usuário permanece');
  const c=await salvar(db,'trips',[{id:1,city:'A2',status:'Planejada'},{id:2,city:'B2'}],2);
  assert.equal(c.status,'salvo');assert.equal(c.revisao,3);
  assert.equal(await sinal(db,'trips'),3,'sinal acompanha a revisão');
  await login(db,STAFF);
  // Mesmo conteúdo não gera revisão nova (evita ciclos de sincronização).
  const d=await salvar(db,'trips',c.dados,3);assert.equal(d.status,'salvo');assert.equal(d.revisao,3);
  // Gravação antiga (UPSERT direto) ainda funciona na Fase A e também incrementa a revisão.
  await db.query(`update financeiro_estado_modulos set dados=dados||'[{"id":3}]' where chave='trips'`);
  assert.equal((await linha(db,'trips')).revisao,4);
  const e=await salvar(db,'trips',[],3);assert.equal(e.status,'conflito');assert.equal(e.revisao,4);
  // O cliente não consegue escolher a revisão.
  await db.query(`update financeiro_estado_modulos set revisao=1 where chave='trips'`);assert.equal((await linha(db,'trips')).revisao,4);
 }finally{await db.close()}
});

test('permissões e guardas continuam valendo pela função de salvamento',async()=>{
 const db=await prepared();
 try{
  await login(db,STAFF);
  await assert.rejects(salvar(db,'hrPeople',[{id:1,name:'x'}],1),/sem permissão/,'colaborador não grava RH');
  await assert.rejects(salvar(db,'cashflow',[],1),/sem permissão/,'colaborador não grava fluxo de caixa');
  await assert.rejects(salvar(db,'budgetRecords',[{id:1,name:'Campo',active:true,history:[],status:'Fechado'}],1),/Somente ADM/);
  await assert.rejects(salvar(db,'trips',[],1),/FINANCEIRO_PROTECAO/,'proteção contra esvaziamento continua');
  await assert.rejects(salvar(db,'invoiceRequests',[{id:'x',requesterId:id(ADM),status:'Aprovada'}],1),/Usuários comuns|Somente ADM/);
  await assert.rejects(salvar(db,'planExpenses',[{id:1}],null),/row-level security|violates|sem permissão/i,'colaborador não cria módulo de planejamento (só ADM)');
  await login(db,FIN);assert.equal((await salvar(db,'cashflow',[{id:1,value:4}],1)).status,'salvo');
  await login(db,INATIVO);await assert.rejects(salvar(db,'trips',[{id:1}],1),/sem permissão/);
  await login(db,null);await assert.rejects(salvar(db,'trips',[{id:1}],1),/permission denied/);
  await login(db,ADM);
  const novo=await salvar(db,'suppliers',[{id:1,name:'Fornecedor sintético'}],null);assert.equal(novo.status,'salvo');assert.equal(novo.revisao,1);
  const repetido=await salvar(db,'suppliers',[{id:2}],null);assert.equal(repetido.status,'conflito','criação concorrente não sobrescreve');
  assert.equal(await sinal(db,'suppliers'),1);
  // Anexo enviado inline continua saindo do JSON e a resposta já traz o arquivoId.
  await login(db,STAFF);
  const d2=await salvar(db,'docs',[{id:1,name:'nf.pdf',dataUrl:'data:application/pdf;base64,JVBERi0x'}],null);
  assert.ok(d2.dados[0].arquivoId&&!d2.dados[0].dataUrl);
 }finally{await db.close()}
});

test('fechamento de orçamento e solicitações continuam funcionando e incrementam a revisão',async()=>{
 for(const faseB of [false,true]){
  const db=await prepared({faseB});
  try{
   await login(db,ADM);
   const r=(await db.query('select financeiro_close_budget($1,$2) r',['1',JSON.stringify({id:1,name:'Campo',active:true,history:[]})])).rows[0].r;
   assert.equal(r[0].status,'Fechado');assert.equal((await linha(db,'budgetRecords')).revisao,2);
   await login(db,STAFF);
   const req={id:'r1',requesterId:id(STAFF),status:'Pendente',response:''};
   const s=(await db.query('select financeiro_save_invoice_request($1) r',[JSON.stringify(req)])).rows[0].r;
   assert.deepEqual(s,[req]);assert.equal((await linha(db,'invoiceRequests')).revisao,2);
   assert.equal(await sinal(db,'invoiceRequests'),2);
  }finally{await db.close()}
 }
});

test('Fase B: UPSERT direto de aba antiga é recusado; função versionada, restauração e service role seguem',async()=>{
 const db=await prepared({faseB:true});
 try{
  await login(db,STAFF);
  await assert.rejects(db.query(`update financeiro_estado_modulos set dados='[{"id":1,"city":"velho"}]' where chave='trips'`),/Versão desatualizada/);
  await assert.rejects(db.query(`insert into financeiro_estado_modulos(chave,dados) values('trips','[{"id":1}]') on conflict(chave) do update set dados=excluded.dados`),/Versão desatualizada/);
  assert.equal((await linha(db,'trips')).dados[0].city,'A','nada foi sobrescrito');
  assert.equal((await salvar(db,'trips',[{id:1,city:'novo'},{id:2,city:'B'}],1)).status,'salvo');
  // Mesmo dentro de uma transação, a autorização vale só para o módulo indicado e é limpa depois.
  await db.exec(`select set_config('financeiro.gravacao_autorizada','cashflow',false)`);
  await assert.rejects(db.query(`update financeiro_estado_modulos set dados='[{"id":9}]' where chave='trips'`),/Versão desatualizada/);
  await db.exec(`select set_config('financeiro.gravacao_autorizada','',false)`);
  await login(db,ADM);
  await db.exec('reset role');const h=(await db.query("select id from financeiro_estado_modulos_history where chave='trips' order by id desc limit 1")).rows[0].id;
  await login(db,ADM);await db.query('select financeiro_restore_modulo_version($1,$2)',['trips',h]);
  assert.equal((await linha(db,'trips')).dados[0].city,'A','restauração do ADM (SECURITY DEFINER) segue funcionando');
  await db.exec('reset role');await db.query(`update financeiro_estado_modulos set dados='[{"id":1,"city":"servidor"}]' where chave='trips'`);
  assert.equal((await linha(db,'trips')).dados[0].city,'servidor','papel de serviço/administração não é bloqueado');
 }finally{await db.close()}
});
