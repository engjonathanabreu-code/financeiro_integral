-- Mantém todos os pedidos, incluindo IDs legados. Novos pedidos usam UUID.
-- Depende da regra de complemento de veículo de 20261028123451.
-- A interface que usa financeiro_revisar_solicitacao deve sair junto com a conversão transacional.
begin;
set local lock_timeout='5s';
create schema if not exists financeiro_privado;
revoke all on schema financeiro_privado from public,anon,authenticated;


create or replace function public.financeiro_listar_solicitacoes()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ator uuid := auth.uid(); administrador boolean;
begin
  if ator is null or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501', message='Sessão ativa obrigatória.';
  end if;
  administrador := public.is_admin();
  return (
    select coalesce(jsonb_agg(pedido order by ord),'[]'::jsonb)
    from public.financeiro_estado_modulos m
    cross join lateral jsonb_array_elements(m.dados) with ordinality as p(pedido,ord)
    where m.chave='invoiceRequests' and (administrador or pedido->>'requesterId'=ator::text)
  );
end;
$$;
revoke all on function public.financeiro_listar_solicitacoes() from public,anon;
grant execute on function public.financeiro_listar_solicitacoes() to authenticated;

-- O UPDATE transacional da RPC abaixo continua acionando o guard de agendamento.
-- A política restritiva impede tanto acesso direto como renomear outro módulo para esta chave.
create policy financeiro_solicitacoes_somente_rpc
on public.financeiro_estado_modulos as restrictive for all to public
using (chave <> 'invoiceRequests' or (select public.is_admin()))
with check (chave <> 'invoiceRequests' or (select public.is_admin()));

