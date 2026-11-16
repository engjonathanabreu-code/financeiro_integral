-- Extensão aditiva. Mantém o JSON canônico, as decisões e as referências existentes.
begin;
set local lock_timeout = '5s';

do $$
begin
  if (select md5(prosrc) from pg_proc where oid='public.financeiro_guard_invoice_requests()'::regprocedure)
       is distinct from '8796aa9363d7992c92b9143145a747d1'
    or (select md5(prosrc) from pg_proc where oid='public.financeiro_save_invoice_request(jsonb,jsonb)'::regprocedure)
       is distinct from 'ecb49987f05d318c8461b71a563250c0'
    or (select md5(prosrc) from pg_proc where oid='public.financeiro_revisar_solicitacao(text,jsonb,boolean,text)'::regprocedure)
       is distinct from '9a8914a4bb2e818992bea380e6ac555d'
    or (select md5(prosrc) from pg_proc where oid='public.financeiro_listar_solicitacoes()'::regprocedure)
       is distinct from '1a2fceb9acfb389cbc819727c9186d79' then
    raise exception 'O fluxo de Solicitações divergiu da base conhecida. Revise a instalação.';
  end if;
end $$;

create schema if not exists financeiro_solicitacoes_privado;
revoke all on schema financeiro_solicitacoes_privado from public, anon, authenticated;

create table if not exists financeiro_solicitacoes_privado.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criada_em timestamptz not null default clock_timestamp(),
  criada_por uuid not null
);
create or replace function financeiro_solicitacoes_privado.normalizar_categoria(p_nome text)
returns text language sql immutable set search_path='' as $$
  select translate(lower(normalize(p_nome,NFC)),'áàãâäéèêëíìîïóòõôöúùûüç','aaaaaeeeeiiiiooooouuuuc')
$$;
create unique index if not exists central_categoria_nome
  on financeiro_solicitacoes_privado.categorias (financeiro_solicitacoes_privado.normalizar_categoria(nome));

create table if not exists financeiro_solicitacoes_privado.estado (
  solicitacao_id text primary key,
  revisao integer not null default 0,
  situacao text check (situacao in ('Devolvida','Cancelada')),
  devolucao text,
  arquivada_em timestamptz,
  excluida_em timestamptz,
  categoria uuid references financeiro_solicitacoes_privado.categorias(id),
  responsavel uuid,
  analista uuid,
  analise_ate timestamptz,
  prioridade text not null default 'Normal' check (prioridade in ('Baixa','Normal','Alta','Urgente')),
  prazo date,
  revisao_aprovacao jsonb,
  atualizado_em timestamptz
);

create table if not exists financeiro_solicitacoes_privado.eventos (
  id bigint generated always as identity primary key,
  solicitacao_id text not null,
  acao text not null,
  ator uuid not null,
  autor text not null,
  ocorrido_em timestamptz not null default clock_timestamp(),
  interno boolean not null default false,
  motivo text,
  alteracoes jsonb,
  operacao uuid unique,
  assinatura text
);
create index if not exists central_eventos_solicitacao
  on financeiro_solicitacoes_privado.eventos (solicitacao_id,id desc);

create table if not exists financeiro_solicitacoes_privado.destinatarios (
  evento bigint references financeiro_solicitacoes_privado.eventos(id) not null,
  destinatario uuid not null,
  lido_em timestamptz,
  primary key (destinatario,evento)
);

alter table financeiro_solicitacoes_privado.categorias enable row level security;
alter table financeiro_solicitacoes_privado.estado enable row level security;
alter table financeiro_solicitacoes_privado.eventos enable row level security;
alter table financeiro_solicitacoes_privado.destinatarios enable row level security;
revoke all on all tables in schema financeiro_solicitacoes_privado from public, anon, authenticated;
revoke all on all sequences in schema financeiro_solicitacoes_privado from public, anon, authenticated;

create or replace function financeiro_solicitacoes_privado.pedido(p_id text)
returns jsonb language sql stable set search_path='' as $$
  select item
  from public.financeiro_estado_modulos m
  cross join lateral jsonb_array_elements(m.dados) item
  where m.chave='invoiceRequests' and item->>'id'=p_id
$$;

create or replace function financeiro_solicitacoes_privado.pode_acessar(p_id text,p_anexar boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select
    public.is_active_user()
    and (public.is_admin() or r->>'requesterId'=auth.uid()::text)
    and e.excluida_em is null
    and (not p_anexar or (e.arquivada_em is null and coalesce(e.situacao,r->>'status') in ('Pendente','Devolvida')
      and (e.analise_ate is null or e.analise_ate<=statement_timestamp() or e.analista=auth.uid())))
  from financeiro_solicitacoes_privado.pedido(p_id) r
  left join financeiro_solicitacoes_privado.estado e on e.solicitacao_id=p_id),false)
