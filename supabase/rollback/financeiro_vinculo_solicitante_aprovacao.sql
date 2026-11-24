-- Restaura a função original sem apagar vínculos, pedidos ou viagens já criados.
begin;
set local lock_timeout = '5s';
do $rollback$
declare
  funcao regprocedure := 'financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(text,jsonb,boolean,text)'::regprocedure;
  anterior text := $old$      select dados into usuarios from public.financeiro_estado_modulos where chave='usersMvp' for share;$old$;
  novo text := $new$      perform financeiro_solicitacoes_privado.garantir_vinculo_solicitante(solicitante.id);
      select dados into usuarios from public.financeiro_estado_modulos where chave='usersMvp' for share;$new$;
  corpo text;
begin
  select prosrc into corpo from pg_proc where oid=funcao;
  if strpos(corpo,novo)=0 or md5(replace(corpo,novo,anterior)) is distinct from '9a8914a4bb2e818992bea380e6ac555d' then
    raise exception 'O fluxo de aprovação divergiu da correção conhecida. Revise a reversão.';
  end if;
  execute replace(pg_get_functiondef(funcao),novo,anterior);
end $rollback$;
drop function financeiro_solicitacoes_privado.garantir_vinculo_solicitante(uuid);
commit;
