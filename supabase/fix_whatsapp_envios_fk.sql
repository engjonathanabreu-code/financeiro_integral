-- Os lembretes leem as contas de financeiro_estado_modulos (accountPayments), não de financeiro_pagamentos.
-- A FK fazia o registro do 1º envio falhar e interrompia os demais lembretes do dia; o CASCADE apagava o histórico.
alter table public.financeiro_whatsapp_envios drop constraint if exists financeiro_whatsapp_envios_pagamento_id_fkey;
