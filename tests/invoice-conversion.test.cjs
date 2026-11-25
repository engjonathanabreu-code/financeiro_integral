const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { id } = require('./veiculos-fixtures.cjs');

const request = () => ({ id: id(10), requesterId: id(2), category: 'trip', status: 'Pendente',
  title: 'Vistoria', vehicleId: 'hb20', neededAt: '2099-01-01', estimatedValue: 10 });

function load(storage = new Map(), timers = { setTimeout, clearTimeout }) {
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
    structuredClone, AbortController, ...timers, alerts: [], calls: [], confirm: () => true, title() {},
    sessionStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    },
    alert(message) { context.alerts.push(message); },
  };
  context.window.IntegralERP = { sb: {
  auth:{getUser:async()=>({data:{user:{id:context.user?.erpId}}})},
  rpc: async (name, args) => {
    context.calls.push({ name, args });
    return { data: [{
      ...args.p_esperado, status: args.p_aprovar ? 'Aprovada' : 'Rejeitada',
      response: args.p_resposta, reviewedAt: '2098-01-01', reviewedById: id(1), convertedId: 88,
    }] };
  } } };
  const source = fs.readFileSync(path.join(__dirname, '../public/financeiro-invoices.js'), 'utf8')
    .replace('boot();', 'window.test={detailModal,ownsApprovedTrip,linkedAccess};');
  vm.runInNewContext(source, context);
  return { context, api: context.window.test, elements };
}

test('compra legada abre uma parcela recíproca única somente para perfil autorizado', () => {
  const { context, api } = load();
  const purchase={ id: id(10), category: 'purchase', convertedId: 88 };
  const opened=[];
  context.v2PaymentModal=(...args)=>opened.push(args);
  context.db.accountPayments=[{ id: 89, accountId: 88, invoiceRequestId: purchase.id },
    { id: 90, accountId: 88, invoiceRequestId: id(11) }];
  api.linkedAccess(purchase).open();
  assert.deepEqual(opened,[[89,88]]);
  assert.equal(api.linkedAccess({...purchase,convertedPaymentId:90}),null);
  context.db.accountPayments.push({ id: 91, accountId: 88, invoiceRequestId: purchase.id });
  assert.equal(api.linkedAccess(purchase),null);
  assert.ok(api.linkedAccess({...purchase,convertedPaymentId:89}));
  context.user={ role:'Funcionário', erpId:id(2) };
  assert.equal(api.linkedAccess({...purchase,convertedPaymentId:89}),null);
});

