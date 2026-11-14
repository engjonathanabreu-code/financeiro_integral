begin;
set local lock_timeout = '5s';

create schema financeiro_baixas_privado;
revoke all on schema financeiro_baixas_privado from public, anon, authenticated;

create table financeiro_baixas_privado.eventos (
  id bigint generated always as identity primary key,
  parcela_id uuid not null,
  autor uuid not null,
  operacao text not null check (operacao in ('manual','estorno','relatorio')),
  chave_evento text unique,
  arquivo_sha256 text,
  motivo text,
  antes jsonb not null,
  depois jsonb not null,
  criado_em timestamptz not null default clock_timestamp()
);
create index on financeiro_baixas_privado.eventos (parcela_id, id desc);
alter table financeiro_baixas_privado.eventos enable row level security;

create table financeiro_baixas_privado.lotes (
  arquivo_sha256 text not null,
  revisao text not null,
  autor uuid not null,
  quantidade integer not null,
  criado_em timestamptz not null default clock_timestamp(),
  primary key (arquivo_sha256)
);
alter table financeiro_baixas_privado.lotes enable row level security;

alter table public.fin_receb_parcelas
  add column origem_baixa text check (origem_baixa in ('manual','relatorio','ailos'));

-- Capacidade interna associada à transação. Um cliente SQL comum não pode
-- produzir a autorização via set_config nem invocar as funções privadas.
create table financeiro_baixas_privado.escritas (
  transacao xid8 primary key,
  canal text not null check (canal in ('manual','estorno','relatorio','ailos')),
  parcela_id uuid,
  check ((canal='ailos') = (parcela_id is null))
);
alter table financeiro_baixas_privado.escritas enable row level security;

create function financeiro_baixas_privado.abrir_escrita(p_canal text,p_parcela uuid)
returns void language sql set search_path='' as $$
  insert into financeiro_baixas_privado.escritas(transacao,canal,parcela_id)
  values (pg_current_xact_id(),p_canal,p_parcela)
$$;

create function financeiro_baixas_privado.fechar_escrita()
returns void language sql set search_path='' as $$
  delete from financeiro_baixas_privado.escritas where transacao=pg_current_xact_id()
$$;

create function financeiro_baixas_privado.proteger_liquidacao()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  canal text;
  liquidada boolean;
  mudou_baixa boolean;
begin
  if tg_op='INSERT' then
    if new.origem_baixa is not null or new.status in ('Pago','Parcial') or new.pago_em is not null
       or coalesce(new.valor_liquidado,0)<>0 or coalesce(new.diferenca,0)<>0 then
      raise exception using errcode='42501',message='Cadastre a parcela em aberto e registre o recebimento no fluxo de baixa.';
    end if;
    return new;
  end if;

  liquidada:=old.origem_baixa is not null or old.status in ('Pago','Parcial') or old.pago_em is not null
      or coalesce(old.valor_liquidado,0)<>0;
  if tg_op='DELETE' then
    if liquidada then
      raise exception using errcode='42501',message='Parcela com pagamento registrado deve ser preservada.';
    end if;
    return old;
  end if;

  if liquidada and (
    (new.id,new.cliente_id,new.numero,new.vencimento,new.valor_previsto,new.juros,new.multa,new.nosso_numero,new.documento,new.linha_digitavel)
      is distinct from
    (old.id,old.cliente_id,old.numero,old.vencimento,old.valor_previsto,old.juros,old.multa,old.nosso_numero,old.documento,old.linha_digitavel)
    or old.ativo is distinct from false and new.ativo is false
  ) then
    raise exception using errcode='42501',message='A identidade, a cobrança e o valor de uma parcela liquidada exigem revisão.';
  end if;

  mudou_baixa:=(new.status,new.pago_em,coalesce(new.valor_liquidado,0),coalesce(new.diferenca,0),new.origem_baixa)
   is distinct from (old.status,old.pago_em,coalesce(old.valor_liquidado,0),coalesce(old.diferenca,0),old.origem_baixa);
  if not mudou_baixa then return new; end if;
  if not liquidada and new.origem_baixa is null and new.status not in ('Pago','Parcial')
     and new.pago_em is null and coalesce(new.valor_liquidado,0)=0 and coalesce(new.diferenca,0)=0 then
    return new;
  end if;

  select e.canal into canal from financeiro_baixas_privado.escritas e
  where e.transacao=pg_current_xact_id_if_assigned() and (e.parcela_id=old.id or e.canal='ailos');

  if canal='estorno' and old.origem_baixa='manual' and new.origem_baixa is null
     and new.status in ('Pendente','Inadimplente') and new.pago_em is null
     and coalesce(new.valor_liquidado,0)=0 then return new; end if;

  if canal in ('manual','relatorio','ailos') and not liquidada
     and new.status in ('Pago','Parcial') and new.pago_em is not null and new.valor_liquidado>0 then
    new.origem_baixa:=canal;
    return new;
  end if;
  raise exception using errcode='42501',message='Pagamento conciliado ou sem autorização. Use o fluxo de baixa ou encaminhe para revisão.';
