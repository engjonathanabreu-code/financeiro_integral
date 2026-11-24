-- Aprovação e espelho local são gravados na mesma transação.
-- Somente um perfil ativo, identificado por UUID, pode originar um vínculo novo.
begin;
set local lock_timeout = '5s';

create function financeiro_solicitacoes_privado.garantir_vinculo_solicitante(p_usuario uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  perfil public.profiles;
  usuarios jsonb;
  id_local bigint := 0;
  caractere text;
begin
  if not coalesce(public.is_admin(),false) or not coalesce(public.is_active_user(),false) then
    raise exception using errcode='42501',message='Somente ADM pode revisar solicitações.';
  end if;
  select * into perfil from public.profiles where id=p_usuario and ativo for share;
  if perfil.id is null then raise exception 'Confira o perfil ativo do solicitante.'; end if;

  insert into public.financeiro_estado_modulos(chave,dados,updated_by,updated_at)
  values('usersMvp','[]'::jsonb,auth.uid(),clock_timestamp()) on conflict(chave) do nothing;
  select dados into usuarios from public.financeiro_estado_modulos where chave='usersMvp' for update;
  if jsonb_typeof(usuarios) is distinct from 'array' then
    raise exception 'Confira o cadastro de usuários do Financeiro.';
  end if;
  -- Vínculos existentes, inclusive inativos ou duplicados, passam pela guarda original.
  if exists(select 1 from jsonb_array_elements(usuarios) u where u->>'erpId'=perfil.id::text) then
    return;
  end if;
  -- Não vincula por nome/e-mail nem substitui cadastros locais antigos sem identidade ERP.
  if nullif(btrim(perfil.email),'') is not null and exists (
    select 1 from jsonb_array_elements(usuarios) u
    where nullif(btrim(u->>'erpId'),'') is null
      and lower(btrim(u->>'email'))=lower(btrim(perfil.email))
  ) then
    raise exception 'Confira o vínculo ERP do cadastro financeiro existente do solicitante.';
  end if;
  -- Mesmo hash uint32 do login e da sincronização ERP; mantém os consumidores numéricos.
  for caractere in select regexp_split_to_table(perfil.id::text,'') loop
    id_local := (id_local*31+ascii(caractere)) % 4294967296;
  end loop;
  if id_local=0 then id_local:=1; end if;
  if exists(select 1 from jsonb_array_elements(usuarios) u where u->>'id'=id_local::text) then
    raise exception 'Identificador financeiro em uso. Confira o cadastro do solicitante.';
  end if;
  update public.financeiro_estado_modulos
  set dados=usuarios||jsonb_build_array(jsonb_build_object(
    'id',id_local,'erpId',perfil.id,'name',perfil.nome,'email',coalesce(perfil.email,''),
    'role',case when perfil.tipo='Administrador' then 'Administrador' else 'Funcionário' end,
    'sector',coalesce(nullif(perfil.tipo,''),'Administrativo'),'active',true,'source','ERP')),
    updated_by=auth.uid(),updated_at=clock_timestamp()
  where chave='usersMvp';
end $$;
revoke all on function financeiro_solicitacoes_privado.garantir_vinculo_solicitante(uuid)
  from public,anon,authenticated;

-- Altera somente o ponto de resolução de identidade na conversão original.
-- As guardas públicas da central e de viagens semelhantes permanecem intactas.
do $migration$
declare
  funcao regprocedure := 'financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(text,jsonb,boolean,text)'::regprocedure;
  definicao text;
  anterior text := $old$      select dados into usuarios from public.financeiro_estado_modulos where chave='usersMvp' for share;$old$;
  novo text := $new$      perform financeiro_solicitacoes_privado.garantir_vinculo_solicitante(solicitante.id);
      select dados into usuarios from public.financeiro_estado_modulos where chave='usersMvp' for share;$new$;
begin
  if (select md5(prosrc) from pg_proc where oid=funcao) is distinct from '9a8914a4bb2e818992bea380e6ac555d' then
    raise exception 'O fluxo de aprovação divergiu da base conhecida. Revise a instalação.';
  end if;
  definicao:=pg_get_functiondef(funcao);
  if strpos(definicao,anterior)=0 then raise exception 'Ponto de resolução de identidade não encontrado.'; end if;
  execute replace(definicao,anterior,novo);
end $migration$;

commit;
