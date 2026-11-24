const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, submit, review, modules, read, phase1, phase2, login } = require('./solicitacoes-orcamento-fechado-fixture.cjs');
const budgets = async db => (await db.query("select dados from financeiro_estado_modulos where chave='budgetRecords'")).rows[0]?.dados;

test('reproduz conflito da conversão com a guarda real e a fase 1 transforma o erro em HTTP 409', async () => {
  const db = await fixture({ fixed: false });
  try {
    const request = await submit(db);
    await login(db, 1);
    const before = await modules(db);
    await assert.rejects(review(db, request), { code: '40001', message: 'Um orçamento foi fechado. Atualize a tela antes de salvar.' });
    assert.deepEqual(await modules(db), before);
    await db.exec('reset role');
    await db.exec(read(phase1));
    await login(db, 1);
    await assert.rejects(review(db, request), { code: 'PT409', message: 'Um orçamento foi fechado. Atualize a tela antes de salvar.' });
    assert.deepEqual(await modules(db), before);
  } finally { await db.close(); }
});

test('aprova orçamento uma vez preservando encerramento, histórico e conteúdo de todos os anteriores', async () => {
  const db = await fixture();
  try {
    const request = await submit(db);
    await login(db, 1);
    const previous = await budgets(db);
    assert.ok(previous.some(b => b.status === 'Fechado'));
    const approved = await review(db, request);
    const current = await budgets(db);
    assert.deepEqual(current.slice(0, -1), previous);
    assert.equal(current.at(-1).invoiceRequestId, request.id);
    assert.equal(current.at(-1).id, approved.convertedId);
    assert.equal(current.at(-1).limit, 395);
    assert.equal(approved.status, 'Aprovada');
    const confirmed = await modules(db);
    assert.deepEqual(await review(db, request), approved);
    assert.deepEqual(await modules(db), confirmed);
    assert.equal((await db.query("select count(*) n from financeiro_estado_modulos where chave in ('accountMasters','accountPayments')")).rows[0].n, 0);
  } finally { await db.close(); }
});

test('guarda de encerramento continua impedindo reabertura, perda de histórico e upsert parcial', async () => {
  const db = await fixture();
  try {
    await login(db, 1);
    const previous = await budgets(db);
    await assert.rejects(db.query("update financeiro_estado_modulos set dados=$1 where chave='budgetRecords'", [[{ ...previous[0], status: 'Aberto' }]]), { code: '40001' });
    await assert.rejects(db.query("update financeiro_estado_modulos set dados=$1 where chave='budgetRecords'", [[{ ...previous[0], history: [] }]]), { code: '40001' });
    await assert.rejects(db.query("insert into financeiro_estado_modulos(chave,dados) values('budgetRecords',$1) on conflict(chave) do update set dados=excluded.dados", [[{ id: 999, name: 'Parcial' }]]), { code: '40001' });
    assert.deepEqual(await budgets(db), previous);
    const request = await submit(db);
    await assert.rejects(review(db, request), { code: '42501' });
    await login(db, 1);
    await assert.rejects(review(db, { ...request, title: 'Versão antiga' }), { code: 'PT409' });
    assert.deepEqual(await budgets(db), previous);
  } finally { await db.close(); }
});

test('inicialização de módulo ausente e rejeição continuam sem conversões duplicadas', async () => {
  const db = await fixture();
  try {
    const request = await submit(db);
    await login(db, 1);
    await db.exec("delete from financeiro_estado_modulos where chave='budgetRecords'");
    await review(db, request);
    assert.equal((await budgets(db)).length, 1);
    const rejected = await submit(db, 861);
    await login(db, 1);
    assert.equal((await review(db, rejected, 'Rejeitado', false)).status, 'Rejeitada');
    assert.equal((await budgets(db)).length, 1);
  } finally { await db.close(); }
});

test('instalação e rollback conservam dados, ACLs e guardas e recusam funções divergentes', async () => {
  const db = await fixture({ fixed: false });
  try {
    const initial = await modules(db);
    const signatures = "oid in ('public.financeiro_revisar_solicitacao(text,jsonb,boolean,text,text)'::regprocedure,'financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(text,jsonb,boolean,text)'::regprocedure,'public.financeiro_guard_budget_close()'::regprocedure)";
    const functions = async () => (await db.query(`select oid::regprocedure::text signature,prosrc,proacl,prosecdef,proconfig from pg_proc where ${signatures} order by 1`)).rows;
    const original = await functions();
    await db.exec(read(phase1)); await db.exec(read(phase2));
    const changed = await functions();
    for (const f of original) {
      const n = changed.find(v => v.signature === f.signature);
      assert.deepEqual({ ...n, prosrc: f.prosrc }, f);
      if (f.signature === 'financeiro_guard_budget_close()') assert.equal(n.prosrc, f.prosrc);
    }
    assert.deepEqual(await modules(db), initial);
    await db.exec(read('rollback/financeiro_converter_orcamento_fechados.sql'));
    assert.equal((await functions()).find(f => f.signature.startsWith('public.financeiro_revisar_solicitacao') || f.signature.startsWith('financeiro_revisar_solicitacao(')).prosrc.includes("raise sqlstate 'PT409'"), true);
    await db.exec(read('rollback/financeiro_revisao_conflito_sem_retry.sql'));
    assert.deepEqual(await functions(), original);
    assert.deepEqual(await modules(db), initial);
    await db.exec(read(phase1));
    await assert.rejects(db.exec(read(phase1)), /divergiu/);
    await db.exec('rollback');
    assert.deepEqual(await modules(db), initial);
  } finally { await db.close(); }
});
