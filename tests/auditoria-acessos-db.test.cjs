const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ADM=1,STAFF=2,FIN=3,INATIVO=4,FIN_SETOR=5;
const base64=n=>'data:image/png;base64,'+Buffer.from('x'.repeat(n)).toString('base64');

async function setup(){
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;
 create table profiles(id uuid primary key,tipo text,setor text,ativo boolean);
 insert into profiles values('${id(ADM)}','Administrador','Administrador',true),('${id(STAFF)}','Comercial','Comercial',true),('${id(FIN)}','Financeiro','Financeiro',true),('${id(INATIVO)}','Administrador','Administrativo',false),('${id(FIN_SETOR)}','Projetos','Financeiro',true);
 grant select on profiles to authenticated;
 create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and tipo='Administrador' and ativo)$$;
 create function public.is_active_user() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo)$$;
 create function public.can_access_fin_recebimentos() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p where p.id=auth.uid() and p.ativo and (lower(trim(coalesce(p.tipo,''))) in ('administrador','financeiro') or lower(trim(coalesce(p.setor,'')))='financeiro'))$$;
 create table financeiro_estado_modulos(chave text primary key,dados jsonb,updated_by uuid,updated_at timestamptz);
 alter table financeiro_estado_modulos enable row level security;
 create policy financeiro_estado_modulos_authenticated on financeiro_estado_modulos for all to authenticated using(true) with check(true);
 create policy financeiro_estado_modulos_write on financeiro_estado_modulos for all to authenticated using(true) with check(true);
 grant select,insert,update,delete on financeiro_estado_modulos to authenticated;
 create table financeiro_estado_modulos_history(id bigserial primary key,chave text,dados jsonb,operation text,changed_at timestamptz default now(),changed_by uuid);
 alter table financeiro_estado_modulos_history enable row level security;
 create function public.financeiro_estado_modulos_protect_and_history() returns trigger language plpgsql security definer set search_path to 'public' as $$
 declare old_len int; new_len int;
 begin
  if tg_op='DELETE' then insert into public.financeiro_estado_modulos_history(chave,dados,operation) values(old.chave,old.dados,'DELETE');return old;end if;
  if tg_op='UPDATE' then
   if old.dados is distinct from new.dados then insert into public.financeiro_estado_modulos_history(chave,dados,operation) values(old.chave,old.dados,'UPDATE');end if;
   if jsonb_typeof(old.dados)='array' and jsonb_typeof(new.dados)='array' then old_len:=jsonb_array_length(old.dados);new_len:=jsonb_array_length(new.dados);
    if old_len>0 and new_len=0 then raise exception 'FINANCEIRO_PROTECAO: bloqueado esvaziamento total';end if;end if;
  end if;return new;end $$;
 create trigger trg_financeiro_estado_modulos_protect_history before delete or update on financeiro_estado_modulos for each row execute function financeiro_estado_modulos_protect_and_history();
 create function public.financeiro_restore_modulo_version(p_chave text,p_history_id bigint) returns void language plpgsql security definer set search_path to 'public' as $$declare v jsonb;begin if coalesce(current_setting('request.jwt.claim.sub',true),'')='' then raise exception 'Nao autorizado';end if;select dados into v from public.financeiro_estado_modulos_history where id=p_history_id and chave=p_chave;update public.financeiro_estado_modulos set dados=v where chave=p_chave;end $$;
 grant execute on function public.financeiro_restore_modulo_version(text,bigint) to authenticated;
 create table financeiro_contas(id text primary key);create table financeiro_pagamentos(id text primary key);create table financeiro_whatsapp_envios(id text primary key);create table fin_receb_importacoes(id serial primary key,arquivo_nome text);
 alter table financeiro_contas enable row level security;alter table financeiro_pagamentos enable row level security;alter table financeiro_whatsapp_envios enable row level security;alter table fin_receb_importacoes enable row level security;
 create policy financeiro_contas_authenticated on financeiro_contas for all to authenticated using(true) with check(true);
 create policy financeiro_pagamentos_authenticated on financeiro_pagamentos for all to authenticated using(true) with check(true);
 create policy financeiro_whatsapp_envios_read on financeiro_whatsapp_envios for select to authenticated using(true);
 create policy fin_receb_importacoes_auth_all on fin_receb_importacoes for all to authenticated using(true) with check(true);
 grant select,insert,update,delete on financeiro_contas,financeiro_pagamentos,financeiro_whatsapp_envios,fin_receb_importacoes to authenticated;
 insert into financeiro_contas values('c1');insert into financeiro_pagamentos values('p1');insert into financeiro_whatsapp_envios values('w1');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/financeiro_consultor.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/financeiro_solicitacoes_permissoes.sql'),'utf8'));
 return db;
}
const login=(db,n)=>db.exec(n?`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated`:`reset role;select set_config('request.jwt.claim.sub','',false);set role anon`);
const keys=async db=>(await db.query('select chave from financeiro_estado_modulos order by chave')).rows.map(r=>r.chave);

