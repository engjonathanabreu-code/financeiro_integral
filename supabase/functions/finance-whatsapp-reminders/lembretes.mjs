const localDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localParts(now) {
  const parts = Object.fromEntries(localDateFormat.formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}

function paymentId(payment) {
  const id = payment?.id;
  if (typeof id === 'number' && Number.isSafeInteger(id)) return String(id);
  return typeof id === 'string' && id.trim() && id.length <= 256 ? id : null;
}

function duePayments(accountPayments, date) {
  const payments = Array.isArray(accountPayments) ? accountPayments : [];
  const ids = new Map();
  for (const payment of payments) {
    const id = paymentId(payment);
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const due = payments.filter((payment) => String(payment?.due ?? '').slice(0, 10) === date &&
    !/paga|pago|cancelad/i.test(String(payment?.status ?? '')));
  return { due, ids };
}

const encoder = new TextEncoder();

async function sha256(value) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function sameSecret(provided, configured) {
  if (!provided || !configured) return false;
  const [a, b] = await Promise.all([sha256(provided), sha256(configured)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

async function idempotencyKey(id, phone) {
  const digest = await sha256(JSON.stringify(['finance-reminder', id, phone]));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function response(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/**
 * @param {object} dependencies
 * @param {string} dependencies.cronSecret
 * @param {string} dependencies.phone
 * @param {() => boolean} dependencies.configured
 * @param {() => {
 *   modules: () => Promise<{accountPayments: unknown, accountMasters: unknown}>,
 *   reserve: (id: string, phone: string, date: string) => Promise<string | null>,
 *   finish: (reservation: string, result: string) => Promise<boolean>
 * }} dependencies.connect
 * @param {(payload: object, idempotencyKey: string, signal: AbortSignal) => Promise<Response>} dependencies.send
 * @param {() => Date} [dependencies.now]
 * @param {number} [dependencies.timeoutMs]
 * @param {(event: string) => void} [dependencies.log]
 */
export function createHandler({ cronSecret, phone, configured, connect, send, now = () => new Date(), timeoutMs = 12000, log = () => {} }) {
  return async (request) => {
    if (request.method !== 'POST') return response(405, { ok: false }, { allow: 'POST' });
    if (!await sameSecret(request.headers.get('x-cron-secret'), cronSecret)) return response(401, { ok: false });

    const current = localParts(now());
    if (current.hour !== 9 || current.minute > 20) {
      return response(200, { ok: true, skipped: 'fora_da_janela' });
    }
    if (!configured() || !/^\d{10,15}$/.test(phone)) {
      log('configuracao_incompleta');
      return response(503, { ok: false, error: 'configuracao_incompleta' });
    }

    let db, modules;
    try {
      db = connect();
      modules = await db.modules();
    } catch {
      log('leitura_indisponivel');
      return response(503, { ok: false, error: 'leitura_indisponivel' });
    }

    const { due, ids } = duePayments(modules.accountPayments, current.date);
    const masters = new Map();
    for (const master of Array.isArray(modules.accountMasters) ? modules.accountMasters : []) {
      if (master?.id != null && !masters.has(String(master.id))) masters.set(String(master.id), master);
    }
    const counts = { due: due.length, sent: 0, skipped: 0, errors: 0, uncertain: 0 };

    for (const item of due) {
      const id = paymentId(item);
      if (id === null || ids.get(id) !== 1) {
        log('identidade_invalida_ou_duplicada');
        counts.errors++;
        continue;
      }

      let reservation, key;
      try {
        key = await idempotencyKey(id, phone);
        reservation = await db.reserve(id, phone, current.date);
      } catch {
        log('reserva_indisponivel');
        counts.errors++;
        continue;
      }
      if (!reservation) {
        counts.skipped++;
        continue;
      }

      const master = masters.get(String(item.accountId)) ?? {};
      const payment = {
        id,
        accountName: master.name || master.supplier || 'Conta cadastrada',
        supplier: master.supplier || '',
        value: Number(item.value || 0),
        due: item.due,
        method: master.method || item.method || 'Não informada',
        barcode: item.barcode || item.paymentCode || '',
        notes: item.notes || '',
      };
      const signal = AbortSignal.timeout(timeoutMs);
      let result;
      try {
        const provider = await send({ phone, payment }, key, signal);
        if (!provider.ok) {
          await provider.body?.cancel();
          result = 'http_sem_confirmacao';
        } else {
          const body = await provider.json();
          result = body?.ok === true ? 'enviado' : 'resposta_sem_confirmacao';
        }
      } catch {
        result = signal.aborted ? 'timeout' : 'transporte';
      }

      try {
        if (!await db.finish(reservation, result)) throw new Error('reserva_nao_finalizada');
      } catch {
        log('finalizacao_indisponivel');
        counts.uncertain++;
        continue;
      }
      if (result === 'enviado') counts.sent++;
      else {
        log(result);
        counts.uncertain++;
      }
    }

    return response(200, { ok: counts.errors === 0 && counts.uncertain === 0, date: current.date, ...counts });
  };
}