$$;

create or replace function financeiro_solicitacoes_privado.tem_efeito(pedido jsonb)
returns boolean language sql stable set search_path='' as $$
  select nullif(pedido->>'convertedId','') is not null
    or nullif(pedido->>'convertedPaymentId','') is not null
    or exists (
      select 1 from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(case when jsonb_typeof(m.dados)='array' then m.dados else '[]'::jsonb end) item
      where m.chave in ('trips','budgetRecords','accountMasters','accountPayments')
      and item->>'invoiceRequestId'=pedido->>'id'
    )
    or exists (
      select 1 from public.financeiro_veiculos_usos u where u.solicitacao_id=pedido->>'id'
    )
$$;

create or replace function financeiro_solicitacoes_privado.acoes(
  pedido jsonb,e financeiro_solicitacoes_privado.estado,administrador boolean,autor boolean,efeito boolean
) returns text[] language plpgsql stable set search_path='' as $$
declare
  situacao text := coalesce(e.situacao,pedido->>'status');
  acoes text[] := '{}';
  ativa boolean := e.arquivada_em is null;
  aberta boolean := situacao in ('Pendente','Devolvida');
  proposta boolean := coalesce(e.revisao_aprovacao->>'status'='pending',false);
  revisao_ativa boolean := coalesce(e.analise_ate>statement_timestamp(),false);
  em_analise_alheia boolean := revisao_ativa and e.analista is distinct from auth.uid();
begin
  if not (administrador or coalesce(autor,false)) then return acoes; end if;
  if e.excluida_em is not null then
    if administrador then return array['restore']; end if;
    return acoes;
  end if;
  if administrador then
    acoes:=acoes||array['organize','internal_comment'];
    if not ativa then acoes:=acoes||array['unarchive'];
    elsif not aberta then acoes:=acoes||array['archive']; end if;
    if ativa and situacao='Pendente' and not efeito and not em_analise_alheia then
      acoes:=acoes||array['return','approve','reject'];
      if revisao_ativa then acoes:=acoes||array['release_review'];
      else acoes:=acoes||array['start_review']; end if;
    end if;
    if proposta then acoes:=acoes||array['decide_review']; end if;
  end if;
  if ativa then
    acoes:=acoes||array['comment','duplicate'];
    if aberta and not em_analise_alheia and to_regprocedure('public.financeiro_listar_anexos_solicitacao(text)') is not null then
      acoes:=acoes||array['attach'];
    end if;
    if not efeito and aberta and not em_analise_alheia then
      acoes:=acoes||array['cancel'];
      if situacao='Pendente' then acoes:=acoes||array['edit','delete']; end if;
      if situacao='Devolvida' and autor then acoes:=acoes||array['resubmit']; end if;
    end if;
    if not efeito and situacao='Cancelada' then acoes:=acoes||array['delete']; end if;
  end if;
  if autor and not proposta and (situacao='Aprovada' or efeito) then
    acoes:=acoes||array['request_change','request_cancel'];
  end if;
  return acoes;
end
$$;

create or replace function financeiro_solicitacoes_privado.registrar_evento(
  p_id text,p_acao text,p_motivo text,p_alteracoes jsonb,p_interno boolean,p_operacao uuid,p_assinatura text
) returns bigint language plpgsql set search_path='' as $$
declare evento_id bigint;
begin
  insert into financeiro_solicitacoes_privado.eventos(
    solicitacao_id,acao,ator,autor,interno,motivo,alteracoes,operacao,assinatura
  )
  select p_id,p_acao,p.id,p.nome,p_interno,p_motivo,p_alteracoes,p_operacao,p_assinatura
  from public.profiles p where p.id=auth.uid() and p.ativo
  returning id into evento_id;
  if evento_id is null then raise exception using errcode='42501',message='Sessão ativa obrigatória.'; end if;

  if not p_interno and p_acao in (
    'submit','edit','return','resubmit','approve','reject','cancel','comment','attach',
    'request_change','request_cancel','decide_review'
  ) then
    insert into financeiro_solicitacoes_privado.destinatarios(evento,destinatario)
    select evento_id,p.id
    from financeiro_solicitacoes_privado.pedido(p_id) r
    left join financeiro_solicitacoes_privado.estado e on e.solicitacao_id=p_id
    join public.profiles p on p.ativo and p.id<>auth.uid()
      and (p.id::text=r->>'requesterId'
           or (p.tipo='Administrador' and (e.responsavel is null or e.responsavel=p.id)))
    on conflict do nothing;
  end if;
  return evento_id;
