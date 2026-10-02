import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Lembrete diário das contas a pagar que vencem hoje, enviado ao WhatsApp do sócio pelo agente do CRM.
// Cada conta é tratada isoladamente: uma falha de envio ou de registro não interrompe as demais do dia.
const AGENT_TOKEN = Deno.env.get('FINANCE_AGENT_TOKEN') ?? '';
const AGENT_URL = 'https://crm-integral-andamentos1.vercel.app/api/finance-reminder';
const TARGET_PHONE = '5547996757213';
const TZ = 'America/Sao_Paulo';
function localParts() { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); const g = (t: string) => p.find(x => x.type === t)?.value || ''; return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')), minute: Number(g('minute')) }; }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (_req: Request) => {
  const now = localParts();
  if (now.hour !== 9 || now.minute > 20) return json({ ok: true, skipped: 'outside_send_window', localTime: `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}` });
  if (!AGENT_TOKEN) return json({ ok: false, error: 'FINANCE_AGENT_TOKEN não configurado' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const { data: state, error } = await sb.from('financeiro_estado_modulos').select('chave,dados').in('chave', ['accountPayments', 'accountMasters']); if (error) throw error;
    const map = new Map((state || []).map((r: any) => [String(r.chave), r.dados])); const payments = Array.isArray(map.get('accountPayments')) ? map.get('accountPayments') : []; const masters = Array.isArray(map.get('accountMasters')) ? map.get('accountMasters') : [];
    const due = payments.filter((p: any) => String(p?.due || '').slice(0, 10) === now.date && !/paga|pago|cancelad/i.test(String(p?.status || ''))); const results: any[] = [];
    for (const p of due) {
      const paymentId = String(p.id ?? `${p.accountId}-${p.due}-${p.value}`);
      try {
        const { data: existing } = await sb.from('financeiro_whatsapp_envios').select('id').eq('pagamento_id', paymentId).eq('destinatario', TARGET_PHONE).eq('status', 'enviado').maybeSingle();
        if (existing) { results.push({ id: paymentId, status: 'already_sent' }); continue; }
        const a = masters.find((m: any) => String(m.id) === String(p.accountId)) || {}; const payload = { phone: TARGET_PHONE, payment: { id: paymentId, accountName: a.name || a.supplier || 'Conta cadastrada', supplier: a.supplier || '', value: Number(p.value || 0), due: p.due, method: a.method || p.method || 'Não informada', barcode: p.barcode || p.paymentCode || '', notes: p.notes || '' } };
        let status = 'erro', erro: string | null = null, data: any = null;
        try {
          const r = await fetch(AGENT_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${AGENT_TOKEN}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) }); const text = await r.text(); try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
          status = r.ok && data?.ok ? 'enviado' : 'erro'; erro = status === 'erro' ? (data?.error || `HTTP ${r.status}`) : null;
        } catch (e) { erro = e instanceof Error ? e.message : String(e); }
        const row = { pagamento_id: paymentId, destinatario: TARGET_PHONE, vencimento: now.date, status, erro, enviado_em: new Date().toISOString() };
        const { error: logError } = await sb.from('financeiro_whatsapp_envios').upsert(row, { onConflict: 'pagamento_id,destinatario' });
        if (logError) console.error('Registro do envio falhou', paymentId, logError.message);
        results.push({ id: paymentId, status: status === 'enviado' ? 'sent' : 'error', mode: data?.mode || null, template: data?.template || null, error: erro, logError: logError?.message || null });
      } catch (e) { console.error('Lembrete falhou', paymentId, e); results.push({ id: paymentId, status: 'error', error: e instanceof Error ? e.message : String(e) }); }
    }
    return json({ ok: true, date: now.date, due: due.length, sent: results.filter(x => x.status === 'sent').length, results });
  } catch (e) { console.error(e); return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500); }
});
