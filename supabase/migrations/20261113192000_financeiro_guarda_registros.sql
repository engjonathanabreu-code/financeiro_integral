-- Os registros por setor, atribuição e vínculo canônico são lidos pela RPC filtrada.
-- Depende das migrações de revisão, Solicitações e acesso aos anexos.
begin;
set local lock_timeout = '5s';

create policy financeiro_registros_somente_rpc
on public.financeiro_estado_modulos as restrictive for all to public
using (
  chave not in ('trips','tripExpenses','tripDocuments','budgetRecords','budgetExpenses','docs')
  or (select public.is_admin())
)
with check (
  chave not in ('trips','tripExpenses','tripDocuments','budgetRecords','budgetExpenses','docs')
  or (select public.is_admin())
);

-- usersMvp relaciona a sessão autenticada à atribuição local usada pela interface.
create policy financeiro_atribuicoes_cadastro_administrado
on public.financeiro_estado_modulos as restrictive for update to public
using (chave <> 'usersMvp' or (select public.is_admin()))
with check (chave <> 'usersMvp' or (select public.is_admin()));

create policy financeiro_atribuicoes_insercao_administrada
on public.financeiro_estado_modulos as restrictive for insert to public
with check (chave <> 'usersMvp' or (select public.is_admin()));

-- Restringe a leitura direta de snapshots antigos, inclusive se surgir outra
-- política permissiva no histórico.
create policy financeiro_historico_registros_administrado
on public.financeiro_estado_modulos_history as restrictive for all to public
using (
  chave not in ('trips','tripExpenses','tripDocuments','budgetRecords','budgetExpenses','docs','invoiceRequests','usersMvp')
  or (select public.is_admin())
)
with check ((select public.is_admin()));

create or replace function public.financeiro_restore_modulo_version(p_chave text,p_history_id bigint)
returns void language plpgsql security definer set search_path='' as $$
declare conteudo jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then
    raise exception using errcode='42501', message='Somente ADM pode restaurar versões.';
  end if;
  select dados into conteudo from public.financeiro_estado_modulos_history
    where id=p_history_id and chave=p_chave;
  if conteudo is null then raise exception 'Versão não encontrada.'; end if;
  update public.financeiro_estado_modulos set dados=conteudo,updated_at=now() where chave=p_chave;
end $$;
revoke all on function public.financeiro_restore_modulo_version(text,bigint) from public,anon;
grant execute on function public.financeiro_restore_modulo_version(text,bigint) to authenticated;

create or replace function financeiro_privado.filtrar_registros(
  p_chave text, p_dados jsonb, perfil public.profiles
) returns jsonb language sql stable set search_path='' as $$
  select case when perfil.tipo='Administrador' then p_dados else (
    select coalesce(jsonb_agg(item order by ordem),'[]'::jsonb)
    from jsonb_array_elements(financeiro_privado.lista(p_dados)) with ordinality r(item,ordem)
    where financeiro_privado.pode_ver_registro(p_chave,item,perfil)
  ) end
$$;

create or replace function public.financeiro_listar_modulos_visiveis(p_chaves text[] default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare perfil public.profiles;
begin
  select * into perfil from public.profiles where id=auth.uid() and ativo;
  if perfil.id is null then
    raise exception using errcode='42501',message='Sessão ativa obrigatória.';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'chave',m.chave,'revisao',m.revisao,'dados',financeiro_privado.filtrar_registros(m.chave,m.dados,perfil))
      order by m.chave),'[]'::jsonb)
    from public.financeiro_estado_modulos m
    where m.chave in ('trips','tripExpenses','tripDocuments','budgetRecords','budgetExpenses','docs')
      and (p_chaves is null or m.chave=any(p_chaves))
      and public.financeiro_modulo_permitido(m.chave)
  );
end $$;
revoke all on function public.financeiro_listar_modulos_visiveis(text[]) from public,anon;
grant execute on function public.financeiro_listar_modulos_visiveis(text[]) to authenticated;

