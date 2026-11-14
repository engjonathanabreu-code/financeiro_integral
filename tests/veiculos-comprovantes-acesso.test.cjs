const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, login, id, ADM, STAFF, INATIVO } = require('./financeiro-db-fixture.cjs');
const { rpc, foto } = require('./veiculos-fixtures.cjs');

const sql = file => fs.readFileSync(path.join(__dirname, '../supabase', file), 'utf8');
const migration = name => sql('migrations/' + name + '.sql');
const fix = '20261114135757_financeiro_veiculos_comprovantes_autorizados';
const rollback = 'rollback/financeiro_veiculos_comprovantes_autorizados.sql';
const original = 'data:application/pdf;base64,JVBERi0xLjQK';
const read = async (db, key) => (await db.query(
  'select financeiro_listar_modulos_visiveis($1::text[]) resultado', [[key]]
)).rows[0].resultado[0];
const save = async (db, key, revision, data, operation) => (await db.query(
  'select financeiro_salvar_modulo_com_recibo($1,$2,$3,$4,true) resultado',
  [key, JSON.stringify(data), revision, id(operation)]
)).rows[0].resultado;
const apiDefinition = async db => (await db.query(`
  select md5(prosrc) hash, proacl::text acl, proconfig conf, prosecdef definer, proowner dono
  from pg_proc where oid='financeiro_veiculos_privado.api(text,jsonb)'::regprocedure
`)).rows[0];

