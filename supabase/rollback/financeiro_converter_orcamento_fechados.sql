-- Reverte apenas a escrita da conversão; conserva a proteção PT409 da fase 1 e todos os dados.
begin;
set local lock_timeout='5s';
do $rollback$
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
  corpo text;
begin
  select prosrc into corpo from pg_proc where oid=funcao;
  if strpos(corpo,novo)=0 or md5(replace(corpo,novo,anterior)) is distinct from 'b68c24ebf4802c3f3b185f4320d53332' then
    raise exception 'A função divergiu da correção conhecida. Revise a reversão.';
  end if;
  execute replace(pg_get_functiondef(funcao),novo,anterior);
end $rollback$;
commit;
