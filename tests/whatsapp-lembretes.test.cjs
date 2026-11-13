const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

globalThis.crypto ??= webcrypto;
const logic = import('../supabase/functions/finance-whatsapp-reminders/lembretes.mjs');
const migration = fs.readFileSync(path.join(__dirname,
  '../supabase/migrations/20261113181004_financeiro_whatsapp_reserva.sql'), 'utf8');
const cronSql = fs.readFileSync(path.join(__dirname, '../supabase/financeiro_whatsapp_agendador.sql'), 'utf8');

const TODAY = '2026-11-15';
const NOW = '2026-11-15T12:00:00Z';
const PHONE = '5500000000000';
const SECRET = 'synthetic-cron-secret';
const modules = {
  accountPayments: [
    { id: 'modulo-1', accountId: 10, due: TODAY, value: 125 },
    { id: 'modulo-2', accountId: 10, due: TODAY, value: 24 },
    { id: 'paga', due: TODAY, status: 'Paga' },
    { id: 'cancelada', due: TODAY, status: 'Cancelada' },
    { id: 'outro-dia', due: '2026-11-16' },
  ],
  accountMasters: [{ id: 10, name: 'Conta sintética' }],
};

const ack = () => Response.json({ ok: true });
const request = ({ method = 'POST', secret = SECRET } = {}) => new Request('https://fixture.test/', {
  method,
  headers: secret ? { 'x-cron-secret': secret } : {},
});

