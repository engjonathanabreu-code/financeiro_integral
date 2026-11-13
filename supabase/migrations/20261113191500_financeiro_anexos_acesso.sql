-- Restringe originais de anexos e caminhos do Financeiro à autoria ou ao registro visível.
-- Esta migração só altera código, políticas e grants.
begin;
set local lock_timeout = '5s';

create or replace function financeiro_privado.id_local(p_id uuid)
returns bigint language plpgsql immutable set search_path = '' as $$
declare h bigint := 0; s text := p_id::text; i int;
begin
  for i in 1..length(s) loop h := (h * 31 + ascii(substr(s, i, 1))) % 4294967296; end loop;
  return case when h = 0 then 1 else h end;
end $$;

create or replace function financeiro_privado.perfil_financeiro(p public.profiles)
returns boolean language sql stable set search_path='' as $$
  select lower(trim(coalesce(p.tipo, ''))) = 'financeiro'
      or lower(trim(coalesce(p.setor, ''))) = 'financeiro'
$$;

create or replace function financeiro_privado.lista(dados jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select case when jsonb_typeof(dados) = 'array' then dados else '[]'::jsonb end
$$;

create or replace function financeiro_privado.pode_ver_registro(
  p_chave text, registro jsonb, perfil public.profiles
) returns boolean language plpgsql stable set search_path='' as $$
declare registro_pai jsonb; chave_pai text; id_pai text; atribuicoes jsonb; financeiro boolean;
begin
  if perfil.id is null or perfil.ativo is not true or registro is null then return false; end if;
  if perfil.tipo = 'Administrador' then return true; end if;
  financeiro := financeiro_privado.perfil_financeiro(perfil);
  if p_chave = 'docs' then
    return coalesce(registro->>'criadoPorId'=perfil.id::text,false)
      or coalesce(financeiro and lower(trim(registro->>'sector'))='financeiro',false);
  end if;
  if p_chave in ('tripExpenses','tripDocuments','budgetExpenses') then
    chave_pai := case when p_chave='budgetExpenses' then 'budgetRecords' else 'trips' end;
    id_pai := case when p_chave='budgetExpenses' then registro->>'budgetId' else registro->>'tripId' end;
    select item into registro_pai
    from public.financeiro_estado_modulos m
    cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) item
    where m.chave=chave_pai and item->>'id'=id_pai;
    registro := registro_pai;
    p_chave := chave_pai;
  end if;
  if p_chave not in ('trips','budgetRecords') or registro is null then return false; end if;

  atribuicoes := case when financeiro and jsonb_typeof(registro->'assignedDirect')='array'
    then registro->'assignedDirect' else financeiro_privado.lista(registro->'assigned') end;
  return (
    not financeiro and nullif(lower(trim(registro->>'sector')),'')=lower(trim(perfil.tipo))
  ) is true or (
    p_chave='trips' and financeiro_privado.solicitante_da_viagem(registro,perfil.id)
  ) or exists (
    select 1 from jsonb_array_elements_text(atribuicoes) a
    where a=financeiro_privado.id_local(perfil.id)::text or a in (
      select usuario->>'id' from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) usuario
      where m.chave='usersMvp' and usuario->>'erpId'=perfil.id::text
        and usuario->>'active' is distinct from 'false'
    )
  );
end $$;

create or replace function financeiro_privado.referencias_arquivo(d jsonb)
returns setof text language sql immutable set search_path='' as $$
  select distinct parte->>campo
  from (values(d),(d->'file')) as partes(parte)
  cross join (values ('arquivoId'),('fileDataArquivoId'),('dataUrlArquivoId'),('dataURLArquivoId')) as campos(campo)
  where nullif(parte->>campo,'') is not null
$$;

create or replace function financeiro_privado.referencias_storage(d jsonb)
returns setof text language sql immutable set search_path='' as $$
  select distinct parte->>'storagePath'
  from (values(d),(d->'file')) as partes(parte)
  where nullif(parte->>'storagePath','') is not null
    and coalesce(parte->>'storageBucket','documentos')='documentos'
$$;

create or replace function public.financeiro_pode_ler_arquivo(p_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare eu public.profiles;
begin
  select * into eu from public.profiles where id=auth.uid() and ativo;
  if eu.id is null or p_id is null then return false; end if;
  return exists (
    select 1 from public.financeiro_arquivos a where a.id=p_id
      and (eu.tipo='Administrador' or a.criado_por=eu.id or exists (
        select 1 from public.financeiro_estado_modulos m
        cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) item
        where m.chave in ('docs','tripExpenses','tripDocuments','budgetExpenses')
          and p_id::text in (select financeiro_privado.referencias_arquivo(item))
          and financeiro_privado.pode_ver_registro(m.chave,item,eu)
      ))
  );
end $$;
revoke all on function public.financeiro_pode_ler_arquivo(uuid) from public,anon;
grant execute on function public.financeiro_pode_ler_arquivo(uuid) to authenticated;

create or replace function public.financeiro_storage_permitido(p_caminho text,p_restricao boolean)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare eu public.profiles; caminho_protegido boolean;
begin
  select * into eu from public.profiles where id=auth.uid() and ativo;
  caminho_protegido := split_part(p_caminho,'/',2) in ('financeiro-fiscal','financeiro-analise')
    or exists (
      select 1 from public.financeiro_estado_modulos m
      cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) item
      where m.chave in ('docs','tripExpenses','tripDocuments','budgetExpenses')
        and p_caminho in (select financeiro_privado.referencias_storage(item))
    );
  if not caminho_protegido then return p_restricao; end if;
  if eu.id is null then return false; end if;
  if eu.tipo='Administrador' or split_part(p_caminho,'/',1)=eu.id::text then return true; end if;
  return exists (
    select 1 from public.financeiro_estado_modulos m
    cross join lateral jsonb_array_elements(financeiro_privado.lista(m.dados)) item
    where m.chave in ('docs','tripExpenses','tripDocuments','budgetExpenses')
      and p_caminho in (select financeiro_privado.referencias_storage(item))
      and financeiro_privado.pode_ver_registro(m.chave,item,eu)
  );
end $$;
revoke all on function public.financeiro_storage_permitido(text,boolean) from public;
grant execute on function public.financeiro_storage_permitido(text,boolean) to anon,authenticated;

-- A política restritiva impede que uma regra permissiva de outro módulo exponha
-- os comprovantes do Financeiro. A permissiva libera referências autorizadas.
create policy financeiro_documentos_restringir_leitura
  on storage.objects as restrictive for select to anon,authenticated
  using (bucket_id <> 'documentos' or (select public.financeiro_storage_permitido(name,true)));
create policy financeiro_documentos_ler_vinculados
  on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and (select public.financeiro_storage_permitido(name,false)));

alter policy financeiro_arquivos_ler on public.financeiro_arquivos
  using (public.financeiro_pode_ler_arquivo(id));
revoke all on public.financeiro_arquivos from public,anon;
revoke insert,update,delete,truncate,references,trigger on public.financeiro_arquivos from authenticated;
grant select on public.financeiro_arquivos to authenticated;
revoke execute on function public.financeiro_guardar_arquivo(text,text) from public,anon;
revoke execute on function public.financeiro_modulo_permitido(text) from public,anon;
revoke execute on function public.financeiro_estado_modulos_protect_and_history() from public,anon,authenticated;
revoke execute on function public.financeiro_guard_invoice_requests() from public,anon,authenticated;
revoke execute on function public.financeiro_guard_budget_close() from public,anon,authenticated;
revoke all on all functions in schema financeiro_privado from public,anon,authenticated;

commit;
