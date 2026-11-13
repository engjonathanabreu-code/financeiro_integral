const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, login, id, approval } = require('./veiculos-fixtures.cjs');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261113190500_financeiro_solicitacoes_acesso.sql'), 'utf8');

test('solicitações restringem lista e gravação, preservam legado e complemento de veículo', async () => {
  const db = await setup();
  try {
    await login(db, 1);
    const previous = { ...approval(41), id: 'legado', status: 'Aprovada' };
    delete previous.vehicleId;
    await db.exec('reset role');
    await db.query("insert into financeiro_estado_modulos(chave,dados) values('invoiceRequests',$1) on conflict(chave) do update set dados=excluded.dados", ['[]']);
    await db.exec("alter table financeiro_estado_modulos disable trigger financeiro_guard_invoice_requests");
    await db.query("update financeiro_estado_modulos set dados=$1 where chave='invoiceRequests'", [JSON.stringify([previous])]);
    await db.exec("alter table financeiro_estado_modulos enable trigger financeiro_guard_invoice_requests");
    await db.exec("alter table financeiro_estado_modulos enable row level security");
    await db.exec("create policy teste_base on financeiro_estado_modulos for all to authenticated using(true) with check(true)");
    await db.exec(migration);
    await login(db, 2);
    assert.deepEqual((await db.query("select dados from financeiro_estado_modulos where chave='invoiceRequests'")).rows, []);
    const own = (await db.query('select financeiro_listar_solicitacoes() as dados')).rows[0].dados;
    assert.deepEqual(own, [previous]);
    const changed = { ...previous, vehicleId: 'gol' };
    const write = async (record, expected = null) => (await db.query(
      'select financeiro_save_invoice_request($1,$2) as dados',
      [JSON.stringify(record), expected ? JSON.stringify(expected) : null],
    )).rows[0].dados;
    assert.deepEqual(await write(changed, previous), [changed]);
    const request = { id: id(42), category: 'purchase', requesterId: id(2), status: 'Pendente' };
    await assert.rejects(write({ ...request, id: 'inválido' }), /Identificador/);
    const saved = await write({ ...request, requesterName: 'Terceiro', requesterSector: 'Outro', requesterLocalUserId: 999 });
    assert.equal(saved.length, 2);
    assert.equal(saved[1].requesterName, 'Motorista A');
    assert.equal(saved[1].requesterSector, 'Projetos');
    assert.equal('requesterLocalUserId' in saved[1], false);
    await login(db, 3);
    assert.deepEqual((await db.query('select financeiro_listar_solicitacoes() as dados')).rows[0].dados, []);
    await assert.rejects(write({ ...changed, vehicleId: 'hb20' }, changed), /Somente ADM/);
    await login(db, 1);
    assert.equal((await db.query('select financeiro_listar_solicitacoes() as dados')).rows[0].dados.length, 2);
  } finally {
    await db.close();
  }
});

test('revisão atômica deriva setor e atribuição canônicos, mantém histórico e repete sem duplicar', async () => {
  const db = await setup();
  try {
    await db.exec(migration);
    const submit = async (n, category, fields = {}) => {
      await login(db, 2);
      const draft = { id: id(n), category, requesterId: id(2), requesterName: 'Rótulo adulterado',
        requesterLocalUserId: 999, requesterSector: 'Setor adulterado', status: 'Pendente',
        title: 'Solicitação sintética', estimatedValue: 25, ...fields };
      const saved = (await db.query('select financeiro_save_invoice_request($1) as dados', [JSON.stringify(draft)])).rows[0].dados
        .find(item => item.id === draft.id);
      // Solicitações anteriores à migração podem carregar rótulos/IDs locais incorretos.
      const old = { ...saved, requesterName: draft.requesterName, requesterSector: draft.requesterSector,
        requesterLocalUserId: draft.requesterLocalUserId };
      await login(db, 1);
      await db.query(`update financeiro_estado_modulos set dados=(select jsonb_agg(
        case when value->>'id'=$1 then $2::jsonb else value end order by ord)
        from jsonb_array_elements(dados) with ordinality as t(value,ord)) where chave='invoiceRequests'`,
      [draft.id, JSON.stringify(old)]);
      await login(db, 2);
      return old;
    };
    const decide = async (record, approved = true, answer = 'Conferido') => (await db.query(
      'select financeiro_revisar_solicitacao($1,$2,$3,$4) as dados',
      [record.id, JSON.stringify(record), approved, answer],
    )).rows[0].dados.find(item => item.id === record.id);
    const items = async key => (await db.query('select dados from financeiro_estado_modulos where chave=$1', [key])).rows[0]?.dados || [];
    const request = await submit(52, 'trip', { vehicleId: 'gol', neededAt: '2099-01-01' });
    await assert.rejects(decide(request), /Somente ADM/);
    await login(db, 1);
    await assert.rejects(decide({ ...request, title: 'Revisão antiga' }), /Solicitação atualizada/);
    const results = await Promise.allSettled([decide(request), decide(request, false)]);
    const [accepted, conflicting] = results;
    assert.equal(accepted.status, 'fulfilled');
    assert.equal(conflicting.status, 'rejected');
    assert.match(conflicting.reason.message, /Solicitação atualizada/);
    const approved = accepted.value;
    assert.equal(approved.status, 'Aprovada');
    assert.deepEqual(await decide(request), approved);
    await assert.rejects(decide(request, false), /Solicitação atualizada/);
    assert.equal((await items('trips')).filter(t => t.invoiceRequestId === request.id).length, 1);
    const trip = (await items('trips')).find(t => t.id === approved.convertedId);
    assert.deepEqual(trip.assigned, [2]);
    assert.equal(trip.employee, 'Motorista A');
    assert.equal(trip.sector, 'Projetos');

    await db.exec('reset role');
    const access = async actor => (await db.query('select financeiro_privado.solicitante_da_viagem($1,$2) as allowed',
      [JSON.stringify({ ...trip, assigned: [], sector: 'Histórico' }), id(actor)])).rows[0].allowed;
    assert.equal(await access(2), true);
    assert.equal(await access(3), false);

    const budget = await submit(53, 'budget');
    await login(db, 1);
    const approvedBudget = await decide(budget);
    const entry = (await items('budgetRecords')).find(t => t.id === approvedBudget.convertedId);
    assert.equal(entry.requestedById, 2);
    assert.deepEqual(entry.assignedDirect, [2]);

    const purchase = await submit(54, 'purchase');
    await db.exec('reset role');
    await db.exec(`create function public.falha_sintetica_conversao() returns trigger language plpgsql as $$
      begin if new.chave='accountMasters' then raise exception 'Falha sintética no cadastro'; end if; return new; end
      $$; create trigger falha_sintetica before insert on financeiro_estado_modulos
      for each row execute function public.falha_sintetica_conversao();`);
    await login(db, 1);
    await assert.rejects(decide(purchase), /Falha sintética/);
    assert.equal((await items('invoiceRequests')).find(t => t.id === purchase.id).status, 'Pendente');
    assert.equal((await items('accountPayments')).length, 0);
    assert.equal((await items('accountMasters')).length, 0);
    await db.exec('reset role;drop trigger falha_sintetica on financeiro_estado_modulos;');
    await login(db, 1);
    const bought = await decide(purchase);
    const payments = await items('accountPayments');
    assert.equal(payments[0].accountId, bought.convertedId);
    assert.equal(payments[0].invoiceRequestId, purchase.id);
    assert.deepEqual(await decide(purchase), bought);
    assert.equal((await items('accountPayments')).length, 1);
  } finally {
    await db.close();
  }
});
