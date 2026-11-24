-- Só reverter esta proteção após eliminar backends presos e avaliar o retry do PostgREST.
begin;
set local lock_timeout='5s';
do $rollback$
declare
  funcao regprocedure := 'public.financeiro_revisar_solicitacao(text,jsonb,boolean,text,text)'::regprocedure;
  anterior text := $old$  return itens;$old$;
  novo text := $new$  return itens;
exception when serialization_failure then
  -- Conflito de negócio não deve acionar retry automático no PostgREST 14.
  raise sqlstate 'PT409' using message=SQLERRM;$new$;
  corpo text;
begin
  select prosrc into corpo from pg_proc where oid=funcao;
  if strpos(corpo,novo)=0 or md5(replace(corpo,novo,anterior)) is distinct from 'd8292a599bfeac5da7636f33bcdc00d1' then
    raise exception 'A função divergiu da correção conhecida. Revise a reversão.';
  end if;
  execute replace(pg_get_functiondef(funcao),novo,anterior);
end $rollback$;
commit;
