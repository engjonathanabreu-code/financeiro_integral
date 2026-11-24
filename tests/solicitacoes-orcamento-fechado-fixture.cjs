const fs = require('node:fs');
const path = require('node:path');
const { setup, login, id } = require('./veiculos-fixtures.cjs');
const read = name => fs.readFileSync(path.join(__dirname, '../supabase', name), 'utf8');
const phase1 = 'migrations/20261124202434_financeiro_revisao_conflito_sem_retry.sql';
const phase2 = 'migrations/20261124202455_financeiro_converter_orcamento_fechados.sql';

async function fixture({ externalDb, fixed = true } = {}) {
  const db = await setup(externalDb);
  await db.exec(`create table financeiro_contas(id text primary key);
    create table financeiro_pagamentos(id text primary key);
    alter table financeiro_estado_modulos enable row level security;
    create policy fixture_access on financeiro_estado_modulos for all to authenticated using(true) with check(true);`);
  for (const file of ['financeiro_consultor.sql',
    'migrations/20261113190500_financeiro_solicitacoes_acesso.sql',
    'migrations/20261114135633_financeiro_integridade_solicitacoes.sql',
    'migrations/20261116151526_financeiro_central_solicitacoes.sql',
    'migrations/20261116194500_financeiro_conferir_viagem_repetida.sql',
    'migrations/20261124191435_financeiro_vinculo_solicitante_aprovacao.sql']) await db.exec(read(file));
  await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false);
    select financeiro_close_budget('11',(select dados->0 from financeiro_estado_modulos where chave='budgetRecords'));
    select set_config('request.jwt.claim.sub','',false);`);
  if (fixed) { await db.exec(read(phase1)); await db.exec(read(phase2)); }
  return db;
}
async function submit(db, n = 860, fields = {}) {
  await login(db, 2);
  return (await db.query('select financeiro_save_invoice_request($1,null) r', [{
    id: id(n), title: 'Conserto ABS sintético', description: 'Peças 315 e mão de obra 80',
    category: 'budget', status: 'Pendente', estimatedValue: 395, neededAt: '2026-11-18',
    ...fields,
  }])).rows[0].r.find(r => r.id === id(n));
}
async function review(db, request, answer = 'Aprovado e pago', approved = true) {
  return (await db.query('select financeiro_revisar_solicitacao($1,$2,$3,$4) r',
    [request.id, request, approved, answer])).rows[0].r.find(r => r.id === request.id);
}
const modules = async db => (await db.query('select chave,dados from financeiro_estado_modulos order by chave')).rows;
module.exports = { fixture, submit, review, modules, read, phase1, phase2, login, id };
