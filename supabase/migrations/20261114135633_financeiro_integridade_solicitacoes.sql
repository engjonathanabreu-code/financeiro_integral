-- Mantém o contrato existente de aprovação e torna o fluxo obrigatório.
-- A instalação não altera solicitações, destinos, anexos nem históricos.
begin;
set local lock_timeout = '5s';

do $$ begin
  if (select md5(prosrc) from pg_proc where oid='public.financeiro_save_invoice_request(jsonb,jsonb)'::regprocedure)
      is distinct from '435ef470e38fda31a1ccb00378918c5e'
    or (select md5(prosrc) from pg_proc where oid='public.financeiro_revisar_solicitacao(text,jsonb,boolean,text)'::regprocedure)
      is distinct from '1535ee9647ab7dc53af65c18a2c7c9ef' then
    raise exception 'Funções de Solicitações divergiram da base aprovada. Revalide antes de aplicar.';
  end if;
end $$;

create or replace function public.financeiro_save_invoice_request(p_request jsonb, p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_requests jsonb;
  existing jsonb;
  result jsonb;
  solicitante public.profiles;
  instante timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  if jsonb_typeof(p_request) is distinct from 'object' or nullif(p_request->>'id','') is null then
    raise exception using errcode='22023',message='Solicitação inválida.';
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
    if p_request->>'category' is null or p_request->>'category' not in ('trip','budget','purchase') then
      raise exception using errcode='22023',message='Categoria de solicitação inválida.';
    end if;
    if p_request->>'status' is distinct from 'Pendente'
      or p_request ?| array['reviewedBy','reviewedById','reviewedAt','reviewedBaseHash','convertedId','convertedPaymentId'] then
      raise exception using errcode='42501',message='Novas solicitações começam pendentes.';
    end if;
    select * into solicitante from public.profiles where id=auth.uid() and ativo;
    if solicitante.id is null then
      raise exception using errcode='42501',message='Sessão ativa obrigatória.';
    end if;
    p_request := (p_request - array['requesterLocalUserId','history','response']) || jsonb_build_object(
      'requesterId',solicitante.id,'requesterName',solicitante.nome,'requesterSector',solicitante.tipo);
    if existing is not null then
      if existing->>'requesterId'=solicitante.id::text
         and (existing-array['createdAt','updatedAt','history','response']) is not distinct from
             (p_request-array['createdAt','updatedAt']) then
        return public.financeiro_listar_solicitacoes();
      end if;
      raise exception 'Não foi possível usar este identificador.';
    end if;
    p_request := p_request || jsonb_build_object(
      'createdAt',instante,'updatedAt',instante,
      'history',jsonb_build_array(jsonb_build_object('at',instante,'action','Solicitação enviada','by',solicitante.nome)));
    result := current_requests || jsonb_build_array(p_request);
  else
    if not public.is_admin() and not financeiro_veiculos_privado.complemento_veiculo(existing,p_request) then
      raise exception using errcode='42501',message='Somente ADM pode aprovar ou rejeitar. O solicitante só pode completar o veículo ainda não escolhido.';
    end if;
    if existing is null or existing is distinct from p_expected then
      raise exception using errcode='40001',message='Solicitação atualizada por outro usuário. Reabra a solicitação.';
    end if;
    if (p_request - array['title','description','descriptionHtml','estimatedValue','neededAt','project','destination','vehicleId','updatedAt'])
      is distinct from
       (existing - array['title','description','descriptionHtml','estimatedValue','neededAt','project','destination','vehicleId','updatedAt']) then
      raise exception using errcode='42501',message='A identidade, a decisão e os vínculos da solicitação devem ser preservados.';
    end if;
    if existing->>'status' is distinct from 'Pendente'
       and (p_request-'vehicleId') is distinct from (existing-'vehicleId') then
      raise exception using errcode='42501',message='Os dados da solicitação revisada devem ser preservados.';
    end if;
    select jsonb_agg(case when value->>'id'=p_request->>'id' then p_request else value end order by ord)
      into result from jsonb_array_elements(current_requests) with ordinality as a(value,ord);
  end if;
  update public.financeiro_estado_modulos set dados=result,updated_by=auth.uid(),updated_at=now() where chave='invoiceRequests';
  return public.financeiro_listar_solicitacoes();
end;
$$;

revoke all on function public.financeiro_save_invoice_request(jsonb,jsonb) from public,anon;
grant execute on function public.financeiro_save_invoice_request(jsonb,jsonb) to authenticated;
create or replace function public.financeiro_revisar_solicitacao(
  p_id text, p_esperado jsonb, p_aprovar boolean, p_resposta text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  pedidos jsonb; pedido jsonb; solicitante public.profiles; revisor public.profiles;
  destino text; atribuicao jsonb; id_local jsonb; registro jsonb; parcela jsonb;
  status_novo text; data_necessaria date; valor numeric; convertido bigint;
  agora timestamptz := clock_timestamp(); quantidade integer; base_hash text; usuarios jsonb;
  espelho_conta text; espelho_parcela text;
begin
  select * into revisor from public.profiles where id=auth.uid() and ativo;
  if revisor.id is null or not coalesce(public.is_admin(),false) then
    raise exception using errcode='42501',message='Somente ADM pode revisar solicitações.';
  end if;
  if jsonb_typeof(p_esperado) is distinct from 'object' or p_esperado->>'id' is distinct from p_id
     or p_id is null or p_aprovar is null or nullif(btrim(p_resposta),'') is null then
    raise exception using errcode='22023',message='Informe a decisão e uma resposta.';
  end if;
  p_resposta := btrim(p_resposta);
  base_hash := encode(sha256(convert_to(p_esperado::text,'UTF8')),'hex');
  status_novo := case when p_aprovar then 'Aprovada' else 'Rejeitada' end;
  select dados into pedidos from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  select count(*), jsonb_agg(value)->0 into quantidade, pedido
  from jsonb_array_elements(pedidos) where value->>'id'=p_id;
  if quantidade<>1 then raise exception 'Solicitação não encontrada ou identificador duplicado.'; end if;
  destino := case pedido->>'category'
      when 'trip' then 'trips'
      when 'budget' then 'budgetRecords'
      when 'purchase' then 'accountMasters'
      end;
  -- Retry da mesma decisão após uma resposta perdida: não cria entidades novamente.
  if pedido->>'status'=status_novo and pedido->>'response'=p_resposta
    and pedido->>'reviewedById'=revisor.id::text
    and pedido->>'reviewedBaseHash'=base_hash then
    if p_aprovar then
      select count(*) into quantidade from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(m.dados) item
      where m.chave=destino and item->>'id'=pedido->>'convertedId' and item->>'invoiceRequestId'=p_id;
      if quantidade<>1 then raise exception 'Vínculo da conversão indisponível. Confira o histórico.'; end if;
      if destino='accountMasters' then
        select count(*) into quantidade from public.financeiro_estado_modulos m
        cross join lateral jsonb_array_elements(m.dados) item
        where m.chave='accountPayments' and item->>'accountId'=pedido->>'convertedId'
          and item->>'invoiceRequestId'=p_id and
          (pedido->>'convertedPaymentId' is null or item->>'id'=pedido->>'convertedPaymentId');
        if quantidade<>1 then raise exception 'Vínculo da parcela indisponível. Confira o histórico.'; end if;
      end if;
    end if;
    return public.financeiro_listar_solicitacoes();
  end if;
  if pedido->>'status' is distinct from 'Pendente' or pedido is distinct from p_esperado then
    raise exception using errcode='40001',message='Solicitação atualizada. Reabra a solicitação.';
  end if;

  if p_aprovar then
    select * into solicitante from public.profiles where id::text=pedido->>'requesterId' and ativo;
    if solicitante.id is null then raise exception 'Confira o perfil ativo do solicitante.'; end if;
    if destino is null then raise exception 'Categoria de solicitação inválida.'; end if;
    if pedido->>'convertedId' is not null then
      raise exception 'Solicitação já vinculada. Confira o histórico antes de converter.';
    end if;
    valor := coalesce((pedido->>'estimatedValue')::numeric,0);
    if valor::text in ('NaN','Infinity','-Infinity') or valor<0 or valor>=1000000000000 or valor<>round(valor,2) then
      raise exception 'Orçamento da solicitação inválido.';
    end if;
    if destino='accountMasters' and valor<=0 then
      raise exception 'Informe valor maior que zero para aprovar a compra.';
    end if;
    if nullif(pedido->>'neededAt','') is not null and pedido->>'neededAt' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Data da solicitação inválida.';
    end if;
    data_necessaria := coalesce(nullif(pedido->>'neededAt','')::date,(agora at time zone 'America/Sao_Paulo')::date);

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
      if coalesce(jsonb_typeof(id_local),'') not in ('number','string') or nullif(btrim(id_local #>> '{}'),'') is null or (
        select count(*) from jsonb_array_elements(usuarios) where value->>'id'=(id_local #>> '{}')
      )<>1 then
        raise exception 'Confira o vínculo único do solicitante no cadastro de usuários.';
      end if;
      atribuicao := jsonb_build_array(id_local);
    end if;
    if exists(
      select 1 from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(m.dados) item
      where (m.chave=destino or (destino='accountMasters' and m.chave='accountPayments'))
      and (item->>'invoiceRequestId'=p_id or item->>'id' in (convertido::text,(convertido+1)::text))
    ) then raise exception 'Já existe registro para esta solicitação ou identificador. Confira antes de aprovar.'; end if;

    if destino='accountMasters' then
      select id into espelho_conta from public.financeiro_contas where id=convertido::text;
      select id into espelho_parcela from public.financeiro_pagamentos where id=(convertido+1)::text;
      if espelho_conta is not null or espelho_parcela is not null then
        raise exception 'Identificador já utilizado. Confira antes de aprovar.';
      end if;
    end if;
    registro := jsonb_build_object('id',convertido,'sector',coalesce(nullif(btrim(solicitante.tipo),''),'Administrativo'),
      'invoiceRequestId',p_id);
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
        'method','A definir','recurrence','Compra única','active',true,'invoicePaymentId',convertido+1);
      parcela := jsonb_build_object('id',convertido+1,'accountId',convertido,'value',valor,
        'due',data_necessaria,'status','A vencer','barcode','','source','Solicitação aprovada','invoiceRequestId',p_id);
    end if;
    insert into public.financeiro_estado_modulos as m(chave,dados,updated_by,updated_at)
    values(destino,jsonb_build_array(registro),revisor.id,agora)
    on conflict(chave) do update set dados=m.dados||excluded.dados,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    if parcela is not null then
      insert into public.financeiro_estado_modulos as m(chave,dados,updated_by,updated_at)
      values('accountPayments',jsonb_build_array(parcela),revisor.id,agora)
      on conflict(chave) do update set dados=m.dados||excluded.dados,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
      pedido := pedido || jsonb_build_object('convertedPaymentId',convertido+1);
    end if;
    pedido := pedido || jsonb_build_object('convertedId',convertido);
  end if;

  pedido := pedido || jsonb_build_object('status',status_novo,'response',p_resposta,'reviewedAt',agora,
    'reviewedBy',revisor.nome,'reviewedById',revisor.id,'reviewedBaseHash',base_hash,'updatedAt',agora,'history',
    (case when jsonb_typeof(pedido->'history') is null then '[]'::jsonb
         when jsonb_typeof(pedido->'history')='array' then pedido->'history'
         else jsonb_build_array(pedido->'history') end)||jsonb_build_array(jsonb_build_object(
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

create function financeiro_privado.reservar_gravacao_solicitacoes()
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
revoke all on function financeiro_privado.reservar_gravacao_solicitacoes() from public,anon,authenticated;
create trigger financeiro_b_reservar_gravacao_solicitacoes
  before insert or update or delete on public.financeiro_estado_modulos
  for each row execute function financeiro_privado.reservar_gravacao_solicitacoes();

create function financeiro_privado.proteger_vinculos_solicitacoes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  modulo text;
  anteriores jsonb := '[]';
  novos jsonb := '[]';
  pedidos jsonb;
  categoria text;
  pedido jsonb;
  destino text;
  registro jsonb;
  quantidade integer;
begin
  -- Preserva registros já existentes. A conversão escreve os filhos
  -- antes de gravar a aprovação, na mesma transação.
  if tg_op='INSERT' then
    modulo:=new.chave;
    if modulo<>'invoiceRequests' then return new; end if;
  else
    modulo:=old.chave;
    if modulo not in ('invoiceRequests','trips','budgetRecords','accountMasters','accountPayments')
       or jsonb_typeof(old.dados) is distinct from 'array' then
      if tg_op='DELETE' then return old; end if;
      return new;
    end if;
    anteriores:=old.dados;
  end if;
  if tg_op<>'DELETE' and new.chave=modulo and jsonb_typeof(new.dados)='array' then
    if tg_op='UPDATE' and anteriores=new.dados then return new; end if;
    novos:=new.dados;
  end if;

  if modulo='invoiceRequests' then
    if exists (
      select a-'vehicleId' from jsonb_array_elements(anteriores) a
      where a->>'status' in ('Aprovada','Rejeitada') or a->>'convertedId' is not null
      except all
      select n-'vehicleId' from jsonb_array_elements(novos) n
    ) then
      raise exception using errcode='42501',message='A decisão e o vínculo da solicitação devem permanecer no histórico.';
    end if;
    for pedido in
      select n from jsonb_array_elements(novos) n
      where n->>'status'='Aprovada' and not exists (
        select 1 from jsonb_array_elements(anteriores) a
        where a-'vehicleId'=n-'vehicleId'
      )
    loop
      destino:=case pedido->>'category' when 'trip' then 'trips' when 'budget' then 'budgetRecords'
        when 'purchase' then 'accountMasters' end;
      select count(*),jsonb_agg(item)->0 into quantidade,registro
      from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(m.dados) item
      where m.chave=destino and item->>'id'=pedido->>'convertedId'
        and item->>'invoiceRequestId'=pedido->>'id';
      if quantidade<>1 then
        raise exception using errcode='42501',message='A aprovação exige vínculo recíproco com o registro convertido.';
      end if;
      if destino='accountMasters' then
        select count(*) into quantidade from public.financeiro_estado_modulos m
        cross join lateral jsonb_array_elements(m.dados) item
        where m.chave='accountPayments' and item->>'accountId'=registro->>'id'
          and item->>'invoiceRequestId'=pedido->>'id'
          and item->>'id'=pedido->>'convertedPaymentId'
          and item->>'id'=registro->>'invoicePaymentId';
        if quantidade<>1 then
          raise exception using errcode='42501',message='A aprovação da compra exige vínculo recíproco com sua parcela.';
        end if;
      end if;
    end loop;
  else
    categoria:=case modulo when 'trips' then 'trip' when 'budgetRecords' then 'budget'
      else 'purchase' end;
    select dados into pedidos from public.financeiro_estado_modulos where chave='invoiceRequests';
    -- A retirada toma trava compartilhada no módulo trips antes de inserir
    -- o uso. Esta guarda só lê os usos e não inverte a ordem de travas.
    if exists (
      select a->'id', a->'invoiceRequestId',
        case modulo when 'accountMasters' then a->'invoicePaymentId'
                       when 'accountPayments' then a->'accountId' end
      from jsonb_array_elements(anteriores) a
      where nullif(a->>'invoiceRequestId','') is not null
        or exists (
          select 1 from jsonb_array_elements(pedidos) p
          where p->>'status'='Aprovada' and p->>'category'=categoria
            and p->>'convertedId'=
              (case when modulo='accountPayments' then a->>'accountId' else a->>'id' end)
            and (modulo<>'accountPayments' or p->>'convertedPaymentId'=a->>'id'
              or (p->>'convertedPaymentId' is null and exists(
                select 1 from public.financeiro_estado_modulos m
                cross join lateral jsonb_array_elements(m.dados) c
                where m.chave='accountMasters' and c->>'id'=p->>'convertedId'
                  and c->>'invoiceRequestId'=p->>'id'
              )))
        )
        or (modulo='trips' and exists(
          select 1 from public.financeiro_veiculos_usos u where u.viagem_id=a->>'id'
        ))
      except all
      select n->'id', n->'invoiceRequestId',
        case modulo when 'accountMasters' then n->'invoicePaymentId'
                       when 'accountPayments' then n->'accountId' end
      from jsonb_array_elements(novos) n
    ) then
      raise exception using errcode='42501',message='Preserve o registro vinculado à solicitação ou ao uso de veículo.';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function financeiro_privado.proteger_vinculos_solicitacoes() from public,anon,authenticated;
create trigger financeiro_c_proteger_vinculos_solicitacoes
  before insert or update or delete on public.financeiro_estado_modulos
  for each row execute function financeiro_privado.proteger_vinculos_solicitacoes();

commit;
