-- Fase 1: transforma 40001 da revisão em conflito HTTP 409, sem reexecutar uma decisão.
-- Encerre separadamente os backends antigos em loop antes de instalar a fase 2.
begin;
set local lock_timeout='5s';
do $migration$
declare
  funcao regprocedure := 'public.financeiro_revisar_solicitacao(text,jsonb,boolean,text,text)'::regprocedure;
  anterior text := $old$  return itens;$old$;
  novo text := $new$  return itens;
exception when serialization_failure then
  -- Conflito de negócio não deve acionar retry automático no PostgREST 14.
  raise sqlstate 'PT409' using message=SQLERRM;$new$;
  definicao text;
begin
  if (select md5(prosrc) from pg_proc where oid=funcao) is distinct from 'd8292a599bfeac5da7636f33bcdc00d1' then
    raise exception 'A função divergiu da versão conhecida. Revise a instalação.';
  end if;
  definicao:=pg_get_functiondef(funcao);
  if (length(definicao)-length(replace(definicao,anterior,'')))/length(anterior)<>1 then
    raise exception 'O ponto esperado de alteração não é único.';
  end if;
  execute replace(definicao,anterior,novo);
end $migration$;
commit;
