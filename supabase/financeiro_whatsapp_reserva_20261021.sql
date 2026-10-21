-- PREPARADA, NÃO APLICADA. FIN-06/FIN-07 — reserva atômica e idempotência dos lembretes WhatsApp.
-- Aplicar somente com autorização explícita e ANTES de publicar a nova versão da Edge Function.
-- Pré-condição verificada em 21/10/2026 (somente leitura): financeiro_whatsapp_envios tem apenas
-- status 'enviado' (5 linhas); a FK para financeiro_pagamentos ainda existe em produção.
--
-- Problema: a função consulta "já enviado" e depois envia; duas execuções (o endpoint aceitava
-- chamadas de qualquer origem) enviam em dobro. A FK para financeiro_pagamentos faz o registro falhar
-- para contas que só existem em accountPayments (o próximo caso previsto é 15/11/2026) e o CASCADE
-- apagaria o histórico. authenticated tinha escrita na tabela (catálogo divergente da migration).
-- Solução: reserva por INSERT ... ON CONFLICT (uma execução vence), tentativa identificada,
-- finalização condicionada à tentativa e varredura que marca "incerto" o que ficou sem finalização.
-- Nada é reenviado automaticamente depois de "incerto". Integração: não usa esta tabela.

begin;
set local lock_timeout = '5s';

alter table public.financeiro_whatsapp_envios drop constraint if exists financeiro_whatsapp_envios_pagamento_id_fkey;
alter table public.financeiro_whatsapp_envios add column if not exists tentativa uuid;
alter table public.financeiro_whatsapp_envios add column if not exists atualizado_em timestamptz not null default now();
alter table public.financeiro_whatsapp_envios drop constraint if exists financeiro_whatsapp_envios_status_check;
alter table public.financeiro_whatsapp_envios add constraint financeiro_whatsapp_envios_status_check
  check (status in ('enviando', 'enviado', 'erro', 'incerto'));

-- Só o backend (service_role) grava; usuários do Financeiro/ADM continuam lendo pela política atual.
revoke insert, update, delete, truncate, references, trigger on public.financeiro_whatsapp_envios from authenticated, anon;
revoke all on public.financeiro_whatsapp_envios from anon;

create or replace function public.financeiro_whatsapp_marcar_incertos()
returns integer language sql security definer set search_path = '' as $$
  with x as (
    update public.financeiro_whatsapp_envios
       set status = 'incerto', erro = coalesce(erro, 'sem finalização: conferir no CRM antes de reenviar'), atualizado_em = now()
     where status = 'enviando' and atualizado_em < now() - interval '10 minutes'
    returning 1)
  select count(*)::int from x;
$$;

-- Devolve a tentativa reservada, ou nulo se já foi enviado, está em andamento ou ficou incerto.
-- Só um "erro" confirmado (o provedor recusou) pode ser tentado de novo.
create or replace function public.financeiro_whatsapp_reservar(p_pagamento_id text, p_destinatario text, p_vencimento date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid;
begin
  if coalesce(p_pagamento_id, '') = '' or coalesce(p_destinatario, '') = '' or p_vencimento is null then
    raise exception using errcode = '22023', message = 'Reserva inválida.';
  end if;
  insert into public.financeiro_whatsapp_envios(pagamento_id, destinatario, vencimento, status, tentativa, atualizado_em, enviado_em)
    values (p_pagamento_id, p_destinatario, p_vencimento, 'enviando', gen_random_uuid(), now(), now())
  on conflict (pagamento_id, destinatario) do update
    set status = 'enviando', tentativa = gen_random_uuid(), atualizado_em = now(), erro = null, vencimento = excluded.vencimento
    where public.financeiro_whatsapp_envios.status = 'erro'
  returning tentativa into t;
  return t;
end $$;

create or replace function public.financeiro_whatsapp_finalizar(p_pagamento_id text, p_destinatario text, p_tentativa uuid, p_status text, p_erro text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('enviado', 'erro', 'incerto') then raise exception using errcode = '22023', message = 'Status inválido.'; end if;
  update public.financeiro_whatsapp_envios
     set status = p_status, erro = left(p_erro, 300), atualizado_em = now(), enviado_em = case when p_status = 'enviado' then now() else enviado_em end
   where pagamento_id = p_pagamento_id and destinatario = p_destinatario and tentativa = p_tentativa and status = 'enviando';
  return found;
end $$;

revoke all on function public.financeiro_whatsapp_marcar_incertos() from public, anon, authenticated;
revoke all on function public.financeiro_whatsapp_reservar(text, text, date) from public, anon, authenticated;
revoke all on function public.financeiro_whatsapp_finalizar(text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.financeiro_whatsapp_marcar_incertos() to service_role;
grant execute on function public.financeiro_whatsapp_reservar(text, text, date) to service_role;
grant execute on function public.financeiro_whatsapp_finalizar(text, text, uuid, text, text) to service_role;

commit;
