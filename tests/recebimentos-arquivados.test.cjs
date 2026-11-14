const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const shared = require('../public/financeiro-dre-shared.js');

const script = fs.readFileSync(path.join(__dirname, '../public/financeiro-recebimentos-archive.js'), 'utf8');
const tableNames = ['fin_receb_municipios', 'fin_receb_clientes', 'fin_receb_parcelas'];

function fixture(tables = {}, { limit = 97 } = {}) {
  const elements = new Map();
  const calls = [];
  const alerts = [];
  let userId = 'usuario';
  let onAuthChange;
  let onPage = () => undefined;

  const appendChild = element => elements.set('#' + element.id, element);
  const createElement = () => ({
    style: {},
    isConnected: true,
    appendChild,
    querySelectorAll: () => [],
    querySelector: selector => elements.get(selector),
    remove() { elements.delete('#' + this.id); }
  });
  elements.set('.receb-toolbar .right', createElement());
  const client = {
    auth: {
      getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }),
      onAuthStateChange: callback => { onAuthChange = callback; }
    },
    from(table) {
      let cursor;
      let orderBy;
      const read = size => {
        calls.push({ table, cursor });
        const error = onPage(table, cursor);
        if (error) return { error };
        const rows = (tables[table] || []).filter(row => row.ativo === false && (!cursor || row.id > cursor));
        return {
          data: rows.sort((a, b) => String(a[orderBy]).localeCompare(String(b[orderBy]), 'pt-BR'))
            .slice(0, Math.min(size, limit))
        };
      };
      return {
        select() { return this; },
        eq(key, value) { assert.deepEqual([key, value], ['ativo', false]); return this; },
        order(key) { orderBy = key; return this; },
        gt(key, value) { assert.equal(key, 'id'); cursor = value; return this; },
        async limit(size) {
          assert.equal(orderBy, 'id');
          return read(size);
        },
        then(resolve) { return Promise.resolve(read(limit)).then(resolve); },
        update() { assert.fail('Abrir Arquivados deve executar somente consultas.'); }
      };
    }
  };
  const context = {
    IntegralDREShared: shared,
    supabase: { createClient: () => client },
    document: {
      head: { appendChild },
      body: { appendChild },
      getElementById: id => elements.get('#' + id),
      querySelector: selector => elements.get(selector),
      querySelectorAll: () => [],
      addEventListener() {},
      createElement
    },
    addEventListener() {},
    MutationObserver: class { observe() {} },
    queueMicrotask: callback => callback(),
    setTimeout: callback => callback(),
    alert: message => alerts.push(message)
  };
  context.window = context;
  vm.runInNewContext(script, context);

  return {
    calls,
    alerts,
    open: () => elements.get('#recebArchivedBtn').onclick(),
    modal: () => elements.get('#recebArchivedModal'),
    changeSession(next) {
      userId = next;
      onAuthChange('SIGNED_IN', next ? { user: { id: next } } : null);
    },
    interceptPages(callback) { onPage = callback; }
  };
}

function archivedRows() {
  return Array.from({ length: 1001 }, (_, i) => ({
    id: String(i).padStart(4, '0'), ativo: false, nome: 'Zulu ' + i, numero: i + 1, vencimento: '2099-02-01'
  })).concat({ id: 'ativo', ativo: true, nome: 'Registro ativo' });
}

test('Arquivados lê todas as páginas de municípios, clientes e parcelas, conservando a ordem da tela', async () => {
  const data = Object.fromEntries(tableNames.map(table => [table, archivedRows()]));
  data.fin_receb_municipios[1000].nome = 'Álvaro';
  data.fin_receb_clientes[1000].nome = 'Bruno';
  data.fin_receb_parcelas[1000].vencimento = '2099-01-01';
  const ui = fixture(data);
  await ui.open();
  const html = ui.modal().innerHTML;
  assert.match(html, /Álvaro[\s\S]*Zulu 0/);
  assert.match(html, /Bruno[\s\S]*Zulu 0/);
  assert.match(html, /Parcela #1001 · Vencimento 01\/01\/2099[\s\S]*Parcela #1 · Vencimento 01\/02\/2099/);
  assert.doesNotMatch(html, /Registro ativo/);
  for (const kind of ['muni', 'cliente', 'parcela']) {
    assert.equal([...html.matchAll(new RegExp('data-unarchive-' + kind + '=', 'g'))].length, 1001);
  }
  for (const table of tableNames) {
    assert.equal(ui.calls.filter(call => call.table === table).length, 12);
  }
  assert.deepEqual(ui.alerts, []);
});

test('Arquivados conserva a lista anterior se uma página falhar e mostra o vazio apenas após consulta completa', async () => {
  const table = 'fin_receb_clientes';
  const data = { [table]: archivedRows() };
  const ui = fixture(data);
  await ui.open();
  const before = ui.modal();
  ui.interceptPages((name, cursor) => name === table && cursor ? Error('página indisponível') : undefined);
  await ui.open();
  assert.equal(ui.modal(), before);
  assert.match(ui.alerts.at(-1), /página indisponível/);

  data[table] = [];
  ui.interceptPages(() => undefined);
  await ui.open();
  assert.notEqual(ui.modal(), before);
  assert.equal([...ui.modal().innerHTML.matchAll(/Nenhum registro arquivado/g)].length, 3);
});

test('Arquivados descarta a leitura e o modal se a sessão mudar durante a paginação', async () => {
  const table = 'fin_receb_clientes';
  const ui = fixture({ [table]: archivedRows() });
  await ui.open();
  assert.ok(ui.modal());
  ui.interceptPages((name, cursor) => {
    if (name === table && cursor === '0096') ui.changeSession('outro');
  });
  await ui.open();
  assert.equal(ui.modal(), undefined);
  assert.deepEqual(ui.alerts, []);
});
