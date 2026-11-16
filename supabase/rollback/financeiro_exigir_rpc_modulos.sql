-- Restaura a compatibilidade da fase A sem reverter dados, revisões ou recibos.
begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from pg_proc where oid='public.financeiro_salvar_modulo(text,jsonb,bigint)'::regprocedure
      and prosecdef and proowner='financeiro_modulos_writer'::regrole and md5(prosrc)='34b0c9d76e921f9cbb5a4fb5cecb5780')
    or not exists (select 1 from pg_proc where oid='public.financeiro_close_budget(text,jsonb)'::regprocedure
      and prosecdef and proowner='financeiro_modulos_writer'::regrole and md5(prosrc)='5e2f5013e97a939146412a490de706b9')
    or (select md5(prosrc) from pg_proc where oid='financeiro_privado.reservar_gravacao_solicitacoes()'::regprocedure)
      is distinct from 'fccd1d213e8efdfa5e3983e9ba93f488'
    or (select md5(prosrc) from pg_proc where oid='public.financeiro_restore_modulo_version(text,bigint,bigint)'::regprocedure)
      is distinct from '1b812f19103b31968587aa7306124bf9' then
    raise exception 'O catálogo mudou após a Fase B. Revise a reversão antes de executar.';
  end if;
end
$$;

alter function public.financeiro_salvar_modulo(text,jsonb,bigint) owner to postgres;
alter function public.financeiro_close_budget(text,jsonb) owner to postgres;
alter function public.financeiro_salvar_modulo(text,jsonb,bigint) security invoker;
alter function public.financeiro_close_budget(text,jsonb) security invoker;

create or replace function financeiro_privado.reservar_gravacao_solicitacoes()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- As duas RPCs de Solicitações executam como proprietárias. A REST direta
  -- e a sincronização INVOKER executam como authenticated.
  if current_user in ('authenticated','anon') and (
    (tg_op<>'INSERT' and old.chave='invoiceRequests')
    or (tg_op<>'DELETE' and new.chave='invoiceRequests')
  ) then
    raise exception using errcode='42501',message='Use o fluxo de Solicitações para gravar o registro.';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

grant execute on function public.financeiro_restore_modulo_version(text,bigint) to authenticated;
drop function public.financeiro_restore_modulo_version(text,bigint,bigint);

grant insert,update,delete,truncate,references,trigger
  on public.financeiro_estado_modulos to authenticated;
revoke insert,update on public.financeiro_estado_modulos from financeiro_modulos_writer;
drop role financeiro_modulos_writer;

commit;
