-- Fase 2: executar somente após interromper as tentativas antigas e confirmar o pedido pendente.
-- Corrige a conversão sem mudar a guarda de fechamento ou qualquer dado ao instalar.
begin;
set local lock_timeout='5s';
do $migration$
declare
  funcao regprocedure := 'financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(text,jsonb,boolean,text)'::regprocedure;
  anterior text := $old$    insert into public.financeiro_estado_modulos as m(chave,dados,updated_by,updated_at)
    values(destino,jsonb_build_array(registro),revisor.id,agora)
    on conflict(chave) do update set dados=m.dados||excluded.dados,updated_by=excluded.updated_by,updated_at=excluded.updated_at;$old$;
  novo text := $new$    if destino='budgetRecords' then
      -- A linha já foi bloqueada acima. UPDATE fornece à guarda a lista completa,
      -- preservando os orçamentos fechados antes de anexar o registro convertido.
      update public.financeiro_estado_modulos
      set dados=dados||jsonb_build_array(registro),updated_by=revisor.id,updated_at=agora
      where chave=destino;
      if not found then
        -- Aprovações são serializadas pelo módulo invoiceRequests; inicialização legítima.
        insert into public.financeiro_estado_modulos(chave,dados,updated_by,updated_at)
        values(destino,jsonb_build_array(registro),revisor.id,agora);
      end if;
    else
      insert into public.financeiro_estado_modulos as m(chave,dados,updated_by,updated_at)
      values(destino,jsonb_build_array(registro),revisor.id,agora)
      on conflict(chave) do update set dados=m.dados||excluded.dados,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
    end if;$new$;
  definicao text;
begin
  if (select md5(prosrc) from pg_proc where oid=funcao) is distinct from 'b68c24ebf4802c3f3b185f4320d53332' then
    raise exception 'A função divergiu da versão conhecida. Revise a instalação.';
  end if;
  definicao:=pg_get_functiondef(funcao);
  if (length(definicao)-length(replace(definicao,anterior,'')))/length(anterior)<>1 then
    raise exception 'O ponto esperado de alteração não é único.';
  end if;
  execute replace(definicao,anterior,novo);
end $migration$;
commit;
