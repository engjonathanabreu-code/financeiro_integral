const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, login, ADM, STAFF, FIN } = require('./financeiro-db-fixture.cjs');

const sql = file => fs.readFileSync(path.join(__dirname, '../supabase', file), 'utf8');
const migrate = 'migrations/20261113193000_financeiro_contas_canonicas.sql';

const account = { id: 101, name: 'Conta sintética', active: true, recurrence: 'Mensal', history: [{ action: 'Criada' }] };
const due = { id: 201, accountId: 101, due: '2026-11-15', value: 32.05, status: 'A vencer', file: { arquivoId: 'fixture' } };
const paid = { id: 202, accountId: 101, due: '2026-11-01', value: 28, status: 'Paga', paidAt: '2026-11-01', history: [{ action: 'Quitada' }] };
const legacy = { id: 'espelho-legado', accountId: 101, due: '2026-11-25', value: 17, status: 'Paga' };

async function fixture(t, {payments = [due, paid], matching = false} = {}) {
  const db = await setup();
  t.after(() => db.close());
  await db.exec(`
    drop table financeiro_whatsapp_envios,financeiro_pagamentos,financeiro_contas;
    create table auth.users(id uuid primary key);
  `);
  await db.exec(sql('financeiro_contas_automacao.sql').replace('create extension if not exists pgcrypto;', ''));
  await db.exec(`
    grant select,insert,update,delete on financeiro_contas,financeiro_pagamentos to authenticated;
    insert into financeiro_contas(id,nome,dados) values('101','Nome antigo','{"auditoria":"preservar"}');
    insert into financeiro_pagamentos(id,conta_id,vencimento,valor,status)
      values('${legacy.id}','101','${legacy.due}',${legacy.value},'${legacy.status}');
  `);
  await db.query("insert into financeiro_estado_modulos(chave,dados,updated_at) values('accountMasters',$1,now()),('accountPayments',$2,now())", [
    JSON.stringify([account]), JSON.stringify(payments),
  ]);
  await db.exec(sql('auditoria_acessos_20261005.sql'));
  await db.exec(sql('migrations/20261113190000_financeiro_modulos_revisao.sql'));
  if(matching){
    await db.query("update financeiro_contas set nome=$1,fornecedor='',categoria='',setor='',matricula_cadastro='',recorrencia=$2,dados=$3 where id='101'",[
      account.name,account.recurrence,JSON.stringify(account),
    ]);
    for(const payment of payments)await db.query(`insert into financeiro_pagamentos(id,conta_id,vencimento,valor,status,forma_pagamento,codigo_pagamento,pago_em,dados)
      values($1,'101',$2,$3,$4,'','',$5,$6)`,[
      String(payment.id),payment.due,payment.value,payment.status,payment.paidAt??null,JSON.stringify(payment),
    ]);
  }
  await db.exec(sql(migrate));
  return db;
}

async function projection(db) {
  return (await db.query('select financeiro_projetar_contas_confirmadas() as r')).rows[0].r;
}
async function archive(db, kind, record, payments = null) {
  return (await db.query('select financeiro_arquivar_conta_pagamento($1,$2,$3,$4) as r', [
    kind, String(record.id), JSON.stringify(record), payments ? JSON.stringify(payments) : null,
  ])).rows[0].r;
}
async function moduleRows(db, key) {
  return (await db.query('select dados from financeiro_estado_modulos where chave=$1', [key])).rows[0].dados;
}

test('primeira projeção e edições legadas preservam divergências e espelho legado', async t => {
  const db = await fixture(t);
  await login(db, STAFF);
  await assert.rejects(projection(db), /Somente|somente/);
  await login(db, FIN);
  await assert.rejects(db.query("delete from financeiro_pagamentos where id='espelho-legado'"), /permission denied/);
  assert.deepEqual(await projection(db), { atualizadas: 0, falhas: 0, revisao: 3 });
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='accountMasters'",[JSON.stringify([{...account,name:'Editada'}])]);
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='accountPayments'",[JSON.stringify([{...due,value:54},paid,{...legacy,value:65},{...due,id:250,due:'2026-11-26'}])]);
  assert.deepEqual(await projection(db), { atualizadas: 0, falhas: 0, revisao: 5 });
  assert.equal((await db.query("select nome from financeiro_contas where id='101'")).rows[0].nome,'Nome antigo');
  assert.deepEqual((await db.query('select id from financeiro_pagamentos order by id')).rows.map(p=>p.id), [legacy.id]);
  await db.exec('reset role');
  assert.equal((await db.query('select * from financeiro_privado.contas_espelho_historico')).rows.length,0);
  const baseline=(await db.query('select tabela,registro_id,canonico,espelho,sincronizavel from financeiro_privado.contas_espelho_base')).rows;
  assert.equal(baseline.length,4);
  assert.ok(baseline.every(row=>row.sincronizavel===false));
  assert.equal(baseline.find(row=>row.registro_id===legacy.id).canonico,null);
});

