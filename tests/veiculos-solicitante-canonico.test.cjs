const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,login,rpc,id,approve,withdrawal}=require('./veiculos-fixtures.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261113173933_financeiro_veiculos_solicitante_canonico.sql'),'utf8');
const rollback=fs.readFileSync(path.join(__dirname,'../supabase/rollback/financeiro_veiculos_solicitante_canonico.sql'),'utf8');
const save=(db,a,expected)=>db.query('select financeiro_save_invoice_request($1,$2)',[JSON.stringify(a),JSON.stringify(expected)]);
async function scenario(db){
 await login(db,1);const positive=await approve(db,10,'hb20'),zero=await approve(db,11,'hb20');
 await save(db,{...zero,estimatedValue:0},zero);
 await db.exec(`reset role;update profiles set tipo='Comercial',setor=null where id='${id(2)}';
 update financeiro_estado_modulos set dados='[]' where chave='usersMvp';
 update financeiro_estado_modulos set dados=(select jsonb_agg(t||'{"assigned":[]}'::jsonb) from jsonb_array_elements(dados)t) where chave='trips';`);
 return positive;
}
test('solicitante canônico: reproduz bloqueios, libera somente a própria aprovação positiva e preserva dados/ACL',async()=>{
 const db=await setup();try{
  await scenario(db);await login(db,2);
  const beforePanel=await rpc(db,'painel');assert.match(beforePanel.solicitacoes.find(a=>a.id===id(10)).impedimento,/acesso/);assert.match(beforePanel.solicitacoes.find(a=>a.id===id(11)).impedimento,/orçamento/);
  await assert.rejects(rpc(db,'retirar',withdrawal(20,10,'hb20')),/acesso/);
  await db.exec('reset role');
  const snapshot=async()=>({modules:(await db.query('select * from financeiro_estado_modulos order by chave')).rows,policies:(await db.query('select * from pg_policies order by schemaname,tablename,policyname')).rows,functions:(await db.query("select n.nspname,p.proname,p.proacl::text,p.prosecdef,case when p.proname<>'impedimento' then p.prosrc end as body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='financeiro_veiculos_privado' order by p.proname")).rows});
  const before=await snapshot();await db.exec(migration);assert.deepEqual(await snapshot(),before);await assert.rejects(db.exec(migration),/mudou/);await db.exec('rollback');assert.deepEqual(await snapshot(),before);
  await login(db,2);const panel=await rpc(db,'painel');assert.equal(panel.solicitacoes.find(a=>a.id===id(10)).impedimento,null);assert.match(panel.solicitacoes.find(a=>a.id===id(11)).impedimento,/orçamento/);
  await assert.rejects(rpc(db,'retirar',withdrawal(21,11,'hb20')),/orçamento/);
  // O helper legado continua recusando acesso genérico: o vínculo novo vale só na retirada.
  await db.exec('reset role');assert.equal((await db.query("select financeiro_veiculos_privado.acesso(financeiro_veiculos_privado.registro('trips','21'),p) allowed from profiles p where id=$1",[id(2)])).rows[0].allowed,false);
  await login(db,2);const use=await rpc(db,'retirar',withdrawal(20,10,'hb20'));assert.equal(use.motorista,id(2));assert.equal(use.solicitacao_id,id(10));assert.match((await rpc(db,'painel')).solicitacoes.find(a=>a.id===id(10)).impedimento,/já possui/);
  await db.exec('reset role');assert.deepEqual(await snapshot(),before);const uses=(await db.query('select * from financeiro_veiculos_usos')).rows;await db.exec(rollback);assert.equal((await db.query("select md5(prosrc) checksum from pg_proc where oid='financeiro_veiculos_privado.impedimento(jsonb,public.profiles,date)'::regprocedure")).rows[0].checksum,'b40f2ea9a879959f257a7d9aebd63ea0');assert.deepEqual((await db.query('select * from financeiro_veiculos_usos')).rows,uses);assert.deepEqual(await snapshot(),before);
 }finally{await db.close()}
});
test('solicitante canônico: outro usuário, inativo, vínculo adulterado e aprovação inválida continuam bloqueados',async()=>{
 const db=await setup();try{
  const original=await scenario(db);await db.exec(migration);
  await login(db,3);assert.equal((await rpc(db,'painel')).solicitacoes.length,0);await assert.rejects(rpc(db,'retirar',withdrawal(20,10,'hb20')),/Somente o solicitante/);
  await login(db,4);await assert.rejects(rpc(db,'retirar',withdrawal(20,10,'hb20')),/Sessão ativa/);
  await login(db,0);await assert.rejects(rpc(db,'retirar',withdrawal(20,10,'hb20')),/permission denied/);
  for(const change of [{status:'Pendente'},{reviewedAt:''},{category:'purchase'},{convertedId:999},{estimatedValue:0},{neededAt:'2099-01-01'},{vehicleId:'gol'}]){
   await login(db,1);await save(db,{...original,...change},original);await login(db,2);await assert.rejects(rpc(db,'retirar',withdrawal(20,10,'hb20')));
   await login(db,1);await save(db,original,{...original,...change});
  }
  await db.exec(`reset role;update financeiro_estado_modulos set dados=(select jsonb_agg(t||'{"invoiceRequestId":"outro"}'::jsonb) from jsonb_array_elements(dados)t) where chave='trips'`);
  await login(db,2);await assert.rejects(rpc(db,'retirar',withdrawal(20,10,'hb20')),/vinculada/);assert.equal((await rpc(db,'painel')).usos.length,0);
 }finally{await db.close()}
});
