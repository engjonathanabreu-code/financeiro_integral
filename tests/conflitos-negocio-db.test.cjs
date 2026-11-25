// Migration financeiro_conflitos_negocio_sem_retry: 40001 -> PT409 nas recusas de regra de negócio.
// Cada ambiente instala com as dependências reais as funções cujo comportamento exercita; as demais
// são completadas a partir do SQL do repositório (ver conflitos-negocio-fixture.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { alvos, revisoes, definicao, completar, catalogo, entorno, instalar, reverter, read } = require('./conflitos-negocio-fixture.cjs');
const pedidos = require('./solicitacoes-orcamento-fechado-fixture.cjs');
const modulos = require('./financeiro-db-fixture.cjs');
const ailos = require('./ailos-fixtures.cjs');
const md5 = text => crypto.createHash('md5').update(text).digest('hex');
const nome = assinatura => assinatura.replace(/^public\./, '');
const NOVO = "'PT409'", ANTIGO = "'40001'";

async function recusa(cenario) {
  try { await cenario(); } catch (error) { return { code: error.code, message: error.message }; }
  assert.fail('A recusa esperada não ocorreu.');
}
const coletar = async cenarios => {
  const resultado = {};
  for (const [titulo, cenario] of Object.entries(cenarios)) resultado[titulo] = await recusa(cenario);
  return resultado;
};

// Instala, confere que só o literal mudou, reaplica, reverte e reinstala. Devolve o banco instalado.
async function ciclo(db, cenarios, reais) {
  const criadas = await completar(db);
  assert.deepEqual(alvos.map(alvo => alvo.assinatura).filter(assinatura => !criadas.includes(assinatura)).sort(), [...reais].sort(),
    'funções instaladas com dependências reais neste ambiente');
  const original = await catalogo(db), volta = await entorno(db);
  for (const alvo of alvos) {
    const funcao = original.find(f => f.assinatura === nome(alvo.assinatura));
    assert.equal(md5(funcao.prosrc), alvo.md5, 'o repositório gera o corpo conferido em produção: ' + alvo.assinatura);
    assert.equal(funcao.prosrc.split(ANTIGO).length - 1, alvo.ocorrencias, alvo.assinatura);
    assert.ok(!funcao.prosrc.includes('PT409') && !/exception\s+when/i.test(funcao.prosrc), alvo.assinatura);
  }
  const antes = await coletar(cenarios);
  for (const [titulo, erro] of Object.entries(antes)) assert.equal(erro.code, '40001', titulo + ': ' + erro.message);

  await instalar(db);
  const corrigido = await catalogo(db);
  assert.deepEqual(corrigido, original.map(f => ({ ...f, prosrc: f.prosrc.replaceAll(ANTIGO, NOVO) })),
    'somente o literal do código muda; ACL, dono, security definer e configuração permanecem');
  for (const f of corrigido) assert.ok(!f.prosrc.includes('40001'), f.assinatura);
  assert.deepEqual(await entorno(db), volta, 'demais funções, gatilhos e dados inalterados');
  const depois = await coletar(cenarios);
  assert.deepEqual(depois, Object.fromEntries(Object.entries(antes).map(([titulo, erro]) => [titulo, { code: 'PT409', message: erro.message }])));
  assert.deepEqual(await entorno(db), volta, 'as recusas não gravam nada');

  await assert.rejects(instalar(db), /divergiu da versão conhecida\. Nada foi alterado/);
  await db.exec('rollback');
  assert.deepEqual(await catalogo(db), corrigido, 'reaplicar não altera nada');

  await reverter(db);
  assert.deepEqual(await catalogo(db), original, 'a reversão restaura prosrc e atributos idênticos');
  assert.deepEqual(await entorno(db), volta);
  assert.deepEqual(await coletar(cenarios), antes);
  await assert.rejects(reverter(db), /divergiu da correção conhecida\. Nada foi alterado/);
  await db.exec('rollback');
  assert.deepEqual(await catalogo(db), original);

  await instalar(db);
  assert.deepEqual(await catalogo(db), corrigido);
  return { original, corrigido, volta };
}

