begin;
set local lock_timeout = '5s';

-- A guarda do bucket existente passa a proteger também uploads de Viagens
-- antes de o registro da despesa estar vinculado.
do $$
declare corpo text;
begin
  select pg_get_functiondef('public.financeiro_storage_permitido(text,boolean)'::regprocedure)
    into corpo;
  if strpos(corpo, '(''financeiro-fiscal'',''financeiro-analise'')') = 0 then
    raise exception 'Revise a versão ativa da guarda do Storage antes de instalar Viagens.';
  end if;
  execute replace(corpo, '(''financeiro-fiscal'',''financeiro-analise'')',
    '(''financeiro-fiscal'',''financeiro-analise'',''financeiro-viagens'')');
end
$$;

create table financeiro_privado.viagens_operacoes (
  usuario uuid not null,
  operacao uuid not null,
  assinatura bytea not null,
  viagem_id text not null,
  criada_em timestamptz not null default now(),
  primary key (usuario, operacao)
);
alter table financeiro_privado.viagens_operacoes enable row level security;
revoke all on financeiro_privado.viagens_operacoes from public, anon, authenticated;

create function public.financeiro_salvar_viagem(
  p_operacao uuid, p_id text, p_campos jsonb, p_esperado jsonb default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  perfil public.profiles;
  modulo public.financeiro_estado_modulos;
  assinatura bytea;
  recebida financeiro_privado.viagens_operacoes;
  atual jsonb;
  destino jsonb;
  escritos jsonb;
  resposta jsonb;
  editaveis constant text[] := array['city','project','start','end','period','month','employee',
    'sector','status','objective','report','assigned'];
begin
  select * into perfil from public.profiles where id=auth.uid() and ativo;
  if perfil.id is null or not coalesce(public.financeiro_modulo_permitido('trips'),false) then
    raise exception using errcode='42501',message='Viagens indisponíveis para este perfil.';
  end if;
  if p_operacao is null or nullif(p_id,'') is null or length(p_id)>100
    or jsonb_typeof(p_campos) is distinct from 'object'
    or p_campos-editaveis <> '{}'::jsonb
    or nullif(btrim(p_campos->>'city'),'') is null
    or nullif(btrim(p_campos->>'employee'),'') is null
    or coalesce(p_campos->>'start','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_campos->>'end','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_campos->>'end' < p_campos->>'start'
    or jsonb_typeof(p_campos->'assigned') is distinct from 'array' then
    raise exception using errcode='22023',message='Confira a identificação, datas, equipe e campos da viagem.';
  end if;
  perform (p_campos->>'start')::date, (p_campos->>'end')::date;
  assinatura:=pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_array(p_id,p_campos,p_esperado)::text,'UTF8'));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('financeiro_viagem:'||perfil.id||':'||p_operacao,0));
  select * into recebida from financeiro_privado.viagens_operacoes
    where usuario=perfil.id and operacao=p_operacao;
  if found and recebida.assinatura<>assinatura then
    raise exception using errcode='22023',message='Esta tentativa identifica outro conteúdo.';
  end if;
  select * into modulo from public.financeiro_estado_modulos where chave='trips' for update;
  if not found or jsonb_typeof(modulo.dados) is distinct from 'array' then
    raise exception using errcode='42501',message='O módulo de Viagens não está disponível.';
  end if;
  if (select count(*) from jsonb_array_elements(modulo.dados) where value->>'id'=p_id)>1 then
    raise exception using errcode='22023',message='Este identificador precisa de uma revisão administrativa.';
  end if;
  select value into atual from jsonb_array_elements(modulo.dados) where value->>'id'=p_id;
  if atual is not null and financeiro_privado.pode_ver_registro('trips',atual,perfil) is not true then
    raise exception using errcode='42501',message='Viagem indisponível para este perfil.';
  end if;
  if recebida.operacao is not null then
    return jsonb_build_object('status','salvo','viagem',atual,'repetido',true);
  end if;
  if p_esperado is distinct from atual then
    return jsonb_build_object('status','conflito','viagem',atual);
  end if;
  destino:=coalesce(atual,jsonb_build_object('id',p_id,'declared',0,'proven',0,'issues','[]'::jsonb,
    'createdBy',jsonb_build_object('name',perfil.nome,'erpId',perfil.id)))||p_campos;
  if atual is null then
    if perfil.tipo<>'Administrador' then
      destino:=destino||jsonb_build_object('sector',perfil.tipo);
    end if;
  elsif perfil.tipo<>'Administrador' then
    destino:=destino||jsonb_build_object('sector',atual->'sector');
  end if;
  if perfil.tipo<>'Administrador' then
    destino:=financeiro_privado.validar_registro('trips',atual,destino,perfil);
  end if;
  if atual is null then
    escritos:=modulo.dados||jsonb_build_array(destino);
  else
    select jsonb_agg(case when value->>'id'=p_id then destino else value end order by ordenacao)
      into escritos from jsonb_array_elements(modulo.dados) with ordinality t(value,ordenacao);
  end if;
  if perfil.tipo='Administrador' then
    resposta:=public.financeiro_salvar_modulo('trips',escritos,modulo.revisao);
  else
    resposta:=public.financeiro_salvar_modulo_visivel('trips',
      financeiro_privado.filtrar_registros('trips',escritos,perfil),modulo.revisao);
  end if;
  if resposta->>'status' is distinct from 'salvo' then
    raise exception using errcode='40001',message='A viagem mudou. Confira a versão atual antes de gravar.';
  end if;
  insert into financeiro_privado.viagens_operacoes(usuario,operacao,assinatura,viagem_id)
    values(perfil.id,p_operacao,assinatura,p_id);
  return jsonb_build_object('status','salvo','viagem',destino);
end
$$;
revoke all on function public.financeiro_salvar_viagem(uuid,text,jsonb,jsonb) from public,anon;
grant execute on function public.financeiro_salvar_viagem(uuid,text,jsonb,jsonb) to authenticated;

commit;
