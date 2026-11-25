// As telas reconhecem o conflito de versão com o banco anterior (40001) e com o corrigido (PT409).
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { id } = require('./veiculos-fixtures.cjs');
const source = name => fs.readFileSync(path.join(__dirname, '../public', name), 'utf8');
const CONFLITOS = ['40001', 'PT409'];

// Nó permissivo: guarda o que a tela atribui, devolve o mesmo filho por seletor e registra chamadas.
function node(initial = {}) {
  const props = new Map(Object.entries(initial)), children = new Map(), calls = [];
  return new Proxy(function () {}, {
    get(_, key) {
      if (typeof key === 'symbol' || key === 'then' || key === 'toJSON') return undefined;
      if (props.has(key)) return props.get(key);
      if (key === 'calls') return calls;
      if (key === 'querySelector') return selector => {
        if (!children.has(selector)) children.set(selector, node());
        return children.get(selector);
      };
      if (key === 'querySelectorAll') return () => [];
      const child = node();
      props.set(key, child);
      return child;
    },
    set(_, key, value) { props.set(key, value); return true; },
    apply(_, _self, args) { calls.push(args); },
  });
}

function invoices(storage, error) {
  const created = [];
  const context = {
    db: { invoiceRequests: [] }, user: { role: 'Funcionário', erpId: id(2) }, window: {},
    document: { createElement: tag => { const el = node(); created.push({ tag, el }); return el; },
      body: { append() {} }, activeElement: null, documentElement: { dataset: {} },
      querySelector: () => null, querySelectorAll: () => [] },
    crypto: { randomUUID: () => id(99) }, structuredClone, alerts: [],
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    alert(message) { context.alerts.push(message); }, confirm: () => true,
  };
  context.window.IntegralERP = { sb: {
    auth: { getUser: async () => ({ data: { user: { id: context.user.erpId } } }) },
    rpc: async name => { context.rpc = name; return { error }; },
  } };
  vm.runInNewContext(source('financeiro-invoices.js').replace('boot();', 'window.test={runAction};'), context);
  return { context, run: context.window.test.runAction, modal: () => created.find(entry => entry.tag === 'div').el };
}
const pedido = () => ({ id: id(10), requesterId: id(2), category: 'purchase', status: 'Pendente', title: 'Compra sintética', description: 'Detalhes' });
const chave = (acao, item) => 'integral_fin_solicitacao:' + JSON.stringify([id(2), acao, String(item.id)]);
const tentativa = request => ({ operation: id(50), data: { title: 'Compra revisada' }, item: { request, revision: 1 } });

test('edição: 40001 e PT409 são conflito de versão, liberam o rascunho e bloqueiam o reenvio', async () => {
  for (const code of [...CONFLITOS, 'XX000']) {
    const storage = new Map(), request = pedido(), key = chave('edit', request);
    storage.set(key, JSON.stringify({ fields: { title: 'Compra revisada' }, attempt: tentativa(request), base: request, revision: 1 }));
    const { context, run, modal } = invoices(storage, { code, message: 'Solicitação atualizada. Confira a versão atual antes de continuar.' });
    run({ request, revision: 1, state: { status: 'Pendente' } }, 'edit');
    const form = modal().querySelector('#invoiceCreate');
    await form.onsubmit({ preventDefault() {} });
    assert.equal(context.rpc, 'financeiro_acao_solicitacao');
    const status = form.querySelector('.invoice-form-status').textContent, submit = form.querySelector('[type="submit"]');
    const saved = JSON.parse(storage.get(key));
    if (CONFLITOS.includes(code)) {
      assert.equal(status, 'A solicitação mudou. Feche esta janela e reabra o pedido para revisar o rascunho.', code);
      assert.equal(submit.disabled, true, code);
      assert.equal(saved.attempt, null, code);
    } else {
      assert.match(status, /^Não foi possível confirmar: Solicitação atualizada/);
      assert.equal(submit.disabled, false);
      assert.deepEqual(saved.attempt, tentativa(request), 'erro incerto preserva a mesma tentativa');
    }
  }
});

