begin;
set local lock_timeout = '5s';
set local timezone = 'UTC';

-- O estado modular confirmado é a origem. O espelho é uma projeção consultável.
-- A migração não projeta registros automaticamente e não altera linhas existentes.
create table financeiro_privado.contas_espelho_historico (
  tabela text not null,
  registro_id text not null,
  anterior jsonb not null,
  substituido_em timestamptz not null default clock_timestamp(),
  substituido_por uuid not null
);
revoke all on financeiro_privado.contas_espelho_historico from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.financeiro_contas, public.financeiro_pagamentos from public, anon, authenticated;

create function financeiro_privado.proteger_contas_canonicas()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op<>'INSERT' and old.chave in ('accountMasters','accountPayments')
     and (tg_op='DELETE' or new.chave is distinct from old.chave) then
    raise exception using errcode='42501', message='Contas e pagamentos devem permanecer no histórico.';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.chave not in ('accountMasters','accountPayments') then return new; end if;
  if jsonb_typeof(new.dados) is distinct from 'array' then
    raise exception using errcode='22023', message='O módulo de contas precisa ser uma lista.';
  end if;
  -- A contagem também preserva ocorrências legadas de um mesmo ID.
  if exists (
    select item->'id' from jsonb_array_elements(old.dados) item
    except all
    select item->'id' from jsonb_array_elements(new.dados) item
  ) then
    raise exception using errcode='42501', message='Arquive o registro para preservar o histórico e os vínculos.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(old.dados) item
    where nullif(item->>'archivedAt','') is not null
    and not exists (select 1 from jsonb_array_elements(new.dados) novo where novo=item)
  ) then
    raise exception using errcode='42501', message='Um registro arquivado não pode ser alterado.';
  end if;
  if auth.uid() is not null and not public.is_admin() and exists (
    select 1 from jsonb_array_elements(new.dados) item
    where nullif(item->>'archivedAt','') is not null
      and not exists (select 1 from jsonb_array_elements(old.dados) anterior where anterior=item)
  ) then
    raise exception using errcode='42501', message='Somente ADM pode arquivar contas ou pagamentos.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.dados) item
    where nullif(item->>'archivedAt','') is not null
      and case when new.chave='accountMasters' then item->>'active' is distinct from 'false'
               else coalesce(item->>'status','') !~* '^(paga|pago|cancelad[ao])$' end
  ) then
    raise exception using errcode='22023', message='Registro arquivado precisa estar inativo, quitado ou cancelado.';
  end if;
  if new.chave='accountPayments' and exists (
    select 1
    from jsonb_array_elements(new.dados) item
    join public.financeiro_estado_modulos m on m.chave='accountMasters'
    cross join lateral jsonb_array_elements(m.dados) c
    where c->>'id'=item->>'accountId' and nullif(c->>'archivedAt','') is not null
      and coalesce(item->>'status','') !~* '^(paga|pago|cancelad[ao])$'
      and not exists (select 1 from jsonb_array_elements(old.dados) antigo where antigo=item)
  ) then
    raise exception using errcode='42501', message='A conta está arquivada e não recebe novos pagamentos pendentes.';
  end if;
  return new;
end;
$$;
revoke all on function financeiro_privado.proteger_contas_canonicas() from public,anon,authenticated;
create trigger financeiro_b_proteger_contas_canonicas
before insert or update or delete on public.financeiro_estado_modulos
for each row execute function financeiro_privado.proteger_contas_canonicas();

