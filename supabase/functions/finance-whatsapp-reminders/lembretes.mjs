// Lógica do lembrete diário de contas a pagar, sem dependência do Deno (testada em Node).
// Fluxo por conta: reservar (atômico no banco) → enviar → finalizar. Uma reserva só é concedida a
// uma execução; o que ficar "enviando" sem finalização vira "incerto" e nunca é reenviado sozinho.

export const TZ = 'America/Sao_Paulo';
export function localParts(date = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const g = (t) => p.find((x) => x.type === t)?.value || '';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) % 24, minute: Number(g('minute')) };
}

// Comparação em tempo constante para o segredo do agendador.
export function sameSecret(a, b) {
  const x = new TextEncoder().encode(String(a || '')), y = new TextEncoder().encode(String(b || ''));
  if (!x.length || !y.length) return false;
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export function duePayments(payments, masters, date) {
  const list = Array.isArray(payments) ? payments : [];
  return list
    .filter((p) => String(p?.due || '').slice(0, 10) === date && !/paga|pago|cancelad/i.test(String(p?.status || '')))
    .map((p) => {
      const a = (Array.isArray(masters) ? masters : []).find((m) => String(m.id) === String(p.accountId)) || {};
      return {
        id: String(p.id ?? `${p.accountId}-${p.due}-${p.value}`),
        accountName: a.name || a.supplier || 'Conta cadastrada', supplier: a.supplier || '', value: Number(p.value || 0), due: p.due,
        method: a.method || p.method || 'Não informada', barcode: p.barcode || p.paymentCode || '', notes: p.notes || '',
      };
    });
}

/**
 * @param {object} o
 * @param {{rpc:(name:string,args:object)=>Promise<{data:any,error:any}>, modules:()=>Promise<{accountPayments:any,accountMasters:any}>}} o.db
 * @param {(payload:object, opts:{idempotencyKey:string, signal:AbortSignal})=>Promise<{ok:boolean,status:number,body:any}>} o.send
 */
export async function run({ db, send, now = localParts(), phone, timeoutMs = 15000, log = () => {} }) {
  if (now.hour !== 9 || now.minute > 20) return { status: 200, body: { ok: true, skipped: 'outside_send_window' } };
  if (!phone) return { status: 500, body: { ok: false, error: 'configuracao_incompleta' } };
  const { error: sweepError } = await db.rpc('financeiro_whatsapp_marcar_incertos', {});
  if (sweepError) log('marcar_incertos', sweepError.message);
  const { accountPayments, accountMasters } = await db.modules();
  const due = duePayments(accountPayments, accountMasters, now.date);
  const count = { due: due.length, sent: 0, skipped: 0, error: 0, uncertain: 0 };
  for (const payment of due) {
    try {
      const { data: tentativa, error } = await db.rpc('financeiro_whatsapp_reservar', { p_pagamento_id: payment.id, p_destinatario: phone, p_vencimento: now.date });
      if (error) throw error;
      if (!tentativa) { count.skipped++; continue; }                       // já enviado, em andamento ou incerto
      let status = 'erro', erro = null, accepted = false;
      try {
        const signal = AbortSignal.timeout(timeoutMs);
        const r = await send({ phone, payment }, { idempotencyKey: String(tentativa), signal });
        accepted = r.ok && r.body?.ok === true;
        status = accepted ? 'enviado' : 'erro';
        if (!accepted) erro = String(r.body?.error || `HTTP ${r.status}`).slice(0, 300);
      } catch (e) {
        // Tempo esgotado ou conexão caída depois do envio: o provedor pode ter recebido. Não reenviar.
        status = 'incerto'; erro = String(e?.name === 'TimeoutError' ? 'tempo esgotado' : (e?.message || e)).slice(0, 300);
      }
      const { data: ok, error: finalError } = await db.rpc('financeiro_whatsapp_finalizar', { p_pagamento_id: payment.id, p_destinatario: phone, p_tentativa: tentativa, p_status: status, p_erro: erro });
      if (finalError || ok !== true) {
        // Envio pode ter sido aceito sem registro: a reserva fica "enviando" e vira "incerto" depois.
        log('finalizar', payment.id, finalError?.message || 'reserva não encontrada');
        count.uncertain++; continue;
      }
      if (status === 'enviado') count.sent++; else if (status === 'incerto') count.uncertain++; else count.error++;
    } catch (e) {
      log('lembrete', payment.id, e?.message || String(e));
      count.error++;
    }
  }
  // Resposta mínima: sem ids, valores, telefone ou mensagens de erro.
  return { status: 200, body: { ok: true, date: now.date, ...count } };
}
