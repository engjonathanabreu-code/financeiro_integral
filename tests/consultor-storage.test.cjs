const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/financeiro-cloud-storage.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const initial = () => [
  { id: 1, name: 'Budget A', active: true, limit: 100, history: [{ at: '2026-09-01', action: 'Created' }] },
  { id: 2, name: 'Budget B', active: true, limit: 200, history: [] }
];

async function fixture() {
  const server = { budgetRecords: initial() };
  const cache = new Map();
  const writes = [], rpcs = [], events = [];
  const hooks = {};
  const context = {
    console: { log() {}, warn() {}, error() {} }, structuredClone,
    db: copy(server), user: { role: 'Administrador', erpId: 'admin', name: 'Admin' },
    localStorage: { getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value) },
    // Follow-up writes are triggered explicitly in these tests, with no wall-clock races.
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    document: { dispatchEvent() {} }, CustomEvent: function () {}, render() {}, addEventListener() {},
    save() { cache.set('integral_fin_v1', JSON.stringify(context.db)); }
  };
  context.window = context;
  context.IntegralERP = { sb: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'admin' }, access_token: 'fixture' } } }), onAuthStateChange() {} },
    from() { return {
      select: () => {
        const rows = keys => ({ data: Object.entries(server).filter(([chave]) => !keys || keys.includes(chave)).map(([chave, dados]) => ({ chave, dados: copy(dados) })) });
        return { then: (ok, fail) => Promise.resolve(rows()).then(ok, fail), in: async (_column, keys) => rows(keys) };
      },
      upsert: async rows => {
        const captured = copy(rows); writes.push(captured); events.push('push-start');
        const error = await hooks.upsert?.(captured);
        if (error) { events.push('push-failed'); return { error }; }
        for (const row of captured) server[row.chave] = copy(row.dados);
        events.push('push-done'); return { error: null };
      }
    }; },
    rpc: async (name, args) => {
      if (name === 'is_admin') return { data: context.user?.role === 'Administrador', error: null };
      rpcs.push({ name, args: copy(args) }); events.push('rpc-start');
      const error = await hooks.rpc?.(name, args);
      if (error) return { error };
      const budget = server.budgetRecords.find(item => String(item.id) === args.p_id);
      if (!budget || JSON.stringify(budget) !== JSON.stringify(args.p_expected)) return { error: { message: 'O orçamento mudou.' } };
      Object.assign(budget, { status: 'Fechado', closedAt: '2026-10-01T12:00:00Z', closedBy: 'admin' });
      budget.history.push({ at: '2026-10-01T12:00:00Z', action: 'Orçamento fechado', by: 'admin' });
      events.push('rpc-done'); return { data: copy(server.budgetRecords), error: null };
    }
  } };
  vm.createContext(context); vm.runInContext(source, context);
  const api = context.IntegralFinanceCloudStorage;
  assert.equal(await api.initialize(), true);
  return { context, api, server, cache, writes, rpcs, events, hooks };
}

test('closing flushes unrelated unsynced edits and new budgets without discarding them', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]);
  f.context.db.budgetRecords[1].name = 'Unsynced edit';
  f.context.db.budgetRecords.push({ id: 3, name: 'Unsynced new budget', active: true, history: [] });
  f.context.save();
  await f.api.closeBudget(expected);
  assert.equal(f.rpcs.length, 1);
  assert.ok(f.events.indexOf('push-done') < f.events.indexOf('rpc-start'));
  assert.equal(f.context.db.budgetRecords[0].status, 'Fechado');
  assert.equal(f.context.db.budgetRecords[1].name, 'Unsynced edit');
  assert.equal(f.context.db.budgetRecords[2].name, 'Unsynced new budget');
  assert.deepEqual(copy(f.context.db.budgetRecords), f.server.budgetRecords);
  assert.deepEqual(JSON.parse(f.cache.get('integral_fin_v1')).budgetRecords, f.server.budgetRecords);
});

