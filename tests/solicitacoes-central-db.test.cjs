const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { setup, login, id } = require('./veiculos-fixtures.cjs');

const sql = file => readFileSync(join(__dirname, '../supabase', file), 'utf8');
const migration = 'migrations/20261116151526_financeiro_central_solicitacoes.sql';
const access = 'migrations/20261113190500_financeiro_solicitacoes_acesso.sql';
const integrity = 'migrations/20261114135633_financeiro_integridade_solicitacoes.sql';
const repeatedTrip = 'migrations/20261116194500_financeiro_conferir_viagem_repetida.sql';

async function buildFixture(withLegacy) {
  const db = await setup();
  await db.exec(`
    alter table public.financeiro_estado_modulos enable row level security;
    create policy teste_base on public.financeiro_estado_modulos for all to authenticated
      using(true) with check(true);
    create table public.financeiro_contas(id text primary key);
    create table public.financeiro_pagamentos(id text primary key);
    insert into public.profiles values ('${id(6)}','ADM 2','adm2@fixture.test','Administrador','Administrativo',true);
  `);
  await db.exec(sql(access));
  await db.exec(sql(integrity));
  if (withLegacy) await withLegacy(db);
  await db.exec(sql(migration));
  await db.exec(sql(repeatedTrip));
  return db;
}

async function legacySave(db, request, expected = null) {
  return (await db.query('select financeiro_save_invoice_request($1,$2) data', [
    request, expected,
  ])).rows[0].data.find(item => item.id === request.id);
}

function submit(db, number, fields = {}) {
  return legacySave(db, {
    id: id(number), category: 'purchase', title: 'Pedido sintético',
    status: 'Pendente', estimatedValue: 25, description: 'Detalhes sintéticos', ...fields,
  });
}

async function bundle(db, itemId = null) {
  return (await db.query('select financeiro_central_solicitacoes($1) data', [itemId])).rows[0].data;
}

async function item(db, itemId) {
  return (await bundle(db, itemId)).items[0];
}

async function act(db, current, action, payload = {}, operation = crypto.randomUUID()) {
  return (await db.query('select financeiro_acao_solicitacao($1,$2,$3,$4,$5,$6) data', [
    current.request.id, current.revision, action, payload, operation, current.request,
  ])).rows[0].data.items[0];
}

async function review(db, request, approve, answer) {
  return (await db.query('select financeiro_revisar_solicitacao($1,$2,$3,$4) data', [
    request.id, request, approve, answer,
  ])).rows[0].data.find(item => item.id === request.id);
}

test('aprovação pede conferência de viagem já vinculada antes de converter outro pedido', async () => {
  const db = await buildFixture();
  try {
    await login(db, 2);
    const fields = { category: 'trip', neededAt: '2099-01-01', destination: 'São José / SC', vehicleId: 'gol' };
    const first = await submit(db, 50, { ...fields, title: 'Veículo e orçamento' });
    const second = await submit(db, 51, { ...fields, title: 'Outro pedido', destination: 'sao jose-sc', vehicleId: 'hb20' });
    const nextDay = await submit(db, 52, { ...fields, neededAt: '2099-01-02' });
    await assert.rejects(review(db, first, true, 'Usuário sem autorização'), { code: '42501' });
    await login(db, 1);
    const approved = await review(db, first, true, 'Primeira aprovação');
    assert.deepEqual(await review(db, first, true, 'Primeira aprovação'), approved);

    let confirmation;
    await assert.rejects(review(db, second, true, 'Conferido'), error => {
      assert.equal(error.code, 'PT409');
      const details = JSON.parse(error.detail);
      assert.deepEqual(details.pedidos, [{ id: first.id, title: first.title }]);
      confirmation = details.conferencia;
      return true;
    });
    assert.equal((await item(db, second.id)).request.status, 'Pendente');
    const confirm = token => db.query('select financeiro_revisar_solicitacao($1,$2,$3,$4,$5) data', [
      second.id, second, true, 'Conferido', token,
    ]);
    await assert.rejects(confirm('token desatualizado'), { code: 'PT409' });
    assert.equal((await review(db, nextDay, true, 'Outra data')).status, 'Aprovada');
    await confirm(confirmation);
    await confirm(confirmation);
    const verified = await item(db, second.id);
    assert.equal(verified.request.status, 'Aprovada');
    assert.notEqual(verified.request.convertedId, approved.convertedId);
    assert.equal(verified.events.filter(event => event.action === 'approve_distinct_trip').length, 1);

    await db.exec('reset role');
    const trips = async () => (await db.query("select dados from financeiro_estado_modulos where chave='trips'")).rows[0].dados;
    const beforeRollback = await trips();
    assert.equal(beforeRollback.filter(trip => trip.invoiceRequestId === second.id).length, 1);
    assert.equal(beforeRollback.filter(trip => trip.invoiceRequestId === first.id).length, 1);
    await db.exec(sql('rollback/financeiro_conferir_viagem_repetida.sql'));
    assert.deepEqual(await trips(), beforeRollback);
    await login(db, 1);
    assert.ok((await item(db, second.id)).events.some(event => event.action === 'approve_distinct_trip'));
    assert.equal((await review(db, second, true, 'Conferido')).convertedId, verified.request.convertedId);
  } finally {
    await db.close();
  }
});

