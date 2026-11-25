// Apoio aos testes da migration financeiro_conflitos_negocio_sem_retry.
// A migration exige as dez funções no mesmo banco, mas cada fixture de banco monta apenas
// um subconjunto do esquema. `completar` cria as funções ausentes a partir do próprio SQL do
// repositório (mesmo texto, logo o mesmo prosrc), com check_function_bodies desligado na sessão:
// nesse banco elas servem apenas à conferência de hash e à substituição. O comportamento de cada
// função é exercitado somente nos ambientes em que ela foi instalada com as dependências reais.
// A migration e o rollback são executados como estão no repositório, sem modo de teste.
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '../supabase', name), 'utf8');
// O prefixo de versão muda quando a migration é registrada; o sufixo identifica o arquivo.
const versoes = fs.readdirSync(path.join(__dirname, '../supabase/migrations'))
  .filter(name => name.endsWith('_financeiro_conflitos_negocio_sem_retry.sql'));
if (versoes.length !== 1) throw Error('Esperada exatamente uma migration financeiro_conflitos_negocio_sem_retry.');
const migration = 'migrations/' + versoes[0];
const rollback = 'rollback/financeiro_conflitos_negocio_sem_retry.sql';

// md5(prosrc) e ocorrências de '40001' conferidos em produção antes da correção.
const alvos = [
  { assinatura: 'public.financeiro_acao_solicitacao(text,integer,text,jsonb,uuid,jsonb)', md5: 'bf7d1881b1f8aabb485b96393108189e', ocorrencias: 2,
    arquivo: 'migrations/20261116151526_financeiro_central_solicitacoes.sql', inicio: 'create or replace function public.financeiro_acao_solicitacao(' },
  { assinatura: 'public.financeiro_ailos(text,jsonb)', md5: 'c48823e089d2b35836d233647ed23e29', ocorrencias: 1,
    arquivo: 'migrations/20261114151016_financeiro_ailos_artefatos_verificados.sql', inicio: 'create or replace function public.financeiro_ailos(' },
  { assinatura: 'public.financeiro_arquivar_conta_pagamento(text,text,jsonb,jsonb)', md5: 'cccd411611d089da1e2f49dbd3121dbc', ocorrencias: 2,
    arquivo: 'migrations/20261113193000_financeiro_contas_canonicas.sql', inicio: 'create function public.financeiro_arquivar_conta_pagamento(' },
  { assinatura: 'public.financeiro_baixa_manual(uuid,bigint,text,text,text)', md5: '261bc8b68e36352b0cbed53173ffd42f', ocorrencias: 1,
    arquivo: 'migrations/20261113180935_financeiro_baixas_confirmadas.sql', inicio: 'create function public.financeiro_baixa_manual(' },
  { assinatura: 'public.financeiro_baixa_relatorio(text,jsonb,text)', md5: 'bc1c4a92614ee1304bfe2d27312d78ac', ocorrencias: 2,
    arquivo: 'migrations/20261113180935_financeiro_baixas_confirmadas.sql', inicio: 'create function public.financeiro_baixa_relatorio(' },
  { assinatura: 'public.financeiro_close_budget(text,jsonb)', md5: '5e2f5013e97a939146412a490de706b9', ocorrencias: 1,
    arquivo: 'financeiro_consultor.sql', inicio: 'create or replace function public.financeiro_close_budget(' },
  { assinatura: 'public.financeiro_guard_budget_close()', md5: 'a6cf3b1f8acbc8804b5073a3a6adcba4', ocorrencias: 1,
    arquivo: 'financeiro_consultor.sql', inicio: 'create or replace function public.financeiro_guard_budget_close(' },
  { assinatura: 'public.financeiro_restore_modulo_version(text,bigint,bigint)', md5: '1b812f19103b31968587aa7306124bf9', ocorrencias: 2,
    arquivo: 'migrations/20261116135903_financeiro_exigir_rpc_modulos.sql', inicio: 'create function public.financeiro_restore_modulo_version(' },
  { assinatura: 'public.financeiro_salvar_viagem(uuid,text,jsonb,jsonb)', md5: '43299c96d2d45aaf8430c814ca20253a', ocorrencias: 1,
    arquivo: 'migrations/20261116165100_financeiro_viagens_persistencia.sql', inicio: 'create function public.financeiro_salvar_viagem(' },
  // Criada como pública e movida para o esquema privado pela Central de Solicitações.
  { assinatura: 'financeiro_solicitacoes_privado.financeiro_save_invoice_request(jsonb,jsonb)', md5: 'ecb49987f05d318c8461b71a563250c0', ocorrencias: 1,
    arquivo: 'migrations/20261114135633_financeiro_integridade_solicitacoes.sql', inicio: 'create or replace function public.financeiro_save_invoice_request(',
    destino: 'function financeiro_solicitacoes_privado.financeiro_save_invoice_request(' },
];
const revisoes = [
  'public.financeiro_revisar_solicitacao(text,jsonb,boolean,text,text)',
  'financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(text,jsonb,boolean,text)',
];

