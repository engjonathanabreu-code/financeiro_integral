begin;
revoke execute on function public.financeiro_salvar_viagem(uuid,text,jsonb,jsonb) from authenticated;
-- O guarda do Storage continua protegendo os uploads enviados pela versão nova.
-- Os recibos e os anexos são parte dos dados e ficam disponíveis para auditoria.
commit;
