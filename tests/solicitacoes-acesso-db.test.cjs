const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, login, id, approval } = require('./veiculos-fixtures.cjs');

const sql = file => fs.readFileSync(path.join(__dirname, '../supabase', file), 'utf8');
const source = 'migrations/20261114135633_financeiro_integridade_solicitacoes.sql';

async function installIntegrity(db, accounts = false) {
  await db.exec(sql('migrations/20261113190500_financeiro_solicitacoes_acesso.sql'));
  if (accounts) {
    await db.exec('create table auth.users(id uuid primary key);');
    await db.exec(sql('financeiro_contas_automacao.sql').replace('create extension if not exists pgcrypto;', ''));
    await db.exec(sql('migrations/20261113193000_financeiro_contas_canonicas.sql'));
  } else {
    await db.exec('create table financeiro_contas(id text primary key); create table financeiro_pagamentos(id text primary key);');
  }
  await db.exec(sql(source));
}

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
    await installIntegrity(db);
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
    assert.equal(saved[1].history[0].by, 'Motorista A');
    assert.deepEqual(await write(request), saved);
    await assert.rejects(write({ ...request, title: 'Mudança no reenvio' }), /identificador/);
    await login(db, 3);
    assert.deepEqual((await db.query('select financeiro_listar_solicitacoes() as dados')).rows[0].dados, []);
    await assert.rejects(write({ ...changed, vehicleId: 'hb20' }, changed), /Somente ADM/);
    await login(db, 1);
    assert.equal((await db.query('select financeiro_listar_solicitacoes() as dados')).rows[0].dados.length, 2);
    await assert.rejects(write({ ...saved[1], requesterId: id(3) }, saved[1]), /identidade/);
    await assert.rejects(write({ ...saved[1], reviewedBy: 'Outro' }, saved[1]), /identidade/);
    await assert.rejects(db.query("update financeiro_estado_modulos set dados='[]' where chave='invoiceRequests'"), /fluxo de Solicitações/);
    await assert.rejects(db.query("delete from financeiro_estado_modulos where chave='invoiceRequests'"), /fluxo de Solicitações/);
    await db.exec('reset role');
    const orphan = { ...saved[1], status: 'Aprovada', convertedId: 123 };
    await assert.rejects(db.query("update financeiro_estado_modulos set dados=dados||$1::jsonb where chave='invoiceRequests'",
      [JSON.stringify([{ ...orphan, id: id(65) }])]), /vínculo recíproco/);
    // Complementar o veículo legado não revalida outras aprovações já existentes.
    assert.equal((await db.query("select dados from financeiro_estado_modulos where chave='invoiceRequests'")).rows[0].dados.length, 2);
  } finally {
    await db.close();
  }
});

test('revisão atômica deriva setor e atribuição canônicos, mantém histórico e repete sem duplicar', async () => {
  const db = await setup();
  try {
    await db.exec("create function public.can_access_fin_recebimentos() returns boolean language sql stable as $$select public.is_admin()$$;");
    await installIntegrity(db, true);
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
      await db.exec('reset role');
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
    await assert.rejects(db.query("update financeiro_estado_modulos set dados='[]' where chave='trips'"), /Preserve o registro/);
    const tripItems = await items('trips');
    const rewritten = tripItems.map(t => t.id === trip.id ? { ...t, invoiceRequestId: null } : t);
    await assert.rejects(db.query("update financeiro_estado_modulos set dados=$1 where chave='trips'", [JSON.stringify(rewritten)]), /Preserve o registro/);
    const edited = tripItems.map(t => t.id === trip.id ? { ...t, report: 'Relatório legítimo' } : t);
    await db.query("update financeiro_estado_modulos set dados=$1 where chave='trips'", [JSON.stringify(edited)]);

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
      begin if new.chave='accountPayments' then raise exception 'Falha sintética no cadastro'; end if; return new; end
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
    assert.equal(payments[0].id, bought.convertedPaymentId);
    assert.equal((await items('accountMasters'))[0].invoicePaymentId, bought.convertedPaymentId);
    assert.equal(payments[0].value, purchase.estimatedValue);
    assert.match(payments[0].due,/^\d{4}-\d{2}-\d{2}$/);
    await assert.rejects(db.query("update financeiro_estado_modulos set dados='[]' where chave='accountPayments'"), /Preserve o registro|Arquive o registro/);
    await db.query(`update financeiro_estado_modulos set dados=jsonb_set(jsonb_set(dados,'{0,due}','"2099-03-01"'),'{0,value}','30')
      where chave='accountPayments'`);
    assert.deepEqual(await decide(purchase), bought);
    assert.equal((await items('accountPayments'))[0].due, '2099-03-01');
    assert.equal((await items('accountPayments'))[0].value, 30);
    assert.equal((await items('accountPayments')).length, 1);
    const projected = (await db.query('select financeiro_projetar_contas_confirmadas() p')).rows[0].p;
    assert.equal(projected.falhas, 0);
    await db.exec('reset role');
    const projectedPayment = (await db.query('select conta_id,vencimento::text,valor::numeric from financeiro_pagamentos')).rows[0];
    assert.deepEqual(projectedPayment, { conta_id: String(bought.convertedId), vencimento: '2099-03-01', valor: '30.00' });
    await login(db, 1);
    const archived = await db.query('select financeiro_arquivar_conta_pagamento($1,$2,$3,$4) r',
      ['conta', String(bought.convertedId), JSON.stringify((await items('accountMasters'))[0]), JSON.stringify(await items('accountPayments'))]);
    assert.equal(archived.rows[0].r, true);
    assert.equal((await items('accountMasters'))[0].active, false);
    assert.equal((await items('accountPayments'))[0].status, 'Cancelada');
    assert.equal((await items('accountPayments'))[0].invoiceRequestId, purchase.id);
    assert.deepEqual(await decide(purchase), bought);

    await db.exec('reset role');
    const stateBeforeRollback = (await db.query('select chave,dados from financeiro_estado_modulos order by chave')).rows;
    await db.exec(sql('rollback/financeiro_integridade_solicitacoes.sql'));
    assert.deepEqual((await db.query('select chave,dados from financeiro_estado_modulos order by chave')).rows, stateBeforeRollback);
    assert.equal((await db.query(`select md5(prosrc) as hash from pg_proc
      where oid='public.financeiro_revisar_solicitacao(text,jsonb,boolean,text)'::regprocedure`)).rows[0].hash,
      '1535ee9647ab7dc53af65c18a2c7c9ef');
    await db.exec(sql(source));
    assert.deepEqual((await db.query('select chave,dados from financeiro_estado_modulos order by chave')).rows, stateBeforeRollback);
  } finally {
    await db.close();
  }
});