test('closing waits for an actual in-flight push instead of treating its early return as success', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]), gate = deferred();
  f.context.db.budgetRecords[1].name = 'Currently sending';
  f.hooks.upsert = () => gate.promise;
  const pushing = f.api.push(); await turn();
  assert.equal(f.writes.length, 1);
  const closing = f.api.closeBudget(expected); await turn();
  assert.equal(f.rpcs.length, 0, 'RPC must not overtake pending module writes');
  gate.resolve(); await Promise.all([pushing, closing]);
  assert.equal(f.rpcs.length, 1);
  assert.equal(f.context.db.budgetRecords[1].name, 'Currently sending');
  assert.ok(f.events.indexOf('push-done') < f.events.indexOf('rpc-start'));
});

test('a failed pre-close flush aborts before RPC and preserves dirty local data for retry', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]);
  f.context.db.budgetRecords[1].name = 'Must survive network failure';
  f.hooks.upsert = () => ({ message: 'Network unavailable' });
  await assert.rejects(f.api.closeBudget(expected));
  assert.equal(f.rpcs.length, 0);
  assert.equal(f.context.db.budgetRecords[0].status, undefined);
  assert.equal(f.context.db.budgetRecords[1].name, 'Must survive network failure');
  assert.equal(f.server.budgetRecords[1].name, 'Budget B');
  delete f.hooks.upsert;
  await f.api.push();
  assert.equal(f.server.budgetRecords[1].name, 'Must survive network failure');
});

test('unrelated edits and additions during close stay dirty and survive the next push', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]), gate = deferred();
  f.hooks.rpc = () => gate.promise;
  const closing = f.api.closeBudget(expected); await turn();
  assert.equal(f.rpcs.length, 1);
  f.context.db.budgetRecords[1].name = 'Changed during RPC';
  f.context.db.budgetRecords.push({ id: 3, name: 'Created during RPC', active: true, history: [] });
  f.context.save();
  gate.resolve(); await closing;
  assert.equal(f.context.db.budgetRecords[1].name, 'Changed during RPC');
  assert.equal(f.context.db.budgetRecords[2].name, 'Created during RPC');
  assert.equal(f.context.db.budgetRecords[0].status, 'Fechado');
  await f.api.push();
  assert.equal(f.server.budgetRecords[1].name, 'Changed during RPC');
  assert.equal(f.server.budgetRecords[2].name, 'Created during RPC');
  assert.deepEqual(copy(f.context.db.budgetRecords), f.server.budgetRecords);
});

test('an unrelated local deletion during close is not resurrected by the RPC snapshot', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]), gate = deferred();
  f.hooks.rpc = () => gate.promise;
  const closing = f.api.closeBudget(expected); await turn();
  assert.equal(f.rpcs.length, 1);
  f.context.db.budgetRecords = f.context.db.budgetRecords.filter(row => row.id !== 2);
  f.context.save(); gate.resolve(); await closing;
  assert.equal(f.context.db.budgetRecords.length, 1);
  assert.equal(f.context.db.budgetRecords[0].status, 'Fechado');
  await f.api.push();
  assert.equal(f.server.budgetRecords.length, 1);
});

test('fresh unrelated server records and closures are retained when local copies were unchanged', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]);
  f.hooks.rpc = () => {
    Object.assign(f.server.budgetRecords[1], { status: 'Fechado', closedAt: '2026-10-01T11:59:59Z', closedBy: 'other-admin' });
    f.server.budgetRecords[1].history.push({ at: '2026-10-01T11:59:59Z', action: 'Remote closure' });
    f.server.budgetRecords.push({ id: 4, name: 'Created remotely', active: true, history: [] });
  };
  await f.api.closeBudget(expected);
  assert.equal(f.context.db.budgetRecords.find(row => row.id === 2).status, 'Fechado');
  assert.equal(f.context.db.budgetRecords.find(row => row.id === 4)?.name, 'Created remotely');
  f.context.db.budgetRecords.push({ id: 3, name: 'Later local addition', active: true, history: [] });
  f.context.save(); await f.api.push();
  assert.equal(f.server.budgetRecords.find(row => row.id === 4)?.name, 'Created remotely');
  assert.equal(f.server.budgetRecords.find(row => row.id === 2).status, 'Fechado');
});

