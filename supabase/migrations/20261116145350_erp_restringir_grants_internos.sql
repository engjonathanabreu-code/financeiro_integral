-- Reduz os grants redundantes de tabelas internas que já negam acesso direto por RLS.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  alvo text;
  oid_alvo oid;
  acl_esperada constant text[] := array['anon=arwdDxtm/postgres','authenticated=arwdDxtm/postgres','postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres'];
begin
  foreach alvo in array array[
    'matriculaia_rate_limits', 'radar_ai_usage', 'radar_cities', 'radar_email_drafts',
    'radar_opportunities', 'radar_run_items', 'radar_runs', 'radar_settings'
  ]
  loop
    execute format('lock table public.%I in access share mode', alvo);
    select c.oid into strict oid_alvo from pg_class c
    where c.oid=to_regclass(format('public.%I', alvo))
      and c.relkind='r' and c.relrowsecurity and not c.relforcerowsecurity
      and array(select acl::text from unnest(c.relacl) acl order by acl::text collate "C")=acl_esperada
      and not exists(select 1 from pg_policy where polrelid=c.oid)
      and not exists(select 1 from pg_attribute where attrelid=c.oid and attnum>0 and attacl is not null);
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', alvo);
  end loop;
exception when no_data_found then
  raise exception 'Catálogo de public.% mudou. Revise grants, políticas e colunas antes de aplicar.', alvo;
end
$migration$;

-- Revoga a chamada direta de três funções de gatilho. Mantém os gatilhos existentes.
-- Preserva a chamada do helper de Diretoria por authenticated e service_role.
-- Aplique dentro de uma única transação.
do $$
declare rotina record;
begin
  for rotina in
    select * from (values
      ('public.handle_new_user()', '801b549dc9b7c1d82624074c95d5d9ec', 'auth.users', 'on_auth_user_created'),
      ('public.proteger_atualizacao_entregavel()', '5a685fbdccf712e207453ae182c2c3dd', 'public.entregaveis', 'proteger_atualizacao_entregavel'),
      ('public.proteger_atualizacao_etapa_plano()', 'b9a30e81210aa901b26687c8132734fc', 'public.etapas_plano', 'proteger_atualizacao_etapa_plano')
    ) as esperado(assinatura, digest, alvo, gatilho)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_trigger t on t.tgfoid = p.oid
      where p.oid = pg_catalog.to_regprocedure(rotina.assinatura)
        and p.prosecdef
        and p.prorettype = 'pg_catalog.trigger'::regtype
        and array(select a::text from unnest(p.proacl) a order by a::text collate "C")
          = array['=X/postgres','anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']
        and md5(p.prosrc) = rotina.digest
        and t.tgrelid = pg_catalog.to_regclass(rotina.alvo)
        and t.tgname = rotina.gatilho
        and t.tgenabled in ('O', 'A')
    ) then
      raise exception 'O contrato da rotina % mudou. Revise o lote antes de aplicar.', rotina.assinatura;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = 'public.is_projects_director()'::regprocedure
      and p.prosecdef and md5(p.prosrc) = '70050c5ffc72ce15c8f5ffee39118d7b'
      and array(select a::text from unnest(p.proacl) a order by a::text collate "C")
        = array['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']
      and not exists (
        select 1
        from pg_catalog.pg_depend d
        join pg_catalog.pg_policy pol on d.classid = 'pg_policy'::regclass and d.objid = pol.oid
        where d.refclassid = 'pg_proc'::regclass and d.refobjid = p.oid
          and (0 = any(pol.polroles) or 'anon'::regrole::oid = any(pol.polroles))
      )
  ) then
    raise exception 'O contrato de is_projects_director mudou. Revise o lote antes de aplicar.';
  end if;
end
$$;

revoke execute on function public.handle_new_user(),
  public.proteger_atualizacao_entregavel(),
  public.proteger_atualizacao_etapa_plano()
  from public, anon, authenticated;

revoke execute on function public.is_projects_director() from anon;

commit;
