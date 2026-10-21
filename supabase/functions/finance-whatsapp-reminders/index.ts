import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { localParts, run, sameSecret } from './lembretes.mjs';

// Lembrete diário das contas a pagar que vencem hoje, enviado ao WhatsApp do sócio pelo agente do CRM.
// Segredos e destinatário vêm da configuração da função (nunca do código):
//   FINANCE_AGENT_TOKEN, FINANCE_CRON_SECRET, FINANCE_REMINDER_PHONE, FINANCE_AGENT_URL (opcional).
const AGENT_TOKEN = Deno.env.get('FINANCE_AGENT_TOKEN') ?? '';
const CRON_SECRET = Deno.env.get('FINANCE_CRON_SECRET') ?? '';
const TARGET_PHONE = Deno.env.get('FINANCE_REMINDER_PHONE') ?? '';
const AGENT_URL = Deno.env.get('FINANCE_AGENT_URL') ?? 'https://crm-integral-andamentos1.vercel.app/api/finance-reminder';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  // O agendador (pg_cron/pg_net) envia x-cron-secret lido do Vault. Sem ele, ninguém dispara envios.
  if (req.method !== 'POST' || !CRON_SECRET || !sameSecret(req.headers.get('x-cron-secret'), CRON_SECRET)) return json({ ok: false }, 401);
  if (!AGENT_TOKEN) return json({ ok: false, error: 'configuracao_incompleta' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const db = {
    rpc: (name: string, args: Record<string, unknown>) => sb.rpc(name, args),
    modules: async () => {
      const { data, error } = await sb.from('financeiro_estado_modulos').select('chave,dados').in('chave', ['accountPayments', 'accountMasters']);
      if (error) throw error;
      const map = new Map((data || []).map((r: any) => [String(r.chave), r.dados]));
      return { accountPayments: map.get('accountPayments'), accountMasters: map.get('accountMasters') };
    },
  };
  const send = async (payload: unknown, { idempotencyKey, signal }: { idempotencyKey: string; signal: AbortSignal }) => {
    const r = await fetch(AGENT_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${AGENT_TOKEN}`, 'idempotency-key': idempotencyKey }, body: JSON.stringify(payload), signal });
    const text = await r.text();
    let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    return { ok: r.ok, status: r.status, body };
  };
  try {
    const result = await run({ db, send, now: localParts(), phone: TARGET_PHONE, log: (...a: unknown[]) => console.error('finance-whatsapp-reminders', ...a) });
    return json(result.body, result.status);
  } catch (e) {
    console.error('finance-whatsapp-reminders', e instanceof Error ? e.message : String(e));
    return json({ ok: false }, 500);
  }
});