end $$;

create trigger financeiro_proteger_liquidacao
before insert or update or delete on public.fin_receb_parcelas
for each row execute function financeiro_baixas_privado.proteger_liquidacao();

create function public.financeiro_baixa_manual(
  p_id uuid, p_versao bigint, p_status text, p_acao text, p_motivo text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  atual public.fin_receb_parcelas;
  novo public.fin_receb_parcelas;
  evento financeiro_baixas_privado.eventos;
  total numeric;
  operacao text;
begin
  if auth.uid() is null or not public.can_access_fin_recebimentos() then
    raise exception using errcode='42501', message='Perfil sem permissão para operar baixas.';
  end if;

  select * into atual from public.fin_receb_parcelas where id=p_id for update;
  if not found or atual.ativo is distinct from true or atual.versao is distinct from p_versao
     or atual.status is distinct from p_status then
    raise exception using errcode='40001', message='A parcela mudou. Reabra o histórico e confira os dados antes de continuar.';
  end if;

  if p_acao='baixar' and atual.status in ('Pendente','Inadimplente')
     and atual.pago_em is null and coalesce(atual.valor_liquidado,0)=0 then
    if exists (select 1 from ailos_privado.boletos b where b.parcela_id=p_id and b.ambiente='producao'
               and b.estado not in ('Rejeitado','Baixado')) then
      raise exception using errcode='22023', message='Use o retorno Ailos para conciliar este título.';
    end if;
    total := atual.valor_previsto + coalesce(atual.juros,0) + coalesce(atual.multa,0);
    if total is null or total <= 0 then
      raise exception using errcode='22023', message='Confira o valor da parcela antes de registrar a baixa.';
    end if;
    perform financeiro_baixas_privado.abrir_escrita('manual',p_id);
    update public.fin_receb_parcelas set status='Pago', valor_liquidado=total, diferenca=0,
      pago_em=(statement_timestamp() at time zone 'America/Sao_Paulo')::date
    where id=p_id returning * into novo;
    operacao := 'manual';
  elsif p_acao='estornar' and atual.status='Pago' then
    if length(btrim(coalesce(p_motivo,''))) not between 1 and 500 then
      raise exception using errcode='22023', message='Informe um motivo de estorno de até 500 caracteres.';
    end if;
    select * into evento from financeiro_baixas_privado.eventos
    where parcela_id=p_id order by id desc limit 1;
    if evento.operacao is distinct from 'manual' or evento.depois is distinct from to_jsonb(atual) then
      raise exception using errcode='22023', message='Baixa bancária, legada ou alterada requer conferência antes do estorno.';
    end if;
    novo := jsonb_populate_record(atual,evento.antes);
    perform financeiro_baixas_privado.abrir_escrita('estorno',p_id);
    update public.fin_receb_parcelas set status=novo.status, origem_baixa=null, valor_liquidado=novo.valor_liquidado,
      diferenca=novo.diferenca, pago_em=novo.pago_em where id=p_id returning * into novo;
    operacao := 'estorno';
  else
    raise exception using errcode='22023', message='Esta situação exige conferência antes de alterar a baixa.';
  end if;

  perform financeiro_baixas_privado.fechar_escrita();
  insert into financeiro_baixas_privado.eventos (parcela_id,autor,operacao,motivo,antes,depois)
  values (p_id,auth.uid(),operacao,case when operacao='estorno' then btrim(p_motivo) end,to_jsonb(atual),to_jsonb(novo));
end $$;

create function financeiro_baixas_privado.previa(p_itens jsonb)
returns table (linha bigint, parcela_id uuid, numero integer, versao bigint,
               vencimento date, pagamento date, valor numeric, total numeric, situacao text, chave_evento text)
language sql stable set search_path = '' as $$
  with entrada as (
    select ordinality as linha,
      nullif(regexp_replace(x->>'nosso_numero','[^0-9]','','g'),'') as nn,
      nullif(upper(btrim(x->>'documento')),'') as doc,
      nullif(upper(btrim(x->>'codigo_processo')),'') as codigo,
      nullif(regexp_replace(x->>'cpf_cnpj','[^0-9]','','g'),'') as cpf,
      case when x->>'vencimento' ~ '^\d{4}-\d{2}-\d{2}$'
           and pg_input_is_valid(x->>'vencimento','date') then (x->>'vencimento')::date end as vencimento,
      case when x->>'pagamento' ~ '^\d{4}-\d{2}-\d{2}$'
           and pg_input_is_valid(x->>'pagamento','date') then (x->>'pagamento')::date end as pagamento,
      case when x->>'valor_centavos' ~ '^[1-9][0-9]{0,13}$'
           then (x->>'valor_centavos')::numeric / 100 end as valor,
      case when x->>'desconto_centavos' is null then 0
           when x->>'desconto_centavos' ~ '^[0-9]{1,14}$' then (x->>'desconto_centavos')::numeric end as desconto
    from jsonb_array_elements(p_itens) with ordinality as a(x,ordinality)
  ),
  candidatos as (
    select e.*, titulo.id, titulo.numero, titulo.versao, titulo.status, titulo.pago_em,
      titulo.valor_liquidado, titulo.total, titulo.cobranca_ailos, titulo.ativo,
      encode(sha256(convert_to(jsonb_build_array(titulo.id,e.pagamento,e.valor)::text,'UTF8')),'hex') as chave
    from entrada e
    left join lateral (
      select p.id, p.numero, p.versao, p.status, p.pago_em, p.valor_liquidado,
        (p.ativo is true and c.ativo is true) as ativo,
        p.valor_previsto+coalesce(p.juros,0)+coalesce(p.multa,0) as total,
        exists (select 1 from ailos_privado.boletos b
                where b.parcela_id=p.id and b.ambiente='producao'
                  and b.estado not in ('Rejeitado','Baixado')) as cobranca_ailos
      from public.fin_receb_parcelas p
      join public.fin_receb_clientes c on c.id=p.cliente_id
      where p.vencimento=e.vencimento and coalesce(e.nn,e.doc,e.codigo,e.cpf) is not null
        and (e.nn is null or regexp_replace(p.nosso_numero,'[^0-9]','','g')=e.nn)
        and (e.doc is null or upper(btrim(p.documento))=e.doc)
        and (e.codigo is null or upper(btrim(c.codigo))=e.codigo)
        and (e.cpf is null or regexp_replace(c.cpf_cnpj,'[^0-9]','','g')=e.cpf)
        and (e.codigo is null and e.cpf is null or (
          select count(*)=1 from public.fin_receb_clientes outro
          where (e.codigo is null or upper(btrim(outro.codigo))=e.codigo)
            and (e.cpf is null or regexp_replace(outro.cpf_cnpj,'[^0-9]','','g')=e.cpf)
        ))
        and (e.cpf is null or length(e.cpf) in (11,14))
      limit 2
    ) titulo on true
  ),
  classificados as (
    select *, row_number() over (partition by c.linha order by c.id) as ordem,
      count(c.id) over (partition by c.linha) as candidatos
    from candidatos c
  )
  select c.linha,
    case when candidatos=1 then c.id end,
    case when candidatos=1 then c.numero end,
    case when candidatos=1 then c.versao end,
    c.vencimento,c.pagamento,c.valor,case when candidatos=1 then c.total end,
    case
      when c.vencimento is null or c.pagamento is null
           or c.pagamento > (statement_timestamp() at time zone 'America/Sao_Paulo')::date or c.valor is null or c.desconto is null then 'dados_invalidos'
      when c.desconto>0 then 'desconto_revisao'
      when candidatos=0 then 'sem_titulo'
      when candidatos>1 then 'ambiguo'
      when exists (select 1 from financeiro_baixas_privado.eventos b where b.chave_evento=c.chave)
           or (c.status in ('Pago','Parcial') and c.pago_em=c.pagamento and c.valor_liquidado=c.valor) then 'registrado'
      when c.cobranca_ailos then 'retorno_ailos'
      when not c.ativo or c.status not in ('Pendente','Inadimplente') or c.pago_em is not null or coalesce(c.valor_liquidado,0)<>0 then 'situacao_divergente'
      when c.total is null or c.total<=0 or c.valor>c.total then 'valor_divergente'
      when c.valor<c.total then 'parcial_confirmavel'
      else 'confirmavel'
    end,
    case when candidatos=1 then c.chave end
  from classificados c where ordem=1
  order by c.linha
$$;

create function financeiro_baixas_privado.analisar(p_itens jsonb)
returns jsonb language sql stable set search_path = '' as $$
  with previa as (
    select p.*, count(*) over (partition by p.parcela_id) as repeticoes
    from financeiro_baixas_privado.previa(p_itens) p
  )
  select coalesce(jsonb_agg(
    (to_jsonb(p)-'repeticoes') || case when p.situacao in ('confirmavel','parcial_confirmavel') and p.repeticoes>1
      then '{"situacao":"linhas_repetidas"}'::jsonb else '{}'::jsonb end
    order by p.linha),'[]'::jsonb)
  from previa p
$$;

create function public.financeiro_baixa_relatorio(p_arquivo text, p_itens jsonb, p_revisao text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  previa jsonb;
  revisao text;
  item jsonb;
  atual public.fin_receb_parcelas;
  novo public.fin_receb_parcelas;
  quantidade integer := 0;
  lote financeiro_baixas_privado.lotes;
begin
  if auth.uid() is null or not public.can_access_fin_recebimentos() then
    raise exception using errcode='42501', message='Perfil sem permissão para operar baixas.';
  end if;
  if coalesce(p_arquivo,'') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_itens) is distinct from 'array' or octet_length(p_itens::text)>512000 then
    raise exception using errcode='22023', message='Arquivo ou linhas de pagamento inválidas.';
  end if;
  if jsonb_array_length(p_itens) not between 1 and 500 then
    raise exception using errcode='22023', message='O relatório deve conter de 1 a 500 linhas de pagamento.';
  end if;

  if p_revisao is not null then
    perform pg_advisory_xact_lock(850240);
  end if;
  select * into lote from financeiro_baixas_privado.lotes where arquivo_sha256=p_arquivo;
  if found then
    if p_revisao=lote.revisao then
      return jsonb_build_object('aplicadas',lote.quantidade,'repetido',true);
    end if;
    if p_revisao is null then
      return jsonb_build_object('aplicadas',lote.quantidade,'repetido',true,'linhas','[]'::jsonb);
    end if;
    raise exception using errcode='22023', message='Este arquivo já teve um lote confirmado. Encaminhe as demais linhas para conferência.';
  end if;

  if p_revisao is not null then
    -- Novas parcelas/clientes também podem tornar uma referência ambígua.
    -- O lock sem espera evita inversão com escritores legados no meio de lotes.
    lock table public.fin_receb_clientes in share mode nowait;
    -- EXCLUSIVE também recusa SELECT FOR UPDATE pendente, de modo que
    -- um finalizador Ailos não consiga prender uma linha e aguardar nosso lock.
    lock table public.fin_receb_parcelas in exclusive mode nowait;
  end if;
  previa := financeiro_baixas_privado.analisar(p_itens);
  revisao := encode(sha256(convert_to(jsonb_build_array(p_arquivo,p_itens,previa)::text,'UTF8')),'hex');
  if p_revisao is null then
    return jsonb_build_object('revisao',revisao,'linhas',previa);
  end if;
  if p_revisao is distinct from revisao then
    raise exception using errcode='40001', message='A conciliação mudou. Refaça a prévia antes de confirmar.';
  end if;

  for item in select value from jsonb_array_elements(previa)
              where value->>'situacao' in ('confirmavel','parcial_confirmavel') order by value->>'parcela_id'
  loop
    select * into atual from public.fin_receb_parcelas where id=(item->>'parcela_id')::uuid for update;
    if not found or atual.ativo is distinct from true or atual.versao is distinct from (item->>'versao')::bigint
       or atual.status not in ('Pendente','Inadimplente')
       or exists (select 1 from ailos_privado.boletos b where b.parcela_id=atual.id and b.ambiente='producao'
                  and b.estado not in ('Rejeitado','Baixado')) then
      raise exception using errcode='40001', message='Uma parcela mudou. Refaça a prévia antes de confirmar.';
    end if;
    perform financeiro_baixas_privado.abrir_escrita('relatorio',atual.id);
    update public.fin_receb_parcelas set
      status=case when item->>'situacao'='parcial_confirmavel' then 'Parcial' else 'Pago' end,
      pago_em=(item->>'pagamento')::date, valor_liquidado=(item->>'valor')::numeric,
      diferenca=(item->>'valor')::numeric-(item->>'total')::numeric
    where id=atual.id returning * into novo;
    perform financeiro_baixas_privado.fechar_escrita();
    insert into financeiro_baixas_privado.eventos (parcela_id,autor,operacao,chave_evento,arquivo_sha256,antes,depois)
    values (atual.id,auth.uid(),'relatorio',item->>'chave_evento',p_arquivo,to_jsonb(atual),to_jsonb(novo));
    quantidade := quantidade+1;
  end loop;

  if quantidade=0 then
    raise exception using errcode='22023', message='O relatório não tem baixas confirmáveis.';
  end if;
  insert into financeiro_baixas_privado.lotes (arquivo_sha256,revisao,autor,quantidade)
  values (p_arquivo,p_revisao,auth.uid(),quantidade);
  return jsonb_build_object('aplicadas',quantidade,'repetido',false);
end $$;

revoke all on function public.financeiro_baixa_manual(uuid,bigint,text,text,text) from public, anon;
revoke all on function public.financeiro_baixa_relatorio(text,jsonb,text) from public, anon;
grant execute on function public.financeiro_baixa_manual(uuid,bigint,text,text,text) to authenticated;
grant execute on function public.financeiro_baixa_relatorio(text,jsonb,text) to authenticated;

revoke all on all tables in schema financeiro_baixas_privado from public,anon,authenticated;
revoke all on all functions in schema financeiro_baixas_privado from public,anon,authenticated;

notify pgrst, 'reload schema';
commit;