test('Solicitações e orçamentos: recusas passam a PT409 com a mesma mensagem; guarda de fechamento e revisões preservadas', async () => {
  const db = await pedidos.fixture();
  const { login, id, submit, review } = pedidos;
  try {
    const item = async request => (await db.query('select financeiro_central_solicitacoes($1) data', [request.id])).rows[0].data.items[0];
    const act = async (current, action, payload = {}) => (await db.query('select financeiro_acao_solicitacao($1,$2,$3,$4,$5,$6) data',
      [current.request.id, current.revision, action, payload, crypto.randomUUID(), current.request])).rows[0].data.items[0];
    const budgets = async () => (await db.query("select dados from financeiro_estado_modulos where chave='budgetRecords'")).rows[0].dados;

    const editada = await submit(db, 860), emAnalise = await submit(db, 861), direta = await submit(db, 862);
    const inicial = await item(editada);
    await act(inicial, 'edit', { title: 'Conserto atualizado', description: 'Mensagem' });
    await login(db, 1);
    await act(await item(emAnalise), 'start_review');
    await login(db, 2);
    const reservada = await item(emAnalise);
    await login(db, 1);
    const fechados = await budgets();
    const aberto = { id: 12, name: 'Orçamento aberto sintético', sector: 'Projetos', limit: 500, active: true };
    await db.query("update financeiro_estado_modulos set dados=dados||$1::jsonb where chave='budgetRecords'", [JSON.stringify([aberto])]);
    const anteriores = await budgets();
    assert.equal(anteriores[0].status, 'Fechado');
    const gravar = (sql, dados) => async () => { await login(db, 1); await db.query(sql, [JSON.stringify(dados)]); };

    await ciclo(db, {
      'ação sobre revisão antiga': async () => { await login(db, 2); await act(inicial, 'edit', { title: 'Outra alteração', description: 'Mensagem' }); },
      'ação em pedido reservado por outro administrador': async () => { await login(db, 2); await act(reservada, 'cancel'); },
      'gravação direta sobre versão antiga': async () => {
        await login(db, 1);
        await db.query('select financeiro_save_invoice_request($1,$2)', [{ ...direta, title: 'Novo título' }, { ...direta, title: 'Versão antiga' }]);
      },
      'encerramento sobre versão antiga': async () => {
        await login(db, 1);
        await db.query('select financeiro_close_budget($1,$2)', ['12', JSON.stringify({ ...aberto, limit: 1 })]);
      },
      'guarda: reabertura': gravar("update financeiro_estado_modulos set dados=$1 where chave='budgetRecords'", [{ ...anteriores[0], status: 'Aberto' }, anteriores[1]]),
      'guarda: perda de histórico': gravar("update financeiro_estado_modulos set dados=$1 where chave='budgetRecords'", [{ ...anteriores[0], history: [] }, anteriores[1]]),
      'guarda: upsert parcial': gravar("insert into financeiro_estado_modulos(chave,dados) values('budgetRecords',$1) on conflict(chave) do update set dados=excluded.dados", [{ id: 999, name: 'Parcial' }]),
    }, [
      'public.financeiro_acao_solicitacao(text,integer,text,jsonb,uuid,jsonb)', 'public.financeiro_close_budget(text,jsonb)',
      'public.financeiro_guard_budget_close()', 'financeiro_solicitacoes_privado.financeiro_save_invoice_request(jsonb,jsonb)',
    ]);

    // Com a migration instalada: mensagens da guarda e orçamentos intactos.
    for (const dados of [[{ ...anteriores[0], status: 'Aberto' }, anteriores[1]], [{ ...anteriores[0], history: [] }, anteriores[1]]]) {
      await assert.rejects(gravar("update financeiro_estado_modulos set dados=$1 where chave='budgetRecords'", dados)(),
        { code: 'PT409', message: 'Um orçamento foi fechado. Atualize a tela antes de salvar.' });
    }
    assert.deepEqual(await budgets(), anteriores);
    assert.deepEqual((await budgets()).slice(0, fechados.length), fechados);

    // As funções de revisão do PR #32 não mudam: continuam convertendo o conflito e aprovando com orçamento fechado.
    await db.exec('reset role');
    const hashes = async () => Object.fromEntries((await catalogo(db, revisoes)).map(f => [f.assinatura, md5(f.prosrc)]));
    const instaladas = await hashes();
    await login(db, 1);
    await assert.rejects(review(db, { ...direta, title: 'Versão antiga' }), { code: 'PT409' });
    const aprovada = await review(db, direta);
    assert.equal(aprovada.status, 'Aprovada');
    assert.deepEqual((await budgets()).slice(0, anteriores.length), anteriores);
    assert.equal((await budgets()).at(-1).invoiceRequestId, direta.id);
    await db.exec('reset role');
    assert.deepEqual(await hashes(), instaladas);
    // Os rollbacks do PR #32 conferem esses hashes e continuam aplicando depois desta migration.
    await db.exec(read('rollback/financeiro_converter_orcamento_fechados.sql'));
    await db.exec(read('rollback/financeiro_revisao_conflito_sem_retry.sql'));
    assert.deepEqual(await hashes(), {
      'financeiro_revisar_solicitacao(text,jsonb,boolean,text,text)': 'd8292a599bfeac5da7636f33bcdc00d1',
      'financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(text,jsonb,boolean,text)': 'b68c24ebf4802c3f3b185f4320d53332',
    });
    for (const f of await catalogo(db)) assert.ok(f.prosrc.includes(NOVO) && !f.prosrc.includes(ANTIGO), f.assinatura);
  } finally { await db.close(); }
});

