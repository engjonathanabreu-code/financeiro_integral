begin;
set local lock_timeout = '5s';

alter function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text)
  rename to revisar_solicitacao_com_central;
alter function public.revisar_solicitacao_com_central(text,jsonb,boolean,text)
  set schema financeiro_solicitacoes_privado;
revoke all on function financeiro_solicitacoes_privado.revisar_solicitacao_com_central(text,jsonb,boolean,text)
  from public, anon, authenticated;

create function financeiro_solicitacoes_privado.normalizar_destino_viagem(p_destino text)
returns text language sql immutable set search_path='' as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p_destino,'')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', ' ', 'g'))
$$;
revoke all on function financeiro_solicitacoes_privado.normalizar_destino_viagem(text) from public, anon, authenticated;

create function public.financeiro_revisar_solicitacao(
  p_id text,p_esperado jsonb,p_aprovar boolean,p_resposta text,p_viagens_conferidas text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  pedido jsonb;
  destino text;
  outros jsonb := '[]'::jsonb;
  conferencia text;
  itens jsonb;
begin
  if not coalesce(public.is_admin(),false) or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Somente ADM pode revisar solicitações.';
  end if;

  -- A mesma trava da revisão original serializa aprovações de pedidos com IDs diferentes.
  perform 1 from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  pedido:=financeiro_solicitacoes_privado.pedido(p_id);
  if p_aprovar and pedido->>'status'='Pendente' and pedido->>'category'='trip'
      and pedido is not distinct from p_esperado then
    destino:=financeiro_solicitacoes_privado.normalizar_destino_viagem(pedido->>'destination');
    if destino<>'' and nullif(pedido->>'neededAt','') is not null then
      select coalesce(jsonb_agg(jsonb_build_object('id',previo->>'id','title',previo->>'title')
        order by previo->>'id'),'[]'::jsonb) into outros
      from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(m.dados) p(previo)
      where m.chave='invoiceRequests' and previo->>'id'<>p_id
        and previo->>'category'='trip' and previo->>'status'='Aprovada'
        and previo->>'requesterId'=pedido->>'requesterId'
        and previo->>'neededAt'=pedido->>'neededAt'
        and financeiro_solicitacoes_privado.normalizar_destino_viagem(previo->>'destination')=destino
        and exists(
          select 1 from public.financeiro_estado_modulos v
          cross join lateral jsonb_array_elements(v.dados) t(viagem)
          where v.chave='trips' and viagem->>'id'=previo->>'convertedId'
            and viagem->>'invoiceRequestId'=previo->>'id'
        );
    end if;
    if outros<>'[]'::jsonb then
      conferencia:=encode(sha256(convert_to(outros::text,'UTF8')),'hex');
      if p_viagens_conferidas is distinct from conferencia then
        raise exception using errcode='PT409',
          message='Já existe viagem aprovada para este solicitante, destino e data.',
          detail=jsonb_build_object('conferencia',conferencia,'pedidos',outros)::text;
      end if;
    elsif p_viagens_conferidas is not null then
      raise exception using errcode='40001',message='Os pedidos relacionados mudaram. Reabra a solicitação.';
    end if;
  end if;

  itens:=financeiro_solicitacoes_privado.revisar_solicitacao_com_central(p_id,p_esperado,p_aprovar,p_resposta);
  if conferencia is not null then
    perform financeiro_solicitacoes_privado.registrar_evento(p_id,'approve_distinct_trip',
      'Aprovada como viagem distinta após conferência dos pedidos relacionados.',
      jsonb_build_object('pedidos',outros),false,null,null);
  end if;
  return itens;
end $$;

-- A assinatura existente preserva clientes legados e aplica a mesma guarda.
create function public.financeiro_revisar_solicitacao(
  p_id text,p_esperado jsonb,p_aprovar boolean,p_resposta text
) returns jsonb language sql security invoker set search_path='' as $$
  select public.financeiro_revisar_solicitacao(p_id,p_esperado,p_aprovar,p_resposta,null::text)
$$;

revoke all on function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text),
  public.financeiro_revisar_solicitacao(text,jsonb,boolean,text,text) from public, anon;
grant execute on function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text),
  public.financeiro_revisar_solicitacao(text,jsonb,boolean,text,text) to authenticated;

commit;
