-- Keep the shared state format and every other module's existing permissions.
-- Invoker security: the existing table RLS and the immutable server-side profile apply.
create or replace function public.financeiro_guard_invoice_requests()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  previous jsonb := '[]'::jsonb;
  item jsonb;
  actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' and old.chave = 'invoiceRequests' and new.chave <> old.chave then
    raise exception using errcode='42501', message='Não é permitido renomear o módulo Solicitações.';
  end if;
  if tg_op = 'DELETE' then
    if old.chave = 'invoiceRequests' and (actor is null or not public.is_admin()) then
      raise exception using errcode='42501', message='Somente ADM pode excluir solicitações.';
    end if;
    return old;
  end if;
  if new.chave <> 'invoiceRequests' then return new; end if;
  if actor is null then
    raise exception using errcode='42501', message='Autenticação necessária para solicitações.';
  end if;
  if jsonb_typeof(new.dados) is distinct from 'array' then
    raise exception using errcode='22023', message='Solicitações devem ser uma lista.';
  end if;
  if exists (select 1 from jsonb_array_elements(new.dados) r where jsonb_typeof(r) <> 'object' or coalesce(r->>'id','') = '')
     or (select count(*) <> count(distinct r->>'id') from jsonb_array_elements(new.dados) r) then
    raise exception using errcode='22023', message='Identificadores de solicitações inválidos ou duplicados.';
  end if;
  if public.is_admin() then return new; end if;
  if tg_op = 'UPDATE' then
    previous := case when old.chave = 'invoiceRequests' then old.dados else '[]'::jsonb end;
  else
    -- UPSERT runs BEFORE INSERT before BEFORE UPDATE: compare existing records too.
    select dados into previous from public.financeiro_estado_modulos where chave='invoiceRequests';
    previous := coalesce(previous, '[]'::jsonb);
  end if;
  if exists (select 1 from jsonb_array_elements(previous) r where not exists (select 1 from jsonb_array_elements(new.dados) n where n = r)) then
    raise exception using errcode='42501', message='Somente ADM pode alterar, aprovar ou rejeitar solicitações existentes.';
  end if;
  for item in select value from jsonb_array_elements(new.dados) loop
    if exists (select 1 from jsonb_array_elements(previous) p where p = item) then continue; end if;
    if item->>'requesterId' is distinct from actor::text
       or item->>'status' is distinct from 'Pendente'
       or coalesce(item->>'response','') <> ''
       or item ?| array['reviewedBy','reviewedAt','convertedId'] then
      raise exception using errcode='42501', message='Usuários comuns só podem enviar solicitações próprias e pendentes.';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.financeiro_guard_invoice_requests() from public;
drop trigger if exists financeiro_guard_invoice_requests on public.financeiro_estado_modulos;
create trigger financeiro_guard_invoice_requests before insert or update or delete
on public.financeiro_estado_modulos for each row execute function public.financeiro_guard_invoice_requests();

-- Serialize requests to avoid replacing a colleague's newly submitted request.
create or replace function public.financeiro_save_invoice_request(p_request jsonb, p_expected jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  current_requests jsonb;
  existing jsonb;
  result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Autenticação necessária.'; end if;
  insert into public.financeiro_estado_modulos(chave,dados,updated_by)
    select 'invoiceRequests','[]'::jsonb,auth.uid() where not exists (select 1 from public.financeiro_estado_modulos where chave='invoiceRequests') on conflict (chave) do nothing;
  select dados into current_requests from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  select value into existing from jsonb_array_elements(current_requests) where value->>'id'=p_request->>'id';
  if p_expected is null then
    if existing is not null then raise exception 'Solicitação já existe.'; end if;
    result := current_requests || jsonb_build_array(p_request);
  else
    if not public.is_admin() then raise exception using errcode='42501',message='Somente ADM pode aprovar ou rejeitar.'; end if;
    if existing is distinct from p_expected then raise exception 'Solicitação atualizada por outro usuário. Reabra a solicitação.'; end if;
    select jsonb_agg(case when value->>'id'=p_request->>'id' then p_request else value end order by ord)
      into result from jsonb_array_elements(current_requests) with ordinality as a(value,ord);
  end if;
  update public.financeiro_estado_modulos set dados=result,updated_by=auth.uid(),updated_at=now() where chave='invoiceRequests';
  return result;
end;
$$;
revoke all on function public.financeiro_save_invoice_request(jsonb,jsonb) from public, anon;
grant execute on function public.financeiro_save_invoice_request(jsonb,jsonb) to authenticated;