test('Módulos e contas: restauração, arquivamento e encerramento com dono dedicado passam a PT409', async () => {
  const db = await modulos.setup();
  const { login, id, ADM } = modulos;
  try {
    const conta = { id: 101, name: 'Conta sintética', active: true, recurrence: 'Mensal', history: [{ action: 'Criada' }] };
    const aVencer = { id: 201, accountId: 101, due: '2026-11-15', value: 32.05, status: 'A vencer' };
    const paga = { id: 202, accountId: 101, due: '2026-11-01', value: 28, status: 'Paga', paidAt: '2026-11-01' };
    const orcamento = { id: 10, name: 'Orçamento sintético', active: true, status: 'Ativo', sector: 'Comercial', history: [] };
    const caixa = [{ id: 11, description: 'Movimento sintético', value: 10 }];
    await db.exec(`drop table financeiro_whatsapp_envios,financeiro_pagamentos,financeiro_contas;create table auth.users(id uuid primary key);`);
    await db.exec(read('financeiro_contas_automacao.sql').replace('create extension if not exists pgcrypto;', ''));
    await db.exec('grant select,insert,update,delete on financeiro_contas,financeiro_pagamentos to authenticated;');
    await db.exec(read('auditoria_acessos_20261005.sql'));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(ADM)]);
    for (const [chave, dados] of Object.entries({ cashflow: caixa, budgetRecords: [orcamento], trips: [], invoiceRequests: [], accountMasters: [conta], accountPayments: [aVencer, paga] })) {
      await db.query('insert into financeiro_estado_modulos(chave,dados,updated_at) values($1,$2,now())', [chave, JSON.stringify(dados)]);
    }
    await db.query("insert into financeiro_estado_modulos_history(chave,dados,operation) values('cashflow',$1,'UPDATE')", [JSON.stringify([{ ...caixa[0], value: 8 }])]);
    for (const arquivo of ['20261113190000_financeiro_modulos_revisao.sql', '20261113190500_financeiro_solicitacoes_acesso.sql',
      '20261113191500_financeiro_anexos_acesso.sql', '20261113192000_financeiro_guarda_registros.sql', '20261113193000_financeiro_contas_canonicas.sql',
      '20261114104155_financeiro_recibos_sincronizacao.sql']) await db.exec(read('migrations/' + arquivo));
    const solicitacoes = read('migrations/20261114135633_financeiro_integridade_solicitacoes.sql');
    await db.exec(solicitacoes.slice(solicitacoes.indexOf('create function financeiro_privado.reservar_gravacao_solicitacoes()'),
      solicitacoes.indexOf('create function financeiro_privado.proteger_vinculos_solicitacoes()')));
    await db.exec(read('migrations/20261116135903_financeiro_exigir_rpc_modulos.sql'));
    const historico = (await db.query("select min(id)::int id from financeiro_estado_modulos_history where chave='cashflow'")).rows[0].id;
    const arquivar = (tipo, registro, pagamentos = null) => async () => {
      await login(db, ADM);
      await db.query('select financeiro_arquivar_conta_pagamento($1,$2,$3,$4)', [tipo, String(registro.id), JSON.stringify(registro), pagamentos && JSON.stringify(pagamentos)]);
    };
    const { corrigido } = await ciclo(db, {
      'restauração sobre revisão antiga': async () => { await login(db, ADM); await db.query('select financeiro_restore_modulo_version($1,$2,$3)', ['cashflow', historico, 3]); },
      'arquivamento de pagamento alterado': arquivar('pagamento', { ...aVencer, value: 14 }),
      'arquivamento de conta com pagamentos alterados': arquivar('conta', conta, [aVencer]),
      'encerramento sobre versão antiga': async () => { await login(db, ADM); await db.query('select financeiro_close_budget($1,$2)', ['10', JSON.stringify({ ...orcamento, name: 'Anterior' })]); },
    }, [
      'public.financeiro_arquivar_conta_pagamento(text,text,jsonb,jsonb)', 'public.financeiro_close_budget(text,jsonb)',
      'public.financeiro_guard_budget_close()', 'public.financeiro_restore_modulo_version(text,bigint,bigint)',
    ]);
    const fechamento = corrigido.find(f => f.assinatura === 'financeiro_close_budget(text,jsonb)');
    assert.equal(fechamento.dono, 'financeiro_modulos_writer');
    assert.equal(fechamento.prosecdef, true);
    // Os caminhos de sucesso continuam funcionando com a correção instalada.
    await login(db, ADM);
    assert.equal((await db.query('select financeiro_close_budget($1,$2) r', ['10', JSON.stringify(orcamento)])).rows[0].r[0].status, 'Fechado');
    assert.equal((await db.query('select financeiro_restore_modulo_version($1,$2,$3) r', ['cashflow', historico, 1])).rows[0].r.status, 'salvo');
    assert.equal((await db.query('select financeiro_arquivar_conta_pagamento($1,$2,$3,null) r', ['pagamento', '201', JSON.stringify(aVencer)])).rows[0].r, true);
  } finally { await db.close(); }
});

