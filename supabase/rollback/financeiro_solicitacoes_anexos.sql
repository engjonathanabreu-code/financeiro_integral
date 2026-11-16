-- Reverter antes da central. Os arquivos, as reservas e o bucket ficam guardados.
begin;
set local lock_timeout='5s';
drop function public.financeiro_listar_anexos_solicitacao(text);
drop function public.financeiro_reservar_anexo_solicitacao(text,uuid,text,text,integer);
drop function public.financeiro_confirmar_anexo_solicitacao(text,uuid);
drop policy financeiro_solicitacao_objeto_ler on storage.objects;
drop policy financeiro_solicitacao_objeto_enviar on storage.objects;
alter policy financeiro_solicitacao_objeto_limitar_leitura on storage.objects
using (bucket_id<>'financeiro-solicitacoes');
alter policy financeiro_solicitacao_objeto_limitar_envio on storage.objects
with check (bucket_id<>'financeiro-solicitacoes');
drop function public.financeiro_permite_objeto_solicitacao(text,boolean);
commit;
