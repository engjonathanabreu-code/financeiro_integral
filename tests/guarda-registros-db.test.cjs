// Autorização em PostgreSQL isolado, com registros sintéticos de dois setores.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, login, id, ADM, STAFF, FIN, INATIVO } = require('./financeiro-db-fixture.cjs');

const sql = file => fs.readFileSync(path.join(__dirname, '../supabase', file), 'utf8');
const legados = {
  trips: [
    { id: 1, city: 'A', sector: 'Comercial', status: 'Planejada', assigned: [] },
    { id: 2, city: 'B', sector: 'Projetos', status: 'Planejada', assigned: [] },
    { id: 3, city: 'C', sector: 'Projetos', status: 'Planejada', assigned: [303] }
  ],
  tripExpenses: [
    { id: 4, tripId: 1, value: 5 },
    { id: 5, tripId: 2, value: 7, file: { dataUrl: 'data:text/plain;base64,YQ==' } }
  ],
  tripDocuments: [{ id: 6, tripId: 1, expenseId: 4 }, { id: 7, tripId: 2, expenseId: 5 }],
  budgetRecords: [
    { id: 'a', name: 'Aberto', sector: 'Comercial', status: 'Ativo' },
    { id: 'b', name: 'Fechado', sector: 'Comercial', status: 'Fechado' },
    { id: 'c', name: 'Outro', sector: 'Projetos', status: 'Ativo' }
  ],
  budgetExpenses: [
    { id: 'x', budgetId: 'a', value: 12 },
    { id: 'y', budgetId: 'b', value: 14 },
    { id: 'z', budgetId: 'c', value: 16 }
  ],
  docs: [{ id: 8, name: 'NF legada' }, { id: 10, name: 'NF financeira', sector: 'Financeiro' }],
  usersMvp: [{ id: 202, erpId: id(STAFF) }, { id: 303, erpId: id(FIN) }]
};

async function prepared() {
  const db = await setup();
  await db.query("insert into profiles values($1,'Diretor de Projetos','Projetos',true)", [id(6)]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(ADM)]);
  await db.exec(sql('auditoria_acessos_20261005.sql'));
  // A fixture inclui originais legados inline, anteriores ao trigger de externalização.
  await db.exec('alter table financeiro_estado_modulos disable trigger financeiro_a_antes_gravar');
  for (const [key, data] of Object.entries(legados)) {
    await db.query('insert into financeiro_estado_modulos(chave,dados,updated_at) values($1,$2,now())', [key, JSON.stringify(data)]);
  }
  await db.exec('alter table financeiro_estado_modulos enable trigger financeiro_a_antes_gravar');
  for (const file of [
    'migrations/20261113190000_financeiro_modulos_revisao.sql',
    'migrations/20261113190500_financeiro_solicitacoes_acesso.sql',
    'migrations/20261113191500_financeiro_anexos_acesso.sql',
    'migrations/20261113192000_financeiro_guarda_registros.sql'
  ]) await db.exec(sql(file));
  return db;
}

const direct = async (db, key) => (await db.query(
  'select dados from financeiro_estado_modulos where chave=$1', [key]
)).rows;
const rows = async (db, keys) => (await db.query(
  'select financeiro_listar_modulos_visiveis($1::text[]) r', [keys]
)).rows[0].r;
const read = async (db, key) => (await rows(db, [key]))[0];
const write = async (db, key, value, revision) => (await db.query(
  'select financeiro_salvar_modulo_visivel($1,$2,$3) r', [key, JSON.stringify(value), revision]
)).rows[0].r;
const save = async (db, key, value) => write(db, key, value, (await read(db, key)).revisao);
const ids = data => data.map(item => item.id);

