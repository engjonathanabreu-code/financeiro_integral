-- Devolve o código 40001 às recusas de regra de negócio. Com o PostgREST 14 isso reintroduz a
-- repetição indefinida dessas recusas: só reverter com esse risco avaliado.
-- Tudo ou nada: cada função precisa estar exatamente na versão corrigida.
begin;
set local lock_timeout='5s';
do $rollback$
declare
  alvo record;
  funcao regprocedure;
  corpo text;
begin
  -- md5(prosrc) original e ocorrências do código em cada função.
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
    select prosrc into corpo from pg_proc where oid=funcao;
    if strpos(corpo,$$'40001'$$)>0
      or (length(corpo)-length(replace(corpo,$$'PT409'$$,'')))/length($$'PT409'$$)<>alvo.ocorrencias
      or md5(replace(corpo,$$'PT409'$$,$$'40001'$$)) is distinct from alvo.hash then
      raise exception 'A função % divergiu da correção conhecida. Nada foi alterado; revise a reversão.',alvo.assinatura;
    end if;
    execute replace(pg_get_functiondef(funcao),$$'PT409'$$,$$'40001'$$);
  end loop;
end $rollback$;
commit;