test('projeta novos IDs e edições de registros concordantes e conserva a versão anterior', async t => {
  const db = await fixture(t,{matching:true});
  const originalBase=(await db.query("select canonico_ativacao from financeiro_privado.contas_espelho_base where registro_id='201'")).rows[0].canonico_ativacao;
  assert.deepEqual((await db.query('select registro_id,sincronizavel from financeiro_privado.contas_espelho_base order by registro_id')).rows.map(row=>row.sincronizavel),[true,true,true,false]);
  await login(db, FIN);
  assert.deepEqual(await projection(db), { atualizadas: 0, falhas: 0, revisao: 0 });
  const newAccount={...account,id:104,name:'Nova conta'};
  const newPayment={...due,id:208,accountId:104};
  const editedDue={...due,value:52};
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='accountMasters'",[JSON.stringify([account,newAccount])]);
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='accountPayments'",[JSON.stringify([editedDue,paid,newPayment])]);
  assert.deepEqual(await projection(db), { atualizadas: 3, falhas: 0, revisao: 0 });
  assert.deepEqual(await projection(db), { atualizadas: 0, falhas: 0, revisao: 0 });
  assert.deepEqual((await db.query('select id from financeiro_pagamentos order by id')).rows.map(p=>p.id), ['201','202','208',legacy.id]);
  await db.exec('reset role');
  const [history]=(await db.query('select registro_id,anterior from financeiro_privado.contas_espelho_historico')).rows;
  assert.equal(history.registro_id,'201');
  assert.equal(history.anterior.valor,due.value);
  const projectedBase=(await db.query("select canonico,canonico_ativacao from financeiro_privado.contas_espelho_base where registro_id='201'")).rows[0];
  assert.equal(projectedBase.canonico_ativacao,originalBase);
  assert.notEqual(projectedBase.canonico,originalBase);
  await db.query("update financeiro_pagamentos set status='Em revisão externa' where id='208'");
  await db.exec("set timezone='America/Sao_Paulo'");
  await login(db, FIN);
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='accountPayments'",[JSON.stringify([editedDue,paid,{...newPayment,value:99}])]);
  assert.deepEqual(await projection(db), { atualizadas: 0, falhas: 0, revisao: 1 });
  assert.equal((await db.query("select status from financeiro_pagamentos where id='208'")).rows[0].status,'Em revisão externa');
});

test('arquiva a conta de forma atômica e preserva pagamento quitado, IDs, anexos e recorrência', async t => {
  const db = await fixture(t,{matching:true});
  await login(db, ADM);
  await assert.rejects(archive(db, 'conta', account, [due]), /pagamentos da conta mudaram/);
  assert.deepEqual(await moduleRows(db, 'accountMasters'), [account]);
  assert.equal(await archive(db, 'conta', account, [due, paid]), true);
  assert.equal(await archive(db, 'conta', account, [due, paid]), true);
  const [storedAccount] = await moduleRows(db, 'accountMasters');
  const [storedDue, storedPaid] = await moduleRows(db, 'accountPayments');
  assert.equal(storedAccount.active, false);
  assert.equal(storedAccount.recurrence, account.recurrence);
  assert.deepEqual(storedAccount.history, account.history);
  assert.equal(storedDue.status, 'Cancelada');
  assert.equal(storedDue.statusBeforeArchive, due.status);
  assert.equal(storedDue.archivedAt, storedAccount.archivedAt);
  assert.equal(storedDue.accountId, account.id);
  assert.deepEqual(storedDue.file, due.file);
  assert.equal(storedPaid.status, 'Paga');
  assert.equal(storedPaid.paidAt, paid.paidAt);
  assert.deepEqual(storedPaid.history, paid.history);
  await assert.rejects(db.query("update financeiro_estado_modulos set dados='[]' where chave='accountPayments'"), /Arquive/);
  await assert.rejects(db.query("delete from financeiro_estado_modulos where chave='accountMasters'"), /permanecer/);
  await assert.rejects(db.query("update financeiro_estado_modulos set dados=$1 where chave='accountMasters'", [JSON.stringify([account])]), /arquivado/);
  await assert.rejects(db.query("update financeiro_estado_modulos set dados=dados||$1::jsonb where chave='accountPayments'", [
    JSON.stringify([{ ...due, id: 207 }]),
  ]), /não recebe novos pagamentos/);
  await projection(db);
  const readback = (await db.query("select id,status,dados from financeiro_pagamentos where id in ('201','202') order by id")).rows;
  assert.deepEqual(readback.map(p => p.status), ['Cancelada', 'Paga']);
  assert.equal(readback[0].dados.file.arquivoId, 'fixture');
});

