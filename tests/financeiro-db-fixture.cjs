// Esquema mínimo do Supabase compartilhado (perfis, módulos, histórico) usado pelos testes de banco.
const fs=require('node:fs'),path=require('node:path');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ADM=1,STAFF=2,FIN=3,INATIVO=4,FIN_SETOR=5;
const BASE_SQL=`create role anon;create role authenticated;create schema auth;
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
 create policy financeiro_estado_modulos_select on financeiro_estado_modulos for select to authenticated using(true);
 create schema integracao_financeiro_privado;grant usage on schema integracao_financeiro_privado to authenticated;
 create function integracao_financeiro_privado.operar() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and (tipo in ('Administrador','Financeiro') or lower(trim(setor))='financeiro'))$$;
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
 insert into financeiro_contas values('c1');insert into financeiro_pagamentos values('p1');insert into financeiro_whatsapp_envios values('w1');`;
const SQL_FILES=['financeiro_consultor.sql','financeiro_solicitacoes_permissoes.sql'];
async function setup(){
 const {PGlite}=await import('@electric-sql/pglite');const db=new PGlite();
 await db.exec(BASE_SQL);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/financeiro_consultor.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/financeiro_solicitacoes_permissoes.sql'),'utf8'));
 return db;
}
const login=(db,n)=>db.exec(n?`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated`:`reset role;select set_config('request.jwt.claim.sub','',false);set role anon`);
module.exports={BASE_SQL,SQL_FILES,setup,login,id,ADM,STAFF,FIN,INATIVO,FIN_SETOR};
