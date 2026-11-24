const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, login, id } = require('./veiculos-fixtures.cjs');
const read = name => fs.readFileSync(path.join(__dirname, '../supabase', name), 'utf8');
const migration = 'migrations/20261124185717_financeiro_vinculo_solicitante_aprovacao.sql';
const rollback = 'rollback/financeiro_vinculo_solicitante_aprovacao.sql';
const localId = uuid => [...uuid].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) || 1;

async function fixture(install = true) {
  const db = await setup();
  await db.exec(`alter table financeiro_estado_modulos enable row level security;
    create policy teste_base on financeiro_estado_modulos for all to authenticated using(true) with check(true);
    create table financeiro_contas(id text primary key);
    create table financeiro_pagamentos(id text primary key);`);
  for (const file of ['20261113190500_financeiro_solicitacoes_acesso.sql',
    '20261114135633_financeiro_integridade_solicitacoes.sql',
    '20261116151526_financeiro_central_solicitacoes.sql',
    '20261116194500_financeiro_conferir_viagem_repetida.sql']) await db.exec(read('migrations/' + file));
  if (install) await db.exec(read(migration));
  return db;
}
async function submit(db, n = 70, fields = {}) {
  await login(db, 3);
  return (await db.query('select financeiro_save_invoice_request($1,null) r', [{
    id: id(n), title: 'Reunião sintética', description: 'Alinhamento', destination: 'Destino sintético novo',
    category: 'trip', status: 'Pendente', neededAt: '2099-11-25', vehicleId: 'hb20', estimatedValue: 60,
    ...(fields.category && fields.category !== 'trip' ? { vehicleId: '', destination: '' } : {}), ...fields,
  }])).rows[0].r.find(r => r.id === id(n));
}
async function review(db, request, approved = true) {
  return (await db.query('select financeiro_revisar_solicitacao($1,$2,$3,$4) r',
    [request.id, request, approved, approved ? 'Aprovado' : 'Rejeitado'])).rows[0].r.find(r => r.id === request.id);
}
async function moduleData(db, key) {
  return (await db.query('select dados from financeiro_estado_modulos where chave=$1', [key])).rows[0]?.dados;
}
async function snapshot(db) {
  return (await db.query('select chave,dados,updated_by,updated_at from financeiro_estado_modulos order by chave')).rows;
}
async function setUsers(db, users) {
  await db.exec('reset role');
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='usersMvp'", [users]);
  await login(db, 1);
}

test('reproduz falta de vínculo e aprova pedido editado com vínculo canônico, preservação e retry', async () => {
  const db = await fixture(false);
  try {
    const original = await submit(db);
    const current = (await db.query('select financeiro_central_solicitacoes($1) r', [original.id])).rows[0].r.items[0];
    const edited = (await db.query('select financeiro_acao_solicitacao($1,$2,$3,$4,$5,$6) r', [
      original.id, current.revision, 'edit', { neededAt: '2099-11-26', vehicleId: 'gol' }, crypto.randomUUID(), original,
    ])).rows[0].r.items[0].request;
    await login(db, 1);
    const before = await snapshot(db);
    await assert.rejects(review(db, edited), /vínculo único/);
    assert.deepEqual(await snapshot(db), before);
    await db.exec('reset role');
    await db.exec(read(migration));
    assert.deepEqual(await snapshot(db), before, 'instalação não altera registros');
    await login(db, 1);
    const usersBefore = await moduleData(db, 'usersMvp');
    const tripsBefore = await moduleData(db, 'trips');
    const approved = await review(db, edited);
    const users = await moduleData(db, 'usersMvp');
    const added = users.find(u => u.erpId === id(3));
    assert.deepEqual(users.slice(0, -1), usersBefore);
    assert.deepEqual(added, { id: localId(id(3)), erpId: id(3), name: 'Motorista B',
      email: 'b@fixture.test', role: 'Funcionário', sector: 'Comercial', active: true, source: 'ERP' });
    const trips = await moduleData(db, 'trips');
    assert.deepEqual(trips.slice(0, -1), tripsBefore);
    const trip = trips.at(-1);
    assert.equal(approved.status, 'Aprovada');
    assert.equal(trip.id, approved.convertedId);
    assert.equal(trip.invoiceRequestId, edited.id);
    assert.equal(trip.start, '2099-11-26');
    assert.equal(trip.vehicleId, 'gol');
    assert.equal(trip.plannedAmount, 60);
    assert.deepEqual(trip.assigned, [added.id]);
    const committed = await snapshot(db);
    assert.deepEqual(await review(db, edited), approved);
    assert.deepEqual(await snapshot(db), committed, 'retry não duplica vínculo nem viagem');
    const other = await submit(db, 71, { destination: 'Outra cidade' });
    await login(db, 1);
    await review(db, other);
    assert.deepEqual(await moduleData(db, 'usersMvp'), users);
  } finally { await db.close(); }
});

