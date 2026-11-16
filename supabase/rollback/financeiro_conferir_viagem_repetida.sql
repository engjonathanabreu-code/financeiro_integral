begin;
set local lock_timeout = '5s';

drop function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text);
drop function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text,text);
drop function financeiro_solicitacoes_privado.normalizar_destino_viagem(text);
alter function financeiro_solicitacoes_privado.revisar_solicitacao_com_central(text,jsonb,boolean,text)
  set schema public;
alter function public.revisar_solicitacao_com_central(text,jsonb,boolean,text)
  rename to financeiro_revisar_solicitacao;
grant execute on function public.financeiro_revisar_solicitacao(text,jsonb,boolean,text) to authenticated;

commit;