test('arquivamento individual compara versão conferida e não altera outros pagamentos', async t => {
  const db = await fixture(t);
  await login(db, FIN);
  await assert.rejects(archive(db, 'pagamento', due), /Somente ADM/);
  await assert.rejects(db.query("update financeiro_estado_modulos set dados=$1 where chave='accountPayments'", [
    JSON.stringify([{...due,status:'Cancelada',archivedAt:'2026-11-14T09:00:00Z'},paid]),
  ]), /Somente ADM/);
  await login(db, ADM);
  await assert.rejects(archive(db, 'pagamento', { ...due, value: 14 }), /registro mudou/);
  assert.equal(await archive(db, 'pagamento', due), true);
  const [updated, unmodified] = await moduleRows(db, 'accountPayments');
  assert.equal(updated.status, 'Cancelada');
  assert.deepEqual(unmodified, paid);
  assert.deepEqual(await moduleRows(db, 'accountMasters'), [account]);
});

test('colisões e dados inválidos ficam pendentes sem interromper o restante da projeção', async t => {
  const duplicate = { ...due, id: 204 };
  const invalid = { ...due, id: 205, due: '2026-11-32' };
  const db = await fixture(t,{payments:[paid],matching:true});
  await login(db, ADM);
  const valid={...due,id:206,due:'2026-11-02'};
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='accountPayments'",[
    JSON.stringify([due,duplicate,invalid,paid,valid]),
  ]);
  assert.deepEqual(await projection(db), { atualizadas: 1, falhas: 1, revisao: 2 });
  assert.deepEqual(await projection(db), { atualizadas: 0, falhas: 1, revisao: 2 });
  const records = await moduleRows(db, 'accountPayments');
  assert.deepEqual(records.map(p => p.id), [due.id, duplicate.id, invalid.id, paid.id, valid.id]);
  const ids = (await db.query('select id from financeiro_pagamentos order by id')).rows.map(p => p.id);
  assert.deepEqual(ids, ['202','206', legacy.id]);
});


test('falha após arquivar conta reverte também o arquivo do cadastro', async t => {
  const db = await fixture(t);
  await db.exec(`
    create function testar_falha_pagamento() returns trigger language plpgsql as $$
    begin
      if new.chave='accountPayments' then raise exception 'falha sintética'; end if;
      return new;
    end;
    $$;
    create trigger teste_falha before update on financeiro_estado_modulos
      for each row execute function testar_falha_pagamento();
  `);
  await login(db, ADM);
  await assert.rejects(archive(db, 'conta', account, [due, paid]), /falha sintética/);
  assert.deepEqual(await moduleRows(db, 'accountMasters'), [account]);
  assert.deepEqual(await moduleRows(db, 'accountPayments'), [due, paid]);
});

test('espelho aguarda confirmação de Contas e envia somente o nome da RPC', async () => {
  const vm = require('node:vm');
  const listeners = new Map();
  const timers = new Map();
  const calls = [];
  let sequence = 0;
  const context = {
    document: {
      readyState: 'loading',
      addEventListener(event, handler) { listeners.set(event, handler); },
    },
    addEventListener(event, handler) { listeners.set(event, handler); },
    setTimeout(handler) { timers.set(++sequence, handler); return sequence; },
    clearTimeout(id) { timers.delete(id); },
    user: { role: 'Administrador' },
    db: { accountPayments: [{ id: 'rascunho-não-confirmado' }] },
    IntegralERP: { sb: { rpc: async (...args) => {
      calls.push(args);
      return { data: { revisao: 0, falhas: 0 }, error: null };
    } } },
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/financeiro-incrementos.js'), 'utf8'), context);
  await context.IntegralFinanceIncrementos.runMirror();
  assert.equal(calls.length, 0);
  async function runTimer() {
    assert.equal(timers.size, 1);
    const [key, handler] = timers.entries().next().value;
    timers.delete(key);
    await handler();
  }
  listeners.get('integral-finance-cloud-ready')();
  listeners.get('online')();
  assert.equal(timers.size,0);
  assert.equal(calls.length,0);
  const confirmed = listeners.get('integral-finance-modules-saved');
  confirmed({ detail: { keys: ['trips'] } });
  assert.equal(timers.size, 0);
  confirmed({ detail: { keys: ['accountPayments'] } });
  await runTimer();
  listeners.get('integral-finance-remote-update')({ detail: { keys: ['accountMasters'] } });
  await runTimer();
  assert.deepEqual(calls, [
    ['financeiro_projetar_contas_confirmadas'],
    ['financeiro_projetar_contas_confirmadas'],
  ]);
});