test('Veículos: solicitante de viagem antiga vincula somente originais autorizados e preserva a regra na reversão', async () => {
  const db = await setup();
  try {
    await db.exec("alter table profiles add column nome text, add column email text; update profiles set nome='Perfil sintético';");
    await db.exec(sql('auditoria_acessos_20261005.sql'));
    await db.exec(sql('financeiro_veiculos.sql'));
    await db.exec(migration('20261028121955_financeiro_veiculos_agendamento'));
    await db.exec(migration('20261113173933_financeiro_veiculos_solicitante_canonico'));

    await login(db, ADM);
    const today = (await rpc(db, 'painel')).hoje;
    const legacyFile = (await db.query('select financeiro_guardar_arquivo($1,$2) id', [original, 'arquivo.pdf'])).rows[0].id;
    const approved = (number, trip, requesterId, estimatedValue) => ({
      id: id(number), category: 'trip', requesterId, status: 'Aprovada', vehicleId: 'hb20',
      neededAt: today, estimatedValue, reviewedAt: new Date().toISOString(), convertedId: trip
    });
    const trip = { id: 21, sector: 'Projetos', assigned: [], invoiceRequestId: id(30), vehicleId: 'hb20', city: 'Destino sintético' };
    const thirdPartyTrip = { id: 22, sector: 'Projetos', assigned: [], invoiceRequestId: id(32), vehicleId: 'hb20' };
    const adminPath = id(ADM) + '/financeiro-fiscal/legado.pdf';
    const missingPath = id(ADM) + '/financeiro-fiscal/ausente.pdf';
    const otherTripPath = id(ADM) + '/financeiro-fiscal/outra-viagem.pdf';
    const expense = (number, tripId, file) => ({ id: number, tripId, value: 25, date: today, type: 'Combustível', file });
    const storageFile = storagePath => ({ storagePath, storageBucket: 'documentos' });
    const legacyExpense = expense(42, 21, storageFile(adminPath));
    const indexedExpense = expense(43, 21, { arquivoId: legacyFile, name: 'arquivo.pdf' });
    const missingExpense = expense(44, 21, storageFile(missingPath));
    const wrongBucket = expense(45, 21, { storagePath: adminPath, storageBucket: 'outro' });
    const unrelatedExpense = expense(46, 22, storageFile(otherTripPath));
    const modules = {
      trips: [trip, thirdPartyTrip],
      invoiceRequests: [approved(30, 21, id(STAFF), 10), approved(31, 23, id(STAFF), 0), approved(32, 22, id(6), 100)],
      usersMvp: [],
      tripExpenses: [legacyExpense, indexedExpense, missingExpense, wrongBucket, unrelatedExpense],
      tripDocuments: []
    };

    await db.exec('reset role');
    await db.query("insert into profiles values($1,'Topografia','Topografia',true,'Outra pessoa',null)", [id(6)]);
    for (const [key, records] of Object.entries(modules)) {
      await db.query(
        'insert into financeiro_estado_modulos(chave,dados,updated_by,updated_at) values($1,$2,$3,now())',
        [key, JSON.stringify(records), id(ADM)]
      );
    }
    await db.query("insert into storage.objects values('documentos',$1),('outro',$2),('documentos',$3)", [adminPath, missingPath, otherTripPath]);
    for (const name of [
      '20261113190000_financeiro_modulos_revisao', '20261113190500_financeiro_solicitacoes_acesso',
      '20261113191500_financeiro_anexos_acesso', '20261113192000_financeiro_guarda_registros',
      '20261114104155_financeiro_recibos_sincronizacao'
    ]) await db.exec(migration(name));
    const previous = await apiDefinition(db);

    await login(db, STAFF);
    assert.deepEqual((await read(db, 'trips')).dados, [trip], 'solicitante ativo sem espelho local e fora do setor histórico');
    const requests = (await rpc(db, 'painel')).solicitacoes;
    assert.equal(requests.find(r => r.id === id(30)).impedimento, null);
    assert.match(requests.find(r => r.id === id(31)).impedimento, /orçamento maior que zero/);
    const retirada = {
      id: id(50), veiculo_id: 'hb20', solicitacao_id: id(30), retirada_em: new Date().toISOString(),
      km_inicial: 100, destino: 'Destino sintético', foto, tanque_inicial_cheio: true
    };
    const use = await rpc(db, 'retirar', retirada);
    assert.equal(use.viagem_id, '21');
    assert.equal((await rpc(db, 'retirar', retirada)).id, use.id);
    const devolver = km => rpc(db, 'devolver', {
      id: use.id, devolucao_em: new Date().toISOString(), km_final: km, foto, ciclo_confirmado: true
    });
    await assert.rejects(devolver(99), /quilometragem/);
    assert.equal(Number((await devolver(121.5)).km_final), 121.5);
    assert.equal((await rpc(db, 'painel')).arquivos.filter(a => a.uso_id === use.id).length, 2);
    const link = (record, expected = record) => rpc(db, 'vincular', {
      id: use.id, despesa_id: String(record.id), litros: 7, esperado: expected
    });
    assert.equal((await db.query('select name from storage.objects where name=$1', [adminPath])).rows.length, 1);
    await assert.rejects(link(legacyExpense), /Original do comprovante não encontrado/);

    await db.exec('reset role');
    await db.exec(migration(fix));
    const updated = await apiDefinition(db);
    assert.notEqual(updated.hash, previous.hash);
    assert.deepEqual({ ...updated, hash: previous.hash }, previous);
    await assert.rejects(db.exec(migration(fix)), /A API de Veículos mudou/);
    await db.exec('rollback');
    assert.deepEqual(await apiDefinition(db), updated);
    await login(db, STAFF);
    await assert.rejects(link(missingExpense), /Original do comprovante não encontrado/);
    await assert.rejects(link(wrongBucket), /Original do comprovante não encontrado/);
    await assert.rejects(link(unrelatedExpense), /Selecione comprovante de combustível desta viagem/);
    await assert.rejects(link(legacyExpense, { ...legacyExpense, value: 26 }), /Despesa alterada/);
    await link(legacyExpense);
    await link(indexedExpense);

    const documents = await read(db, 'tripDocuments');
    const document = { id: 70, tripId: 21, expenseId: 43, file: indexedExpense.file };
    assert.equal((await save(db, 'tripDocuments', documents.revisao, [document], 71)).status, 'salvo');
    assert.deepEqual((await read(db, 'tripDocuments')).dados, [document]);
    assert.equal((await db.query('select conteudo from financeiro_arquivos where id=$1', [legacyFile])).rows[0].conteudo, original);
    const links = (await rpc(db, 'painel')).despesas;
    assert.equal(links.length, 2);
    assert.equal(Number(links[0].centavos), 2500);

    await login(db, 6);
    await assert.rejects(link(legacyExpense), /Sem acesso ao uso/);
    assert.equal((await db.query('select conteudo from financeiro_arquivos where id=$1', [legacyFile])).rows.length, 0);
    assert.equal((await db.query('select name from storage.objects where name=$1', [adminPath])).rows.length, 0);
    assert.deepEqual((await read(db, 'tripDocuments')).dados, []);
    assert.equal((await rpc(db, 'painel')).usos.length, 0);
    await login(db, INATIVO);
    await assert.rejects(link(legacyExpense), /Sessão ativa/);

    await db.exec('reset role');
    await db.exec(sql(rollback));
    assert.deepEqual(await apiDefinition(db), previous);
    await login(db, STAFF);
    await assert.rejects(link(legacyExpense), /Original do comprovante não encontrado/);
    assert.deepEqual((await rpc(db, 'painel')).despesas, links, 'vínculos existentes não são alterados na reversão');
  } finally {
    await db.close();
  }
});
