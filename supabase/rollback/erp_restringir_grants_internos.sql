-- Restaura somente os grants anteriores. Os dados e as políticas continuam intactos.
begin;
set local lock_timeout = '5s';

do $migration$
declare
  alvo text;
  oid_alvo oid;
  acl_esperada constant text[] := array['postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres'];
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
    execute format('grant all privileges on table public.%I to anon, authenticated', alvo);
  end loop;
exception when no_data_found then
  raise exception 'Catálogo de public.% mudou. Revise grants, políticas e colunas antes de aplicar.', alvo;
end
$migration$;

-- Recria apenas os grants explícitos registrados no catálogo anterior.
-- Preserve alterações de ACL posteriores, se existirem.
do $$
begin
  if exists (
    select 1 from pg_proc p where p.oid in ('public.handle_new_user()'::regprocedure,
      'public.proteger_atualizacao_entregavel()'::regprocedure,
      'public.proteger_atualizacao_etapa_plano()'::regprocedure)
    and array(select a::text from unnest(p.proacl) a order by a::text collate "C")
      <> array['postgres=X/postgres','service_role=X/postgres']
  ) or not exists (
    select 1 from pg_proc p where p.oid = 'public.is_projects_director()'::regprocedure
    and array(select a::text from unnest(p.proacl) a order by a::text collate "C")
      = array['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']
  ) then
    raise exception 'A ACL das funções mudou. Revalide a reversão antes de aplicar.';
  end if;
end
$$;
grant execute on function public.handle_new_user(),
  public.proteger_atualizacao_entregavel(),
  public.proteger_atualizacao_etapa_plano()
  to public, anon, authenticated;

grant execute on function public.is_projects_director() to anon;

commit;