end
$$;

create or replace function public.financeiro_central_solicitacoes(p_id text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  usuario_atual uuid := auth.uid();
  administrador boolean := coalesce(public.is_admin(),false);
  itens jsonb;
begin
  if usuario_atual is null or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  with referencias(id) as materialized (
    select item->>'invoiceRequestId'
    from public.financeiro_estado_modulos m
    cross join lateral jsonb_array_elements(case when jsonb_typeof(m.dados)='array' then m.dados else '[]'::jsonb end) item
    where m.chave in ('trips','budgetRecords','accountMasters','accountPayments')
      and nullif(item->>'invoiceRequestId','') is not null
    union
    select solicitacao_id from public.financeiro_veiculos_usos where solicitacao_id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'request',r,
    'revision',coalesce(e.revisao,0),
    'state',jsonb_build_object(
      'status',coalesce(e.situacao,r->>'status'),'archivedAt',e.arquivada_em,'deletedAt',e.excluida_em,
      'categoryId',e.categoria,'assigneeId',e.responsavel,'assigneeName',responsavel.nome,
      'priority',coalesce(e.prioridade,'Normal'),'deadline',e.prazo,'returnReason',e.devolucao,
      'updatedAt',coalesce(to_jsonb(e.atualizado_em),r->'updatedAt',r->'createdAt'),
      'reviewingBy',case when e.analise_ate>statement_timestamp() then e.analista end,
      'reviewingUntil',case when e.analise_ate>statement_timestamp() then e.analise_ate end,
      'review',e.revisao_aprovacao,'hasEffect',efeito.existe
    ),
    'actions',financeiro_solicitacoes_privado.acoes(r,e,administrador,r->>'requesterId'=usuario_atual::text,efeito.existe),
    'events',case when p_id is null or e.excluida_em is not null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'action',v.acao,'at',v.ocorrido_em,'by',v.autor,'internal',v.interno,
        'reason',v.motivo,'changes',v.alteracoes
      ) order by v.id),'[]'::jsonb)
      from financeiro_solicitacoes_privado.eventos v
      where v.solicitacao_id=r->>'id' and (administrador or not v.interno)
    ) end
  ) order by ord),'[]'::jsonb) into itens
  from public.financeiro_estado_modulos m
  cross join lateral jsonb_array_elements(m.dados) with ordinality as pedidos(r,ord)
  left join financeiro_solicitacoes_privado.estado e on e.solicitacao_id=r->>'id'
  left join public.profiles responsavel on responsavel.id=e.responsavel
  left join referencias on referencias.id=r->>'id'
  cross join lateral (select referencias.id is not null or nullif(r->>'convertedId','') is not null
    or nullif(r->>'convertedPaymentId','') is not null as existe) efeito
  where m.chave='invoiceRequests'
    and (p_id is null or r->>'id'=p_id)
    and (administrador or (r->>'requesterId'=usuario_atual::text and e.excluida_em is null));

  if p_id is not null and itens='[]'::jsonb then
    raise exception using errcode='42501',message='Solicitação indisponível para este perfil.';
  end if;

  return jsonb_build_object(
    'items',itens,
    'attachmentsEnabled',to_regprocedure('public.financeiro_listar_anexos_solicitacao(text)') is not null,
    'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',nome) order by nome),'[]'::jsonb)
      from financeiro_solicitacoes_privado.categorias),
    'assignees', case when administrador then (
      select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.nome) order by p.nome),'[]'::jsonb)
      from public.profiles p where p.ativo and p.tipo='Administrador'
    ) else '[]'::jsonb end,
    'notifications',coalesce((
      select jsonb_agg(n.item order by n.id desc)
      from (
        select v.id,jsonb_build_object('id',v.id::text,'requestId',v.solicitacao_id,'action',v.acao,
          'at',v.ocorrido_em,'readAt',d.lido_em) item
        from financeiro_solicitacoes_privado.destinatarios d
        join financeiro_solicitacoes_privado.eventos v on v.id=d.evento
        where d.destinatario=usuario_atual and not v.interno
          and financeiro_solicitacoes_privado.pode_acessar(v.solicitacao_id,false)
        order by v.id desc limit 30
      ) n
    ),'[]'::jsonb)
  );