test('leitura por registro usa o setor ou atribuição canônica e bloqueia tabela direta', async () => {
  const db = await prepared();
  try {
    await login(db, STAFF);
    assert.deepEqual(await direct(db, 'trips'), []);
    assert.deepEqual(ids((await read(db, 'trips')).dados), [1]);
    assert.deepEqual(ids((await read(db, 'tripExpenses')).dados), [4]);
    assert.deepEqual(ids((await read(db, 'tripDocuments')).dados), [6]);
    assert.deepEqual(ids((await read(db, 'budgetRecords')).dados), ['a', 'b']);
    assert.deepEqual(ids((await read(db, 'budgetExpenses')).dados), ['x', 'y']);
    assert.deepEqual((await read(db, 'docs')).dados, []);
    assert.deepEqual(await rows(db, ['usersMvp', 'cashflow']), []);
    assert.equal((await db.query("update financeiro_estado_modulos set dados='[]' where chave='trips' returning chave")).rows.length, 0);
    assert.equal((await db.query("update financeiro_estado_modulos set dados='[]' where chave='usersMvp' returning chave")).rows.length, 0);
    await assert.rejects(db.query("select financeiro_salvar_modulo('trips','[]',1)"), /sem permissão/);
    await assert.rejects(db.query("select financeiro_restore_modulo_version('trips',1)"), /Somente ADM/);

    await login(db, FIN);
    assert.deepEqual(ids((await read(db, 'trips')).dados), [3]);
    assert.deepEqual(ids((await read(db, 'docs')).dados), [10]);
    assert.deepEqual((await read(db, 'budgetRecords')).dados, []);
    await login(db, 6);
    assert.deepEqual((await read(db, 'trips')).dados, []);
    await login(db, INATIVO);
    await assert.rejects(rows(db, ['trips']), /Sessão ativa/);
    await assert.rejects(write(db, 'trips', [], 1), /indisponível/);
    await login(db, null);
    await assert.rejects(rows(db, ['trips']), /permission denied/);
    await assert.rejects(write(db, 'trips', [], 1), /permission denied/);
    await login(db, ADM);
    assert.deepEqual(ids((await read(db, 'trips')).dados), [1, 2, 3]);
  } finally { await db.close(); }
});

test('gravação filtrada preserva terceiros, rejeita tentativa de autoatribuição e filtra o conflito', async () => {
  const db = await prepared();
  try {
    await login(db, STAFF);
    const current = await read(db, 'trips');
    const [own] = current.dados;
    await assert.rejects(save(db, 'trips', [{ ...own, status: 'Aprovada' }]), /aprovar viagens/);
    await assert.rejects(save(db, 'trips', [{ ...own, sector: 'Projetos' }]), /setor da viagem/);
    await assert.rejects(save(db, 'trips', [{ ...own, invoiceRequestId: 'fabricada' }]), /vínculos/);
    await assert.rejects(save(db, 'trips', [{ ...own, assigned: [303] }]), /responsáveis/);
    await assert.rejects(save(db, 'trips', [{ ...own, assignedDirect: [303] }]), /vínculos/);
    await assert.rejects(save(db, 'trips', [own, { id: 2, assigned: [202] }]), /indisponível/);
    await assert.rejects(save(db, 'trips', []), /excluir/);
    const result = await save(db, 'trips', [{ ...own, assigned: [202], report: 'Atualizado' }]);
    assert.equal(result.status, 'salvo');
    assert.deepEqual(ids(result.dados), [1]);
    const conflict = await write(db, 'trips', current.dados, current.revisao);
    assert.equal(conflict.status, 'conflito');
    assert.deepEqual(ids(conflict.dados), [1]);
    assert.equal(conflict.dados[0].report, 'Atualizado');

    const change = await save(db, 'tripExpenses', [{ id: 4, tripId: 1, value: 9 }]);
    assert.deepEqual(ids(change.dados), [4]);
    await assert.rejects(save(db, 'tripExpenses', [change.dados[0], { id: 9, tripId: 2, value: 5 }]), /indisponível/);
    await assert.rejects(save(db, 'tripExpenses', [{ id: 4, tripId: 2, value: 5 }]), /trocar a viagem/);
    await assert.rejects(save(db, 'tripDocuments', [{ id: 6, tripId: 1, expenseId: 5 }]), /despesa desta viagem/);

    await login(db, ADM);
    const [allTrips] = await direct(db, 'trips');
    assert.deepEqual(allTrips.dados.slice(1), legados.trips.slice(1));
    const [allExpenses] = await direct(db, 'tripExpenses');
    assert.deepEqual(allExpenses.dados[1], legados.tripExpenses[1], 'origem inline de terceiro fica idêntica');
    assert.equal(allExpenses.dados[0].value, 9);
  } finally { await db.close(); }
});