test('decisão manda versão esperada e usa somente o retorno confirmado', async () => {
  for (const approve of [true, false]) {
    const { context, api, elements } = load();
    const item = request();
    api.detailModal(item);
    elements.get('#invoiceResponse').value='Revisado';
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
  elements.get('#invoiceResponse').value='Revisado';
  await elements.get('#invoiceApprove').onclick();
  assert.equal(context.db.trips.length, 0);
  assert.equal(context.db.invoiceRequests[0], item);
  assert.match(context.alerts[0], /Conflito sintético/);
});

test('resposta perdida mantém a revisão e repete os mesmos dados após recarregar', async () => {
  const storage = new Map();
  const first = load(storage);
  const item = request();
  let sent;
  first.context.window.IntegralERP.sb.rpc = async (_name, args) => {
    sent=args;
    throw Error('Conexão interrompida');
  };
  first.api.detailModal(item);
  first.elements.get('#invoiceResponse').value='Resposta original';
  await first.elements.get('#invoiceApprove').onclick();
  assert.equal(first.elements.get('#invoiceReject').disabled,true);
  assert.equal(first.elements.get('#invoiceResponse').readOnly,true);
  assert.equal(storage.size,1);

  const reloaded=load(storage);
  reloaded.api.detailModal({ ...item, status:'Aprovada', convertedId:88 });
  await reloaded.elements.get('#invoiceApprove').onclick();
  const retry=reloaded.context.calls[0].args;
  assert.deepEqual(JSON.parse(JSON.stringify(retry)),JSON.parse(JSON.stringify(sent)));
  assert.equal(reloaded.context.db.invoiceRequests[0].convertedId,88);
  assert.equal(storage.size,0);
});

test('conflito confirmado pede nova conferência e preserva o texto para a versão atual', async () => {
 for (const code of ['40001','PT409']) {
  const storage = new Map();
  const { context, api, elements }=load(storage);
  const item=request();
  context.window.IntegralERP.sb.rpc=async()=>({error:{code,message:'Solicitação atualizada.'}});
  api.detailModal(item);
  elements.get('#invoiceResponse').value='Resposta preservada';
  await elements.get('#invoiceApprove').onclick();
  assert.equal(elements.get('#invoiceApprove').disabled,true);
  assert.match(context.alerts[0],/Reabra a solicitação/);
  api.detailModal({ ...item, vehicleId:'gol' });
  assert.equal(elements.get('#invoiceResponse').value,'Resposta preservada');
  assert.equal(elements.get('#invoiceResponse').readOnly,false);
 }
});

test('retorno sem confirmação da conversão mantém a solicitação e o diário locais', async () => {
  const storage = new Map();
  const { context, api, elements }=load(storage);
  const item=request();
  context.db.invoiceRequests=[item];
  context.window.IntegralERP.sb.rpc=async()=>({data:[item]});
  api.detailModal(item);
  elements.get('#invoiceResponse').value='Ainda sem confirmação';
  await elements.get('#invoiceApprove').onclick();
  assert.equal(context.db.invoiceRequests[0],item);
  assert.equal(storage.size,1);
  assert.match(context.alerts[0],/ainda não confirmou/);
});

test('duplo clique e outra sessão não enviam ou exibem a revisão em andamento', async () => {
  const storage=new Map(), { context, api, elements }=load(storage);
  const item=request();
  let complete, calls=0;
  context.window.IntegralERP.sb.rpc=async()=>{
    calls++;
    return new Promise(resolve=>{complete=resolve});
  };
  api.detailModal(item);
  elements.get('#invoiceResponse').value='Rascunho do primeiro revisor';
  const first=elements.get('#invoiceApprove').onclick();
  await elements.get('#invoiceApprove').onclick();
  await elements.get('#invoiceReject').onclick();
  await new Promise(setImmediate);
  assert.equal(calls,1);

  const another=load(storage);
  another.context.user.erpId=id(3);
  another.api.detailModal(item);
  assert.equal(another.elements.get('#invoiceResponse').value,'');
  complete({error:{message:'Resposta não recebida'}});
  await first;
  assert.equal(storage.size,1);
});

test('uma sessão administrativa diferente da tela bloqueia o envio e preserva a decisão', async () => {
  const storage=new Map(), { context, api, elements }=load(storage);
  const item=request();
  context.window.IntegralERP.sb.auth.getUser=async()=>({data:{user:{id:id(3)}}});
  api.detailModal(item);
  elements.get('#invoiceResponse').value='Resposta guardada';
  await elements.get('#invoiceApprove').onclick();
  assert.equal(context.calls.length,0);
  assert.equal(storage.size,1);
  assert.equal(elements.get('#invoiceReject').disabled,true);
  assert.match(context.alerts[0],/sessão mudou/);
});

test('troca de usuário enquanto o Supabase confirma a sessão impede o envio', async () => {
  const { context, api, elements }=load();
  let release;
  context.window.IntegralERP.sb.auth.getUser=()=>new Promise(resolve=>{release=resolve});
  api.detailModal(request());
  elements.get('#invoiceResponse').value='Resposta guardada';
  const result=elements.get('#invoiceApprove').onclick();
  context.user.erpId=id(3);
  release({data:{user:{id:id(1)}}});
  await result;
  assert.equal(context.calls.length,0);
});

function controlledTimers() {
  const pending = new Map();
  let next = 0;
  return {
    setTimeout(callback) { const key = ++next; pending.set(key, callback); return key; },
    clearTimeout(key) { pending.delete(key); },
    expire() { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback()); },
    count: () => pending.size,
  };
}

