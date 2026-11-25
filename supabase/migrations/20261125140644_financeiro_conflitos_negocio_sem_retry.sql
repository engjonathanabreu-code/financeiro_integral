-- Recusas determinísticas de regra de negócio deixam de usar 40001, que o PostgREST 14 repete
-- indefinidamente, e passam a PT409 (HTTP 409, sem repetição). Só o literal do código muda:
-- mensagens, lógica, ACL, dono, security definer, search_path e dados ficam como estão.
-- Tudo ou nada: qualquer função ausente ou divergente interrompe a instalação inteira.
begin;
set local lock_timeout='5s';
do $migration$
declare
  alvo record;
  funcao regprocedure;
  definicao text;
begin
  -- md5(prosrc) e ocorrências de '40001' conferidos em produção antes desta correção.
  for alvo in select * from (values
    ('public.financeiro_acao_solicitacao(text,integer,text,jsonb,uuid,jsonb)','bf7d1881b1f8aabb485b96393108189e',2),
    ('public.financeiro_ailos(text,jsonb)','c48823e089d2b35836d233647ed23e29',1),
    ('public.financeiro_arquivar_conta_pagamento(text,text,jsonb,jsonb)','cccd411611d089da1e2f49dbd3121dbc',2),
    ('public.financeiro_baixa_manual(uuid,bigint,text,text,text)','261bc8b68e36352b0cbed53173ffd42f',1),
    ('public.financeiro_baixa_relatorio(text,jsonb,text)','bc1c4a92614ee1304bfe2d27312d78ac',2),
    ('public.financeiro_close_budget(text,jsonb)','5e2f5013e97a939146412a490de706b9',1),
    ('public.financeiro_guard_budget_close()','a6cf3b1f8acbc8804b5073a3a6adcba4',1),
    ('public.financeiro_restore_modulo_version(text,bigint,bigint)','1b812f19103b31968587aa7306124bf9',2),
    ('public.financeiro_salvar_viagem(uuid,text,jsonb,jsonb)','43299c96d2d45aaf8430c814ca20253a',1),
    ('financeiro_solicitacoes_privado.financeiro_save_invoice_request(jsonb,jsonb)','ecb49987f05d318c8461b71a563250c0',1)
  ) as conhecidas(assinatura,hash,ocorrencias) loop
    funcao:=to_regprocedure(alvo.assinatura);
    if funcao is null then
      raise exception 'A função % não existe. Nada foi alterado.',alvo.assinatura;
    end if;
    if (select md5(prosrc) from pg_proc where oid=funcao) is distinct from alvo.hash then
      raise exception 'A função % divergiu da versão conhecida. Nada foi alterado; revise a instalação.',alvo.assinatura;
    end if;
    definicao:=pg_get_functiondef(funcao);
    if (length(definicao)-length(replace(definicao,$$'40001'$$,'')))/length($$'40001'$$)<>alvo.ocorrencias then
      raise exception 'A função % não tem as % ocorrências esperadas do código. Nada foi alterado.',alvo.assinatura,alvo.ocorrencias;
    end if;
    execute replace(definicao,$$'40001'$$,$$'PT409'$$);
  end loop;
end $migration$;
commit;