test('orçamento fechado, despesa de terceiro e documentos fiscais respeitam o papel', async () => {
  const db = await prepared();
  try {
    await login(db, STAFF);
    const budgets = (await read(db, 'budgetRecords')).dados;
    await assert.rejects(save(db, 'budgetRecords', [{ ...budgets[0], limit: 999 }, budgets[1]]), /Somente ADM/);
    const expenses = (await read(db, 'budgetExpenses')).dados;
    await assert.rejects(save(db, 'budgetExpenses', [expenses[0], { ...expenses[1], value: 99 }]), /Orçamento fechado/);
    await assert.rejects(save(db, 'budgetExpenses', [...expenses, { id: 'nova', budgetId: 'c', value: 1 }]), /indisponível/);
    await assert.rejects(save(db, 'budgetExpenses', [expenses[0], { ...expenses[1], budgetId: 'a' }]), /trocar o orçamento/);
    assert.equal((await save(db, 'budgetExpenses', [...expenses, { id: 'nova', budgetId: 'a', value: 1 }])).status, 'salvo');
    const own = await save(db, 'docs', [{ id: 9, name: 'Comprovante', criadoPorId: id(FIN) }]);
    assert.equal(own.dados[0].criadoPorId, id(STAFF));
    await assert.rejects(save(db, 'docs', [{ id: 8, name: 'Troca' }, own.dados[0]]), /indisponível/);
    await assert.rejects(save(db, 'docs', [{ ...own.dados[0], name: 'Troca' }]), /Somente Financeiro ou ADM/);
    await login(db, FIN);
    const docs = (await read(db, 'docs')).dados;
    assert.deepEqual(ids(docs), [10]);
    await assert.rejects(save(db, 'docs', []), /excluir/);
    await assert.rejects(save(db, 'docs', [{ ...docs[0], sector: 'Comercial' }]), /trocar o setor/);
    const saved = await save(db, 'docs', [{ ...docs[0], name: 'NF revisada' }]);
    assert.deepEqual(ids(saved.dados), [10]);
    assert.equal(saved.dados[0].name, 'NF revisada');
  } finally { await db.close(); }
});

test('referenciar anexo ou caminho de outra pessoa em registro próprio não concede leitura', async () => {
  const db = await prepared();
  try {
    await db.query("insert into storage.objects values('documentos',$1),('documentos',$2),('documentos',$3)",
      [id(ADM) + '/financeiro-fiscal/privado.pdf', id(STAFF) + '/financeiro-fiscal/proprio.pdf', id(ADM) + '/projeto/doc.pdf']);
    await login(db, ADM);
    const hidden = (await db.query("select financeiro_guardar_arquivo('data:text/plain;base64,QQ==','privado.txt') id")).rows[0].id;
    const docs = (await read(db, 'docs')).dados;
    await save(db, 'docs', [docs[0], { ...docs[1], arquivoId: hidden, storagePath: id(ADM) + '/financeiro-fiscal/privado.pdf' }]);
    await login(db, STAFF);
    const original = (await read(db, 'tripExpenses')).dados;
    const add = file => save(db, 'tripExpenses', [...original, { id: 11, tripId: 1, file }]);
    await assert.rejects(add({ arquivoId: hidden }), /Anexo indisponível/);
    await assert.rejects(add({ storagePath: id(ADM) + '/financeiro-fiscal/privado.pdf' }), /Anexo do Storage indisponível/);
    assert.equal((await add({ storagePath: id(STAFF) + '/financeiro-fiscal/proprio.pdf' })).status, 'salvo');
    assert.deepEqual((await db.query("select id from financeiro_arquivos where id=$1",[hidden])).rows, []);
    const paths = await db.query('select name from storage.objects order by name');
    assert.deepEqual(paths.rows.map(x => x.name), [id(ADM) + '/projeto/doc.pdf', id(STAFF) + '/financeiro-fiscal/proprio.pdf']);
    await login(db, FIN);
    assert.deepEqual((await db.query("select id from financeiro_arquivos where id=$1",[hidden])).rows, [{ id: hidden }]);
    assert.deepEqual((await db.query("select name from storage.objects where name=$1",[id(ADM) + '/financeiro-fiscal/privado.pdf'])).rows,
      [{ name: id(ADM) + '/financeiro-fiscal/privado.pdf' }]);
    await login(db, null);
    assert.deepEqual((await db.query('select name from storage.objects order by name')).rows, [{ name: id(ADM) + '/projeto/doc.pdf' }]);
  } finally { await db.close(); }
});