test('Recebimentos e Ailos: baixas e importação de retorno passam a PT409 com a mesma mensagem', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  try {
    // Mesmo esquema mínimo de ailos-artefatos.test.cjs, com uma parcela a mais para as baixas.
    await db.exec(`
      create role anon; create role authenticated; create role service_role; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key, ativo boolean,tipo text,setor text);
      insert into public.profiles values ('${id(1)}',true,'Financeiro','Financeiro'),('${id(3)}',true,'Administrador','Diretoria');
      create function public.is_admin() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')$$;
      create schema financeiro_privado; create schema integracao_financeiro_privado;
      create table public.fin_receb_importacoes (id int); create table public.financeiro_contas (id int);
      create table public.financeiro_pagamentos (id int); create table public.financeiro_whatsapp_envios (id int);
      create table public.financeiro_estado_modulos (chave text,dados jsonb);
      create table public.fin_receb_clientes (id uuid primary key, codigo text, nome text, cpf_cnpj text, ativo boolean,municipio_id uuid,remessa_id uuid);
      create table public.fin_receb_parcelas(id uuid primary key,cliente_id uuid,numero int,vencimento date,
        valor_previsto numeric,juros numeric default 0,multa numeric default 0,nosso_numero text,documento text,
        linha_digitavel text,status text,pago_em date,valor_liquidado numeric default 0,diferenca numeric,ativo boolean,versao bigint default 1);
      create table integracao_moradores(colecao text,registro_id text,dados jsonb,referencia_id uuid);
      create table integracao_nucleos(colecao text,registro_id text,dados jsonb,referencia_id uuid);
      create table processos_kanban(id uuid,nucleo text);
      create function public.versionar() returns trigger language plpgsql as $$begin new.versao=old.versao+1;return new;end $$;
      create trigger versao before update on fin_receb_parcelas for each row execute function versionar();
      insert into fin_receb_clientes(id,codigo,nome,cpf_cnpj,ativo) values ('${id(10)}','10','PAGADOR TESTE','${ailos.pagador.cpf_cnpj}',true);
      insert into fin_receb_parcelas(id,cliente_id,numero,vencimento,valor_previsto,status,ativo,nosso_numero,documento) values
        ('${id(20)}','${id(10)}',1,current_date+10,100,'Pendente',true,null,null),
        ('${id(21)}','${id(10)}',2,'2026-01-18',100,'Pendente',true,'123-4','DOC-21');`);
    for (const arquivo of ['ailos-cobranca.sql', 'ailos-carnes.sql', 'ailos-busca-performance.sql', 'ailos-endereco-cliente.sql',
      'migrations/20261113191000_financeiro_perfis_recebimentos.sql', 'migrations/20261113180935_financeiro_baixas_confirmadas.sql',
      'migrations/20261114094852_financeiro_ailos_permissoes_baixas.sql', 'migrations/20261114151016_financeiro_ailos_artefatos_verificados.sql']) await db.exec(read(arquivo));
    const entrar = async usuario => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [usuario]); await db.exec('set role authenticated'); };
    const rpc = async (acao, dados = {}) => (await db.query('select financeiro_ailos($1,$2) as data', [acao, JSON.stringify(dados)])).rows[0].data;
    const relatorio = async (linhas, revisao = null) => (await db.query('select financeiro_baixa_relatorio($1,$2,$3) r', ['a'.repeat(64), JSON.stringify(linhas), revisao])).rows[0].r;
    const linha = { nosso_numero: '1234', vencimento: '2026-01-18', pagamento: '2026-01-20', valor_centavos: 10000 };

    await entrar(id(3));
    await rpc('configurar', { config: ailos.config, ultimo_boleto: 253, ultima_remessa: 0 });
    await entrar(id(1));
    await rpc('pagador', { cliente_id: id(10), pagador: ailos.pagador });
    const reserva = await rpc('preparar', { id: id(30), parcelas: [{ id: id(20), versao: 1 }] });
    await rpc('finalizar', { id: reserva.id, confirmar: true });
    const entrada = { arquivo: ailos.retorno(reserva, '06', 7000), nome: 'origem.ret', origem: 'canal_homologacao' };
    const previa = await rpc('previa_retorno', entrada);
    const conciliacao = await relatorio([linha]);
    assert.equal(conciliacao.linhas[0].situacao, 'confirmavel');

    await ciclo(db, {
      'retorno sem a prévia vigente': async () => { await entrar(id(1)); await rpc('retorno', entrada); },
      'baixa manual sobre versão antiga': async () => { await entrar(id(1)); await db.query('select financeiro_baixa_manual($1,$2,$3,$4,$5)', [id(21), 7, 'Pendente', 'baixar', null]); },
      'lote com prévia de outro conteúdo': async () => { await entrar(id(1)); await relatorio([{ ...linha, valor_centavos: 9900 }], conciliacao.revisao); },
    }, [
      'public.financeiro_ailos(text,jsonb)', 'public.financeiro_baixa_manual(uuid,bigint,text,text,text)', 'public.financeiro_baixa_relatorio(text,jsonb,text)',
    ]);
    // Os caminhos de sucesso continuam funcionando com a correção instalada.
    await entrar(id(1));
    assert.equal((await rpc('retorno', { ...entrada, revisao: previa.revisao })).processados, 1);
    assert.deepEqual(await relatorio([linha], conciliacao.revisao), { aplicadas: 1, repetido: false });
  } finally { await db.close(); }
});

