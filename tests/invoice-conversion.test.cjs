const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { id } = require('./veiculos-fixtures.cjs');

const request = () => ({ id: id(10), requesterId: id(2), category: 'trip', status: 'Pendente',
  title: 'Vistoria', vehicleId: 'hb20', neededAt: '2099-01-01', estimatedValue: 10 });

function load() {
  const elements = new Map();
  const root = {
    remove() {},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { value: 'Revisado', disabled: false, addEventListener() {} });
      return elements.get(selector);
    },
    querySelectorAll: () => [],
  };
  const context = {
    db: { trips: [], invoiceRequests: [], budgetRecords: [], accountMasters: [], accountPayments: [] },
    user: { role: 'Administrador', erpId: id(1) },
    window: {},
    document: { createElement: () => root, body: { append() {} }, querySelector: () => root.querySelector('#content'), querySelectorAll: () => [] },
    structuredClone, alerts: [], calls: [], confirm: () => true, title() {},
    alert(message) { context.alerts.push(message); },
  };
  context.window.IntegralERP = { sb: { rpc: async (name, args) => {
    context.calls.push({ name, args });
    return { data: [{ ...args.p_esperado, status: args.p_aprovar ? 'Aprovada' : 'Rejeitada', convertedId: 88 }] };
  } } };
  const source = fs.readFileSync(path.join(__dirname, '../public/financeiro-invoices.js'), 'utf8')
    .replace('boot();', 'window.test={detailModal,ownsApprovedTrip};');
  vm.runInNewContext(source, context);
  return { context, api: context.window.test, elements };
}

test('decisão manda versão esperada e usa somente o retorno confirmado', async () => {
  for (const approve of [true, false]) {
    const { context, api, elements } = load();
    const item = request();
    api.detailModal(item);
    await elements.get(approve ? '#invoiceApprove' : '#invoiceReject').onclick();
    const [{ name, args }] = context.calls;
    assert.equal(name, 'financeiro_revisar_solicitacao');
    assert.equal(args.p_id, item.id);
    assert.deepEqual(args.p_esperado, item);
    assert.equal(args.p_aprovar, approve);
    assert.equal(item.status, 'Pendente');
    assert.equal(context.db.invoiceRequests[0].status, approve ? 'Aprovada' : 'Rejeitada');
    assert.equal(context.db.trips.length, 0, 'entidade convertida vem pela atualização do estado canônico');
  }
});

test('erro do servidor preserva estado local para nova conferência', async () => {
  const { context, api, elements } = load();
  const item = request();
  context.db.invoiceRequests.push(item);
  context.window.IntegralERP.sb.rpc = async () => ({ error: Error('Conflito sintético') });
  api.detailModal(item);
  await elements.get('#invoiceApprove').onclick();
  assert.equal(context.db.trips.length, 0);
  assert.equal(context.db.invoiceRequests[0], item);
  assert.match(context.alerts[0], /Conflito sintético/);
});

test('solicitante histórico é identificado por pedido recíproco e UUID, sem setor ou espelho local', () => {
  const { context, api } = load();
  context.user = { role: 'Funcionário', erpId: id(2), sector: 'Comercial' };
  const item = { ...request(), status: 'Aprovada', reviewedAt: '2098-12-01', convertedId: 77 };
  context.db.invoiceRequests.push(item);
  const trip = { id: 77, invoiceRequestId: item.id, assigned: [], sector: 'Projetos' };
  assert.equal(api.ownsApprovedTrip(trip), true);
  assert.equal(api.ownsApprovedTrip({ ...trip, id: 78 }), false);
  context.user.erpId = id(3);
  assert.equal(api.ownsApprovedTrip(trip), false);
});