-- Na atualização de um registro, externaliza somente seu anexo alterado.
-- A consulta anterior pode incluir itens legados com dados inline que o ator
-- não consegue ler. Esses itens devem passar pelo UPDATE sem alteração.
create or replace function financeiro_privado.antes_gravar_modulo()
returns trigger language plpgsql security definer set search_path='' as $$
declare anterior jsonb;
begin
  if tg_op='UPDATE' then new.updated_at := clock_timestamp(); anterior:=old.dados; end if;
  if new.chave in ('docs','tripExpenses','tripDocuments','budgetExpenses')
     and jsonb_typeof(new.dados)='array'
     and strpos(new.dados::text,'"data:')>0 then
    select coalesce(jsonb_agg(case when exists (
      select 1 from jsonb_array_elements(financeiro_privado.lista(anterior)) a where a=x
    ) then x else financeiro_privado.externalizar(x) end order by o),'[]'::jsonb)
    into new.dados from jsonb_array_elements(new.dados) with ordinality t(x,o);
  end if;
  return new;
end $$;

create or replace function financeiro_privado.validar_registro(
  chave text, antes jsonb, depois jsonb, perfil public.profiles
) returns jsonb language plpgsql set search_path='' as $$
declare orcamento jsonb; atribuicao_nova text; dono text; arquivo text; anexos jsonb;
begin
  if chave='trips' then
    if depois->>'status'='Aprovada' and antes->>'status' is distinct from 'Aprovada' then
      raise exception using errcode='42501',message='Somente ADM pode aprovar viagens.';
    end if;
    if depois->'invoiceRequestId' is distinct from antes->'invoiceRequestId'
       or depois->'vehicleId' is distinct from antes->'vehicleId'
       or depois->'assignedDirect' is distinct from antes->'assignedDirect'
       or (antes is not null and depois->'sector' is distinct from antes->'sector') then
      raise exception using errcode='42501',message='Somente ADM pode alterar vínculos e setor da viagem.';
    end if;
    if antes is null and nullif(trim(depois->>'sector'),'') is null then
      depois := depois || jsonb_build_object('sector',perfil.tipo);
    end if;
    if antes is null and lower(trim(depois->>'sector')) is distinct from lower(trim(perfil.tipo)) then
      raise exception using errcode='42501',message='Crie a viagem no seu setor.';
    end if;
    if exists (
      select id from jsonb_array_elements_text(financeiro_privado.lista(antes->'assigned')) id
      except select id from jsonb_array_elements_text(financeiro_privado.lista(depois->'assigned')) id
    ) then
      raise exception using errcode='42501',message='Somente ADM pode alterar os responsáveis da viagem.';
    end if;
    for atribuicao_nova in
      select id from jsonb_array_elements_text(financeiro_privado.lista(depois->'assigned')) id
      except select id from jsonb_array_elements_text(financeiro_privado.lista(antes->'assigned')) id
    loop
      if atribuicao_nova<>financeiro_privado.id_local(perfil.id)::text and not exists (
        select 1 from public.financeiro_estado_modulos m
        cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) u
        where m.chave='usersMvp' and u->>'erpId'=perfil.id::text
          and u->>'active' is distinct from 'false' and u->>'id'=atribuicao_nova
      ) then
        raise exception using errcode='42501',message='Somente ADM pode alterar os responsáveis da viagem.';
      end if;
    end loop;
  elsif chave='budgetRecords' then
    raise exception using errcode='42501',message='Somente ADM pode criar, alterar ou excluir orçamentos.';
  elsif chave='budgetExpenses' then
    if antes is not null and depois->'budgetId' is distinct from antes->'budgetId' then
      raise exception using errcode='42501',message='Não é permitido trocar o orçamento de uma despesa.';
    end if;
    select item into orcamento from public.financeiro_estado_modulos m
    cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) item
    where m.chave='budgetRecords' and item->>'id'=depois->>'budgetId';
    if orcamento->>'status'='Fechado'
       and (antes is null or (depois-'fiscalDocId') is distinct from (antes-'fiscalDocId')) then
      raise exception using errcode='42501',message='Orçamento fechado: gastos não podem ser incluídos ou alterados.';
    end if;
  elsif chave in ('tripExpenses','tripDocuments') then
    if antes is not null and depois->'tripId' is distinct from antes->'tripId' then
      raise exception using errcode='42501',message='Não é permitido trocar a viagem do registro.';
    end if;
    if chave='tripDocuments' and depois->>'expenseId' is not null
       and depois->'expenseId' is distinct from antes->'expenseId' and not exists (
        select 1 from public.financeiro_estado_modulos m
        cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) despesa
        where m.chave='tripExpenses' and despesa->>'id'=depois->>'expenseId' and despesa->>'tripId'=depois->>'tripId'
      ) then
      raise exception using errcode='42501',message='Escolha uma despesa desta viagem.';
    end if;
  elsif chave='docs' then
    if antes is not null and not financeiro_privado.perfil_financeiro(perfil) then
      raise exception using errcode='42501',message='Somente Financeiro ou ADM pode alterar documentos fiscais.';
    end if;
    if antes is not null and depois->'sector' is distinct from antes->'sector' then
      raise exception using errcode='42501',message='Somente ADM pode trocar o setor do documento fiscal.';
    end if;
    dono := case when antes is null then perfil.id::text else antes->>'criadoPorId' end;
    depois := (depois-'criadoPorId') || case when dono is null then '{}'::jsonb else jsonb_build_object('criadoPorId',dono) end;
  end if;

  if not financeiro_privado.pode_ver_registro(chave,depois,perfil) then
    raise exception using errcode='42501',message='Registro indisponível para este perfil.';
  end if;
  if chave in ('docs','tripExpenses','tripDocuments','budgetExpenses') then
    anexos := financeiro_privado.externalizar(depois);
    for arquivo in
      select financeiro_privado.referencias_arquivo(anexos)
      except select financeiro_privado.referencias_arquivo(antes)
    loop
      if arquivo !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
         or not public.financeiro_pode_ler_arquivo(arquivo::uuid) then
        raise exception using errcode='42501',message='Anexo indisponível para este perfil.';
      end if;
    end loop;
    for arquivo in
      select financeiro_privado.referencias_storage(anexos)
      except select financeiro_privado.referencias_storage(antes)
    loop
      if not exists (select 1 from storage.objects where bucket_id='documentos' and name=arquivo)
         or not (
           split_part(arquivo,'/',1)=perfil.id::text
           or public.financeiro_storage_permitido(arquivo,false)
         ) then
        raise exception using errcode='42501',message='Anexo do Storage indisponível para este perfil.';
      end if;
    end loop;
    if exists (
      select 1 from (values (anexos),(anexos->'file')) partes(parte)
      where nullif(parte->>'storagePath','') is not null
        and coalesce(parte->>'storageBucket','documentos') <> 'documentos'
    ) and (anexos->'storagePath' is distinct from antes->'storagePath'
      or anexos->'storageBucket' is distinct from antes->'storageBucket'
      or anexos->'file'->'storagePath' is distinct from antes->'file'->'storagePath'
      or anexos->'file'->'storageBucket' is distinct from antes->'file'->'storageBucket') then
      raise exception using errcode='42501',message='Use o bucket de documentos para este anexo.';
    end if;
    depois := anexos;
  end if;
  return depois;
