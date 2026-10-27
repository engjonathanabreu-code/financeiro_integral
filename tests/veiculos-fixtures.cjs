const fs=require('node:fs'),path=require('node:path');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const foto={name:'sintetica.png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1sAAAAASUVORK5CYII='};
async function setup(externalDb,beforeMigration){
 const {PGlite}=await import('@electric-sql/pglite');const db=externalDb||new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;
 create table profiles(id uuid primary key,nome text,email text,tipo text,setor text,ativo boolean);
 insert into profiles values('${id(1)}','ADM','adm@fixture.test','Administrador','Administrativo',true),('${id(2)}','Motorista A','a@fixture.test','Projetos','Projetos',true),('${id(3)}','Motorista B','b@fixture.test','Comercial','Comercial',true),('${id(4)}','Inativo','i@fixture.test','Administrador','',false),('${id(5)}','Financeiro','f@fixture.test','Financeiro','Financeiro',true);
 grant select on profiles to authenticated;
 create function is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and tipo='Administrador' and ativo)$$;
 create function is_active_user() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo)$$;
 create table financeiro_arquivos(id uuid primary key,conteudo text);
 insert into financeiro_arquivos values('00000000-0000-4000-8000-000000000091','data:application/pdf;base64,JVBERi0x');
 create schema storage;create table storage.objects(bucket_id text,name text);
 create table financeiro_estado_modulos(chave text primary key,dados jsonb,updated_by uuid,updated_at timestamptz);
 insert into financeiro_estado_modulos(chave,dados) values('budgetRecords','[{"id":11,"name":"Viagem de campo","sector":"Projetos","limit":1000,"active":true,"assignedDirect":[2]}]'),('trips','[{"id":21,"city":"Destino sintético","sector":"Projetos","assigned":[2]}]'),('usersMvp','[{"id":2,"erpId":"${id(2)}","email":"a@fixture.test"}]'),('tripExpenses','[]');
 grant select,insert,update,delete on financeiro_estado_modulos to authenticated;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/financeiro_solicitacoes_permissoes.sql'),'utf8'));
 if(beforeMigration)await beforeMigration(db);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/financeiro_veiculos.sql'),'utf8'));return db;
}
async function login(db,n){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${n?id(n):''}',false);set role ${n?'authenticated':'anon'}`)}
async function rpc(db,acao,p={}){return (await db.query('select public.financeiro_veiculos_api($1,$2) data',[acao,JSON.stringify(p)])).rows[0].data}
const time=offset=>new Date(Date.now()+offset*60000).toISOString();
const approvedDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const approval=(n=10)=>({id:id(n),category:'trip',requesterId:id(2),requesterName:'Motorista A',requesterSector:'Projetos',status:'Aprovada',title:'Orçamento de viagem sintético',estimatedValue:1000,neededAt:approvedDate(),convertedId:n+11,reviewedBy:'ADM',reviewedAt:new Date().toISOString()});
async function approve(db,n=10){const a=approval(n);await db.query('select financeiro_save_invoice_request($1)',[JSON.stringify(a)]);const t={id:a.convertedId,city:'Destino sintético',sector:'Projetos',assigned:[2],invoiceRequestId:a.id,plannedAmount:1000};await db.query("update financeiro_estado_modulos set dados=(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(dados) x where x->>'id'<>$1)||$2::jsonb where chave='trips'",[String(t.id),JSON.stringify([t])]);return a;}
const withdrawal=(n=20,a=10,car='gol')=>({id:id(n),veiculo_id:car,solicitacao_id:id(a),retirada_em:time(-1),km_inicial:100,destino:'Destino de teste',foto,tanque_inicial_cheio:true});

module.exports={setup,login,rpc,id,foto,time,approval,approve,withdrawal};