test('solicitante edita com histórico e reenvio idempotente, respeitando revisão e acesso', async () => {
  const db = await buildFixture();
  try {
    await login(db, 2);
    const saved = await submit(db, 42);
    assert.deepEqual(await submit(db, 42), saved);
    const initial = await item(db, saved.id);
    assert.equal(initial.events.filter(event => event.action === 'submit').length, 1);

    const operation = crypto.randomUUID();
    await assert.rejects(act(db, initial, 'edit', { convertedId: 20 }), /campos indisponíveis/);
    await assert.rejects(act(db, initial, 'edit', { descriptionHtml: '<img src=x onerror=alert(1)>' }), /marcação não permitida/);
    const fields = { title: 'Atualizado', description: 'Mensagem', descriptionHtml: '<p style="text-align:right"><b>Mensagem</b></p>' };
    const edited = await act(db, initial, 'edit', fields, operation);
    assert.deepEqual(await act(db, initial, 'edit', fields, operation), edited);
    assert.equal(edited.request.requesterId, id(2));
    assert.equal(edited.revision, 1);
    assert.deepEqual(edited.events.at(-1).changes.title, { before: 'Pedido sintético', after: 'Atualizado' });
    await assert.rejects(act(db, initial, 'edit', fields), { code: '40001' });
    await assert.rejects(act(db, initial, 'edit', { title: 'Outra alteração' }, operation), /operação já utilizado/);

    await login(db, 3);
    assert.deepEqual((await bundle(db)).items, []);
    await assert.rejects(bundle(db, saved.id), { code: '42501' });
    await assert.rejects(act(db, edited, 'comment', { message: 'Acesso cruzado' }), { code: '42501' });
    await assert.rejects(db.query('select * from financeiro_solicitacoes_privado.eventos'), { code: '42501' });

    await login(db, 4);
    await assert.rejects(bundle(db), { code: '42501' });
    await login(db, null);
    await assert.rejects(bundle(db), { code: '42501' });
  } finally {
    await db.close();
  }
});

