const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, login, id, FIN, ADM, STAFF, INATIVO } = require('./financeiro-db-fixture.cjs');

test('perfis financeiros leem parcelas e direção recebe somente resumo municipal', async () => {
  const db = await setup();
  try {
    await db.exec(`
      insert into profiles values('${id(7)}','Diretor de Projetos','Financeiro',true);
      create schema financeiro_privado;
      create schema ailos_privado;
      grant usage on schema ailos_privado to authenticated;
      create function ailos_privado.operar(acao text,dados jsonb) returns jsonb
      language sql security definer as $$select jsonb_build_object('acao',acao)$$;
      create function public.financeiro_ailos(acao text,dados jsonb default '{}'::jsonb)
      returns jsonb language sql as $$select ailos_privado.operar(acao,dados)$$;
      grant select,delete on financeiro_contas,financeiro_pagamentos,financeiro_whatsapp_envios to authenticated;
      insert into financeiro_contas values('conta');
      insert into financeiro_pagamentos values('pagamento');
      insert into financeiro_whatsapp_envios values('envio');
      insert into financeiro_estado_modulos(chave,dados) values('accountMasters','[{"id":"conta","nome":"Antes"}]');
      create table fin_receb_clientes(id uuid, municipio_id uuid, remessa_id uuid, ativo boolean);
      create table fin_receb_parcelas(cliente_id uuid, valor_previsto numeric, juros numeric,
        multa numeric, valor_liquidado numeric, vencimento date, status text, ativo boolean);
      create table integracao_moradores(referencia_id uuid, registro_id text, colecao text, dados jsonb);
      insert into fin_receb_clientes values('${id(81)}','${id(82)}','${id(83)}',true);
      insert into fin_receb_parcelas values('${id(81)}',100,2,3,40,'2026-11-01','Parcial',true);
      insert into integracao_moradores values('${id(81)}','1','processos','{"nucleoId":"sintético"}');
      alter table fin_receb_parcelas enable row level security;
      create policy consulta_anterior on fin_receb_parcelas for all to authenticated using(true) with check(true);
      grant select,update on fin_receb_parcelas to authenticated;
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261113191000_financeiro_perfis_recebimentos.sql'), 'utf8'));
    const detail = () => db.query('select * from fin_receb_parcelas');
    const summary = async () => (await db.query("select * from integracao_financeiro_resumo('2026-11-01','2026-12-01')")).rows[0];
    await login(db, 7);
    assert.equal((await detail()).rows.length, 0);
    assert.equal((await db.query('update fin_receb_parcelas set valor_liquidado=99 returning *')).rows.length, 0);
    await assert.rejects(db.query("select * from integracao_financeiro_resumo('2026-11-01','2026-11-02')"), /competência mensal/);
    await assert.rejects(db.query("select financeiro_ailos('painel')"), /Sem permissão/);
    const reduced = await summary();
    assert.equal(reduced.remessa_id, null);
    assert.equal(reduced.nucleo_id, '');
    assert.equal(Number(reduced.previsto), 105);
    assert.equal(Number(reduced.recebido), 40);
    assert.equal((await db.query('select integracao_financeiro_privado.operar() as permitido')).rows[0].permitido, false);
    for (const actor of [FIN, ADM]) {
      await login(db, actor);
      assert.equal((await detail()).rows.length, 1);
      const full = await summary();
      assert.equal(full.remessa_id, id(83));
      assert.equal(full.nucleo_id, 'sintético');
    }
    await login(db, FIN);
    assert.equal((await db.query("select financeiro_ailos('painel') as painel")).rows[0].painel.acao,'painel');
    await assert.rejects(db.query("select financeiro_ailos('configurar')"), /Sem permissão/);
    await assert.rejects(db.query("select ailos_privado.operar_legado_p1('configurar','{}')"), /permission denied/);
    assert.equal((await db.query("delete from financeiro_contas returning id")).rows.length,0);
    assert.equal((await db.query("delete from financeiro_pagamentos returning id")).rows.length,0);
    assert.equal((await db.query("select id from financeiro_whatsapp_envios where id='envio'")).rows.length,0);
    await assert.rejects(db.query("update financeiro_estado_modulos set dados='[]' where chave='accountMasters'"),/Somente ADM/);
    assert.equal((await db.query("update financeiro_estado_modulos set dados=replace(dados::text,'Antes','Depois')::jsonb where chave='accountMasters' returning chave")).rows.length,1);
    await login(db, ADM);
    assert.equal((await db.query("select financeiro_ailos('configurar') as config")).rows[0].config.acao,'configurar');
    assert.equal((await db.query("select id from financeiro_whatsapp_envios where id='envio'")).rows.length,1);
    for (const actor of [STAFF, INATIVO]) {
      await login(db, actor);
      assert.equal((await detail()).rows.length, 0);
      await assert.rejects(summary(), /Sem acesso/);
    }
    await login(db, null);
    await assert.rejects(summary(), /permission denied/);
  } finally {
    await db.close();
  }
});