test('ações da central: 40001 e PT409 pedem reabertura e preservam o rascunho', async () => {
  for (const code of [...CONFLITOS, 'XX000']) {
    const storage = new Map(), request = pedido(), key = chave('comment', request);
    const attempt = { operation: id(51), data: { message: 'Comentário sintético' }, item: { request, revision: 1 } };
    storage.set(key, JSON.stringify({ fields: { message: 'Comentário sintético' }, base: { revision: 1 }, attempt }));
    const { run, modal } = invoices(storage, { code, message: 'Outro administrador está analisando a solicitação.' });
    run({ request, revision: 1, state: { status: 'Pendente' } }, 'comment');
    const form = modal().querySelector('form');
    await form.onsubmit({ preventDefault() {} });
    const status = form.querySelector('[role="status"]').textContent, submit = form.querySelector('[type="submit"]');
    const saved = JSON.parse(storage.get(key));
    if (CONFLITOS.includes(code)) {
      assert.equal(status, 'A solicitação mudou. Reabra o pedido para conferir. Seu rascunho foi preservado.', code);
      assert.equal(submit.disabled, true, code);
      assert.equal(saved.attempt, null, code);
    } else {
      assert.equal(status, 'Outro administrador está analisando a solicitação.');
      assert.equal(submit.disabled, false);
      assert.deepEqual(saved.attempt, attempt);
    }
  }
});

async function retornoAilos(error) {
  const nodes = new Map(), created = [], tab = node({ dataset: { ailosTab: 'retorno' } });
  const q = selector => { if (!nodes.has(selector)) nodes.set(selector, node()); return nodes.get(selector); };
  const window = { view: 'boletos', AilosCNAB: {}, ERP_SUPABASE: {}, IntegralRecebimentosAccess: { allowed: () => true }, confirm: () => true };
  window.supabase = { createClient: () => ({ rpc: async (_name, { acao }) => {
    if (acao === 'painel') return { data: { config: { ambiente: 'homologacao' }, remessas: [], boletos: [], pagadores: {} } };
    if (acao === 'previa_retorno') return { data: { eventos: [], ambiente: 'homologacao', revisao: '1' } };
    return { error };
  } }) };
  const document = { querySelector: q, querySelectorAll: selector => selector === '[data-ailos-tab]' ? [tab] : [],
    createElement: tag => { const el = node(); created.push({ tag, el }); return el; } };
  vm.runInNewContext(source('financeiro-boletos.js'), { window, document, TextDecoder, Uint8Array, user: { tipo: 'Financeiro' } });
  await window.IntegralBoletos.render();
  tab.onclick();
  const file = { size: 3, name: 'teste.ret', arrayBuffer: async () => new Uint8Array([65, 66, 67]).buffer };
  q('#ailosFile').files = [file];
  q('#ailosSource').value = 'canal_homologacao';
  await q('#ailosRead').onclick();
  await q('#ailosApply').onclick();
  return { result: q('#ailosReturn'), message: q('#ailosMessage'), created };
}

test('retorno bancário: 40001 e PT409 pedem nova prévia sem perder a seleção', async () => {
  for (const code of [...CONFLITOS, 'P0001']) {
    const { result, message, created } = await retornoAilos({ code, message: 'Refaça a conferência do retorno antes de importar' });
    assert.equal(message.textContent, 'Refaça a conferência do retorno antes de importar');
    assert.equal(message.className, 'ailos-error');
    if (CONFLITOS.includes(code)) {
      const aviso = created.find(entry => entry.tag === 'p').el;
      assert.match(aviso.textContent, /O histórico mudou desde a prévia\. Use Conferir arquivo/, code);
      assert.equal(result.prepend.calls[0][0], aviso, code);
    } else {
      assert.equal(created.length, 0, 'recusa sem conflito não pede nova prévia');
    }
  }
});