test('análise em andamento impede gravações alheias e devolução/reenvio protege a fila', async () => {
  const db = await buildFixture();
  try {
    await login(db, 2);
    const saved = await submit(db, 43);
    await login(db, 1);
    const initial = await item(db, saved.id);
    const lease = await act(db, initial, 'start_review');
    assert.equal(lease.state.reviewingBy, id(1));
    assert.ok(new Date(lease.state.reviewingUntil) > new Date());

    await login(db, 6);
    const otherAdmin = await item(db, saved.id);
    assert.ok(!otherAdmin.actions.includes('approve'));
    await assert.rejects(review(db, saved, true, 'Tentativa concorrente'), { code: '42501' });
    await login(db, 2);
    const locked = await item(db, saved.id);
    assert.ok(!locked.actions.includes('edit'));
    await assert.rejects(act(db, locked, 'edit', { title: 'Alteração concorrente' }), { code: '40001' });
    await assert.rejects(act(db, locked, 'cancel'), { code: '40001' });

    await login(db, 1);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select financeiro_solicitacoes_privado.pode_acessar($1,true) result',
      [saved.id])).rows[0], { result: true });
    await login(db, 2);
    await db.exec('reset role');
    assert.deepEqual((await db.query('select financeiro_solicitacoes_privado.pode_acessar($1,true) result',
      [saved.id])).rows[0], { result: false });

    await login(db, 1);
    const released = await act(db, lease, 'release_review');
    assert.equal(released.state.reviewingBy, null);
    await login(db, 6);
    const available = await item(db, saved.id);
    assert.ok(available.actions.includes('approve'));
    const leaseTwo = await act(db, available, 'start_review');
    assert.equal(leaseTwo.state.reviewingBy, id(6));
    await db.exec('reset role');
    await db.query("update financeiro_solicitacoes_privado.estado set analise_ate=now()-interval '1 minute' where solicitacao_id=$1",
      [saved.id]);

    await login(db, 1);
    const expired = await item(db, saved.id);
    assert.equal(expired.state.reviewingBy, null);
    const returned = await act(db, expired, 'return', { reason: 'Informe o centro de custo' });
    assert.equal(returned.state.status, 'Devolvida');
    assert.equal(returned.state.reviewingBy, null);
    await assert.rejects(review(db, saved, true, 'Atalho indevido'), { code: '42501' });

    await login(db, 2);
    const forOwner = await bundle(db, saved.id);
    assert.ok(forOwner.items[0].actions.includes('resubmit'));
    const notification = forOwner.notifications.find(entry => entry.action === 'return');
    assert.equal(notification.requestId, saved.id);
    assert.equal(notification.readAt, null);
    await login(db, 3);
    assert.equal((await db.query('select financeiro_ler_notificacao_solicitacao($1) as result',
      [notification.id])).rows[0].result, false);
    await login(db, 2);
    assert.equal((await db.query('select financeiro_ler_notificacao_solicitacao($1) as result',
      [notification.id])).rows[0].result, true);
    const resent = await act(db, forOwner.items[0], 'resubmit', { project: 'Projeto sintético' });
    assert.equal(resent.state.status, 'Pendente');
    assert.equal(resent.state.returnReason, 'Informe o centro de custo');
    assert.equal(resent.events.at(-1).action, 'resubmit');
    await login(db, 1);
    await assert.rejects(review(db, saved, false, 'Decisão sobre versão desatualizada'), { code: '40001' });
    const rejected = await review(db, resent.request, false, 'Conferido após reenvio');
    assert.equal(rejected.status, 'Rejeitada');
  } finally {
    await db.close();
  }
});

test('comentários internos ficam restritos; organização, categorias e exclusão são auditáveis', async () => {
  const db = await buildFixture();
  try {
    await login(db, 2);
    const saved = await submit(db, 44);
    const initial = await item(db, saved.id);
    await assert.rejects(act(db, initial, 'internal_comment', { message: 'Privado' }), { code: '42501' });
    const categoria = async name => (await db.query('select financeiro_categoria_solicitacao($1) data', [name])).rows[0].data;
    await assert.rejects(categoria('Materiais'), { code: '42501' });
    await login(db, 1);
    const category = await categoria(' Materiais   técnicos ');
    assert.deepEqual(await categoria('  materiais TECNICOS  '), category);
    await assert.rejects(act(db, initial, 'organize', { assigneeId: id(4) }), /administrador ativo/);
    await assert.rejects(act(db, initial, 'organize', { assigneeId: id(2) }), /administrador ativo/);
    const organized = await act(db, initial, 'organize', {
      assigneeId: id(6), categoryId: category.id, priority: 'Alta', deadline: '2099-11-30',
    });
    assert.equal(organized.state.assigneeName, 'ADM 2');
    assert.equal(organized.state.deadline, '2099-11-30');
    assert.deepEqual(organized.events.at(-1).changes.assigneeId, { before: null, after: id(6) });
    const withInternal = await act(db, organized, 'internal_comment', { message: 'Comentário sigiloso' });
    assert.equal(withInternal.events.at(-1).reason, 'Comentário sigiloso');

    await login(db, 2);
    const publicDetail = await item(db, saved.id);
    assert.ok(!JSON.stringify(publicDetail).includes('Comentário sigiloso'));
    assert.ok(!(await bundle(db)).notifications.some(entry => entry.action === 'internal_comment'));
    const cancelled = await act(db, publicDetail, 'cancel', { reason: 'Duplicidade no meu pedido' });
    assert.equal(cancelled.state.status, 'Cancelada');
    assert.equal(cancelled.events.at(-1).reason, 'Duplicidade no meu pedido');
    const operation = crypto.randomUUID();
    assert.equal(await act(db, cancelled, 'delete', { reason: 'Organização' }, operation), undefined);
    assert.equal(await act(db, cancelled, 'delete', { reason: 'Organização' }, operation), undefined);
    assert.deepEqual((await bundle(db)).items, []);
    await assert.rejects(bundle(db, saved.id), { code: '42501' });
    assert.deepEqual((await db.query('select financeiro_listar_solicitacoes() data')).rows[0].data, []);

    await login(db, 1);
    const deleted = await item(db, saved.id);
    assert.notEqual(deleted.state.deletedAt, null);
    assert.deepEqual(deleted.actions, ['restore']);
    await assert.rejects(review(db, saved, true, 'Atalho indevido'), { code: '42501' });
    const restored = await act(db, deleted, 'restore');
    assert.equal(restored.state.deletedAt, null);
    assert.equal(restored.state.status, 'Cancelada');
    assert.deepEqual(restored.request, saved);
    assert.ok(restored.events.some(event => event.action === 'delete' && event.reason === 'Organização'));
  } finally {
    await db.close();
  }
});

