const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('ADM closes atomically; RLS/RPC and direct writes reject staff, inactive ADM, anonymous and stale saves',async()=>{
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;create table profiles(id uuid primary key,tipo text,ativo boolean);insert into profiles values('${id(1)}','Administrador',true),('${id(2)}','Funcionário',true),('${id(3)}','Administrador',false);grant select on profiles to authenticated;create function public.is_admin() returns boolean language sql stable security invoker as $$select exists(select 1 from public.profiles where id=auth.uid() and tipo='Administrador' and ativo)$$;create table financeiro_estado_modulos(chave text primary key,dados jsonb,updated_by uuid,updated_at timestamptz);alter table financeiro_estado_modulos enable row level security;create policy existing_access on financeiro_estado_modulos to authenticated using(true) with check(true);grant select,insert,update,delete on financeiro_estado_modulos to authenticated;insert into financeiro_estado_modulos values('budgetRecords','[{"id":1,"name":"Campo","active":true,"history":[]},{"id":2,"name":"Projeto","active":true,"history":[]}]',null,now());insert into financeiro_estado_modulos values('cashflow','[]',null,now());`);
 await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/financeiro_consultor.sql'),'utf8'));
 const login=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated`);
 const first={id:1,name:'Campo',active:true,history:[]};
 const close=()=>db.query('select financeiro_close_budget($1,$2) as result',['1',JSON.stringify(first)]);
 for(const n of [2,3]){await login(n);await assert.rejects(close(),/Somente ADM/);await assert.rejects(db.query('select financeiro_consultor_base()'),/somente para ADM/)}
 await login(2);
 const direct=items=>db.query("update financeiro_estado_modulos set dados=$1 where chave='budgetRecords'",[JSON.stringify(items)]);
 const second={id:2,name:'Projeto',active:true,history:[]};
 await assert.rejects(direct([{...first,status:'Fechado'},second]),/Somente ADM/);
 await assert.rejects(direct([{...first,closedBy:id(1)},second]),/Somente ADM/);
 await assert.rejects(direct([second]),/Somente ADM/);
 await assert.rejects(db.query("delete from financeiro_estado_modulos where chave='budgetRecords'"),/Somente ADM/);
 await assert.rejects(db.query("update financeiro_estado_modulos set chave='bypass' where chave='budgetRecords'"),/renomear/);
 await db.exec('reset role;set role anon');await assert.rejects(close(),/permission denied/);await assert.rejects(db.query('select financeiro_consultor_base()'),/permission denied/);
 await login(1);await assert.rejects(db.query('select financeiro_close_budget($1,$2)',['1',JSON.stringify({...first,name:'Stale'})]),/mudou/);
 const result=(await close()).rows[0].result;assert.equal(result[0].status,'Fechado');assert.equal(result[0].closedBy,id(1));assert.equal(result[0].history.length,1);assert.deepEqual(result[1],second);
 await assert.rejects(direct([first,second]),/foi fechado/);await assert.rejects(close(),/já encerrado/);
 await login(2);await assert.rejects(direct([{...result[0],name:'Changed'},second]),/Somente ADM/);
 await login(1);const snapshot=(await db.query('select financeiro_consultor_base() as result')).rows[0].result;assert.equal(snapshot.budgetRecords[0].status,'Fechado');assert.equal(snapshot.cashflow.length,0);
 }finally{await db.close()}
});

