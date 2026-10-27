-- Rollback operacional opcional. NÃO é parte da migração de instalação.
-- Bloqueia a RPC nova e preserva todos os registros, fotos, relatos e lançamentos.
-- Reverter também o frontend para o deploy anterior verificado.
begin;
revoke execute on function public.financeiro_veiculos_api(text,jsonb) from authenticated;
revoke execute on function financeiro_veiculos_privado.api(text,jsonb) from authenticated;
commit;