test('anexos saem do JSON sem perder bytes, ordem ou campos; acesso por módulo respeita o perfil',async()=>{
 const db=await setup();
 try{
  const trip=[{id:1,tripId:9,value:10,file:{name:'a.png',type:'image/png',size:3,dataUrl:base64(3000)}},{id:2,tripId:9,value:5,file:{name:'b.txt',type:'text/plain',size:1}}];
  const docs=[{id:7,name:'nf.pdf',type:'Nota Fiscal',value:1,dataUrl:'data:application/pdf;base64,JVBERi0x'},{id:8,name:'sem.pdf'}];
  const seed={trips:[{id:9,city:'Ibirama'}],tripExpenses:trip,tripDocuments:[{id:3,expenseId:1,file:{...trip[0].file}}],docs,budgetRecords:[{id:1,name:'Campo',active:true,history:[]}],budgetExpenses:[],hrPeople:[{id:1,name:'Fulano',currentValue:5000}],hrPayments:[{id:1}],cashflow:[{id:1,value:3}],accountPayments:[{id:1,value:9}],accountMasters:[{id:1}],planRevenues:[{id:1}],usersMvp:[{id:1}],invoiceRequests:[],natures:[{id:1,name:'X'}]};
  await db.exec(`select set_config('request.jwt.claim.sub','${id(ADM)}',false)`);
  for(const [k,v] of Object.entries(seed))await db.query('insert into financeiro_estado_modulos(chave,dados,updated_at) values($1,$2,now())',[k,JSON.stringify(v)]);
  const before=(await db.query('select chave,dados from financeiro_estado_modulos')).rows;
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/auditoria_acessos_20261005.sql'),'utf8'));
  // Conteúdo idêntico depois de recompor cada arquivoId com o original guardado.
  const recompose=async v=>{const s=JSON.stringify(v);if(!s.includes('arquivoId'))return v;const walk=async o=>{if(Array.isArray(o))return Promise.all(o.map(walk));if(o&&typeof o==='object'){const out={};for(const [k,x] of Object.entries(o)){if(k==='arquivoId'){out.dataUrl=(await db.query('select conteudo from financeiro_arquivos where id=$1',[x])).rows[0].conteudo}else out[k]=await walk(x)}return out}return o};return walk(v)};
  for(const r of before){const now=(await db.query('select dados from financeiro_estado_modulos where chave=$1',[r.chave])).rows[0].dados;assert.deepEqual(await recompose(now),r.dados,r.chave);if(['tripExpenses','tripDocuments','docs'].includes(r.chave))assert.ok(!JSON.stringify(now).includes('data:'),r.chave)}
  assert.equal((await db.query('select count(*)::int n from financeiro_arquivos')).rows[0].n,2,'mesmo arquivo em despesa e documento é guardado uma vez');
  const hist=(await db.query("select count(*)::int n from financeiro_estado_modulos_history where chave in ('tripExpenses','tripDocuments','docs')")).rows[0].n;assert.equal(hist,3,'versão original preservada no histórico');

  await login(db,ADM);assert.equal((await keys(db)).length,Object.keys(seed).length);
  await login(db,STAFF);const staff=await keys(db);
  for(const k of ['hrPeople','hrPayments','cashflow','accountPayments','accountMasters','planRevenues'])assert.ok(!staff.includes(k),`staff não vê ${k}`);
  for(const k of ['trips','tripExpenses','tripDocuments','docs','budgetRecords','budgetExpenses','usersMvp','invoiceRequests','natures'])assert.ok(staff.includes(k),`staff vê ${k}`);
  await assert.rejects(db.query(`insert into financeiro_estado_modulos(chave,dados) values('hrPeople','[]') on conflict(chave) do update set dados=excluded.dados`),/row-level security|violates/);
  const r=await db.query(`update financeiro_estado_modulos set dados='[{"id":1,"name":"x"}]' where chave='hrPeople'`);assert.equal(r.affectedRows,0);
  await assert.rejects(db.query(`delete from financeiro_estado_modulos where chave='trips'`).then(x=>{if(!x.affectedRows)throw Error('row-level security: nada excluído')}),/row-level/);
  await assert.rejects(db.query('select financeiro_restore_modulo_version($1,$2)',['hrPeople',1]),/Somente ADM/);
  for(const t of ['financeiro_contas','financeiro_pagamentos','financeiro_whatsapp_envios'])assert.equal((await db.query(`select count(*)::int n from ${t}`)).rows[0].n,0,`staff não lê ${t}`);
  assert.equal((await db.query('select count(*)::int n from fin_receb_importacoes')).rows[0].n,0);
  // Viagem continua gravável pelo colaborador e o anexo novo também sai do JSON.
  await db.query(`update financeiro_estado_modulos set dados=dados||$1::jsonb where chave='tripExpenses'`,[JSON.stringify([{id:4,file:{name:'c.png',dataUrl:base64(10)}}])]);
  const te=(await db.query("select dados from financeiro_estado_modulos where chave='tripExpenses'")).rows[0].dados;assert.ok(te[2].file.arquivoId&&!te[2].file.dataUrl);
  const leitura=(await db.query('select conteudo from financeiro_arquivos where id=$1',[te[2].file.arquivoId])).rows[0];assert.equal(leitura.conteudo,base64(10));
  const novo=(await db.query('select financeiro_guardar_arquivo($1,$2) id',[base64(20),'d.png'])).rows[0].id;assert.ok(novo);
  assert.equal((await db.query('select financeiro_guardar_arquivo($1,$2) id',[base64(20),'d.png'])).rows[0].id,novo,'mesmo conteúdo reutiliza o registro');
  await assert.rejects(db.query(`insert into financeiro_arquivos(sha256,conteudo) values('x','data:,1')`),/permission denied/);

  for(const n of [FIN,FIN_SETOR]){await login(db,n);const fin=await keys(db);for(const k of ['accountPayments','accountMasters','cashflow','docs','trips'])assert.ok(fin.includes(k),`financeiro vê ${k}`);for(const k of ['hrPeople','hrPayments','planRevenues'])assert.ok(!fin.includes(k),`financeiro não vê ${k}`);assert.equal((await db.query('select count(*)::int n from financeiro_contas')).rows[0].n,1)}
  await login(db,INATIVO);assert.equal((await keys(db)).length,0);assert.equal((await db.query('select count(*)::int n from financeiro_arquivos')).rows[0].n,0);
  await login(db,null);await assert.rejects(db.query('select chave from financeiro_estado_modulos'),/permission denied/);await assert.rejects(db.query('select financeiro_guardar_arquivo($1,$2)',[base64(1),'x']),/permission denied/);
  await login(db,ADM);
  // Gravação de ADM e guardas existentes continuam funcionando; updated_at sempre muda no servidor.
  const t0=(await db.query("select updated_at from financeiro_estado_modulos where chave='hrPeople'")).rows[0].updated_at;
  await db.query(`update financeiro_estado_modulos set dados='[{"id":1,"name":"Fulano","currentValue":6000}]',updated_at='2000-01-01' where chave='hrPeople'`);
  const t1=(await db.query("select updated_at from financeiro_estado_modulos where chave='hrPeople'")).rows[0].updated_at;assert.ok(t1>t0);
  await db.exec('reset role');const h2=(await db.query("select id from financeiro_estado_modulos_history where chave='hrPeople' order by id desc limit 1")).rows[0].id;await login(db,ADM);await db.query('select financeiro_restore_modulo_version($1,$2)',['hrPeople',h2]);
  assert.equal((await db.query("select dados from financeiro_estado_modulos where chave='hrPeople'")).rows[0].dados[0].currentValue,5000);
  await login(db,STAFF);await assert.rejects(db.query(`update financeiro_estado_modulos set dados='[{"id":1,"name":"Campo","active":true,"history":[],"status":"Fechado"}]' where chave='budgetRecords'`),/Somente ADM/);
 }finally{await db.close()}
});
