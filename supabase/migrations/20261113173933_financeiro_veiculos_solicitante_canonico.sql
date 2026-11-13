-- Somente código: sem alteração de dados, políticas, grants ou função acesso().
-- A API já carrega o perfil ativo de auth.uid() e os registros canônicos do banco.
begin;
do $$ begin
 if (select md5(prosrc) from pg_proc where oid='financeiro_veiculos_privado.impedimento(jsonb,public.profiles,date)'::regprocedure)
    is distinct from 'b40f2ea9a879959f257a7d9aebd63ea0' then
  raise exception 'Impedimento de veículos mudou. Revalide antes de aplicar.';
 end if;
end $$;
create or replace function financeiro_veiculos_privado.impedimento(a jsonb, eu public.profiles, hoje date)
returns text language plpgsql stable security invoker set search_path='' as $$
declare t jsonb; dia date;
begin
 if a is null or a->>'category' is distinct from 'trip' then return 'Solicitação de viagem não encontrada.'; end if;
 if a->>'requesterId' is distinct from eu.id::text then return 'Somente o solicitante pode retirar o veículo desta viagem.'; end if;
 if a->>'status' is distinct from 'Aprovada' or nullif(a->>'reviewedAt','') is null then return 'A solicitação de viagem precisa estar aprovada pelo administrador.'; end if;
 if coalesce(a->>'neededAt','') !~ '^\d{4}-\d{2}-\d{2}$' then return 'Data da viagem não informada. Peça a correção ao administrador.'; end if;
 begin dia:=(a->>'neededAt')::date;exception when invalid_datetime_format or datetime_field_overflow then return 'Data da viagem inválida. Peça a correção ao administrador.';end;
 if dia>hoje then return 'Retirada liberada somente em '||to_char(dia,'DD/MM/YYYY')||', na data da viagem aprovada.'; end if;
 if dia<hoje then return 'A data da viagem aprovada ('||to_char(dia,'DD/MM/YYYY')||') já passou. Peça ao administrador para revisar o agendamento.'; end if;
 if not exists(select 1 from public.financeiro_veiculos where id=a->>'vehicleId') then return 'Escolha o veículo em Solicitações → Detalhes → Salvar veículo. A aprovação existente será preservada.'; end if;
 if coalesce((a->>'estimatedValue')::numeric,0)<=0 then return 'A viagem aprovada precisa de orçamento maior que zero. Peça a revisão ao administrador.'; end if;
 t:=financeiro_veiculos_privado.registro('trips',a->>'convertedId');
 if t is null or t->>'invoiceRequestId' is distinct from a->>'id' or t->>'id' is distinct from a->>'convertedId' then return 'A viagem aprovada ainda não está vinculada corretamente. Peça ao administrador para conferir a conversão.'; end if;
 -- Autorização restrita à retirada: o pedido canônico acima comprova o solicitante,
 -- a aprovação e o vínculo recíproco. Não depende do espelho opcional usersMvp,
 -- do nome exibido nem do setor histórico. Mantém acesso() e as ACL/RLS legadas.
 if not coalesce(eu.ativo and eu.id=auth.uid() and a->>'requesterId'=auth.uid()::text,false) then
  return 'Seu acesso à viagem aprovada precisa ser conferido pelo administrador.';
 end if;
 if exists(select 1 from public.financeiro_veiculos_usos where solicitacao_id=a->>'id' and estado<>'cancelado') then return 'Esta solicitação de viagem aprovada já possui uma retirada registrada. Consulte Meus usos.'; end if;
 return null;
end $$;
revoke all on function financeiro_veiculos_privado.impedimento(jsonb,public.profiles,date) from public,anon,authenticated;

commit;