async function fixture(t) {
  const { PGlite } = await import('@electric-sql/pglite');
  const sql = new PGlite();
  t.after(() => sql.close());
  await sql.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create table public.financeiro_pagamentos(id text primary key);
    create table public.financeiro_whatsapp_envios(
      id uuid primary key default gen_random_uuid(),
      pagamento_id text not null references public.financeiro_pagamentos on delete cascade,
      destinatario text not null,
      vencimento date not null,
      status text not null default 'enviado',
      erro text,
      enviado_em timestamptz not null default now(),
      unique(pagamento_id, destinatario)
    );
    alter table public.financeiro_whatsapp_envios enable row level security;
    create policy financeiro_whatsapp_envios_read on public.financeiro_whatsapp_envios
      for select to authenticated using (true);
    grant all on public.financeiro_whatsapp_envios to authenticated, service_role;
    insert into public.financeiro_pagamentos values ('legado-1'), ('legado-2');
  `);
  await sql.query(`insert into public.financeiro_whatsapp_envios
      (pagamento_id,destinatario,vencimento,status,erro,enviado_em)
    values ('legado-1',$1,'2026-11-10','enviado',null,'2026-11-10T12:01:00Z'),
           ('legado-2',$1,'2026-11-10','erro','motivo legado','2026-11-10T12:02:00Z')`, [PHONE]);
  const before = (await sql.query('select * from financeiro_whatsapp_envios order by pagamento_id')).rows;
  await sql.exec(migration);
  const rpc = (statement, params) => sql.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query(statement, params)).rows[0].result;
  });
  return {
    sql, before,
    db: {
      modules: async () => modules,
      reserve: (...args) => rpc('select public.financeiro_whatsapp_reservar($1,$2,$3) as result', args),
      finish: (...args) => rpc('select public.financeiro_whatsapp_finalizar($1,$2) as result', args),
    },
  };
}

async function handler(db, options = {}) {
  const { createHandler } = await logic;
  return createHandler({
    cronSecret: SECRET,
    phone: PHONE,
    configured: () => true,
    now: () => new Date(NOW),
    connect: () => db,
    send: async () => ack(),
    ...options,
  });
}

const entries = async (sql) => (await sql.query(`
  select pagamento_id, status, erro, reservado_em is not null as reservado
  from public.financeiro_whatsapp_envios
  where pagamento_id like 'modulo-%'
  order by pagamento_id
`)).rows;

test('autentica o invocador antes de abrir o cliente e ignora chamadas fora da janela', async () => {
  const unusable = () => assert.fail('A requisição não deve abrir o cliente');
  const call = await handler(null, { connect: unusable });
  assert.equal((await call(request({ method: 'GET' }))).status, 405);
  assert.equal((await call(request({ secret: '' }))).status, 401);
  assert.equal((await call(request({ secret: 'outra' }))).status, 401);

  const outside = await handler(null, { connect: unusable, now: () => new Date('2026-11-15T12:21:00Z') });
  assert.deepEqual(await (await outside(request())).json(), { ok: true, skipped: 'fora_da_janela' });

  const misconfigured = await handler(null, { connect: unusable, configured: () => false });
  assert.equal((await misconfigured(request())).status, 503);
});

test('duas execuções disputam a mesma reserva SQL e cada obrigação é enviada uma vez', async (t) => {
  const { sql, db } = await fixture(t);
  const calls = [];
  const call = await handler(db, {
    send: async ({ phone, payment }, key) => {
      assert.equal(phone, PHONE);
      assert.equal(payment.accountName, 'Conta sintética');
      assert.match(key, /^[0-9a-f]{64}$/);
      const entry = (await entries(sql)).find((row) => row.pagamento_id === payment.id);
      assert.equal(entry.status, 'incerto');
      calls.push({ id: payment.id, key });
      await new Promise((resolve) => setTimeout(resolve, 10));
      return ack();
    },
  });
  const results = await Promise.all([call(request()), call(request())]);
  const bodies = await Promise.all(results.map((response) => response.json()));
  assert.deepEqual(calls.map(({ id }) => id).sort(), ['modulo-1', 'modulo-2']);
  assert.equal(new Set(calls.map(({ key }) => key)).size, 2);
  assert.equal(bodies.reduce((sum, body) => sum + body.sent, 0), 2);
  assert.equal(bodies.reduce((sum, body) => sum + body.skipped, 0), 2);
  assert.ok(!JSON.stringify(bodies).includes(PHONE));
  assert.ok(!JSON.stringify(bodies).includes('modulo-1'));
  assert.deepEqual((await entries(sql)).map(({ status }) => status), ['enviado', 'enviado']);
  assert.equal((await (await call(request())).json()).skipped, 2);
  assert.equal(calls.length, 2);
});

test('recusa do provedor e timeout após aceite permanecem incertos sem reenvio automático', async (t) => {
  const { sql, db } = await fixture(t);
  const calls = [];
  const call = await handler(db, {
    timeoutMs: 10,
    send: async ({ payment }, _key, signal) => {
      calls.push(payment.id);
      if (payment.id === 'modulo-1') return new Response('mensagem interna', { status: 503 });
      return new Promise((_, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('timer inesperado')), 250);
        signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(signal.reason);
        }, { once: true });
      });
    },
  });
  const body = await (await call(request())).json();
  assert.equal(body.uncertain, 2);
  assert.equal(body.ok, false);
  assert.deepEqual((await entries(sql)).map(({ status, erro }) => [status, erro]), [
    ['incerto', 'http_sem_confirmacao'], ['incerto', 'timeout'],
  ]);
  assert.equal((await (await call(request())).json()).skipped, 2);
  assert.deepEqual(calls, ['modulo-1', 'modulo-2']);
});

test('erro ao registrar a confirmação mantém reserva e não interrompe as outras contas', async (t) => {
  const { sql, db } = await fixture(t);
  let sends = 0;
  let finishes = 0;
  const call = await handler({
    ...db,
    async finish(...args) {
      if (finishes++ === 0) throw new Error('conexão perdida');
      return db.finish(...args);
    },
  }, { send: async () => { sends++; return ack(); } });
  const body = await (await call(request())).json();
  assert.equal(body.sent, 1);
  assert.equal(body.uncertain, 1);
  assert.deepEqual((await entries(sql)).map(({ status, erro }) => [status, erro]), [
    ['incerto', 'reserva_sem_confirmacao'], ['enviado', null],
  ]);
  assert.equal((await (await call(request())).json()).skipped, 2);
  assert.equal(sends, 2);
});

test('se a resposta da reserva se perder, nenhum POST é feito para a reserva incerta', async (t) => {
  const { sql, db } = await fixture(t);
  const calls = [];
  const call = await handler({
    ...db,
    async reserve(...args) {
      const result = await db.reserve(...args);
      if (args[0] === 'modulo-1' && result) throw new Error('resposta perdida');
      return result;
    },
  }, { send: async ({ payment }) => { calls.push(payment.id); return ack(); } });
  const body = await (await call(request())).json();
  assert.equal(body.errors, 1);
  assert.equal(body.sent, 1);
  assert.equal((await (await call(request())).json()).skipped, 2);
  assert.deepEqual(calls, ['modulo-2']);
  assert.deepEqual((await entries(sql)).map(({ status, erro }) => [status, erro]), [
    ['incerto', 'reserva_sem_confirmacao'], ['enviado', null],
  ]);
});

test('IDs ausentes e duplicados são encaminhados para revisão sem criar chave a partir do valor', async () => {
  const call = await handler({
    modules: async () => ({
      accountPayments: [
        { due: TODAY },
        { id: 'duplo', due: TODAY },
        { id: 'duplo', due: '2026-11-16' },
      ],
    }),
    reserve: () => assert.fail('Não deve reservar identidade ambígua'),
  }, { send: () => assert.fail('Não deve enviar identidade ambígua') });
  assert.deepEqual(await (await call(request())).json(), {
    ok: false, date: TODAY, due: 2, sent: 0, skipped: 0, errors: 2, uncertain: 0,
  });
});

test('migration preserva o conteúdo antigo, impede sobrescrita e remove o CASCADE', async (t) => {
  const { sql, before, db } = await fixture(t);
  for (const { pagamento_id } of before) assert.equal(await db.reserve(pagamento_id, PHONE, TODAY), null);
  assert.equal(await db.finish(before[1].id, 'enviado'), false);
  await sql.exec('delete from public.financeiro_pagamentos');
  const after = (await sql.query('select * from financeiro_whatsapp_envios order by pagamento_id')).rows;
  assert.deepEqual(after, before.map((row) => ({ ...row, reservado_em: null })));
  await sql.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    assert.equal((await tx.query('select count(*)::int as n from financeiro_whatsapp_envios')).rows[0].n, 2);
  });
  await assert.rejects(sql.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    return tx.query('select financeiro_whatsapp_reservar($1,$2,$3)', ['x', PHONE, TODAY]);
  }), /permission denied/);
  await assert.rejects(sql.transaction(async (tx) => {
    await tx.exec('set local role authenticated');
    return tx.query('delete from financeiro_whatsapp_envios');
  }), /permission denied/);
});

test('agendador exige pausa e segredo, conserva a agenda e não executa o job ao instalar', async (t) => {
  const { sql } = await fixture(t);
  await sql.exec(`
    create schema cron;
    create schema vault;
    create table cron.job(jobid bigint primary key, jobname text, active bool, schedule text, command text);
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create function cron.alter_job(job_id bigint, command text) returns void language sql as $$
      update cron.job set command=$2 where jobid=$1;
    $$;
    insert into cron.job values (1,'finance-whatsapp-reminders-daily',true,'0 12 * * *','old command');
  `);
  async function rejected(message) {
    await assert.rejects(sql.exec(cronSql), message);
    await sql.exec('rollback');
  }
  await rejected(/Pause o agendador/);
  await sql.exec('update cron.job set active=false');
  await rejected(/segredo de agendamento válido/);
  await sql.exec("insert into vault.decrypted_secrets values ('finance_cron_secret',repeat('a',32))");
  await sql.exec("insert into vault.decrypted_secrets values ('finance_cron_secret','duplicado')");
  await rejected(/segredo de agendamento válido/);
  await sql.exec("delete from vault.decrypted_secrets where decrypted_secret='duplicado'");
  await sql.exec(cronSql);
  const row = (await sql.query('select * from cron.job')).rows[0];
  assert.equal(row.active, false);
  assert.equal(row.schedule, '0 12 * * *');
  assert.match(row.command, /'x-cron-secret'/);
  assert.match(row.command, /from vault\.decrypted_secrets/);
  assert.ok(!row.command.includes('a'.repeat(32)));
});