test('target edits during close retain local fields and both histories with confirmed closure metadata', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]), gate = deferred();
  f.hooks.rpc = () => gate.promise;
  const closing = f.api.closeBudget(expected); await turn();
  assert.equal(f.rpcs.length, 1);
  f.context.db.budgetRecords[0].limit = 333;
  f.context.db.budgetRecords[0].history.push({ at: '2026-10-01T12:00:01Z', action: 'Local edit during RPC' });
  f.context.save(); gate.resolve(); await closing;
  const budget = f.context.db.budgetRecords[0];
  assert.equal(budget.limit, 333);
  assert.equal(budget.status, 'Fechado');
  assert.equal(budget.closedBy, 'admin');
  assert.deepEqual(new Set(budget.history.map(row => row.action)), new Set(['Created', 'Local edit during RPC', 'Orçamento fechado']));
  await f.api.push();
  assert.deepEqual(copy(f.context.db.budgetRecords), f.server.budgetRecords);
  assert.equal(f.server.budgetRecords[0].limit, 333);
});

test('disjoint unrelated local and remote fields merge without losing either edit', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]), gate = deferred();
  f.hooks.rpc = async () => { f.server.budgetRecords[1].limit = 777; await gate.promise; };
  const closing = f.api.closeBudget(expected); await turn();
  f.context.db.budgetRecords[1].name = 'Local name';
  f.context.save(); gate.resolve();
  const result = await closing;
  assert.equal(result.conflicts, 0);
  assert.equal(f.context.db.budgetRecords[1].name, 'Local name');
  assert.equal(f.context.db.budgetRecords[1].limit, 777);
  await f.api.push();
  assert.equal(f.server.budgetRecords[1].name, 'Local name');
  assert.equal(f.server.budgetRecords[1].limit, 777);
});

test('same-field conflicts preserve both versions and block budget autosave without blocking other modules', async () => {
  const f = await fixture(), expected = copy(f.context.db.budgetRecords[0]), gate = deferred();
  f.hooks.rpc = async () => { f.server.budgetRecords[1].name = 'Remote version'; await gate.promise; };
  const closing = f.api.closeBudget(expected); await turn();
  f.context.db.budgetRecords[1].name = 'Local version';
  f.context.save(); gate.resolve();
  const result = await closing;
  assert.equal(result.conflicts, 1);
  assert.equal(f.context.db.budgetRecords[0].status, 'Fechado');
  assert.equal(f.context.db.budgetRecords[1].name, 'Local version');
  assert.equal(f.server.budgetRecords[1].name, 'Remote version');
  const backup = JSON.parse(f.cache.get('integral_fin_budget_conflicts'));
  assert.equal(backup.local.find(row => row.id === 2).name, 'Local version');
  assert.equal(backup.server.find(row => row.id === 2).name, 'Remote version');
  assert.equal(backup.conflicts[0].field, 'name');
  f.context.db.cashflow = [{ id: 9, date: '2026-10-01', direction: 'Entrada', value: 500 }];
  await f.api.push();
  assert.equal(f.server.cashflow[0].value, 500);
  assert.equal(f.server.budgetRecords[1].name, 'Remote version');
  assert.equal(f.writes.flat().some(row => row.chave === 'budgetRecords'), false);
  await assert.rejects(f.api.closeBudget(copy(f.context.db.budgetRecords[1])), /simultâneas|revisão/);
  assert.equal(f.rpcs.length, 1);
});
