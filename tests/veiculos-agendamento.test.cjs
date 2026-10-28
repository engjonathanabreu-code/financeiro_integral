const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,login,rpc,id,approve,approval,withdrawal,time}=require('./veiculos-fixtures.cjs');
const migration=()=>fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261028121955_financeiro_veiculos_agendamento.sql'),'utf8');
const pending=(n=50)=>{const a={...approval(n),status:'Pendente',response:'',history:[{action:'Solicitação enviada'}]};delete a.reviewedAt;delete a.reviewedBy;delete a.convertedId;return a};
const save=(db,a,expected=null)=>db.query('select financeiro_save_invoice_request($1,$2)',[JSON.stringify(a),expected&&JSON.stringify(expected)]);
const dayOffset=(day,n)=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};

test('agendamento: solicitações novas exigem veículo/data; outras categorias preservadas',async()=>{
 const db=await setup();try{
  await login(db,2);const a=pending();
  await assert.rejects(save(db,{...a,vehicleId:''}),/Selecione o veículo/);
  await assert.rejects(save(db,{...a,vehicleId:'outro'}),/Selecione o veículo/);
  await assert.rejects(save(db,{...a,neededAt:''}),/data da viagem/);
  await assert.rejects(save(db,{...a,neededAt:'2026-02-30'}),/date\/time/);
  await save(db,a);assert.equal((await rpc(db,'painel')).solicitacoes[0].vehicleId,'gol');
  await assert.rejects(save(db,{...a,status:'Aprovada'},a),/Somente ADM/);
  for(const category of ['budget','purchase']){const b={...pending(category==='budget'?51:52),category};delete b.vehicleId;delete b.neededAt;await save(db,b)}
  assert.equal((await db.query("select jsonb_array_length(dados) n from financeiro_estado_modulos where chave='invoiceRequests'")).rows[0].n,3);
 }finally{await db.close()}
});