end $$;

create or replace function public.financeiro_salvar_modulo_visivel(
  p_chave text,p_dados jsonb,p_revisao bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare perfil public.profiles; atual public.financeiro_estado_modulos;
  antes jsonb; depois jsonb; original jsonb; uniao jsonb;
begin
  select * into perfil from public.profiles where id=auth.uid() and ativo;
  if perfil.id is null or p_chave is null
     or p_chave not in ('trips','tripExpenses','tripDocuments','budgetRecords','budgetExpenses','docs')
     or not coalesce(public.financeiro_modulo_permitido(p_chave),false) then
    raise exception using errcode='42501',message='Módulo indisponível para este perfil.';
  end if;
  if perfil.tipo='Administrador' then
    return public.financeiro_salvar_modulo(p_chave,p_dados,p_revisao);
  end if;
  -- Mantém a autorização e o estado de encerramento do pai durante a escrita.
  if p_chave in ('tripExpenses','tripDocuments','budgetExpenses') then
    perform 1 from public.financeiro_estado_modulos
    where chave=case when p_chave='budgetExpenses' then 'budgetRecords' else 'trips' end
    for share;
  end if;
  if p_chave='tripDocuments' then
    perform 1 from public.financeiro_estado_modulos where chave='tripExpenses' for share;
  end if;
  select * into atual from public.financeiro_estado_modulos where chave=p_chave for update;
  if not found then
    raise exception using errcode='42501',message='Somente ADM pode criar módulos.';
  end if;
  if atual.revisao is distinct from p_revisao then
    return jsonb_build_object('status','conflito','revisao',atual.revisao,'dados',
      financeiro_privado.filtrar_registros(p_chave,atual.dados,perfil));
  end if;
  if jsonb_typeof(atual.dados) is distinct from 'array'
     or jsonb_typeof(p_dados) is distinct from 'array'
     or exists (
       select 1 from jsonb_array_elements(financeiro_privado.lista(p_dados)) n
       where jsonb_typeof(n)<>'object' or nullif(n->>'id','') is null
     ) or (select count(*)<>count(distinct n->>'id') from jsonb_array_elements(financeiro_privado.lista(p_dados)) n) then
    raise exception using errcode='22023',message='Use uma lista de registros com identificadores únicos.';
  end if;

  uniao := '[]'::jsonb;
  for original in select value from jsonb_array_elements(atual.dados) loop
    select value into depois from jsonb_array_elements(p_dados) where value->>'id'=original->>'id';
    if not financeiro_privado.pode_ver_registro(p_chave,original,perfil) then
      if depois is not null then
        raise exception using errcode='42501',message='Registro indisponível para este perfil.';
      end if;
      depois := original;
    elsif depois is null then
      raise exception using errcode='42501',message='Somente ADM pode excluir este registro.';
    elsif depois is distinct from original then
      if (select count(*) from jsonb_array_elements(atual.dados) a where a->>'id'=original->>'id')<>1 then
        raise exception using errcode='22023',message='Solicite ao ADM a revisão do identificador legado.';
      end if;
      depois := financeiro_privado.validar_registro(p_chave,original,depois,perfil);
    end if;
    if depois is not null then uniao := uniao || jsonb_build_array(depois); end if;
  end loop;
  for depois in select value from jsonb_array_elements(p_dados) loop
    select value into antes from jsonb_array_elements(atual.dados) where value->>'id'=depois->>'id';
    if antes is null then
      depois := financeiro_privado.validar_registro(p_chave,null,depois,perfil);
      uniao := uniao || jsonb_build_array(depois);
    end if;
  end loop;
  if uniao is distinct from atual.dados then
    update public.financeiro_estado_modulos set dados=uniao,updated_by=auth.uid(),updated_at=now()
    where chave=p_chave returning * into atual;
  end if;
  return jsonb_build_object('status','salvo','revisao',atual.revisao,'dados',
    financeiro_privado.filtrar_registros(p_chave,atual.dados,perfil));
end $$;
revoke all on function public.financeiro_salvar_modulo_visivel(text,jsonb,bigint) from public,anon;
grant execute on function public.financeiro_salvar_modulo_visivel(text,jsonb,bigint) to authenticated;
revoke all on all functions in schema financeiro_privado from public,anon,authenticated;

commit;