create or replace function public.financeiro_save_invoice_request(p_request jsonb, p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_requests jsonb;
  existing jsonb;
  result jsonb;
  solicitante public.profiles;
begin
  if auth.uid() is null or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  if p_expected is null and (
    jsonb_typeof(p_request->'id') is distinct from 'string'
    or coalesce(p_request->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode='22023',message='Identificador de solicitação inválido.';
  end if;
  insert into public.financeiro_estado_modulos(chave,dados,updated_by)
    select 'invoiceRequests','[]'::jsonb,auth.uid() where not exists (select 1 from public.financeiro_estado_modulos where chave='invoiceRequests') on conflict (chave) do nothing;
  select dados into current_requests from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  select value into existing from jsonb_array_elements(current_requests) where value->>'id'=p_request->>'id';
  if p_expected is null then
    if existing is not null then raise exception 'Não foi possível usar este identificador.'; end if;
    if p_request->>'status' is distinct from 'Pendente'
      or p_request ?| array['reviewedBy','reviewedById','reviewedAt','reviewedBaseHash','convertedId'] then
      raise exception using errcode='42501',message='Novas solicitações começam pendentes.';
    end if;
    select * into solicitante from public.profiles where id=auth.uid() and ativo;
    p_request := (p_request - array['requesterLocalUserId','history','response']) || jsonb_build_object(
      'requesterId',solicitante.id,'requesterName',solicitante.nome,'requesterSector',solicitante.tipo);
    result := current_requests || jsonb_build_array(p_request);
  else
    if not public.is_admin() and not financeiro_veiculos_privado.complemento_veiculo(existing,p_request) then raise exception using errcode='42501',message='Somente ADM pode aprovar ou rejeitar. O solicitante só pode completar o veículo ainda não escolhido.'; end if;
    if p_request->>'status' is distinct from existing->>'status'
      or p_request->'convertedId' is distinct from existing->'convertedId' then
      raise exception using errcode='42501',message='Registre a decisão no fluxo de revisão de solicitações.';
    end if;
    if existing is distinct from p_expected then raise exception 'Solicitação atualizada por outro usuário. Reabra a solicitação.'; end if;
    select jsonb_agg(case when value->>'id'=p_request->>'id' then p_request else value end order by ord)
      into result from jsonb_array_elements(current_requests) with ordinality as a(value,ord);
  end if;
  update public.financeiro_estado_modulos set dados=result,updated_by=auth.uid(),updated_at=now() where chave='invoiceRequests';
  return public.financeiro_listar_solicitacoes();
end;
$$;

revoke all on function public.financeiro_save_invoice_request(jsonb,jsonb) from public,anon;
grant execute on function public.financeiro_save_invoice_request(jsonb,jsonb) to authenticated;
-- Vínculo de um pedido histórico não depende do espelho local nem do setor atual.
create or replace function financeiro_privado.solicitante_da_viagem(p_viagem jsonb,p_usuario uuid)
returns boolean language sql stable set search_path='' as $$
  select p_usuario is not null and exists (
    select 1 from public.profiles p where p.id=p_usuario and p.ativo
  ) and exists (
    select 1 from public.financeiro_estado_modulos m
    cross join lateral jsonb_array_elements(m.dados) pedido
    where m.chave='invoiceRequests'
      and pedido->>'id'=p_viagem->>'invoiceRequestId'
      and pedido->>'convertedId'=p_viagem->>'id'
      and pedido->>'requesterId'=p_usuario::text
      and pedido->>'category'='trip' and pedido->>'status'='Aprovada'
      and nullif(pedido->>'reviewedAt','') is not null
  )
$$;
revoke all on function financeiro_privado.solicitante_da_viagem(jsonb,uuid) from public,anon,authenticated;

create or replace function public.financeiro_revisar_solicitacao(
  p_id text, p_esperado jsonb, p_aprovar boolean, p_resposta text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  pedidos jsonb; pedido jsonb; solicitante public.profiles; revisor public.profiles;
  destino text; atribuicao jsonb; id_local jsonb; registro jsonb; parcela jsonb;
  status_novo text; data_necessaria date; valor numeric; convertido bigint;
  agora timestamptz := clock_timestamp(); quantidade integer; base_hash text; usuarios jsonb;
begin
  select * into revisor from public.profiles where id=auth.uid() and ativo;
  if revisor.id is null or not coalesce(public.is_admin(),false) then
    raise exception using errcode='42501',message='Somente ADM pode revisar solicitações.';
  end if;
  if p_aprovar is null or nullif(btrim(p_resposta),'') is null then
    raise exception using errcode='22023',message='Informe a decisão e uma resposta.';
  end if;
  p_resposta := btrim(p_resposta);
  base_hash := encode(sha256(convert_to(p_esperado::text,'UTF8')),'hex');
  status_novo := case when p_aprovar then 'Aprovada' else 'Rejeitada' end;
  select dados into pedidos from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  select value into pedido from jsonb_array_elements(pedidos) where value->>'id'=p_id;
  if pedido is null then raise exception 'Solicitação não encontrada.'; end if;
  -- Retry da mesma decisão após uma resposta perdida: não cria entidades novamente.
  if pedido->>'status'=status_novo and pedido->>'response'=p_resposta
    and pedido->>'reviewedById'=revisor.id::text
    and pedido->>'reviewedBaseHash'=base_hash then
    return public.financeiro_listar_solicitacoes();
  end if;
  if pedido->>'status' is distinct from 'Pendente' or pedido is distinct from p_esperado then
    raise exception using errcode='40001',message='Solicitação atualizada. Reabra a solicitação.';
  end if;

  if p_aprovar then
    select * into solicitante from public.profiles where id::text=pedido->>'requesterId' and ativo;
    if solicitante.id is null then raise exception 'Confira o perfil ativo do solicitante.'; end if;
    case pedido->>'category'
      when 'trip' then destino := 'trips';
      when 'budget' then destino := 'budgetRecords';
      when 'purchase' then destino := 'accountMasters';
      else raise exception 'Categoria de solicitação inválida.';
    end case;
    if pedido->>'convertedId' is not null then
      raise exception 'Solicitação já vinculada. Confira o histórico antes de converter.';
    end if;
    valor := coalesce((pedido->>'estimatedValue')::numeric,0);
    if valor::text in ('NaN','Infinity','-Infinity') or valor<0 then
      raise exception 'Orçamento da solicitação inválido.';
    end if;
    data_necessaria := coalesce(nullif(pedido->>'neededAt','')::date,(agora at time zone 'America/Sao_Paulo')::date);

    if destino in ('trips','budgetRecords') then
      select dados into usuarios from public.financeiro_estado_modulos where chave='usersMvp' for share;
      select count(*)::int into quantidade from jsonb_array_elements(usuarios)
      where value->>'erpId'=solicitante.id::text and value->>'active' is distinct from 'false';
      if quantidade<>1 then
        raise exception 'Confira o vínculo único do solicitante no cadastro de usuários.';
      end if;
      select value->'id' into id_local
      from jsonb_array_elements(usuarios)
      where value->>'erpId'=solicitante.id::text
        and value->>'active' is distinct from 'false';
      if nullif(id_local #>> '{}','') is null or (
        select count(*) from jsonb_array_elements(usuarios) where value->>'id'=(id_local #>> '{}')
      )<>1 then
        raise exception 'Confira o vínculo único do solicitante no cadastro de usuários.';
      end if;
      atribuicao := jsonb_build_array(id_local);
    end if;
    if destino='trips' and (valor<=0 or nullif(pedido->>'neededAt','') is null
      or not exists(select 1 from public.financeiro_veiculos where id=pedido->>'vehicleId')) then
      raise exception 'Informe veículo, data e orçamento maior que zero para aprovar a viagem.';
    end if;

    -- IDs numéricos preservam os consumidores legados que comparam com Number.
    -- A faixa fica abaixo do limite de inteiros exatos do JavaScript.
    convertido := 281474976710656 + ('x'||substr(replace(gen_random_uuid()::text,'-',''),1,12))::bit(48)::bigint;
    perform 1 from public.financeiro_estado_modulos
    where chave=destino or (destino='accountMasters' and chave='accountPayments')
    order by chave for update;
    if exists(
      select 1 from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(m.dados) item
      where (m.chave=destino or (destino='accountMasters' and m.chave='accountPayments'))
      and (item->>'invoiceRequestId'=p_id or item->>'id' in (convertido::text,(convertido+1)::text))
    ) then raise exception 'Já existe registro para esta solicitação ou identificador. Confira antes de aprovar.'; end if;

    registro := jsonb_build_object('id',convertido,'sector',coalesce(solicitante.tipo,'Administrativo'),'invoiceRequestId',p_id);
    if destino='trips' then
      registro := registro || jsonb_build_object(
        'city',coalesce(nullif(pedido->>'destination',''),'A definir'),
        'project',coalesce(nullif(pedido->>'project',''),pedido->>'title'),'start',data_necessaria,'end',data_necessaria,
        'period',to_char(data_necessaria,'DD/MM/YYYY')||' a '||to_char(data_necessaria,'DD/MM/YYYY'),
        'month',to_char(data_necessaria,'YYYY-MM'),'employee',solicitante.nome,'status','Planejada',
        'objective',pedido->>'description','report','','assigned',atribuicao,'plannedAmount',valor,
        'declared',0,'proven',0,'aiScore',0,'issues','[]'::jsonb,'vehicleId',pedido->>'vehicleId');
    elsif destino='budgetRecords' then
      registro := registro || jsonb_build_object(
        'name',pedido->>'title','limit',valor,'erpPlan',coalesce(pedido->>'project',''),
        'erpPlanId','','erpProjectId','','assignedDirect',atribuicao,'assigned',atribuicao,
        'requestedById',id_local,'requestedByName',solicitante.nome,'active',true,
        'history',jsonb_build_array(jsonb_build_object('at',agora,'action','Criado por solicitação aprovada','by',revisor.nome)));
    else
      registro := registro || jsonb_build_object(
        'name',pedido->>'title','supplier','A definir','category','Compra avulsa / investimento',
        'method','A definir','recurrence','Compra única','active',true);
      parcela := jsonb_build_object('id',convertido+1,'accountId',convertido,'value',valor,
        'due',data_necessaria,'status','A vencer','barcode','','source','Solicitação aprovada','invoiceRequestId',p_id);
      insert into public.financeiro_estado_modulos as m(chave,dados,updated_by,updated_at)
      values('accountPayments',jsonb_build_array(parcela),revisor.id,agora)
      on conflict(chave) do update set dados=m.dados||excluded.dados,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    end if;
    insert into public.financeiro_estado_modulos as m(chave,dados,updated_by,updated_at)
    values(destino,jsonb_build_array(registro),revisor.id,agora)
    on conflict(chave) do update set dados=m.dados||excluded.dados,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    pedido := pedido || jsonb_build_object('convertedId',convertido);
  end if;

  pedido := pedido || jsonb_build_object('status',status_novo,'response',p_resposta,'reviewedAt',agora,
    'reviewedBy',revisor.nome,'reviewedById',revisor.id,'reviewedBaseHash',base_hash,'updatedAt',agora,'history',
    coalesce(pedido->'history','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'at',agora,'action',case when p_aprovar then 'Aprovada e convertida' else 'Rejeitada' end,'by',revisor.nome)));
  update public.financeiro_estado_modulos
    set dados=(select jsonb_agg(case when value->>'id'=p_id then pedido else value end order by ord)
      from jsonb_array_elements(pedidos) with ordinality as a(value,ord)),
      updated_by=revisor.id,updated_at=agora where chave='invoiceRequests';
  return public.financeiro_listar_solicitacoes();
end;
$$;
revoke all on function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text) from public,anon;
grant execute on function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text) to authenticated;

commit;