test('aprovação, revisão posterior e arquivo preservam versão e vínculos; reversão mantém a guarda', async () => {
  const db = await buildFixture();
  try {
    await login(db, 2);
    const saved = await submit(db, 45);
    const another = await submit(db, 46);
    await login(db, 1);
    const approved = await review(db, saved, true, 'Valor conferido');
    assert.equal(approved.status, 'Aprovada');
    assert.deepEqual(await review(db, saved, true, 'Valor conferido'), approved);
    const related = async () => (await db.query(`
      select chave, dados from financeiro_estado_modulos where chave in ('accountMasters','accountPayments') order by chave
    `)).rows;
    const before = await related();
    const approvedItem = await item(db, saved.id);
    assert.ok(approvedItem.state.hasEffect);

    await login(db, 2);
    const own = await item(db, saved.id);
    assert.ok(!own.actions.includes('edit'));
    assert.ok(!own.actions.includes('delete'));
    const proposal = await act(db, own, 'request_change', { reason: 'Complemento do valor',
      changes: { estimatedValue: 30 } });
    assert.equal(proposal.state.review.status, 'pending');
    assert.deepEqual(proposal.state.review.changes.estimatedValue, { before: 25, after: 30 });
    assert.deepEqual(proposal.request, approved);
    await assert.rejects(act(db, proposal, 'request_cancel', { reason: 'Pedido repetido' }), { code: '42501' });

    await login(db, 1);
    const decision = await act(db, proposal, 'decide_review', { approve: true, reason: 'Encaminhar ao Financeiro' });
    assert.deepEqual(decision.request, approved);
    assert.equal(decision.state.review.status, 'approved');
    const archived = await act(db, decision, 'archive');
    assert.equal(archived.state.status, 'Aprovada');
    assert.ok(archived.state.archivedAt);
    const activeAgain = await act(db, archived, 'unarchive');
    assert.equal(activeAgain.state.archivedAt, null);
    assert.deepEqual(await related(), before);

    const returned = await act(db, await item(db, another.id), 'return', { reason: 'Fixar o valor' });
    await db.exec('reset role');
    await db.exec(sql('rollback/financeiro_central_solicitacoes.sql'));
    await login(db, 1);
    assert.deepEqual((await item(db, another.id)).events, returned.events);
    await assert.rejects(act(db, activeAgain, 'archive'), { code: '42501' });
    await assert.rejects(review(db, another, true, 'Atalho no sistema anterior'), { code: '42501' });
    assert.deepEqual(await related(), before);
  } finally {
    await db.close();
  }
});

test('a instalação é aditiva e preserva complemento do veículo para aprovação antiga', async () => {
  let legacy;
  const db = await buildFixture(async fixture => {
    await login(fixture, 2);
    const created = await submit(fixture, 47, { category: 'trip', neededAt: '2099-01-01', vehicleId: 'gol' });
    await login(fixture, 1);
    const approved = await review(fixture, created, true, 'Viagem legada');
    await fixture.exec('reset role');
    legacy = { ...approved };
    delete legacy.vehicleId;
    await fixture.exec('alter table financeiro_estado_modulos disable trigger financeiro_guard_invoice_requests');
    await fixture.query(`
      update financeiro_estado_modulos set dados=jsonb_build_array($1::jsonb) where chave='invoiceRequests'
    `, [legacy]);
    await fixture.exec('alter table financeiro_estado_modulos enable trigger financeiro_guard_invoice_requests');
  });
  try {
    await login(db, 2);
    const untouched = await item(db, legacy.id);
    assert.deepEqual(untouched.request, legacy);
    assert.deepEqual(untouched.events, []);
    const complemented = await legacySave(db, { ...legacy, vehicleId: 'hb20' }, legacy);
    assert.deepEqual(complemented, { ...legacy, vehicleId: 'hb20' });
    assert.equal((await item(db, legacy.id)).state.status, 'Aprovada');
  } finally {
    await db.close();
  }
});
