-- Fase B: clientes já usam RPCs com revisão. Mantém as políticas por módulo,
-- as guardas de domínio, o histórico e a manutenção via service_role.
begin;
set local lock_timeout = '5s';

do $$
begin
  if (select md5(prosrc) from pg_proc where oid='public.financeiro_salvar_modulo(text,jsonb,bigint)'::regprocedure)
       is distinct from '34b0c9d76e921f9cbb5a4fb5cecb5780'
     or (select md5(prosrc) from pg_proc where oid='public.financeiro_close_budget(text,jsonb)'::regprocedure)
       is distinct from '5e2f5013e97a939146412a490de706b9'
     or (select md5(prosrc) from pg_proc where oid='financeiro_privado.reservar_gravacao_solicitacoes()'::regprocedure)
       is distinct from '8a19b684a2c8017c21f4bba8555a4d40'
     or (select md5(prosrc) from pg_proc where oid='public.financeiro_restore_modulo_version(text,bigint)'::regprocedure)
       is distinct from 'ae9a272469e8a8ff0aea1d1ca794e7a4' then
    raise exception 'O catálogo das RPCs mudou. Revise os corpos ativos antes de restringir a escrita.';
  end if;
end
$$;

create role financeiro_modulos_writer nologin nosuperuser nocreatedb nocreaterole inherit nobypassrls;
-- A função continua sujeita às políticas TO authenticated. A aplicação não recebe
-- membership no papel escritor nem consegue assumi-lo por SET ROLE.
grant authenticated to financeiro_modulos_writer with inherit true, set false;
grant financeiro_modulos_writer to postgres with inherit true, set true;
grant insert, update on public.financeiro_estado_modulos to financeiro_modulos_writer;
grant create on schema public to financeiro_modulos_writer;

alter function public.financeiro_salvar_modulo(text,jsonb,bigint) security definer;
alter function public.financeiro_close_budget(text,jsonb) security definer;
alter function public.financeiro_salvar_modulo(text,jsonb,bigint) owner to financeiro_modulos_writer;
alter function public.financeiro_close_budget(text,jsonb) owner to financeiro_modulos_writer;
revoke create on schema public from financeiro_modulos_writer;

create or replace function financeiro_privado.reservar_gravacao_solicitacoes()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Somente as RPCs de Solicitações podem gravar pelo aplicativo. A RPC
  -- genérica de módulos agora usa um papel dedicado, ainda sob RLS.
  if current_user in ('authenticated','anon','financeiro_modulos_writer') and (
    (tg_op<>'INSERT' and old.chave='invoiceRequests')
    or (tg_op<>'DELETE' and new.chave='invoiceRequests')
  ) then
    raise exception using errcode='42501',message='Use o fluxo de Solicitações para gravar o registro.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create function public.financeiro_restore_modulo_version(p_chave text,p_history_id bigint,p_revisao bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  ator uuid := auth.uid();
  revisao_atual bigint;
  anterior jsonb;
  restaurado record;
begin
  if ator is null or not coalesce(public.is_admin(),false) then
    raise exception using errcode='42501', message='Somente ADM pode restaurar versões.';
  end if;
  if nullif(btrim(p_chave),'') is null or p_history_id is null or p_revisao is null or p_revisao < 1 then
    raise exception using errcode='22023', message='Informe módulo, versão histórica e revisão atual.';
  end if;

  select m.revisao into revisao_atual
    from public.financeiro_estado_modulos m where m.chave=p_chave for update;
  if not found then
    raise exception using errcode='22023', message='Módulo não encontrado.';
  end if;
  if revisao_atual <> p_revisao then
    raise exception using errcode='40001', message='O módulo mudou. Confira a versão atual antes de restaurar.';
  end if;

  select h.dados into anterior from public.financeiro_estado_modulos_history h
    where h.chave=p_chave and h.id=p_history_id;
  if anterior is null then
    raise exception using errcode='22023', message='Versão não encontrada.';
  end if;

  update public.financeiro_estado_modulos m set dados=anterior,updated_by=ator,updated_at=now()
    where m.chave=p_chave and m.revisao=p_revisao
    returning m.revisao,m.dados into restaurado;
  if not found then
    raise exception using errcode='40001', message='O módulo mudou. Confira a versão atual antes de restaurar.';
  end if;
  return jsonb_build_object('status','salvo','revisao',restaurado.revisao,'dados',restaurado.dados);
end
$$;

revoke all on function public.financeiro_restore_modulo_version(text,bigint,bigint) from public,anon;
grant execute on function public.financeiro_restore_modulo_version(text,bigint,bigint) to authenticated;
revoke execute on function public.financeiro_restore_modulo_version(text,bigint) from public,anon,authenticated;

revoke insert,update,delete,truncate,references,trigger
  on public.financeiro_estado_modulos from public,anon,authenticated;

do $$
begin
  if exists (
    select 1 from (values ('authenticated'),('anon')) r(nome)
    where has_table_privilege(r.nome,'public.financeiro_estado_modulos','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege(r.nome,'public.financeiro_estado_modulos','INSERT,UPDATE,REFERENCES')
       or pg_has_role(r.nome,'financeiro_modulos_writer','MEMBER')
  ) then
    raise exception 'Um papel da API ainda possui privilégios de escrita direta no módulo.';
  end if;
end
$$;

commit;