create function public.financeiro_arquivar_conta_pagamento(
  p_tipo text, p_id text, p_esperado jsonb, p_pagamentos jsonb default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  ator uuid := auth.uid();
  instante timestamptz := clock_timestamp();
  conta jsonb;
  esperado_conta jsonb;
  pagamentos jsonb;
  alvo jsonb;
  origem jsonb;
  modulo text;
  atual jsonb;
  arquivado jsonb;
begin
  if ator is null or not public.is_admin() then
    raise exception using errcode='42501', message='Somente ADM pode arquivar contas ou pagamentos.';
  end if;
  if p_tipo is null or p_tipo not in ('conta','pagamento') or nullif(p_id,'') is null
     or jsonb_typeof(p_esperado) is distinct from 'object'
     or p_esperado->>'id' is distinct from p_id then
    raise exception using errcode='22023', message='Registro de arquivamento inválido.';
  end if;
  -- Mesma ordem de travas da conversão de compra e da projeção.
  for modulo, origem in
    select m.chave,m.dados from public.financeiro_estado_modulos m
    where m.chave in ('accountMasters','accountPayments') order by m.chave for update
  loop
    if modulo='accountMasters' then conta:=origem; else pagamentos:=origem; end if;
  end loop;
  if jsonb_typeof(conta) is distinct from 'array' or jsonb_typeof(pagamentos) is distinct from 'array' then
    raise exception using errcode='22023', message='A base de contas ou pagamentos não está disponível.';
  end if;
  origem:=case when p_tipo='conta' then conta else pagamentos end;
  select jsonb_agg(item) into alvo from jsonb_array_elements(origem) item where item->>'id'=p_id;
  if coalesce(jsonb_array_length(alvo),0)<>1 then
    raise exception using errcode='22023', message='Registro inexistente ou com identificador duplicado.';
  end if;
  atual:=alvo->0;
  if nullif(atual->>'archivedAt','') is not null then return true; end if;
  if atual is distinct from p_esperado then
    raise exception using errcode='40001', message='O registro mudou. Atualize a tela e confira antes de arquivar.';
  end if;
  if p_tipo='conta' then
    select coalesce(jsonb_agg(item order by ord),'[]') into esperado_conta
      from jsonb_array_elements(pagamentos) with ordinality as p(item,ord)
      where item->>'accountId'=p_id;
    if esperado_conta is distinct from p_pagamentos then
      raise exception using errcode='40001', message='Os pagamentos da conta mudaram. Atualize a tela e confira antes de arquivar.';
    end if;
    update public.financeiro_estado_modulos set dados=(
      select jsonb_agg(case when item->>'id'=p_id then
        item||jsonb_build_object('active',false,'archivedAt',instante,'archivedBy',ator)
        else item end order by ord)
      from jsonb_array_elements(conta) with ordinality as c(item,ord)
    ), updated_by=ator where chave='accountMasters';
  end if;
  select coalesce(jsonb_agg(case
    when nullif(item->>'archivedAt','') is null
      and (case when p_tipo='conta' then item->>'accountId' else item->>'id' end)=p_id then
      item||jsonb_build_object(
        'archivedAt',instante,'archivedBy',ator,'statusBeforeArchive',item->'status',
        'status',case when item->>'status' in ('Paga','Pago','Cancelada','Cancelado')
                      then item->>'status' else 'Cancelada' end)
    else item end order by ord),'[]') into arquivado
  from jsonb_array_elements(pagamentos) with ordinality as p(item,ord);
  if arquivado is distinct from pagamentos then
    update public.financeiro_estado_modulos set dados=arquivado,updated_by=ator where chave='accountPayments';
  end if;
  return true;
end;
$$;

-- As impressões da ativação identificam os casos legados sem copiar seus dados.
-- Um ID só entra na projeção quando as duas origens estavam de acordo ou foi
-- criado depois da ativação e o ID continua livre no espelho.
create table financeiro_privado.contas_espelho_base (
  tabela text not null,
  registro_id text not null,
  canonico_ativacao text,
  espelho_ativacao text,
  canonico text,
  espelho text,
  sincronizavel boolean not null,
  primary key (tabela, registro_id)
);
revoke all on financeiro_privado.contas_espelho_base from public, anon, authenticated;

create function financeiro_privado.dados_conta_espelho(item jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select case when jsonb_typeof(item->'file')='object' then
    jsonb_set(item-'dataUrl'-'fileData','{file}',(item->'file')-'dataUrl'-'fileData')
  else item-'dataUrl'-'fileData' end
$$;

create function financeiro_privado.forma_conta_espelho(item jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object(
    'id', item->>'id', 'nome', coalesce(nullif(item->>'name',''),nullif(item->>'supplier',''),'Conta'),
    'fornecedor', coalesce(item->>'supplier',''), 'categoria', coalesce(item->>'category',''),
    'setor', coalesce(item->>'sector',''), 'matricula_cadastro', coalesce(item->>'registration',''),
    'recorrencia', coalesce(item->>'recurrence',''), 'ativo', coalesce(item->>'active','true')<>'false',
    'dados', financeiro_privado.dados_conta_espelho(item)
  )
$$;

create function financeiro_privado.forma_pagamento_espelho(item jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v numeric(14,2);
begin
  if nullif(item->>'accountId','') is null or coalesce(item->>'due','') !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  v:=(item->>'value')::numeric;
  if v is null or v::text in ('NaN','Infinity','-Infinity') then return null; end if;
  return jsonb_build_object(
    'id',item->>'id','conta_id',item->>'accountId','vencimento',(item->>'due')::date,
    'valor',v,'status',coalesce(nullif(item->>'status',''),'A vencer'),
    'forma_pagamento',coalesce(item->>'method',item->>'paymentMethod',''),
    'codigo_pagamento',coalesce(item->>'barcode',item->>'paymentCode',''),
    'pago_em',nullif(item->>'paidAt','')::timestamptz,'dados',financeiro_privado.dados_conta_espelho(item)
  );
exception when data_exception then return null;
end;
$$;
revoke all on function financeiro_privado.dados_conta_espelho(jsonb),
  financeiro_privado.forma_conta_espelho(jsonb), financeiro_privado.forma_pagamento_espelho(jsonb)
  from public, anon, authenticated;

-- Fotografia consistente com as linhas que serão comparadas depois da ativação.
select chave from public.financeiro_estado_modulos
  where chave in ('accountMasters','accountPayments') order by chave for update;
lock table public.financeiro_contas, public.financeiro_pagamentos in share row exclusive mode;

with itens as (
  select m.chave, item->>'id' as id, item,
    count(*) over(partition by m.chave,item->>'id') as ocorrencias
  from public.financeiro_estado_modulos m
  cross join lateral jsonb_array_elements(case when jsonb_typeof(m.dados)='array' then m.dados else '[]' end) item
  where m.chave in ('accountMasters','accountPayments') and nullif(item->>'id','') is not null
), canonico as (
  select distinct on (chave,id) chave,id,md5(item::text) as impressao,
    case when ocorrencias=1 and chave='accountMasters' then financeiro_privado.forma_conta_espelho(item)
         when ocorrencias=1 then financeiro_privado.forma_pagamento_espelho(item) end as comparavel
  from itens order by chave,id,item
), espelho as (
  select 'accountMasters' as chave,id,md5(to_jsonb(c)::text) as impressao,
    to_jsonb(c)-array['created_at','updated_at','criado_por'] as comparavel
    from public.financeiro_contas c
  union all
  select 'accountPayments',id,md5(to_jsonb(p)::text),to_jsonb(p)-array['created_at','updated_at']
    from public.financeiro_pagamentos p
)
insert into financeiro_privado.contas_espelho_base(tabela,registro_id,canonico_ativacao,espelho_ativacao,canonico,espelho,sincronizavel)
select coalesce(c.chave,e.chave),coalesce(c.id,e.id),c.impressao,e.impressao,c.impressao,e.impressao,
  coalesce(c.comparavel=e.comparavel,false)
from canonico c full join espelho e using (chave,id);

create function public.financeiro_projetar_contas_confirmadas()
returns jsonb language plpgsql security definer set search_path = '' set timezone='UTC' as $$
declare
  ator uuid := auth.uid();
  conta jsonb;
  pagamentos jsonb;
  modulo text;
  origem jsonb;
  item jsonb;
  id_registro text;
  item_projetado jsonb;
  estado_espelho text;
  base financeiro_privado.contas_espelho_base%rowtype;
  novo_c public.financeiro_contas%rowtype;
  antigo_c public.financeiro_contas%rowtype;
  novo_p public.financeiro_pagamentos%rowtype;
  antigo_p public.financeiro_pagamentos%rowtype;
  id_contas text[] := '{}';
  atualizadas integer := 0;
  falhas integer := 0;
  em_revisao integer := 0;
begin
  if ator is null or not public.can_access_fin_recebimentos() then
    raise exception using errcode='42501', message='Disponível somente para o Financeiro e administradores.';
  end if;
  for modulo, origem in
    select m.chave,m.dados from public.financeiro_estado_modulos m
    where m.chave in ('accountMasters','accountPayments') order by m.chave for update
  loop
    if modulo='accountMasters' then conta:=origem; else pagamentos:=origem; end if;
  end loop;
  if jsonb_typeof(conta) is distinct from 'array' or jsonb_typeof(pagamentos) is distinct from 'array' then
    raise exception using errcode='22023', message='A base de contas ou pagamentos não está disponível.';
  end if;
  for modulo, origem in select * from (values ('accountMasters',conta),('accountPayments',pagamentos)) m(chave,dados) order by chave loop
    for item in select value from jsonb_array_elements(origem) loop
      id_registro:=nullif(item->>'id','');
      if id_registro is null or (select count(*) from jsonb_array_elements(origem) a where a->>'id'=id_registro)<>1 then
        em_revisao:=em_revisao+1;
        continue;
      end if;
      begin
        select * into base from financeiro_privado.contas_espelho_base b where b.tabela=modulo and b.registro_id=id_registro;
        if base.sincronizavel is false then
          em_revisao:=em_revisao+1;
          continue;
        end if;
        if modulo='accountMasters' then
          select * into antigo_c from public.financeiro_contas c where c.id=id_registro for update;
          estado_espelho:=case when found then md5(to_jsonb(antigo_c)::text) end;
        else
          select * into antigo_p from public.financeiro_pagamentos p where p.id=id_registro for update;
          estado_espelho:=case when found then md5(to_jsonb(antigo_p)::text) end;
        end if;
        if estado_espelho is distinct from base.espelho then
          em_revisao:=em_revisao+1;
          continue;
        end if;
        if base.canonico=md5(item::text) then
          if modulo='accountMasters' then id_contas:=array_append(id_contas,id_registro); end if;
          continue;
        end if;

        if modulo='accountMasters' then
          item_projetado:=financeiro_privado.forma_conta_espelho(item);
          select * into novo_c from jsonb_populate_record(null::public.financeiro_contas,item_projetado);
          if estado_espelho is null then
            insert into public.financeiro_contas(id,nome,fornecedor,categoria,setor,matricula_cadastro,recorrencia,ativo,dados)
              values(novo_c.id,novo_c.nome,novo_c.fornecedor,novo_c.categoria,novo_c.setor,novo_c.matricula_cadastro,novo_c.recorrencia,novo_c.ativo,novo_c.dados)
              returning md5(to_jsonb(financeiro_contas)::text) into estado_espelho;
            atualizadas:=atualizadas+1;
          elsif (to_jsonb(antigo_c)-array['created_at','updated_at','criado_por']) is distinct from item_projetado then
            insert into financeiro_privado.contas_espelho_historico(tabela,registro_id,anterior,substituido_por)
              values('financeiro_contas',antigo_c.id,to_jsonb(antigo_c),ator);
            update public.financeiro_contas c set
              nome=novo_c.nome,fornecedor=novo_c.fornecedor,categoria=novo_c.categoria,setor=novo_c.setor,
              matricula_cadastro=novo_c.matricula_cadastro,recorrencia=novo_c.recorrencia,ativo=novo_c.ativo,dados=novo_c.dados,
              updated_at=clock_timestamp() where c.id=novo_c.id returning md5(to_jsonb(c)::text) into estado_espelho;
            atualizadas:=atualizadas+1;
          end if;
          id_contas:=array_append(id_contas,id_registro);
        else
          item_projetado:=financeiro_privado.forma_pagamento_espelho(item);
          if item_projetado is null then falhas:=falhas+1; continue; end if;
          select * into novo_p from jsonb_populate_record(null::public.financeiro_pagamentos,item_projetado);
          if not novo_p.conta_id=any(id_contas)
            or ((antigo_p.id is null or row(antigo_p.conta_id,antigo_p.vencimento) is distinct from row(novo_p.conta_id,novo_p.vencimento))
                and (select count(*) from jsonb_array_elements(pagamentos) p
                     where p->>'accountId'=novo_p.conta_id and p->>'due'=item->>'due')>1)
            or exists (select 1 from public.financeiro_pagamentos p
                where p.conta_id=novo_p.conta_id and p.vencimento=novo_p.vencimento and p.id<>novo_p.id) then
            em_revisao:=em_revisao+1;
            continue;
          end if;
          if estado_espelho is null then
            insert into public.financeiro_pagamentos(id,conta_id,vencimento,valor,status,forma_pagamento,codigo_pagamento,pago_em,dados)
              values(novo_p.id,novo_p.conta_id,novo_p.vencimento,novo_p.valor,novo_p.status,novo_p.forma_pagamento,novo_p.codigo_pagamento,novo_p.pago_em,novo_p.dados)
              returning md5(to_jsonb(financeiro_pagamentos)::text) into estado_espelho;
            atualizadas:=atualizadas+1;
          elsif (to_jsonb(antigo_p)-array['created_at','updated_at']) is distinct from item_projetado then
            insert into financeiro_privado.contas_espelho_historico(tabela,registro_id,anterior,substituido_por)
              values('financeiro_pagamentos',antigo_p.id,to_jsonb(antigo_p),ator);
            update public.financeiro_pagamentos p set
              conta_id=novo_p.conta_id,vencimento=novo_p.vencimento,valor=novo_p.valor,status=novo_p.status,
              forma_pagamento=novo_p.forma_pagamento,codigo_pagamento=novo_p.codigo_pagamento,pago_em=novo_p.pago_em,
              dados=novo_p.dados,updated_at=clock_timestamp() where p.id=novo_p.id returning md5(to_jsonb(p)::text) into estado_espelho;
            atualizadas:=atualizadas+1;
          end if;
        end if;
        insert into financeiro_privado.contas_espelho_base(tabela,registro_id,canonico,espelho,sincronizavel)
          values(modulo,id_registro,md5(item::text),estado_espelho,true)
          on conflict(tabela,registro_id) do update set canonico=excluded.canonico,espelho=excluded.espelho;
      exception when data_exception or integrity_constraint_violation then
        falhas:=falhas+1;
      end;
    end loop;
  end loop;
  return jsonb_build_object('atualizadas',atualizadas,'falhas',falhas,'revisao',em_revisao);
end;
$$;

revoke all on function public.financeiro_arquivar_conta_pagamento(text,text,jsonb,jsonb),
  public.financeiro_projetar_contas_confirmadas() from public,anon,authenticated;
grant execute on function public.financeiro_arquivar_conta_pagamento(text,text,jsonb,jsonb),
  public.financeiro_projetar_contas_confirmadas() to authenticated;
commit;
