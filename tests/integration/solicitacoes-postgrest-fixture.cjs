/* Exporta SQL sintético para o ensaio nativo PostgreSQL/PostgREST. */
const { fixture } = require('../solicitacoes-orcamento-fechado-fixture.cjs');
(async () => {
  const statements = [];
  await fixture({ externalDb: { exec: async sql => { statements.push(sql); } }, fixed: false });
  process.stdout.write(JSON.stringify(statements));
})().catch(error => { console.error(error); process.exitCode = 1; });