test('preserva ID local existente e bloqueia identidade ambígua, inativa ou colidida', async t => {
  for (const [name, users, error] of [
    ['vínculo existente', [{ id: 818, erpId: id(3), custom: 'preservado' }], null],
    ['UUID duplicado', [{ id: 818, erpId: id(3) }, { id: 819, erpId: id(3) }], /vínculo único/],
    ['inativo no financeiro', [{ id: 818, erpId: id(3), active: false }], /vínculo único/],
    ['ID duplicado', [{ id: 818, erpId: id(3) }, { id: 818, erpId: id(2) }], /vínculo único/],
    ['colisão de hash', [{ id: localId(id(3)), erpId: id(2) }], /Identificador financeiro em uso/],
    ['cadastro legado por email', [{ id: 818, email: ' B@fixture.test ' }], /vínculo ERP/],
    ['cadastro inválido', { invalid: true }, /cadastro de usuários/],
  ]) await t.test(name, async () => {
    const db = await fixture();
    try {
      const request = await submit(db);
      await setUsers(db, users);
      const before = await snapshot(db);
      if (error) {
        await assert.rejects(review(db, request), error);
        assert.deepEqual(await snapshot(db), before);
      } else {
        await review(db, request);
        assert.deepEqual(await moduleData(db, 'usersMvp'), users);
        assert.deepEqual((await moduleData(db, 'trips')).at(-1).assigned, [818]);
      }
    } finally { await db.close(); }
  });
});

test('falha posterior na conversão desfaz também a criação do vínculo', async () => {
  const db = await fixture();
  try {
    const request = await submit(db);
    await db.exec(`reset role;
      create function teste_falhar_viagem() returns trigger language plpgsql as $$begin
        if new.chave='trips' then raise exception 'Falha sintética posterior'; end if; return new; end$$;
      create trigger teste_falhar_viagem before insert or update on financeiro_estado_modulos
        for each row execute function teste_falhar_viagem();`);
    await login(db, 1);
    const before = await snapshot(db);
    await assert.rejects(review(db, request), /Falha sintética posterior/);
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.close(); }
});

test('somente ADM aprova; rejeição e compras não criam vínculos; perfil inativo bloqueia', async () => {
  const db = await fixture();
  try {
    const request = await submit(db);
    for (const actor of [3, 5, 4, null]) {
      await login(db, actor);
      await assert.rejects(review(db, request), { code: '42501' });
      await assert.rejects(db.query('select financeiro_solicitacoes_privado.garantir_vinculo_solicitante($1)', [id(3)]), { code: '42501' });
    }
    await db.exec('reset role');
    await db.query('update profiles set ativo=false where id=$1', [id(3)]);
    await login(db, 1);
    const before = await snapshot(db);
    await assert.rejects(review(db, request), /perfil ativo/);
    assert.deepEqual(await snapshot(db), before);
    await db.exec('reset role');
    await db.query('update profiles set ativo=true where id=$1', [id(3)]);
    await login(db, 1);
    assert.equal((await review(db, request, false)).status, 'Rejeitada');
    assert.deepEqual(await moduleData(db, 'usersMvp'), before.find(m => m.chave === 'usersMvp').dados);
    const purchase = await submit(db, 71, { category: 'purchase' });
    // Compra é validada nos testes canônicos de contas; sua rejeição também dispensa espelho.
    await login(db, 1);
    await review(db, purchase, false);
    assert.deepEqual(await moduleData(db, 'usersMvp'), before.find(m => m.chave === 'usersMvp').dados);
  } finally { await db.close(); }
});