// Recorta a instrução `create function` do arquivo, do cabeçalho ao fechamento do corpo.
function definicao(alvo) {
  const texto = read(alvo.arquivo), inicio = texto.indexOf(alvo.inicio);
  if (inicio < 0 || texto.indexOf(alvo.inicio, inicio + 1) >= 0) throw Error('Definição ausente ou repetida: ' + alvo.assinatura);
  const marca = /\$[a-z_]*\$/.exec(texto.slice(inicio));
  const corpo = inicio + marca.index + marca[0].length;
  const instrucao = texto.slice(inicio, texto.indexOf(marca[0], corpo) + marca[0].length);
  return alvo.destino ? instrucao.replace(/(or replace )?function [a-z_.]+\(/, alvo.destino) : instrucao.replace('create or replace function', 'create function');
}
async function completar(db) {
  await db.exec('reset role; create schema if not exists financeiro_solicitacoes_privado; set check_function_bodies=off');
  const criadas = [];
  for (const alvo of alvos) {
    const { rows } = await db.query('select to_regprocedure($1) is null ausente', [alvo.assinatura]);
    if (!rows[0].ausente) continue;
    await db.exec(definicao(alvo));
    criadas.push(alvo.assinatura);
  }
  // Fica desligado na sessão de teste: ao recriar uma função completada, a migration validaria
  // tipos de esquemas que este banco não tem. Em produção as dependências existem.
  return criadas;
}
const lista = nomes => nomes.map(nome => `'${nome}'::regprocedure`).join(',');
// Tudo o que a migration não pode alterar nas funções, exceto o literal trocado em prosrc.
async function catalogo(db, nomes = alvos.map(alvo => alvo.assinatura)) {
  return (await db.query(`select p.oid::regprocedure::text assinatura,p.prosrc,p.proacl::text proacl,p.prosecdef,p.proconfig,
      p.proowner::regrole::text dono,p.provolatile,p.proisstrict,p.prorettype::regtype::text retorno,
      pg_get_function_arguments(p.oid) argumentos,l.lanname linguagem
    from pg_proc p join pg_language l on l.oid=p.prolang where p.oid in (${lista(nomes)}) order by 1`)).rows;
}
// Demais funções, gatilhos e o conteúdo de todas as tabelas: nada disso pode mudar.
async function entorno(db) {
  await db.exec('reset role');
  const fora = "n.nspname not like 'pg\\_%' and n.nspname<>'information_schema'";
  const funcoes = (await db.query(`select p.oid::regprocedure::text assinatura,md5(p.prosrc) md5,p.proacl::text proacl,p.prosecdef,p.proconfig,p.proowner::regrole::text dono
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${fora} and p.oid not in (${lista(alvos.map(alvo => alvo.assinatura))}) order by 1`)).rows;
  const gatilhos = (await db.query(`select t.tgrelid::regclass::text tabela,t.tgname,t.tgfoid::regprocedure::text funcao,t.tgenabled,t.tgtype
    from pg_trigger t where not t.tgisinternal order by 1,2`)).rows;
  const tabelas = (await db.query(`select c.oid::regclass::text nome from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind='r' and ${fora} order by 1`)).rows;
  const dados = {};
  for (const { nome } of tabelas) {
    dados[nome] = (await db.query(`select count(*)::int linhas,md5(coalesce(string_agg(t::text,E'\\n' order by t::text),'')) md5 from ${nome} t`)).rows[0];
  }
  return { funcoes, gatilhos, dados };
}
const instalar = async db => { await db.exec('reset role'); await db.exec(read(migration)); };
const reverter = async db => { await db.exec('reset role'); await db.exec(read(rollback)); };
module.exports = { alvos, revisoes, definicao, completar, catalogo, entorno, instalar, reverter, read, migration, rollback };
