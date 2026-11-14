-- Correção incremental: escolha do carro na solicitação e retirada no dia agendado.
-- Pré-requisitos: financeiro_solicitacoes_permissoes.sql e financeiro_veiculos.sql.
-- Sem UPDATE/DELETE de dados existentes, alterações de tabelas, RLS ou permissões legadas.
begin;
-- Abort if a later release has changed these bodies; never overwrite unknown production logic.
do $$
begin
 if (select md5(prosrc) from pg_proc where oid='public.financeiro_guard_invoice_requests()'::regprocedure) is distinct from '2741b5b53171f3c19a570ec861222ebb'
 or (select md5(prosrc) from pg_proc where oid='public.financeiro_save_invoice_request(jsonb,jsonb)'::regprocedure) is distinct from 'fbc94cdbded6a5d900e518d9be153b85'
 or (select md5(prosrc) from pg_proc where oid='financeiro_veiculos_privado.api(text,jsonb)'::regprocedure) is distinct from '90b91d2c4d55b4e9193cf2d443390e05' then
  raise exception 'As funções mudaram desde a revisão. Revalide a correção antes de aplicar.';
 end if;
end $$;
create or replace function financeiro_veiculos_privado.complemento_veiculo(anterior jsonb, novo jsonb)
returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce(public.is_active_user() and anterior->>'requesterId'=auth.uid()::text
  and anterior->>'category'='trip' and anterior->>'status' in ('Pendente','Aprovada')
  and nullif(anterior->>'vehicleId','') is null
  and (novo-'vehicleId')=(anterior-'vehicleId')
  and exists(select 1 from public.financeiro_veiculos where id=novo->>'vehicleId'),false)
$$;
revoke all on function financeiro_veiculos_privado.complemento_veiculo(jsonb,jsonb) from public,anon;
grant execute on function financeiro_veiculos_privado.complemento_veiculo(jsonb,jsonb) to authenticated;

create or replace function financeiro_veiculos_privado.impedimento(a jsonb, eu public.profiles, hoje date)
returns text language plpgsql stable security invoker set search_path='' as $$
declare t jsonb; dia date;
begin
 if a is null or a->>'category' is distinct from 'trip' then return 'Solicitação de viagem não encontrada.'; end if;
 if a->>'requesterId' is distinct from eu.id::text then return 'Somente o solicitante pode retirar o veículo desta viagem.'; end if;
 if a->>'status' is distinct from 'Aprovada' or nullif(a->>'reviewedAt','') is null then return 'A solicitação de viagem precisa estar aprovada pelo administrador.'; end if;
 if coalesce(a->>'neededAt','') !~ '^\d{4}-\d{2}-\d{2}$' then return 'Data da viagem não informada. Peça a correção ao administrador.'; end if;
 begin dia:=(a->>'neededAt')::date;exception when invalid_datetime_format or datetime_field_overflow then return 'Data da viagem inválida. Peça a correção ao administrador.';end;
 if dia>hoje then return 'Retirada liberada somente em '||to_char(dia,'DD/MM/YYYY')||', na data da viagem aprovada.'; end if;
 if dia<hoje then return 'A data da viagem aprovada ('||to_char(dia,'DD/MM/YYYY')||') já passou. Peça ao administrador para revisar o agendamento.'; end if;
 if not exists(select 1 from public.financeiro_veiculos where id=a->>'vehicleId') then return 'Escolha o veículo em Solicitações → Detalhes → Salvar veículo. A aprovação existente será preservada.'; end if;
 if coalesce((a->>'estimatedValue')::numeric,0)<=0 then return 'A viagem aprovada precisa de orçamento maior que zero. Peça a revisão ao administrador.'; end if;
 t:=financeiro_veiculos_privado.registro('trips',a->>'convertedId');
 if t is null or t->>'invoiceRequestId' is distinct from a->>'id' or t->>'id' is distinct from a->>'convertedId' then return 'A viagem aprovada ainda não está vinculada corretamente. Peça ao administrador para conferir a conversão.'; end if;
 if not financeiro_veiculos_privado.acesso(t,eu) then return 'Seu acesso à viagem aprovada precisa ser conferido pelo administrador.'; end if;
 if exists(select 1 from public.financeiro_veiculos_usos where solicitacao_id=a->>'id' and estado<>'cancelado') then return 'Esta solicitação de viagem aprovada já possui uma retirada registrada. Consulte Meus usos.'; end if;
 return null;
