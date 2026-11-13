import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { createHandler } from './lembretes.mjs';

const cronSecret = Deno.env.get('FINANCE_CRON_SECRET') ?? '';
const agentToken = Deno.env.get('FINANCE_AGENT_TOKEN') ?? '';
const phone = Deno.env.get('FINANCE_REMINDER_PHONE') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const agentUrl = 'https://crm-integral-andamentos1.vercel.app/api/finance-reminder';

// O pg_cron usa um segredo próprio, lido do Vault e validado antes de abrir o cliente.
Deno.serve(createHandler({
  cronSecret,
  phone,
  configured: () => Boolean(agentToken && supabaseUrl && serviceKey && agentToken !== cronSecret),
  connect() {
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return {
      async modules() {
        const { data, error } = await sb.from('financeiro_estado_modulos')
          .select('chave,dados')
          .in('chave', ['accountPayments', 'accountMasters']);
        if (error) throw error;
        const modules = new Map((data ?? []).map((row) => [row.chave, row.dados]));
        return { accountPayments: modules.get('accountPayments'), accountMasters: modules.get('accountMasters') };
      },
      async reserve(id, recipient, date) {
        const { data, error } = await sb.rpc('financeiro_whatsapp_reservar', {
          p_pagamento_id: id, p_destinatario: recipient, p_vencimento: date,
        });
        if (error) throw error;
        return data;
      },
      async finish(reservation, result) {
        const { data, error } = await sb.rpc('financeiro_whatsapp_finalizar', {
          p_reserva: reservation, p_resultado: result,
        });
        if (error) throw error;
        return data;
      },
    };
  },
  send: (payload, key, signal) => fetch(agentUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${agentToken}`,
      'idempotency-key': key,
    },
    body: JSON.stringify(payload),
    signal,
    redirect: 'error',
  }),
  log: (event) => console.warn('finance-whatsapp-reminders', event),
}));
