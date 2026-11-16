const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { setup, login, id, ADM, STAFF, INATIVO } = require('./financeiro-db-fixture.cjs');

const sql = file => fs.readFileSync(path.join(__dirname, '../supabase', file), 'utf8');
const phaseB = 'migrations/20261116135903_financeiro_exigir_rpc_modulos.sql';
const rollback = 'rollback/financeiro_exigir_rpc_modulos.sql';
const budget = { id: 10, name: 'Orçamento sintético', active: true, status: 'Ativo', sector: 'Comercial', history: [] };
const cashflow = [{ id: 11, description: 'Movimento sintético', value: 10 }];
const olderCashflow = [{ ...cashflow[0], value: 8 }];
const trips = [
  { id: 20, city: 'Viagem própria', sector: 'Comercial', assigned: [] },
  { id: 21, city: 'Viagem de outro setor', sector: 'Projetos', assigned: [] },
];

async function fixture(t) {
  const db = await setup();
  t.after(() => db.close());
  await db.exec(sql('auditoria_acessos_20261005.sql'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(ADM)]);
  for (const [key, value] of Object.entries({ cashflow, budgetRecords: [budget], trips, invoiceRequests: [] })) {
    await db.query('insert into financeiro_estado_modulos(chave,dados,updated_at) values($1,$2,now())', [key, JSON.stringify(value)]);
  }
  await db.query("insert into financeiro_estado_modulos_history(chave,dados,operation) values('cashflow',$1,'UPDATE')", [JSON.stringify(olderCashflow)]);
  for (const file of [
    '20261113190000_financeiro_modulos_revisao.sql',
    '20261113190500_financeiro_solicitacoes_acesso.sql',
    '20261113191500_financeiro_anexos_acesso.sql',
    '20261113192000_financeiro_guarda_registros.sql',
    '20261114104155_financeiro_recibos_sincronizacao.sql',
  ]) await db.exec(sql('migrations/' + file));
  // Reproduz a guarda vigente de Solicitações. As RPCs específicas continuam com seu proprietário.
  const requests = sql('migrations/20261114135633_financeiro_integridade_solicitacoes.sql');
  await db.exec(requests.slice(
    requests.indexOf('create function financeiro_privado.reservar_gravacao_solicitacoes()'),
    requests.indexOf('create function financeiro_privado.proteger_vinculos_solicitacoes()')
  ));
  await db.exec(sql(phaseB));
  return db;
}

async function receipt(db, key, data, revision, operation, filtered = false) {
  const { rows } = await db.query('select financeiro_salvar_modulo_com_recibo($1,$2,$3,$4,$5) r',
    [key, JSON.stringify(data), revision, id(operation), filtered]);
  return rows[0].r;
}

test('revisão obrigatória bloqueia REST de ADM e preserva recibos, conflitos e RLS dos módulos', async t => {
  const db = await fixture(t);
  await login(db, ADM);
  assert.deepEqual((await db.query("select dados from financeiro_estado_modulos where chave='cashflow'")).rows[0].dados, cashflow);
  for (const statement of [
    "insert into financeiro_estado_modulos(chave,dados) values('cashflow','[]') on conflict(chave) do update set dados=excluded.dados",
    "update financeiro_estado_modulos set dados='[]' where chave='cashflow'",
    "delete from financeiro_estado_modulos where chave='cashflow'",
  ]) await assert.rejects(db.exec(statement), /permission denied/);
  const submitted = [{ ...cashflow[0], value: 15 }];
  const a = await receipt(db, 'cashflow', submitted, 1, 100);
  assert.deepEqual(a, { status: 'salvo', dados: submitted, revisao: 2 });
  const b = await receipt(db, 'cashflow', [{ ...cashflow[0], value: 20 }], 1, 101);
  assert.deepEqual(b, { status: 'conflito', dados: submitted, revisao: 2 });
  const replay = await receipt(db, 'cashflow', submitted, 1, 100);
  assert.equal(replay.repetido, true);
  assert.equal(replay.revisao_operacao, 2);
  await assert.rejects(receipt(db, 'invoiceRequests', [{ id: 'indevida' }], 1, 102), /fluxo de Solicitações/);

  await login(db, STAFF);
  await assert.rejects(receipt(db, 'cashflow', cashflow, 2, 100), /indisponível|sem permissão/);
  assert.deepEqual((await db.query("select dados from financeiro_estado_modulos where chave='trips'")).rows, []);
  const edited = [{ ...trips[0], report: 'Editada por perfil autorizado' }];
  const visible = await receipt(db, 'trips', edited, 1, 103, true);
  assert.deepEqual(visible, { status: 'salvo', dados: edited, revisao: 2 });
  await login(db, ADM);
  assert.deepEqual((await db.query("select dados from financeiro_estado_modulos where chave='trips'")).rows[0].dados, [...edited, trips[1]]);
  await login(db, INATIVO);
  await assert.rejects(receipt(db, 'trips', edited, 2, 104, true), /indisponível|sem permissão/);
});

test('encerramento e restauração conferem a referência esperada; reversão preserva conteúdo e revisões', async t => {
  const db = await fixture(t);
  await login(db, ADM);
  await assert.rejects(db.query('select financeiro_close_budget($1,$2)', ['10', JSON.stringify({ ...budget, name: 'Anterior' })]), /mudou/);
  const result = (await db.query('select financeiro_close_budget($1,$2) r', ['10', JSON.stringify(budget)])).rows[0].r;
  assert.equal(result[0].status, 'Fechado');
  await assert.rejects(db.query('select financeiro_restore_modulo_version($1,$2)', ['cashflow', 1]), /permission denied/);
  await assert.rejects(db.query('select financeiro_restore_modulo_version($1,$2,$3)', ['cashflow', 1, 3]), { code: '40001' });
  const restore = (await db.query('select financeiro_restore_modulo_version($1,$2,$3) r', ['cashflow', 1, 1])).rows[0].r;
  assert.deepEqual(restore, { status: 'salvo', revisao: 2, dados: olderCashflow });
  await login(db, STAFF);
  await assert.rejects(db.query('select financeiro_restore_modulo_version($1,$2,$3)', ['cashflow', 1, 2]), { code: '42501' });
  await db.exec('reset role');
  const snapshot = async () => (await db.query('select * from financeiro_estado_modulos order by chave')).rows;
  const before = await snapshot();
  const history = (await db.query('select * from financeiro_estado_modulos_history order by id')).rows;
  await db.exec(sql(rollback));
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual((await db.query('select * from financeiro_estado_modulos_history order by id')).rows, history);
  await login(db, ADM);
  const resultAfterRollback = await receipt(db, 'cashflow', cashflow, 2, 110);
  assert.equal(resultAfterRollback.revisao, 3);
});
