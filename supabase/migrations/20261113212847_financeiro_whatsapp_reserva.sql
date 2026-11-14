begin;
set local lock_timeout = '5s';

-- A obrigação tem o ID de accountPayments. O espelho pode faltar ou ser recriado.
-- Remover o CASCADE também preserva o log quando uma linha do espelho é excluída.
alter table public.financeiro_whatsapp_envios
  drop constraint if exists financeiro_whatsapp_envios_pagamento_id_fkey,
  add column reservado_em timestamptz;

revoke insert, update, delete, truncate, references, trigger
  on public.financeiro_whatsapp_envios from public, anon, authenticated;

-- Um único INSERT ganha por obrigação e destinatário, inclusive diante de uma
-- linha histórica. A reserva já fica bloqueada se a resposta do INSERT se perder.
create function public.financeiro_whatsapp_reservar(
  p_pagamento_id text, p_destinatario text, p_vencimento date
) returns uuid
language sql security invoker set search_path = ''
as $$
  insert into public.financeiro_whatsapp_envios
    (pagamento_id, destinatario, vencimento, status, erro, reservado_em)
  values
    (p_pagamento_id, p_destinatario, p_vencimento, 'incerto',
     'reserva_sem_confirmacao', now())
  on conflict (pagamento_id, destinatario) do nothing
  returning id;
$$;

create function public.financeiro_whatsapp_finalizar(p_reserva uuid, p_resultado text)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_resultado is null or p_resultado not in
    ('enviado', 'timeout', 'transporte', 'http_sem_confirmacao', 'resposta_sem_confirmacao')
  then
    raise exception using errcode = '22023', message = 'Resultado inválido.';
  end if;

  update public.financeiro_whatsapp_envios
     set status = case when p_resultado = 'enviado' then 'enviado' else 'incerto' end,
         erro = case when p_resultado = 'enviado' then null else p_resultado end,
         enviado_em = case when p_resultado = 'enviado' then now() else enviado_em end
   where id = p_reserva
     and reservado_em is not null
     and status = 'incerto'
     and erro = 'reserva_sem_confirmacao';
  return found;
end;
$$;

revoke all on function public.financeiro_whatsapp_reservar(text, text, date)
  from public, anon, authenticated;
revoke all on function public.financeiro_whatsapp_finalizar(uuid, text)
  from public, anon, authenticated;
grant execute on function public.financeiro_whatsapp_reservar(text, text, date)
  to service_role;
grant execute on function public.financeiro_whatsapp_finalizar(uuid, text)
  to service_role;

commit;
