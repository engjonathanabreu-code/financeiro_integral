-- Interrompe novas reservas sem remover a tabela, seus registros ou a função.
-- Volte primeiro as rotas de API às versões que não dependem da reserva.
begin;
set local lock_timeout = '5s';
revoke execute on function public.financeiro_reservar_cota_ia(text) from authenticated;
commit;