test('agendamento: migração preserva dados, solicitações antigas completam apenas carro e impedem alterações indevidas',async()=>{
 const db=await setup(null,null,false);try{
  await login(db,1);const original=await approve(db);delete original.vehicleId;original.history=[{action:'Aprovada',by:'ADM'}];
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='invoiceRequests'",[JSON.stringify([original])]);
  await db.exec('reset role');const before=(await db.query('select * from financeiro_estado_modulos order by chave')).rows;
  const policies=(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows;
  await db.exec(migration());assert.deepEqual((await db.query('select * from financeiro_estado_modulos order by chave')).rows,before);assert.deepEqual((await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,policies);
  await login(db,2);assert.match((await rpc(db,'painel')).solicitacoes[0].impedimento,/Escolha o veículo/);
  await assert.rejects(rpc(db,'retirar',withdrawal()),/Escolha o veículo/);
  for(const change of [{status:'Pendente'},{estimatedValue:1},{requesterId:id(3)},{neededAt:'2099-01-01'},{convertedId:88},{reviewedBy:'Fraude'}])await assert.rejects(save(db,{...original,vehicleId:'hb20',...change},original),/Somente ADM/);
  await login(db,3);await assert.rejects(save(db,{...original,vehicleId:'hb20'},original),/Somente ADM/);
  await login(db,2);const completed={...original,vehicleId:'hb20'};await save(db,completed,original);
  const saved=(await rpc(db,'painel')).solicitacoes[0];for(const [key,value] of Object.entries(original))assert.deepEqual(saved[key],value,key);
  await assert.rejects(save(db,{...completed,vehicleId:'gol'},completed),/Somente ADM/);
  await assert.rejects(db.query("update financeiro_estado_modulos set dados='[]' where chave='invoiceRequests'"),/Somente ADM/);
  await assert.rejects(db.query("update financeiro_estado_modulos set dados=$1 where chave='invoiceRequests'",[JSON.stringify([{...completed,estimatedValue:2}])]),/Somente ADM/);
  await assert.rejects(rpc(db,'retirar',withdrawal()),/veículo escolhido/);
  await rpc(db,'retirar',withdrawal(20,10,'hb20'));
  await login(db,1);await assert.rejects(save(db,{...completed,vehicleId:'gol'},completed),/após a retirada/);await assert.rejects(save(db,{...completed,neededAt:'2099-01-01'},completed),/após a retirada/);
  await db.exec('reset role');for(const row of before.filter(x=>x.chave!=='invoiceRequests'))assert.deepEqual((await db.query('select * from financeiro_estado_modulos where chave=$1',[row.chave])).rows[0],row);
 }finally{await db.close()}
});

test('agendamento: servidor bloqueia ontem/amanhã mesmo com relógio ou data de retirada adulterados',async()=>{
 const db=await setup();try{
  await login(db,1);const a=await approve(db);await login(db,2);const today=(await rpc(db,'painel')).hoje;
  for(const delta of [-1,1]){
   const neededAt=dayOffset(today,delta);await login(db,1);await save(db,{...a,neededAt},a);await login(db,2);
   const painel=await rpc(db,'painel');assert.match(painel.solicitacoes[0].impedimento,delta===1?/somente em/:/já passou/);
   await assert.rejects(rpc(db,'retirar',{...withdrawal(),retirada_em:neededAt+'T12:00:00-03:00'}),delta===1?/somente em/:/já passou/);
   await assert.rejects(rpc(db,'retirar',withdrawal()),delta===1?/somente em/:/já passou/);
   await login(db,1);await save(db,a,{...a,neededAt});
  }
  await login(db,2);assert.equal((await rpc(db,'painel')).solicitacoes[0].impedimento,null);
  await assert.rejects(rpc(db,'retirar',{...withdrawal(),retirada_em:dayOffset(today,-1)+'T23:59:00-03:00'}),/data da viagem/);
  await rpc(db,'retirar',{...withdrawal(),retirada_em:time(0)});assert.match((await rpc(db,'painel')).solicitacoes[0].impedimento,/já possui/);
 }finally{await db.close()}
});

test('agendamento: complemento antigo é atômico, só uma escolha, optimistic lock e aprovação continuam protegidos',async()=>{
 const db=await setup(null,null,false);try{
  await login(db,2);const old=pending();delete old.vehicleId;await save(db,old);await db.exec('reset role');await db.exec(migration());await login(db,2);
  const results=await Promise.allSettled([save(db,{...old,vehicleId:'gol'},old),save(db,{...old,vehicleId:'hb20'},old)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);
  const current=(await rpc(db,'painel')).solicitacoes[0];assert.equal(current.status,'Pendente');assert.match(current.impedimento,/aprovada/);
  await login(db,4);await assert.rejects(save(db,{...old,vehicleId:'gol'},old),/Somente ADM/);
 }finally{await db.close()}
});


test('agendamento: rollback restaura funções sem apagar veículo escolhido ou histórico',async()=>{
 const db=await setup(null,null,false);try{
  await login(db,1);const original=await approve(db);await db.exec('reset role');
  const functions=()=>db.query("select proname,prosrc,proacl::text from pg_proc where oid in ('public.financeiro_guard_invoice_requests()'::regprocedure,'public.financeiro_save_invoice_request(jsonb,jsonb)'::regprocedure,'financeiro_veiculos_privado.api(text,jsonb)'::regprocedure) order by proname");
  const before=(await functions()).rows;await db.exec(migration());await login(db,2);await rpc(db,'retirar',withdrawal());await db.exec('reset role');
  const uses=(await db.query('select * from financeiro_veiculos_usos')).rows;
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/rollback/financeiro_veiculos_agendamento.sql'),'utf8'));
  assert.deepEqual((await functions()).rows,before);assert.deepEqual((await db.query('select * from financeiro_veiculos_usos')).rows,uses);
  assert.deepEqual((await db.query("select dados from financeiro_estado_modulos where chave='invoiceRequests'")).rows[0].dados,[original]);
 }finally{await db.close()}
});