test('função ausente ou divergente interrompe instalação e reversão sem alterar nenhuma outra', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;');
    assert.equal((await completar(db)).length, alvos.length);
    const original = await catalogo(db);
    // Penúltima função da ordem de instalação: as anteriores já teriam sido substituídas na mesma transação.
    const viagem = alvos.find(alvo => alvo.assinatura.startsWith('public.financeiro_salvar_viagem'));
    const divergente = definicao(viagem).replace('create function', 'create or replace function').replace("errcode='40001'", "errcode = '40001'");
    assert.notEqual(divergente, definicao(viagem));
    await db.exec(divergente);
    const alterado = await catalogo(db);
    await assert.rejects(instalar(db), /financeiro_salvar_viagem\(uuid,text,jsonb,jsonb\) divergiu da versão conhecida\. Nada foi alterado/);
    await db.exec('rollback');
    assert.deepEqual(await catalogo(db), alterado);

    await db.exec(definicao(viagem).replace('create function', 'create or replace function'));
    assert.deepEqual(await catalogo(db), original);
    const ultima = alvos.at(-1);
    await db.exec(`alter function ${ultima.assinatura} rename to financeiro_save_invoice_request_ausente`);
    await assert.rejects(instalar(db), /financeiro_save_invoice_request\(jsonb,jsonb\) não existe\. Nada foi alterado/);
    await db.exec('rollback');
    await db.exec('alter function financeiro_solicitacoes_privado.financeiro_save_invoice_request_ausente(jsonb,jsonb) rename to financeiro_save_invoice_request');
    assert.deepEqual(await catalogo(db), original);

    await instalar(db);
    const corrigido = await catalogo(db);
    // Reversão com uma função já fora da versão corrigida: nenhuma outra volta ao código antigo.
    await db.exec(definicao(viagem).replace('create function', 'create or replace function'));
    const parcial = await catalogo(db);
    await assert.rejects(reverter(db), /financeiro_salvar_viagem\(uuid,text,jsonb,jsonb\) divergiu da correção conhecida\. Nada foi alterado/);
    await db.exec('rollback');
    assert.deepEqual(await catalogo(db), parcial);
    await db.exec(definicao(viagem).replace('create function', 'create or replace function').replace(ANTIGO, NOVO));
    assert.deepEqual(await catalogo(db), corrigido);
    await reverter(db);
    assert.deepEqual(await catalogo(db), original);
  } finally { await db.close(); }
});