end $$;
revoke all on function financeiro_veiculos_privado.impedimento(jsonb,public.profiles,date) from public,anon,authenticated;

-- Keep the shared state format and every other module's existing permissions.
-- Invoker security: the existing table RLS and the immutable server-side profile apply.
create or replace function public.financeiro_guard_invoice_requests()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  previous jsonb := '[]'::jsonb;
  item jsonb;
  old_item jsonb;
  scheduled date;
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
  if tg_op = 'UPDATE' then
    previous := case when old.chave = 'invoiceRequests' then old.dados else '[]'::jsonb end;
  else
    -- UPSERT runs BEFORE INSERT before BEFORE UPDATE: compare existing records too.
    select dados into previous from public.financeiro_estado_modulos where chave='invoiceRequests';
    previous := coalesce(previous, '[]'::jsonb);
  end if;
  -- Validate only new/changed scheduling fields. Untouched historical records remain valid.
  for item in select value from jsonb_array_elements(new.dados) loop
    select value into old_item from jsonb_array_elements(previous) where value->>'id'=item->>'id';
    if item->>'category'='trip' and (old_item is null
       or (item->'vehicleId') is distinct from (old_item->'vehicleId')
       or (item->'neededAt') is distinct from (old_item->'neededAt')
       or old_item->>'category' is distinct from 'trip'
       or (item->>'status'='Aprovada' and old_item->>'status' is distinct from 'Aprovada')) then
      if not exists(select 1 from public.financeiro_veiculos where id=item->>'vehicleId') then
        raise exception 'Selecione o veículo da viagem.';
      end if;
      if coalesce(item->>'neededAt','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe a data da viagem.'; end if;
      scheduled:=(item->>'neededAt')::date;
    end if;
    if old_item is not null and ((item->'vehicleId') is distinct from (old_item->'vehicleId') or (item->'neededAt') is distinct from (old_item->'neededAt'))
       and exists(select 1 from public.financeiro_veiculos_usos where solicitacao_id=item->>'id' and estado<>'cancelado') then
      raise exception 'Não é permitido alterar veículo ou data após a retirada.';
    end if;
  end loop;
  if public.is_admin() then return new; end if;
  if exists (select 1 from jsonb_array_elements(previous) r where not exists (select 1 from jsonb_array_elements(new.dados) n where n = r or financeiro_veiculos_privado.complemento_veiculo(r,n))) then
    raise exception using errcode='42501', message='Somente ADM pode alterar, aprovar ou rejeitar solicitações existentes.';
  end if;
  for item in select value from jsonb_array_elements(new.dados) loop
    if exists (select 1 from jsonb_array_elements(previous) p where p = item or financeiro_veiculos_privado.complemento_veiculo(p,item)) then continue; end if;
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
    if not public.is_admin() and not financeiro_veiculos_privado.complemento_veiculo(existing,p_request) then raise exception using errcode='42501',message='Somente ADM pode aprovar ou rejeitar. O solicitante só pode completar o veículo ainda não escolhido.'; end if;
    if existing is distinct from p_expected then raise exception 'Solicitação atualizada por outro usuário. Reabra a solicitação.'; end if;
    select jsonb_agg(case when value->>'id'=p_request->>'id' then p_request else value end order by ord)
      into result from jsonb_array_elements(current_requests) with ordinality as a(value,ord);
  end if;
  update public.financeiro_estado_modulos set dados=result,updated_by=auth.uid(),updated_at=now() where chave='invoiceRequests';
  return result;
end;
$$;

create or replace function financeiro_veiculos_privado.api(acao text,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare eu public.profiles; adm boolean; a jsonb; u public.financeiro_veiculos_usos;
 v public.financeiro_veiculos; b jsonb; t jsonb; e jsonb; r uuid; at timestamptz; km numeric; anterior uuid; out jsonb; arquivo_ref text; bloqueio text; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 select * into eu from public.profiles where id=auth.uid() and ativo=true;
 if eu.id is null then raise exception using errcode='42501',message='Sessão ativa obrigatória.'; end if;
 adm:=public.is_admin();
 if acao='painel' then
  select jsonb_build_object('admin',adm,'eu',eu.id,'hoje',hoje,
  'solicitacoes',(select coalesce(jsonb_agg(req_row||jsonb_build_object('impedimento',financeiro_veiculos_privado.impedimento(req_row,eu,hoje),'viagem',financeiro_veiculos_privado.registro('trips',req_row->>'convertedId'))),'[]') from public.financeiro_estado_modulos m cross join lateral jsonb_array_elements(m.dados) req_row where m.chave='invoiceRequests' and req_row->>'category'='trip' and req_row->>'requesterId'=eu.id::text),
  'veiculos',(select coalesce(jsonb_agg(to_jsonb(v_row)||jsonb_build_object('ocupado',exists(select 1 from public.financeiro_veiculos_usos x where x.veiculo_id=v_row.id and x.estado='aberto')) order by v_row.id),'[]') from public.financeiro_veiculos v_row),
  'aprovacoes',(select coalesce(jsonb_agg(req_row||jsonb_build_object('viagem',financeiro_veiculos_privado.registro('trips',req_row->>'convertedId'))),'[]') from public.financeiro_estado_modulos m cross join lateral jsonb_array_elements(m.dados) req_row where m.chave='invoiceRequests' and req_row->>'category'='trip' and req_row->>'status'='Aprovada' and (adm or req_row->>'requesterId'=eu.id::text)),
  'usos',(select coalesce(jsonb_agg(u_row order by u_row.retirada_em desc),'[]') from public.financeiro_veiculos_usos u_row where (adm or u_row.motorista=eu.id)),
  'relatos',(select coalesce(jsonb_agg(r_row order by r_row.criado_em desc),'[]') from public.financeiro_veiculos_relatos r_row where (adm or r_row.autor=eu.id)),
  'arquivos',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'uso_id',f.uso_id,'relato_id',f.relato_id,'etapa',f.etapa,'nome',f.nome)),'[]') from public.financeiro_veiculos_arquivos f where (adm or f.dono=eu.id or exists(select 1 from public.financeiro_veiculos_usos own_use where own_use.id=f.uso_id and own_use.motorista=eu.id))),
  'comprovantes',(select coalesce(jsonb_agg(exp_row),'[]') from public.financeiro_estado_modulos m cross join lateral jsonb_array_elements(m.dados) exp_row where m.chave='tripExpenses' and lower(exp_row->>'type') in ('combustível','combustivel') and exists(select 1 from public.financeiro_veiculos_usos candidate_use where candidate_use.viagem_id=exp_row->>'tripId' and (adm or candidate_use.motorista=eu.id))),
  'despesas',(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('atual',d.snapshot is not distinct from financeiro_veiculos_privado.registro('tripExpenses',d.despesa_id))),'[]') from public.financeiro_veiculos_despesas d join public.financeiro_veiculos_usos u_row on u_row.id=d.uso_id where (adm or u_row.motorista=eu.id))) into out;
  return out;
 elsif acao='arquivo' then
  select jsonb_build_object('dataUrl',conteudo,'name',nome) into out from public.financeiro_veiculos_arquivos f where f.id=(p->>'id')::uuid and (adm or f.dono=eu.id or exists(select 1 from public.financeiro_veiculos_usos own_use where own_use.id=f.uso_id and own_use.motorista=eu.id));
  if out is null then raise exception using errcode='42501',message='Arquivo indisponível.'; end if;return out;
 elsif acao='retirar' then
  if not exists(select 1 from pg_trigger where tgname='financeiro_guard_invoice_requests' and tgrelid='public.financeiro_estado_modulos'::regclass and tgenabled in ('O','A')) then raise exception 'Aprovação protegida indisponível. Retirada bloqueada.';end if;
  select * into v from public.financeiro_veiculos where id=p->>'veiculo_id' for update;
  if v.id is null then raise exception 'Veículo inválido.'; end if;
  select * into u from public.financeiro_veiculos_usos where id=(p->>'id')::uuid;
  if u.id is not null then
   if u.motorista<>eu.id then raise exception using errcode='42501',message='Sem acesso ao uso.'; end if;return to_jsonb(u);
  end if;
  perform 1 from public.financeiro_estado_modulos where chave in ('invoiceRequests','trips','usersMvp') order by chave for share;
  a:=financeiro_veiculos_privado.registro('invoiceRequests',p->>'solicitacao_id');
  t:=financeiro_veiculos_privado.registro('trips',a->>'convertedId');
  at:=(p->>'retirada_em')::timestamptz;km:=(p->>'km_inicial')::numeric;
  bloqueio:=financeiro_veiculos_privado.impedimento(a,eu,hoje);
  if bloqueio is not null then raise exception '%',bloqueio; end if;
  if a->>'vehicleId' is distinct from v.id then raise exception 'Retire somente o veículo escolhido na solicitação aprovada.'; end if;
  if at is null or (at at time zone 'America/Sao_Paulo')::date<>hoje then
    raise exception 'A retirada só pode ser registrada na data da viagem aprovada, pelo horário de Brasília.';
  end if;
  if at>now()+interval '5 minutes' or at<now()-interval '24 hours' or at<coalesce(v.ultima_data,at) or km is null or km>=1000000000 or km<coalesce(v.ultimo_km,0) or km<>round(km,1) or length(trim(p->>'destino')) not between 2 and 300 then raise exception 'Confira data/hora, destino e quilometragem não regressiva.'; end if;
  if exists(select 1 from public.financeiro_veiculos_usos where veiculo_id=v.id and estado='aberto') then raise exception 'Veículo já está em uso.'; end if;
  insert into public.financeiro_veiculos_usos(id,veiculo_id,motorista,motorista_nome,solicitacao_id,solicitacao,viagem_id,destino,retirada_em,km_inicial,tanque_inicial_cheio)
  values((p->>'id')::uuid,v.id,eu.id,coalesce(eu.nome,'Usuário'),a->>'id',a,a->>'convertedId',trim(p->>'destino'),at,km,coalesce((p->>'tanque_inicial_cheio')::boolean,false)) returning * into u;
  perform financeiro_veiculos_privado.foto(p->'foto',u.id,null,'retirada');return to_jsonb(u);
 elsif acao in ('devolver','cancelar','vincular') then
  -- Ordem fixa: veículo antes do uso evita deadlocks entre retirada e devolução.
  select veiculo_id into v.id from public.financeiro_veiculos_usos where id=(p->>'id')::uuid;
  perform 1 from public.financeiro_veiculos where id=v.id for update;
  select * into u from public.financeiro_veiculos_usos where id=(p->>'id')::uuid for update;
  if u.id is null or (u.motorista<>eu.id and not adm) then raise exception using errcode='42501',message='Sem acesso ao uso.'; end if;
  if acao='vincular' then
   if u.estado='cancelado' then raise exception 'Uso cancelado.'; end if;
   a:=u.solicitacao;
   perform 1 from public.financeiro_estado_modulos where chave='tripExpenses' for share;
   e:=financeiro_veiculos_privado.registro('tripExpenses',p->>'despesa_id');
   if e is null or e->>'tripId' is distinct from u.viagem_id or lower(e->>'type') not in ('combustível','combustivel')
    or coalesce(e->'file'->>'arquivoId',e->'file'->>'dataUrl',e->'file'->>'storagePath') is null
    or e->>'date' is null or (e->>'date')::date<(u.retirada_em at time zone 'America/Sao_Paulo')::date or (e->>'date')::date>(coalesce(u.devolucao_em,now()) at time zone 'America/Sao_Paulo')::date
    or coalesce((e->>'value')::numeric,(e->>'proven')::numeric,(e->>'declared')::numeric,0)<=0 then raise exception 'Selecione comprovante de combustível desta viagem e período com valor válido.'; end if;
   if e->'file'->>'arquivoId' is not null then
    if not exists(select 1 from public.financeiro_arquivos f where f.id::text=e->'file'->>'arquivoId' and f.conteudo ~ '^data:(image/(jpeg|png|webp|gif)|application/pdf);base64,') then raise exception 'Original do comprovante não encontrado. Salve na viagem e atualize.';end if;
    arquivo_ref:='arquivo:'||(e->'file'->>'arquivoId');
   elsif e->'file'->>'storagePath' is not null then
    if coalesce(e->'file'->>'storageBucket','documentos')<>'documentos' or not exists(select 1 from storage.objects o where o.bucket_id='documentos' and o.name=e->'file'->>'storagePath' and (adm or o.name like eu.id::text||'/%')) then raise exception 'Original do comprovante não encontrado.';end if;
    arquivo_ref:='documentos:'||(e->'file'->>'storagePath');
   else raise exception 'Aguarde o comprovante ser salvo na nuvem da viagem e atualize antes de vincular.';
   end if;
   if exists(select 1 from public.financeiro_veiculos_despesas where origem_arquivo=arquivo_ref and despesa_id<>p->>'despesa_id') then raise exception 'Este mesmo comprovante já está vinculado. Revise a duplicidade na viagem.';end if;
   if p->'esperado' is distinct from e then raise exception 'Despesa alterada. Atualize e revise novamente.'; end if;
   if exists(select 1 from public.financeiro_veiculos_despesas where despesa_id=p->>'despesa_id' and uso_id<>u.id) then raise exception 'Despesa já vinculada a outro uso.'; end if;
   insert into public.financeiro_veiculos_despesas(despesa_id,uso_id,snapshot,origem_arquivo,centavos,litros,revisado_por)
   values(p->>'despesa_id',u.id,e,arquivo_ref,round(coalesce((e->>'value')::numeric,(e->>'proven')::numeric,(e->>'declared')::numeric)*100)::bigint,nullif(p->>'litros','')::numeric,eu.id)
   on conflict(despesa_id) do update set snapshot=excluded.snapshot,origem_arquivo=excluded.origem_arquivo,centavos=excluded.centavos,litros=excluded.litros,revisado_por=excluded.revisado_por,revisado_em=now();return '{}'::jsonb;
  end if;
  if u.estado<>'aberto' then
   if (acao='devolver' and u.estado='devolvido') or (acao='cancelar' and u.estado='cancelado') then return to_jsonb(u); end if;
   raise exception 'O uso já foi encerrado.';
  end if;
  if acao='cancelar' then
   if length(trim(coalesce(p->>'motivo',''))) not between 10 and 1000 or now()>u.criado_em+interval '15 minutes' then raise exception 'Cancelamento só em até 15 minutos, com motivo. Se houve deslocamento, registre a devolução.'; end if;
   update public.financeiro_veiculos_usos set estado='cancelado',cancelamento=trim(p->>'motivo') where id=u.id returning * into u;return to_jsonb(u);
  end if;
  at:=(p->>'devolucao_em')::timestamptz;km:=(p->>'km_final')::numeric;
  if at is null or km is null or km>=1000000000 or at<u.retirada_em or at>now()+interval '5 minutes' or km<u.km_inicial or km<>round(km,1) then raise exception 'Data/hora ou quilometragem da devolução inválida.'; end if;
  update public.financeiro_veiculos_usos set estado='devolvido',devolucao_em=at,km_final=km,ciclo_confirmado=coalesce((p->>'ciclo_confirmado')::boolean,false) where id=u.id returning * into u;
  perform financeiro_veiculos_privado.foto(p->'foto',u.id,null,'devolucao');
  update public.financeiro_veiculos set ultimo_km=km,ultima_data=at where id=u.veiculo_id;return to_jsonb(u);
 elsif acao='relatar' then
  select * into v from public.financeiro_veiculos where id=p->>'veiculo_id' for update;
  if v.id is null then raise exception 'Veículo inválido.'; end if;
  select id into r from public.financeiro_veiculos_relatos where id=(p->>'id')::uuid and autor=eu.id;
  if r is not null then return jsonb_build_object('id',r); end if;
  -- Só associa ao anterior durante os primeiros 30 minutos da própria retirada.
  -- A associação é temporal; não prova autoria do dano ou mau uso.
  select * into u from public.financeiro_veiculos_usos where veiculo_id=v.id and estado='aberto' and motorista=eu.id and criado_em>now()-interval '30 minutes';
  if u.id is not null then select id into anterior from public.financeiro_veiculos_usos where veiculo_id=v.id and estado='devolvido' and devolucao_em<=u.retirada_em order by devolucao_em desc limit 1; end if;
  insert into public.financeiro_veiculos_relatos(id,veiculo_id,autor,descricao,uso_anterior) values((p->>'id')::uuid,v.id,eu.id,trim(p->>'descricao'),anterior) returning id into r;
  if coalesce(jsonb_typeof(p->'fotos'),'null')<>'array' or coalesce(jsonb_array_length(p->'fotos'),0) not between 1 and 3 then raise exception 'Anexe de 1 a 3 fotos.'; end if;
  for b in select value from jsonb_array_elements(p->'fotos') loop perform financeiro_veiculos_privado.foto(b,null,r,'relato');end loop;
  return jsonb_build_object('id',r);
 end if;
 raise exception 'Ação inválida.';
end $$;
commit;