test('autenticação sem resposta libera a tela, preserva a tentativa e não envia após expirar', async () => {
  const timers = controlledTimers(), storage = new Map();
  const { context, api, elements } = load(storage, timers);
  const normalAuth = context.window.IntegralERP.sb.auth.getUser;
  let release;
  context.window.IntegralERP.sb.auth.getUser = () => new Promise(resolve => { release = resolve; });
  api.detailModal(request());
  elements.get('#invoiceResponse').value = 'Aprovado e pago';
  const waiting = elements.get('#invoiceApprove').onclick();
  assert.equal(elements.get('#invoiceApprove').disabled, true);
  timers.expire();
  await waiting;
  assert.equal(elements.get('#invoiceApprove').disabled, false);
  assert.equal(elements.get('#invoiceReject').disabled, true);
  assert.equal(elements.get('#invoiceResponse').value, 'Aprovado e pago');
  assert.equal(context.calls.length, 0);
  assert.match(elements.get('#invoiceReviewStatus').textContent, /sessão não respondeu/);
  release(await normalAuth());
  await new Promise(setImmediate);
  assert.equal(context.calls.length, 0, 'resposta tardia não inicia escrita');
  context.window.IntegralERP.sb.auth.getUser = normalAuth;
  await elements.get('#invoiceApprove').onclick();
  assert.equal(context.calls.length, 1);
  assert.equal(context.db.invoiceRequests[0].status, 'Aprovada');
  assert.equal(storage.size, 0);
  assert.equal(timers.count(), 0);
});

test('RPC sem resposta é abortada e o retry preserva payload; retorno tardio não reescreve a lista', async () => {
  const timers = controlledTimers(), storage = new Map();
  const { context, api, elements } = load(storage, timers);
  const normalRpc = context.window.IntegralERP.sb.rpc;
  const payloads = [];
  let release, signal;
  context.window.IntegralERP.sb.rpc = (name, args) => {
    payloads.push(structuredClone(args));
    if (payloads.length > 1) return normalRpc(name, args);
    const waiting = new Promise(resolve => { release = resolve; });
    const builder = { then: (yes, no) => waiting.then(yes, no), abortSignal(value) { signal = value; return builder; } };
    return builder;
  };
  api.detailModal(request());
  elements.get('#invoiceResponse').value = 'Aprovado e pago';
  const waiting = elements.get('#invoiceApprove').onclick();
  await new Promise(setImmediate);
  timers.expire();
  await waiting;
  assert.equal(signal.aborted, true);
  assert.equal(elements.get('#invoiceApprove').disabled, false);
  assert.equal(elements.get('#invoiceReject').disabled, true);
  assert.equal(context.db.invoiceRequests.length, 0);
  await elements.get('#invoiceApprove').onclick();
  assert.deepEqual(payloads[0], payloads[1]);
  const canonical = context.db.invoiceRequests;
  release({ data: [{ ...request(), status: 'Pendente' }] });
  await new Promise(setImmediate);
  assert.equal(context.db.invoiceRequests, canonical);
  assert.equal(canonical[0].status, 'Aprovada');
  assert.equal(storage.size, 0);
  assert.equal(timers.count(), 0);
});

test('falha síncrona da autenticação limpa o prazo sem bloquear a reconfirmação', async () => {
  const timers = controlledTimers();
  const { context, api, elements } = load(new Map(), timers);
  context.window.IntegralERP.sb.auth.getUser = () => { throw Error('Sessão indisponível'); };
  api.detailModal(request());
  elements.get('#invoiceResponse').value = 'Resposta preservada';
  await elements.get('#invoiceApprove').onclick();
  assert.equal(timers.count(), 0);
  assert.equal(elements.get('#invoiceApprove').disabled, false);
  assert.equal(elements.get('#invoiceResponse').value, 'Resposta preservada');
  assert.equal(context.calls.length, 0);
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