end $$;

create or replace function financeiro_solicitacoes_privado.campos_editaveis()
returns text[] language sql immutable set search_path='' as $$
  select array['title','description','descriptionHtml','estimatedValue','neededAt','project','destination','vehicleId']
$$;

create or replace function financeiro_solicitacoes_privado.aplicar_campos(pedido jsonb,campos jsonb)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  campo text;
  valor numeric;
  texto text;
  tags_seguras constant text := $regex$</?(b|strong|i|em|ul|ol|li|p|div|br|span|font)( (size="[1-7]"|style="(text-align:(left|center|right|justify)|font-weight:bold|font-style:italic)(;(text-align:(left|center|right|justify)|font-weight:bold|font-style:italic))*"))*\s*/?>$regex$;
begin
  if jsonb_typeof(campos) is distinct from 'object'
     or (campos-financeiro_solicitacoes_privado.campos_editaveis())<>'{}' then
    raise exception using errcode='22023',message='A alteração contém campos indisponíveis.';
  end if;
  for campo in select jsonb_object_keys(campos) loop
    if campo='estimatedValue' then
      if jsonb_typeof(campos->campo) is distinct from 'number' then
        raise exception using errcode='22023',message='Valor estimado inválido.';
      end if;
      valor:=(campos->>campo)::numeric;
      if valor<0 or valor>=1000000000000 or valor<>round(valor,2) then
        raise exception using errcode='22023',message='Valor estimado inválido.';
      end if;
      continue;
    end if;
    if jsonb_typeof(campos->campo) is distinct from 'string' then
      raise exception using errcode='22023',message='Preencha os campos com os valores esperados.';
    end if;
    texto:=campos->>campo;
    if (campo in ('title','description') and btrim(texto)='')
       or length(texto)>(case campo when 'title' then 120 when 'descriptionHtml' then 50000
          when 'description' then 20000 else 400 end) then
      raise exception using errcode='22023',message='Confira os tamanhos e os campos obrigatórios.';
    end if;
    if campo='descriptionHtml' and strpos(regexp_replace(texto,tags_seguras,'','gi'),'<')>0 then
      raise exception using errcode='22023',message='O formato da descrição contém marcação não permitida.';
    end if;
    if campo='neededAt' and texto<>'' then
      if texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode='22023',message='Informe uma data válida.';
      end if;
      perform texto::date;
    end if;
    if campo='vehicleId' and texto<>'' and (
      pedido->>'category' is distinct from 'trip'
      or not exists(select 1 from public.financeiro_veiculos where id=texto)
    ) then raise exception using errcode='22023',message='Selecione um veículo válido para a viagem.'; end if;
  end loop;
  if campos ? 'description' and not campos ? 'descriptionHtml' then
    campos:=campos||jsonb_build_object('descriptionHtml','');
  end if;
  return pedido||campos;
end
$$;

create or replace function financeiro_solicitacoes_privado.permite_edicao_autor(anterior jsonb,novo jsonb)
returns boolean language sql stable set search_path='' as $$
  select current_user not in ('anon','authenticated') and auth.uid() is not null
    and anterior->>'requesterId'=auth.uid()::text
    and anterior->>'status'='Pendente' and novo->>'status'='Pendente'
    and anterior-(financeiro_solicitacoes_privado.campos_editaveis()||array['updatedAt'])
      = novo-(financeiro_solicitacoes_privado.campos_editaveis()||array['updatedAt'])
    and not financeiro_solicitacoes_privado.tem_efeito(anterior)
$$;