test('cria módulo ausente e orçamento atribuído por UUID; homônimo não é usado para vincular', async () => {
  const db = await fixture();
  try {
    const request = await submit(db, 70, { category: 'budget' });
    await db.exec("reset role; delete from financeiro_estado_modulos where chave='usersMvp'");
    await login(db, 1);
    const approved = await review(db, request);
    const user = (await moduleData(db, 'usersMvp'))[0];
    const budget = (await moduleData(db, 'budgetRecords')).find(b => b.id === approved.convertedId);
    assert.equal(user.erpId, id(3));
    assert.deepEqual(budget.assigned, [localId(id(3))]);
    assert.equal(budget.requestedById, localId(id(3)));
    await setUsers(db, [{ id: 818, erpId: id(2), name: 'Motorista B' }]);
    const trip = await submit(db, 71);
    await login(db, 1);
    await review(db, trip);
    assert.equal((await moduleData(db, 'usersMvp')).length, 2);
    assert.deepEqual((await moduleData(db, 'trips')).at(-1).assigned, [localId(id(3))]);
  } finally { await db.close(); }
});

test('mantém conferência de viagens semelhantes e protege instalação/reversão sem apagar dados', async () => {
  const db = await fixture(false);
  try {
    const functions = (await db.query(`select oid::regprocedure::text signature,prosrc,proacl,prosecdef,proconfig
      from pg_proc where proname in ('financeiro_revisar_solicitacao','revisar_solicitacao_com_central') order by 1`)).rows;
    await db.exec(read(migration));
    const after = (await db.query(`select oid::regprocedure::text signature,prosrc,proacl,prosecdef,proconfig
      from pg_proc where proname in ('financeiro_revisar_solicitacao','revisar_solicitacao_com_central') order by 1`)).rows;
    for (const original of functions) {
      const changed = after.find(f => f.signature === original.signature);
      assert.deepEqual({ ...changed, prosrc: original.prosrc }, original);
      if (!original.signature.startsWith('financeiro_solicitacoes_privado.financeiro_revisar_solicitacao('))
        assert.equal(changed.prosrc, original.prosrc);
    }
    const first = await submit(db);
    const second = await submit(db, 71);
    await login(db, 1);
    await review(db, first);
    const committed = await snapshot(db);
    await assert.rejects(review(db, second), { code: 'PT409' });
    assert.deepEqual(await snapshot(db), committed);
    await db.exec('reset role');
    await db.exec(read(rollback));
    assert.deepEqual(await snapshot(db), committed);
    assert.deepEqual((await db.query(`select oid::regprocedure::text signature,prosrc,proacl,prosecdef,proconfig
      from pg_proc where proname in ('financeiro_revisar_solicitacao','revisar_solicitacao_com_central') order by 1`)).rows, functions);
    assert.equal((await db.query("select to_regprocedure('financeiro_solicitacoes_privado.garantir_vinculo_solicitante(uuid)') f")).rows[0].f, null);
    await db.exec(read(migration));
    await db.exec(`create or replace function financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(p_id text,p_esperado jsonb,p_aprovar boolean,p_resposta text)
      returns jsonb language plpgsql security definer set search_path='' as $$begin return '[]'::jsonb; end$$;`);
    await assert.rejects(db.exec(read(rollback)), /divergiu/);
    await db.exec('rollback');
    assert.deepEqual(await snapshot(db), committed);
    // Instalação com corpo desconhecido também falha atomicamente.
    await db.exec('drop function financeiro_solicitacoes_privado.garantir_vinculo_solicitante(uuid)');
    await assert.rejects(db.exec(read(migration)), /divergiu/);
    await db.exec('rollback');
    assert.equal((await db.query("select to_regprocedure('financeiro_solicitacoes_privado.garantir_vinculo_solicitante(uuid)') f")).rows[0].f, null);
    assert.deepEqual(await snapshot(db), committed);
  } finally { await db.close(); }
});
