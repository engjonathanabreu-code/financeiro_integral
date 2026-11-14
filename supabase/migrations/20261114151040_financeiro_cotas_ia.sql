begin;
set local lock_timeout = '5s';

create schema if not exists financeiro_privado;

create table financeiro_privado.cotas_ia (
  usuario_id uuid not null,
  rota text not null,
  dia date not null,
  quantidade integer not null check (quantidade between 1 and 30),
  primary key (usuario_id, rota)
);
alter table financeiro_privado.cotas_ia enable row level security;
revoke all on financeiro_privado.cotas_ia from public, anon, authenticated;

-- O usuário só pode consumir a própria cota. A reserva é atômica mesmo com
-- várias instâncias de API e continua contada se o provedor falhar depois.
create function public.financeiro_reservar_cota_ia(p_rota text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ator uuid := (select auth.uid());
  dia_atual date := (statement_timestamp() at time zone 'America/Sao_Paulo')::date;
  limite integer;
  permitido boolean;
begin
  limite := case p_rota
    when 'comprovantes' then 30
    when 'veiculos' then 20
    when 'veiculos_analise' then 10
    when 'conexao' then 3
    when 'agente' then 20
    when 'contas' then 12
    when 'extratos' then 12
    when 'recebimentos' then 8
    else null
  end;
  if limite is null then
    raise exception using errcode = '22023', message = 'Rota de IA desconhecida.';
  end if;
  permitido := case p_rota
    when 'agente' then coalesce(public.is_admin(), false)
    when 'veiculos_analise' then coalesce(public.is_admin(), false)
    when 'conexao' then coalesce(public.is_admin(), false)
    when 'contas' then coalesce(public.can_access_fin_recebimentos(), false)
    when 'extratos' then coalesce(public.can_access_fin_recebimentos(), false)
    when 'recebimentos' then coalesce(public.can_access_fin_recebimentos(), false)
    else coalesce(public.is_active_user(), false)
  end;
  if ator is null or not permitido then
    raise exception using errcode = '42501', message = 'Sem autorização para reservar a cota de IA.';
  end if;

  insert into financeiro_privado.cotas_ia as c (usuario_id, rota, dia, quantidade)
  values (ator, p_rota, dia_atual, 1)
  on conflict (usuario_id, rota) do update
    set dia = excluded.dia,
        quantidade = case when c.dia < excluded.dia then 1 else c.quantidade + 1 end
    where c.dia < excluded.dia or (c.dia = excluded.dia and c.quantidade < limite);

  return found;
end;
$$;

revoke all on function public.financeiro_reservar_cota_ia(text) from public, anon;
grant execute on function public.financeiro_reservar_cota_ia(text) to authenticated;

commit;