create or replace function public.financeiro_acao_solicitacao(
  p_id text,p_revisao integer,p_acao text,p_dados jsonb,p_operacao uuid,p_esperado jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  ator uuid := auth.uid();
  administrador boolean := coalesce(public.is_admin(),false);
  instante timestamptz := clock_timestamp();
  pedidos jsonb;
  pedido jsonb;
  proposta jsonb;
  atual jsonb;
  anterior financeiro_solicitacoes_privado.eventos;
  estado financeiro_solicitacoes_privado.estado;
  assinatura text;
  motivo text;
  mudancas jsonb;
begin
  if ator is null or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  if coalesce(p_id,'')='' or p_revisao is null or p_operacao is null
    or jsonb_typeof(p_dados) is distinct from 'object' or p_acao is null then
    raise exception using errcode='22023',message='Ação ou revisão inválida.';
  end if;

  select dados into pedidos from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  select value into pedido from jsonb_array_elements(pedidos) where value->>'id'=p_id;
  if pedido is null or not (administrador or coalesce(pedido->>'requesterId'=ator::text,false)) then
    raise exception using errcode='42501',message='Solicitação indisponível para este perfil.';
  end if;

  assinatura:=encode(sha256(convert_to(jsonb_build_array(p_id,p_revisao,p_acao,p_dados,p_esperado)::text,'UTF8')),'hex');
  select * into anterior from financeiro_solicitacoes_privado.eventos where operacao=p_operacao;
  if anterior.id is not null then
    if anterior.ator is distinct from ator or anterior.assinatura is distinct from assinatura then
      raise exception using errcode='22023',message='Identificador de operação já utilizado.';
    end if;
    if p_acao='delete' and not administrador then return jsonb_build_object('items','[]'::jsonb); end if;
    return public.financeiro_central_solicitacoes(p_id);
  end if;

  insert into financeiro_solicitacoes_privado.estado(solicitacao_id) values(p_id) on conflict do nothing;
  select * into estado from financeiro_solicitacoes_privado.estado where solicitacao_id=p_id;
  if estado.revisao<>p_revisao or pedido is distinct from p_esperado then
    raise exception using errcode='40001',message='Solicitação atualizada. Confira a versão atual antes de continuar.';
  end if;
  if p_acao in ('edit','cancel','delete','return','start_review') and estado.analise_ate>statement_timestamp()
    and estado.analista is distinct from ator then
    raise exception using errcode='40001',message='Outro administrador está analisando a solicitação.';
  end if;
  if not p_acao=any(financeiro_solicitacoes_privado.acoes(pedido,estado,administrador,
      pedido->>'requesterId'=ator::text,financeiro_solicitacoes_privado.tem_efeito(pedido))) then
    raise exception using errcode='42501',message='A ação não está disponível para este perfil ou situação.';
  end if;
  if p_acao in ('approve','reject','duplicate','attach') then
    raise exception using errcode='22023',message='Use o fluxo específico para esta ação.';
  end if;
  if p_acao in ('return','request_cancel','request_change','decide_review','cancel','delete') then
    motivo:=nullif(btrim(p_dados->>'reason'),'');
    if (motivo is null and p_acao not in ('cancel','delete'))
       or length(motivo)>2000 or coalesce(jsonb_typeof(p_dados->'reason'),'null') not in ('string','null') then
      raise exception using errcode='22023',message='Informe um motivo de até 2.000 caracteres.';
    end if;
  end if;

  case p_acao
    when 'edit','resubmit' then
      atual:=financeiro_solicitacoes_privado.aplicar_campos(pedido,p_dados);
      select jsonb_object_agg(k,jsonb_build_object('before',pedido->k,'after',atual->k)) into mudancas
      from unnest(financeiro_solicitacoes_privado.campos_editaveis()) k
      where pedido->k is distinct from atual->k;
      if mudancas is not null then
        atual:=atual||jsonb_build_object('updatedAt',instante);
        update public.financeiro_estado_modulos
        set dados=(select jsonb_agg(case when value->>'id'=p_id then atual else value end order by ord)
          from jsonb_array_elements(pedidos) with ordinality as a(value,ord)),
          updated_at=instante,updated_by=ator where chave='invoiceRequests';
      end if;
      if p_acao='resubmit' then estado.situacao:=null; end if;
    when 'return' then
      estado.situacao:='Devolvida';
      estado.devolucao:=motivo;
      estado.analista:=null;
      estado.analise_ate:=null;
    when 'cancel' then
      estado.situacao:='Cancelada';
      estado.analista:=null;
      estado.analise_ate:=null;
    when 'delete' then
      estado.excluida_em:=instante;
      estado.analista:=null;
      estado.analise_ate:=null;
    when 'start_review' then
      estado.analista:=ator;
      estado.analise_ate:=instante+interval '15 minutes';
    when 'release_review' then
      estado.analista:=null;
      estado.analise_ate:=null;
    when 'restore' then estado.excluida_em:=null;
    when 'archive' then estado.arquivada_em:=instante;
    when 'unarchive' then estado.arquivada_em:=null;
    when 'comment','internal_comment' then
      motivo:=nullif(btrim(p_dados->>'message'),'');
      if motivo is null or length(motivo)>4000 or jsonb_typeof(p_dados->'message') is distinct from 'string' then
        raise exception using errcode='22023',message='Escreva um comentário de até 4.000 caracteres.';
      end if;
    when 'organize' then
      if (p_dados-array['categoryId','assigneeId','priority','deadline'])<>'{}' then
        raise exception using errcode='22023',message='Campo de organização inválido.';
      end if;
      if p_dados?'categoryId' then
        estado.categoria:=nullif(p_dados->>'categoryId','')::uuid;
        if estado.categoria is not null and not exists (
          select 1 from financeiro_solicitacoes_privado.categorias where id=estado.categoria
        ) then raise exception using errcode='22023',message='Categoria indisponível.'; end if;
      end if;
      if p_dados?'assigneeId' then
        estado.responsavel:=nullif(p_dados->>'assigneeId','')::uuid;
        if estado.responsavel is not null and not exists (
          select 1 from public.profiles where id=estado.responsavel and ativo and tipo='Administrador'
        ) then raise exception using errcode='22023',message='Escolha um administrador ativo.'; end if;
      end if;
      if p_dados?'priority' then
        estado.prioridade:=coalesce(p_dados->>'priority','Normal');
        if estado.prioridade not in ('Baixa','Normal','Alta','Urgente') then
          raise exception using errcode='22023',message='Prioridade inválida.';
        end if;
      end if;
      if p_dados?'deadline' then
        if nullif(p_dados->>'deadline','') is not null and p_dados->>'deadline' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception using errcode='22023',message='Prazo inválido.';
        end if;
        estado.prazo:=nullif(p_dados->>'deadline','')::date;
      end if;
      select jsonb_object_agg(valor.campo,jsonb_build_object('before',valor.antes,'after',valor.depois))
        into mudancas
      from financeiro_solicitacoes_privado.estado e
      cross join lateral (values
        ('categoryId',to_jsonb(e.categoria),to_jsonb(estado.categoria)),
        ('assigneeId',to_jsonb(e.responsavel),to_jsonb(estado.responsavel)),
        ('priority',to_jsonb(e.prioridade),to_jsonb(estado.prioridade)),
        ('deadline',to_jsonb(e.prazo),to_jsonb(estado.prazo))
      ) valor(campo,antes,depois)
      where e.solicitacao_id=p_id and valor.antes is distinct from valor.depois;
    when 'request_change','request_cancel' then
      if p_acao='request_change' then
        proposta:=financeiro_solicitacoes_privado.aplicar_campos(pedido,p_dados->'changes');
        select jsonb_object_agg(k,jsonb_build_object('before',pedido->k,'after',proposta->k)) into mudancas
        from unnest(financeiro_solicitacoes_privado.campos_editaveis()) k
        where pedido->k is distinct from proposta->k;
        if mudancas is null then raise exception using errcode='22023',message='Informe os campos a alterar.'; end if;
      end if;
      estado.revisao_aprovacao:=jsonb_build_object('kind',case when p_acao='request_change' then 'change' else 'cancel' end,
        'status','pending','reason',motivo,'changes',mudancas,'requestedAt',instante);
    when 'decide_review' then
      if jsonb_typeof(p_dados->'approve') is distinct from 'boolean' then
        raise exception using errcode='22023',message='Informe a decisão sobre o pedido.';
      end if;
      proposta:=jsonb_build_object('status',case when (p_dados->>'approve')::boolean then 'approved' else 'rejected' end,
        'decidedAt',instante,'decisionReason',motivo);
      estado.revisao_aprovacao:=estado.revisao_aprovacao||proposta;
      mudancas:=jsonb_build_object('review',proposta);
    else raise exception using errcode='22023',message='Ação inválida.';
  end case;

  update financeiro_solicitacoes_privado.estado as e
  set revisao=e.revisao+1,situacao=estado.situacao,devolucao=estado.devolucao,
      arquivada_em=estado.arquivada_em,excluida_em=estado.excluida_em,categoria=estado.categoria,
      responsavel=estado.responsavel,analista=estado.analista,analise_ate=estado.analise_ate,
      prioridade=estado.prioridade,prazo=estado.prazo,
      revisao_aprovacao=estado.revisao_aprovacao,atualizado_em=instante
  where solicitacao_id=p_id;
  perform financeiro_solicitacoes_privado.registrar_evento(p_id,p_acao,motivo,mudancas,
    p_acao='internal_comment',p_operacao,assinatura);
  if p_acao='delete' and not administrador then
    return jsonb_build_object('items','[]'::jsonb);
  end if;
  return public.financeiro_central_solicitacoes(p_id);
end
$$;

create or replace function public.financeiro_categoria_solicitacao(p_nome text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare categoria financeiro_solicitacoes_privado.categorias;
begin
  if not coalesce(public.is_admin(),false) or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Somente ADM pode gerenciar categorias.';
  end if;
  p_nome:=btrim(regexp_replace(p_nome,'[[:space:]]+',' ','g'));
  if coalesce(length(p_nome),0) not between 1 and 80 then
    raise exception using errcode='22023',message='Informe um nome de até 80 caracteres.';
  end if;
  insert into financeiro_solicitacoes_privado.categorias(nome,criada_por)
  values(p_nome,auth.uid()) on conflict (financeiro_solicitacoes_privado.normalizar_categoria(nome)) do nothing returning * into categoria;
  if categoria.id is null then
    select * into categoria from financeiro_solicitacoes_privado.categorias
    where financeiro_solicitacoes_privado.normalizar_categoria(nome)=financeiro_solicitacoes_privado.normalizar_categoria(p_nome);
  end if;
  return jsonb_build_object('id',categoria.id,'name',categoria.nome);
end $$;

create or replace function public.financeiro_ler_notificacao_solicitacao(p_id bigint)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  update financeiro_solicitacoes_privado.destinatarios d
  set lido_em=coalesce(d.lido_em,clock_timestamp())
  from financeiro_solicitacoes_privado.eventos v
  where d.destinatario=auth.uid() and d.evento=p_id and v.id=d.evento and not v.interno
    and financeiro_solicitacoes_privado.pode_acessar(v.solicitacao_id,false);
  return found;
end $$;

-- Mantém os corpos de envio e aprovação usados em produção. Os originais ficam
-- privados, para que a compatibilidade com o cliente anterior não contorne a fila.
alter function public.financeiro_save_invoice_request(jsonb,jsonb)
  set schema financeiro_solicitacoes_privado;
alter function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text)
  set schema financeiro_solicitacoes_privado;

create or replace function public.financeiro_listar_solicitacoes()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ator uuid := auth.uid(); administrador boolean;
begin
  if ator is null or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  administrador:=public.is_admin();
  return (
    select coalesce(jsonb_agg(pedido order by ord),'[]'::jsonb)
    from public.financeiro_estado_modulos m
    cross join lateral jsonb_array_elements(m.dados) with ordinality as p(pedido,ord)
    left join financeiro_solicitacoes_privado.estado e on e.solicitacao_id=pedido->>'id'
    where m.chave='invoiceRequests'
      and (administrador or (pedido->>'requesterId'=ator::text and e.excluida_em is null))
  );
end $$;

create function public.financeiro_save_invoice_request(p_request jsonb,p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  ator uuid := auth.uid();
  pedido_id text := p_request->>'id';
  anterior jsonb;
  atual jsonb;
  itens jsonb;
  estado financeiro_solicitacoes_privado.estado;
  alteracoes jsonb;
  campos jsonb;
begin
  if ator is null or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  insert into public.financeiro_estado_modulos(chave,dados,updated_by)
    select 'invoiceRequests','[]'::jsonb,ator
    where not exists (select 1 from public.financeiro_estado_modulos where chave='invoiceRequests')
    on conflict (chave) do nothing;
  perform 1 from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  anterior:=financeiro_solicitacoes_privado.pedido(pedido_id);
  if p_expected is null and anterior is null and jsonb_typeof(p_request)='object' then
    select coalesce(jsonb_object_agg(chave,p_request->chave),'{}'::jsonb) into campos
    from unnest(financeiro_solicitacoes_privado.campos_editaveis()) chave
    where p_request ? chave;
    perform financeiro_solicitacoes_privado.aplicar_campos(p_request,campos);
  end if;
  select * into estado from financeiro_solicitacoes_privado.estado where solicitacao_id=pedido_id;
  if p_expected is not null and (
    estado.excluida_em is not null or estado.situacao is not null
    or (estado.arquivada_em is not null and anterior->>'status' is distinct from 'Aprovada')
  ) then
    raise exception using errcode='42501',message='Use a ação disponível na central de Solicitações.';
  end if;
  if p_expected is not null and anterior->>'status'='Pendente'
    and (financeiro_solicitacoes_privado.tem_efeito(anterior)
         or (estado.analise_ate>statement_timestamp() and estado.analista is distinct from ator)) then
    raise exception using errcode='42501',message='A solicitação possui registro vinculado ou está em análise. Consulte a central.';
  end if;
  itens:=financeiro_solicitacoes_privado.financeiro_save_invoice_request(p_request,p_expected);
  atual:=financeiro_solicitacoes_privado.pedido(pedido_id);
  if anterior is null and atual is not null then
    perform financeiro_solicitacoes_privado.registrar_evento(pedido_id,'submit',null,null,false,null,null);
  elsif anterior is distinct from atual then
    select jsonb_object_agg(k,jsonb_build_object('before',anterior->k,'after',atual->k)) into alteracoes
    from unnest(financeiro_solicitacoes_privado.campos_editaveis()) k
    where anterior->k is distinct from atual->k;
    if alteracoes is not null then
      insert into financeiro_solicitacoes_privado.estado as e(solicitacao_id,revisao,atualizado_em)
      values(pedido_id,1,clock_timestamp())
      on conflict (solicitacao_id) do update set revisao=e.revisao+1,atualizado_em=excluded.atualizado_em;
      perform financeiro_solicitacoes_privado.registrar_evento(pedido_id,'edit',null,alteracoes,false,null,null);
    end if;
  end if;
  return itens;
end $$;

create function public.financeiro_revisar_solicitacao(
  p_id text,p_esperado jsonb,p_aprovar boolean,p_resposta text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  pedido jsonb;
  itens jsonb;
  estado financeiro_solicitacoes_privado.estado;
begin
  if not coalesce(public.is_admin(),false) or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Somente ADM pode revisar solicitações.';
  end if;
  perform 1 from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  pedido:=financeiro_solicitacoes_privado.pedido(p_id);
  select * into estado from financeiro_solicitacoes_privado.estado where solicitacao_id=p_id;
  if pedido->>'status'='Pendente' and (
    estado.situacao is not null or estado.excluida_em is not null or estado.arquivada_em is not null
    or financeiro_solicitacoes_privado.tem_efeito(pedido)
    or (estado.analise_ate>statement_timestamp() and estado.analista is distinct from auth.uid())
  ) then
    raise exception using errcode='42501',message='A solicitação não está na fila de análise. Consulte a central.';
  end if;
  itens:=financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(p_id,p_esperado,p_aprovar,p_resposta);
  if pedido->>'status'='Pendente' then
    insert into financeiro_solicitacoes_privado.estado as e(solicitacao_id,revisao,atualizado_em)
    values(p_id,1,clock_timestamp())
    on conflict (solicitacao_id) do update set revisao=e.revisao+1,
      atualizado_em=excluded.atualizado_em,analista=null,analise_ate=null;
    perform financeiro_solicitacoes_privado.registrar_evento(p_id,case when p_aprovar then 'approve' else 'reject' end,
      btrim(p_resposta),null,false,null,null);
  end if;
  return itens;
end $$;

-- A guarda de frota continua verificando veículo, data, retirada, identidade e decisões.
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
  if exists (select 1 from jsonb_array_elements(previous) r where not exists (select 1 from jsonb_array_elements(new.dados) n where n = r or financeiro_veiculos_privado.complemento_veiculo(r,n)
       or financeiro_solicitacoes_privado.permite_edicao_autor(r,n))) then
    raise exception using errcode='42501', message='Somente ADM pode alterar, aprovar ou rejeitar solicitações existentes.';
  end if;
  for item in select value from jsonb_array_elements(new.dados) loop
    if exists (select 1 from jsonb_array_elements(previous) p where p = item or financeiro_veiculos_privado.complemento_veiculo(p,item)
      or financeiro_solicitacoes_privado.permite_edicao_autor(p,item)) then continue; end if;
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

revoke all on all functions in schema financeiro_solicitacoes_privado from public, anon, authenticated;
revoke all on function public.financeiro_guard_invoice_requests() from public, anon, authenticated;
revoke all on function public.financeiro_listar_solicitacoes(),
  public.financeiro_save_invoice_request(jsonb,jsonb),public.financeiro_revisar_solicitacao(text,jsonb,boolean,text),
  public.financeiro_central_solicitacoes(text),public.financeiro_acao_solicitacao(text,integer,text,jsonb,uuid,jsonb),
  public.financeiro_categoria_solicitacao(text),public.financeiro_ler_notificacao_solicitacao(bigint) from public, anon;
grant execute on function public.financeiro_listar_solicitacoes(),
  public.financeiro_save_invoice_request(jsonb,jsonb),public.financeiro_revisar_solicitacao(text,jsonb,boolean,text),
  public.financeiro_central_solicitacoes(text),public.financeiro_acao_solicitacao(text,integer,text,jsonb,uuid,jsonb),
  public.financeiro_categoria_solicitacao(text),public.financeiro_ler_notificacao_solicitacao(bigint) to authenticated;

commit;
