-- Compatibilidade com clientes que já usam revisão, sem reescrever módulos ou históricos.
begin;
set local lock_timeout = '5s';

create schema financeiro_sincronizacao_privado;
revoke all on schema financeiro_sincronizacao_privado from public, anon;
grant usage on schema financeiro_sincronizacao_privado to authenticated;

create table financeiro_sincronizacao_privado.recibos (
  usuario uuid not null,
  operacao uuid not null,
  assinatura bytea not null,
  revisao bigint not null,
  criado_em timestamptz not null default now(),
  primary key (usuario, operacao)
);
alter table financeiro_sincronizacao_privado.recibos enable row level security;
revoke all on financeiro_sincronizacao_privado.recibos from public, anon, authenticated;
grant select, insert on financeiro_sincronizacao_privado.recibos to authenticated;
create policy recibos_do_usuario on financeiro_sincronizacao_privado.recibos
  for select to authenticated using (usuario = (select auth.uid()));
create policy registrar_recibo_do_usuario on financeiro_sincronizacao_privado.recibos
  for insert to authenticated with check (usuario = (select auth.uid()));

create function public.financeiro_salvar_modulo_com_recibo(
  p_chave text, p_dados jsonb, p_revisao bigint, p_operacao uuid, p_filtrado boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  ator uuid := auth.uid();
  assinatura_pedido bytea;
  recibo financeiro_sincronizacao_privado.recibos%rowtype;
  atual jsonb;
  resposta jsonb;
begin
  if ator is null or not coalesce(public.financeiro_modulo_permitido(p_chave), false) then
    raise exception using errcode = '42501', message = 'Módulo indisponível para este perfil.';
  end if;
  if nullif(btrim(p_chave), '') is null or p_dados is null or p_operacao is null or p_filtrado is null then
    raise exception using errcode = '22023', message = 'Operação de sincronização inválida.';
  end if;

  assinatura_pedido := pg_catalog.sha256(pg_catalog.convert_to(
    jsonb_build_array(p_chave, p_revisao, p_filtrado, p_dados)::text, 'UTF8'
  ));
  -- Serializa apenas reenvios do mesmo usuário e operação. O bloqueio termina com a transação.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(ator::text || ':' || p_operacao::text, 0));
  select * into recibo from financeiro_sincronizacao_privado.recibos
  where usuario = ator and operacao = p_operacao;

  if found then
    if recibo.assinatura <> assinatura_pedido then
      raise exception using errcode = '22023', message = 'Identificador de sincronização já usado com outro conteúdo.';
    end if;
    if p_filtrado then
      atual := public.financeiro_listar_modulos_visiveis(array[p_chave])->0;
    else
      select jsonb_build_object('revisao', m.revisao, 'dados', m.dados) into atual
      from public.financeiro_estado_modulos m where m.chave = p_chave;
    end if;
    if atual is null then
      raise exception using errcode = '42501', message = 'Módulo indisponível para este perfil.';
    end if;
    return jsonb_build_object('status', 'salvo', 'repetido', true, 'revisao_operacao', recibo.revisao,
      'revisao', atual->'revisao', 'dados', atual->'dados');
  end if;

  if p_filtrado then
    resposta := public.financeiro_salvar_modulo_visivel(p_chave, p_dados, p_revisao);
  else
    resposta := public.financeiro_salvar_modulo(p_chave, p_dados, p_revisao);
  end if;
  if resposta->>'status' = 'salvo' then
    insert into financeiro_sincronizacao_privado.recibos(usuario, operacao, assinatura, revisao)
    values (ator, p_operacao, assinatura_pedido, (resposta->>'revisao')::bigint);
  end if;
  return resposta;
end
$$;

revoke all on function public.financeiro_salvar_modulo_com_recibo(text,jsonb,bigint,uuid,boolean) from public, anon;
grant execute on function public.financeiro_salvar_modulo_com_recibo(text,jsonb,bigint,uuid,boolean) to authenticated;
comment on function public.financeiro_salvar_modulo_com_recibo(text,jsonb,bigint,uuid,boolean) is
  'Salva com revisão esperada e confirma reenvios sem reaplicar alterações. Na repetição devolve apenas o estado atual autorizado.';
commit;
