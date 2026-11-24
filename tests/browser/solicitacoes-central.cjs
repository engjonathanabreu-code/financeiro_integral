/* Solicitações no Chromium com RPCs reais no PGlite e rede externa bloqueada.
 * Execute com Playwright no NODE_PATH e, se necessário, BROWSER_EXECUTABLE_PATH. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { setup, id } = require('../veiculos-fixtures.cjs');

const root = path.join(__dirname, '../..');
const assets = process.env.SOLICITACOES_ASSETS || path.join(root, 'public');
const sql = name => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const fixtureUrl = 'https://fixture.test/';
const people = {
  1: { role: 'Administrador', sector: 'Administrativo', erpId: id(1), name: 'ADM' },
  2: { role: 'Funcionário', sector: 'Projetos', erpId: id(2), name: 'Motorista A' },
};

async function setupSolicitacoes() {
  const db = await setup();
  try {
    await db.exec(sql('20261113190500_financeiro_solicitacoes_acesso.sql'));
    await db.exec('create table financeiro_contas(id text primary key); create table financeiro_pagamentos(id text primary key);');
    await db.exec(sql('20261114135633_financeiro_integridade_solicitacoes.sql'));
    await db.exec(sql('20261116151526_financeiro_central_solicitacoes.sql'));
    await db.exec(`create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      alter table storage.objects add column metadata jsonb, add primary key (bucket_id,name);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert on storage.objects to authenticated;
      create function storage.allow_any_operation(text[]) returns boolean language sql stable as
        $$select coalesce(current_setting('storage.operation',true)=any($1),false)$$;`);
    await db.exec(sql('20261116151615_financeiro_solicitacoes_anexos.sql'));
    await db.exec(sql('20261116194500_financeiro_conferir_viagem_repetida.sql'));
    await db.exec(sql('20261124191435_financeiro_vinculo_solicitante_aprovacao.sql'));
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function inSession(db, actor, run) {
  return db.transaction(async transaction => {
    await transaction.query("select set_config('request.jwt.claim.sub',$1,true)", [id(actor)]);
    await transaction.exec('set local role authenticated');
    return run(transaction);
  });
}

async function queryAs(db, actor, name, args) {
  const parameters = {
    financeiro_listar_solicitacoes: [],
    financeiro_save_invoice_request: ['p_request', 'p_expected'],
    financeiro_revisar_solicitacao: ['p_id', 'p_esperado', 'p_aprovar', 'p_resposta',
      ...(args?.p_viagens_conferidas ? ['p_viagens_conferidas'] : [])],
    financeiro_central_solicitacoes: ['p_id'],
    financeiro_acao_solicitacao: ['p_id', 'p_revisao', 'p_acao', 'p_dados', 'p_operacao', 'p_esperado'],
    financeiro_categoria_solicitacao: ['p_nome'],
    financeiro_ler_notificacao_solicitacao: ['p_id'],
    financeiro_listar_anexos_solicitacao: ['p_id'],
    financeiro_reservar_anexo_solicitacao: ['p_id', 'p_arquivo', 'p_nome', 'p_mime', 'p_tamanho'],
    financeiro_confirmar_anexo_solicitacao: ['p_id', 'p_arquivo'],
  }[name];
  assert.ok(parameters, `RPC fixture desconhecida: ${name}`);
  return inSession(db, actor, async transaction => {
    const positions = parameters.map((_, i) => `$${i + 1}`).join(',');
    const values = parameters.map(key => {
      const value = args?.[key];
      return value && typeof value === 'object' ? JSON.stringify(value) : value ?? null;
    });
    return (await transaction.query(`select public.${name}(${positions}) as response`, values)).rows[0].response;
  });
}

async function browserSession(browser, db, actor, width) {
  const context = await browser.newContext({ viewport: { width, height: 940 }, timezoneId: 'America/Sao_Paulo' });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== 'https://fixture.test') return route.abort();
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR" data-invoice-central="true"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"><nav class="nav"></nav><h1 id="heading"></h1><main id="content"></main></div></html>' });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const faults = {};
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.exposeFunction('storeSyntheticFile', async (bucket, filePath, size, mime) => {
    try {
      await inSession(db, actor, transaction => transaction.query('insert into storage.objects (bucket_id,name,metadata) values ($1,$2,$3)',
        [bucket, filePath, JSON.stringify({ size, mimetype: mime })]));
      return { data: { path: filePath } };
    } catch (error) {
      return { error: { message: error.message, statusCode: error.code === '23505' ? '409' : error.code } };
    }
  });
  await page.exposeFunction('testRpc', async (name, args) => {
    try {
      const data = await queryAs(db, actor, name, args);
      if (faults.lose?.(name, args)) return { lost: true };
      return { data };
    } catch (error) {
      return { error: { message: error.message, code: error.code, details: error.detail } };
    }
  });
  await page.goto(fixtureUrl);
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(profile => {
    window.user = profile;
    window.view = 'invoices';
    window.db = { invoiceRequests: [], usersMvp: [], trips: [], budgetRecords: [], accountMasters: [], accountPayments: [] };
    window.adminNav = [['trips', 'Viagens']];
    window.staffNav = [['trips', 'Viagens']];
    window.render = () => {};
    window.app = () => render();
    window.title = text => { document.querySelector('#heading').textContent = text; };
    window.fixtureRpcInFlight = 0;
    window.IntegralERP = { sb: {
      auth: {
        getUser: async () => ({ data: { user: { id: profile.erpId } } }),
        getSession: async () => ({ data: { session: { user: { id: profile.erpId } } } }),
      },
      storage: { from: bucket => ({ upload: (filePath, file) => window.storeSyntheticFile(bucket, filePath, file.size, file.type) }) },
      rpc: async (name, args) => {
        window.fixtureRpcInFlight++;
        try {
          const response = await window.testRpc(name, args);
          if (response.lost) throw Error('Conexão interrompida após gravar');
          return response;
        } finally { window.fixtureRpcInFlight--; }
      },
    } };
  }, people[actor]);
  for (const file of ['financeiro.bundle.css', 'financeiro-design-system.css', 'financeiro-invoices.css']) {
    await page.addStyleTag({ path: path.join(assets, file) });
  }
  for (const file of ['financeiro-solicitacoes-anexos.js', 'financeiro-invoices.js']) {
    await page.addScriptTag({ path: path.join(assets, file) });
  }
  await page.evaluate(() => app());
  return { context, page, faults, pageErrors };
}

async function syntheticRequest(db, actor, requestId, title, fields = {}) {
  return queryAs(db, actor, 'financeiro_save_invoice_request', { p_request: {
    id: requestId, requesterId: id(actor), category: 'purchase', status: 'Pendente',
    title, description: 'Descrição sintética para verificação', estimatedValue: 49.95, ...fields,
  } });
}

const card = (page, title) => page.locator('[data-invoice-id]').filter({ hasText: title });
const trigger = (page, requestId) => page.locator(`[data-invoice-menu-trigger="${requestId}"]`);
const action = (page, actionName) => page.locator(`[data-invoice-action="${actionName}"]:visible`);

async function waitForRpc(page) {
  await page.waitForFunction(() => window.fixtureRpcInFlight === 0);
}

async function scrollTo(page, control) {
  await control.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function choose(page, requestId, actionName) {
  const menuButton = trigger(page, requestId);
  await scrollTo(page, menuButton);
  await menuButton.click();
  await action(page, actionName).click();
}

async function sendAction(page, field, message) {
  const form = page.locator('[data-invoice-operation]:visible');
  if (field) await form.locator(`[name="${field}"]`).fill(message);
  await form.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await form.waitFor({ state: 'hidden' });
  const detailClose = page.getByRole('dialog', { name: 'Detalhes da solicitação' }).locator('[data-invoice-close]');
  if (await detailClose.count()) await detailClose.click();
}

async function readItem(db, actor, requestId) {
  const bundle = await queryAs(db, actor, 'financeiro_central_solicitacoes', { p_id: requestId });
  return bundle.items[0];
}

async function assertFits(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

async function relatedAccounts(db, requestId) {
  const { rows } = await db.query(`select chave, item from public.financeiro_estado_modulos
    cross join lateral jsonb_array_elements(dados) item
    where chave in ('accountMasters','accountPayments') and item->>'invoiceRequestId'=$1
    order by chave`, [requestId]);
  return rows;
}

async function run() {
  const db = await setupSolicitacoes();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : { channel: process.env.BROWSER_CHANNEL || 'chrome' }) });
    const requestId = id(100);
    const privateTitle = 'Equipamento para vistoria sintética';
    const otherTitle = 'Compra sintética de outro setor';
    await syntheticRequest(db, 2, requestId, privateTitle);
    await syntheticRequest(db, 3, id(101), otherTitle);
    const employee = await browserSession(browser, db, 2, 390);
    const admin = await browserSession(browser, db, 1, 1440);
    try {
      await card(employee.page, privateTitle).waitFor();
      await card(admin.page, privateTitle).waitFor();
      await card(admin.page, otherTitle).waitFor();
      assert.equal(await card(employee.page, otherTitle).count(), 0);
      await assert.rejects(() => queryAs(db, 2, 'financeiro_acao_solicitacao', {
        p_id: id(101), p_revisao: 0, p_acao: 'edit', p_dados: { title: 'Alteração indevida' }, p_operacao: id(998),
      }), error => ['42501', 'P0001'].includes(error.code));
      await assertFits(employee.page);

      const ownNewTitle = 'Compra criada na sessão móvel';
      await employee.page.locator('#invoiceNew').click();
      const compose = employee.page.locator('#invoiceCreate');
      await compose.locator('[name=category]').selectOption('purchase');
      await compose.locator('[name=title]').fill(ownNewTitle);
      await compose.locator('[name=estimatedValue]').fill('49.95');
      await compose.locator('#invoiceDescriptionEditor').fill('Descrição preenchida no formulário');
      let responseLost = false;
      employee.faults.lose = name => {
        if (name !== 'financeiro_save_invoice_request' || responseLost) return false;
        responseLost = true;
        return true;
      };
      await compose.locator('[type=submit]').click();
      const retry = compose.getByRole('button', { name: 'Confirmar envio anterior' });
      await retry.waitFor();
      assert.equal(await compose.locator('[name=title]').inputValue(), ownNewTitle);
      assert.equal(await card(employee.page, ownNewTitle).count(), 0);
      await retry.click();
      await card(employee.page, ownNewTitle).waitFor();
      const created = await queryAs(db, 2, 'financeiro_listar_solicitacoes');
      assert.equal(created.filter(request => request.title === ownNewTitle).length, 1);
      const ownNewId = created.find(request => request.title === ownNewTitle).id;
      assert.ok(responseLost);

      await waitForRpc(employee.page);
      await choose(employee.page, requestId, 'edit');
      await compose.locator('[name=title]').fill('Rascunho durante outra edição');
      const initial = await readItem(db, 2, requestId);
      await queryAs(db, 2, 'financeiro_acao_solicitacao', {
        p_id: requestId, p_revisao: initial.revision, p_acao: 'edit', p_esperado: initial.request,
        p_dados: { title: 'Equipamento para vistoria revisado em sessão paralela' }, p_operacao: id(999),
      });
      await compose.locator('[type=submit]').click();
      await compose.getByText(/mudou|atualizada|conflito/i).waitFor();
      assert.equal(await compose.locator('[name=title]').inputValue(), 'Rascunho durante outra edição');
      const concurrentTitle = 'Equipamento para vistoria revisado em sessão paralela';
      assert.equal((await readItem(db, 2, requestId)).request.title, concurrentTitle);
      await employee.page.locator('[data-invoice-close]').click();
      await admin.page.evaluate(() => render());
      await card(admin.page, concurrentTitle).waitFor();

      await card(employee.page, concurrentTitle).click();
      await employee.page.locator('.invoice-attachments input[type=file]').setInputFiles({
        name: 'comprovante-sintetico.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\n%%EOF'),
      });
      await employee.page.getByRole('button', { name: 'Anexar documento' }).click();
      await employee.page.getByRole('button', { name: 'Baixar comprovante-sintetico.pdf' }).waitFor();
      const attachments = await queryAs(db, 2, 'financeiro_listar_anexos_solicitacao', { p_id: requestId });
      assert.equal(attachments.length, 1);
      assert.ok(attachments[0].confirmedAt);
      await employee.page.locator('[data-invoice-close]').click();

      const search = admin.page.locator('[name=search]');
      await search.fill('VISTORIA');
      await card(admin.page, otherTitle).waitFor({ state: 'hidden' });
      await card(admin.page, concurrentTitle).waitFor();
      await admin.page.locator('#invoiceAdvanced summary').click();
      await admin.page.locator('[name=sector]').selectOption('Comercial');
      await card(admin.page, concurrentTitle).waitFor({ state: 'hidden' });
      await admin.page.locator('[name=sector]').selectOption('Projetos');
      await card(admin.page, concurrentTitle).waitFor();
      await admin.page.locator('[name=sector]').selectOption('');
      await search.fill('');

      await card(admin.page, concurrentTitle).click({ button: 'right' });
      await action(admin.page, 'return').waitFor();
      await admin.page.keyboard.press('Escape');
      await action(admin.page, 'return').waitFor({ state: 'hidden' });
      await scrollTo(admin.page, trigger(admin.page, requestId));
      await trigger(admin.page, requestId).focus();
      await admin.page.keyboard.press('Enter');
      await action(admin.page, 'internal_comment').click();
      await sendAction(admin.page, 'message', 'Comentário interno sintético');
      assert.ok((await readItem(db, 1, requestId)).events.some(event => JSON.stringify(event).includes('Comentário interno sintético')));
      assert.ok(!(await readItem(db, 2, requestId)).events.some(event => JSON.stringify(event).includes('Comentário interno sintético')));

      await choose(admin.page, requestId, 'start_review');
      await sendAction(admin.page);
      const reviewing = await readItem(db, 2, requestId);
      assert.ok(reviewing.state.reviewingUntil);
      assert.equal(reviewing.actions.includes('edit'), false);
      await choose(admin.page, requestId, 'release_review');
      await sendAction(admin.page);
      assert.equal((await readItem(db, 2, requestId)).actions.includes('edit'), true);

      await admin.page.locator('#invoiceCategories').click();
      const categories = admin.page.getByRole('dialog', { name: 'Categorias de solicitações' });
      await categories.locator('[name=category]').fill('Compras de campo');
      await categories.getByRole('button', { name: 'Criar categoria' }).click();
      await categories.waitFor({ state: 'hidden' });
      await choose(admin.page, requestId, 'organize');
      const organization = admin.page.locator('[data-invoice-operation=organize]');
      await organization.locator('[name=categoryId]').selectOption({ label: 'Compras de campo' });
      await organization.locator('[name=assigneeId]').selectOption(id(1));
      await organization.locator('[name=priority]').selectOption('Alta');
      await organization.locator('[name=deadline]').fill('2099-01-01');
      await sendAction(admin.page);
      const organized = await readItem(db, 1, requestId);
      assert.equal(organized.state.assigneeId, id(1));
      assert.equal(organized.state.priority, 'Alta');
      assert.equal(organized.state.deadline, '2099-01-01');
      assert.ok(organized.state.categoryId);

      await choose(admin.page, requestId, 'return');
      await sendAction(admin.page, 'reason', 'Informe a quantidade do equipamento');
      await employee.page.evaluate(() => render());
      const updates = employee.page.locator('#invoiceUpdates summary');
      await updates.waitFor();
      await updates.click();
      await employee.page.locator('[data-invoice-notice]').filter({ hasText: /Devolvida para ajustes/ }).click();
      assert.equal(new URL(employee.page.url()).hash, `#solicitacao=${requestId}`);
      await employee.page.locator('[data-invoice-timeline]').getByText('Informe a quantidade do equipamento', { exact: true }).waitFor();
      await employee.page.locator('[data-invoice-close]').click();
      await choose(employee.page, requestId, 'resubmit');
      await employee.page.locator('[name=title]:visible').fill('Dois equipamentos para vistoria');
      await employee.page.locator('#invoiceCreate [type=submit]').click();
      await card(employee.page, 'Dois equipamentos para vistoria').waitFor();
      const resubmitted = await readItem(db, 2, requestId);
      assert.equal(resubmitted.request.id, requestId);
      assert.equal(resubmitted.state.status, 'Pendente');
      assert.ok(resubmitted.events.some(event => JSON.stringify(event).includes('Informe a quantidade do equipamento')));
      await employee.page.locator('[data-invoice-timeline]').waitFor();
      assert.equal(await employee.page.getByText('Comentário interno sintético', { exact: true }).count(), 0);
      await assertFits(employee.page);
      await employee.page.locator('[data-invoice-close]').click();

      await admin.page.evaluate(() => render());
      await card(admin.page, 'Dois equipamentos para vistoria').click();
      await admin.page.locator('#invoiceResponse').fill('Aprovação da compra de teste');
      await admin.page.locator('#invoiceApprove').click();
      await admin.page.locator('#invoiceApprove').waitFor({ state: 'hidden' });
      const approved = await readItem(db, 1, requestId);
      assert.equal(approved.request.status, 'Aprovada');
      assert.ok(approved.request.convertedId);
      assert.ok(approved.request.convertedPaymentId);
      const financialLinks = await relatedAccounts(db, requestId);
      assert.equal(financialLinks.length, 2);
      await card(admin.page, 'Dois equipamentos para vistoria').getByText('Aprovada', { exact: true }).waitFor();

      for(const [role,session,widths] of [['adm',admin,[1440,390]],['colaborador',employee,[390,1440]]]){
        for(const width of widths){
          await session.page.setViewportSize({width,height:940});
          await session.page.evaluate(rows=>{
            db.accountPayments=rows.filter(row=>row.chave==='accountPayments').map(row=>row.item);
            window.v2PaymentModal=(payment,account)=>{window.openedInvoiceLink=[payment,account]};
            render();
          },financialLinks);
          await card(session.page,'Dois equipamentos para vistoria').getByText('Aprovada',{exact:true}).waitFor();
          await card(session.page,'Dois equipamentos para vistoria').click();
          const detail=session.page.getByRole('dialog',{name:'Detalhes da solicitação'});
          await detail.getByRole('button',{name:'Baixar comprovante-sintetico.pdf'}).waitFor();
          await detail.getByText(/Registros vinculados/).waitFor();
          if(process.env.SOLICITACOES_SCREENSHOTS){
            await fs.promises.mkdir(process.env.SOLICITACOES_SCREENSHOTS,{recursive:true});
            await session.page.screenshot({path:path.join(process.env.SOLICITACOES_SCREENSHOTS,role+'-'+width+'-detalhe.png'),fullPage:true});
          }
          const linked=detail.getByRole('button',{name:'Abrir registro vinculado'});
          if(role==='adm'){
            await linked.click();
            assert.deepEqual(await session.page.evaluate(()=>window.openedInvoiceLink),[approved.request.convertedPaymentId,approved.request.convertedId]);
          }else{
            assert.equal(await linked.count(),0);
            assert.equal(await card(session.page,otherTitle).count(),0);
            await detail.locator('[data-invoice-close]').click();
          }
          await assertFits(session.page);
        }
      }
      await admin.page.setViewportSize({width:1440,height:940});
      await employee.page.setViewportSize({width:390,height:940});

      await choose(admin.page, requestId, 'archive');
      await sendAction(admin.page);
      assert.equal(await admin.page.locator('[data-invoice-scope=archive]').getAttribute('aria-pressed'), 'true');
      await card(admin.page, 'Dois equipamentos para vistoria').waitFor();
      const archived = await readItem(db, 1, requestId);
      assert.equal(archived.request.status, 'Aprovada');
      assert.equal(archived.request.convertedId, approved.request.convertedId);
      assert.equal(archived.request.convertedPaymentId, approved.request.convertedPaymentId);
      assert.ok(archived.state.archivedAt);

      if (process.env.SOLICITACOES_SCREENSHOTS) {
        await fs.promises.mkdir(process.env.SOLICITACOES_SCREENSHOTS, { recursive: true });
        await admin.page.screenshot({ path: path.join(process.env.SOLICITACOES_SCREENSHOTS, 'arquivo-1440.png'), fullPage: true });
        await employee.page.screenshot({ path: path.join(process.env.SOLICITACOES_SCREENSHOTS, 'colaborador-390.png'), fullPage: true });
      }
      await choose(admin.page, requestId, 'unarchive');
      await sendAction(admin.page);
      assert.equal((await readItem(db, 1, requestId)).state.archivedAt, null);
      await employee.page.evaluate(() => render());
      await card(employee.page, 'Dois equipamentos para vistoria').getByText('Aprovada', { exact: true }).waitFor();
      await choose(employee.page, requestId, 'request_change');
      await compose.locator('[name=title]').fill('Versão proposta após a aprovação');
      await compose.locator('[name=reason]').fill('Justificativa da alteração solicitada');
      await compose.locator('[type=submit]').click();
      await compose.waitFor({ state: 'hidden' });
      const proposal = await readItem(db, 2, requestId);
      assert.equal(proposal.request.status, 'Aprovada');
      assert.equal(proposal.request.title, approved.request.title);
      assert.equal(proposal.state.review.status, 'pending');
      assert.deepEqual(await relatedAccounts(db, requestId), financialLinks);
      await admin.page.evaluate(() => render());
      await card(admin.page, approved.request.title).getByText('Pedido de revisão aguardando análise').waitFor();
      await choose(admin.page, requestId, 'decide_review');
      await admin.page.locator('[data-invoice-operation=decide_review] [name=approve]').selectOption('yes');
      await sendAction(admin.page, 'reason', 'Proposta encaminhada para conferência administrativa');
      const decided = await readItem(db, 1, requestId);
      assert.equal(decided.state.review.status, 'approved');
      assert.equal(decided.request.title, approved.request.title);
      assert.deepEqual(await relatedAccounts(db, requestId), financialLinks);

      await employee.page.locator('[data-invoice-close]').click();
      await choose(employee.page, ownNewId, 'cancel');
      await sendAction(employee.page, 'reason', 'Compra sintética cancelada');
      assert.equal((await readItem(db, 2, ownNewId)).state.status, 'Cancelada');
      await choose(employee.page, ownNewId, 'delete');
      await sendAction(employee.page, 'reason', 'Remoção lógica no roteiro de teste');
      await card(employee.page, ownNewTitle).waitFor({ state: 'hidden' });
      const removed = await readItem(db, 1, ownNewId);
      assert.ok(removed.state.deletedAt);
      assert.equal(removed.request.id, ownNewId);
      await admin.page.evaluate(() => render());
      await admin.page.locator('[data-invoice-scope=deleted]').click();
      await choose(admin.page, ownNewId, 'restore');
      await sendAction(admin.page);
      assert.equal((await readItem(db, 1, ownNewId)).state.deletedAt, null);

      for (let n = 200; n < 248; n++) {
        await syntheticRequest(db, 3, id(n), `Solicitação de paginação sintética ${n}`);
      }
      await admin.page.locator('[data-invoice-scope=active]').click();
      await admin.page.evaluate(() => render());
      await admin.page.locator('[data-invoice-page=next]').waitFor();
      assert.equal(await admin.page.locator('[data-invoice-id]').count(), 15);
      for (const current of [2, 3, 4]) {
        await admin.page.locator('[data-invoice-page=next]').click();
        await admin.page.getByText(`Página ${current} de 4`, { exact: true }).waitFor();
      }
      assert.equal(await admin.page.locator('[data-invoice-id]').count(), 6);
      await employee.page.setViewportSize({ width: 768, height: 1024 });
      await assertFits(employee.page);
      await employee.page.setViewportSize({ width: 390, height: 940 });

      const fields={category:'trip',destination:'São José',neededAt:'2099-01-01',vehicleId:'gol',createdAt:new Date().toISOString()};
      await syntheticRequest(db, 2, id(600), 'Viagem existente sintética', fields);
      await syntheticRequest(db, 2, id(601), 'Outra viagem sintética', {...fields,vehicleId:'hb20'});
      const firstTrip=(await readItem(db, 2, id(600))).request;
      await queryAs(db, 1, 'financeiro_revisar_solicitacao', {
        p_id:firstTrip.id,p_esperado:firstTrip,p_aprovar:true,p_resposta:'Primeira viagem',
      });
      const mobileReview=await browserSession(browser,db,1,390);
      try {
        await card(mobileReview.page,'Outra viagem sintética').click();
        await mobileReview.page.locator('#invoiceResponse').fill('Viagem realmente distinta');
        await mobileReview.page.locator('#invoiceApprove').click();
        const related=mobileReview.page.getByRole('button',{name:'Ver pedido: Viagem existente sintética'});
        await related.waitFor();
        assert.equal((await readItem(db, 1, id(601))).request.status,'Pendente');
        await related.click();
        await mobileReview.page.getByRole('heading',{name:'Viagem existente sintética',exact:true}).waitFor();
        await mobileReview.page.locator('[data-invoice-close]').click();
        await card(mobileReview.page,'Outra viagem sintética').click();
        await mobileReview.page.locator('#invoiceApprove').click();
        await mobileReview.page.getByRole('button',{name:'Aprovar como viagem distinta'}).click();
        await mobileReview.page.locator('#invoiceApprove').waitFor({state:'hidden'});
        const distinct=await readItem(db, 1, id(601));
        assert.equal(distinct.request.status,'Aprovada');
        assert.ok(distinct.events.some(event=>event.action==='approve_distinct_trip'));
        assert.deepEqual(mobileReview.pageErrors,[]);
      } finally {
        await mobileReview.context.close();
      }

      // Aprovação editada de solicitante ativo que ainda não tem espelho financeiro.
      await db.query('insert into profiles values ($1,$2,$3,$4,$5,true)',
        [id(7),'Motorista C','c@fixture.test','Projetos','Projetos']);
      for (const [width,actor] of [[1440,3],[390,7]]) {
        const requestId=id(700+actor), title=`Viagem editada sem espelho ${width}`;
        await syntheticRequest(db,actor,requestId,title,{
          category:'trip',destination:`Destino novo ${width}`,neededAt:'2099-11-25',vehicleId:'hb20',
          estimatedValue:60,createdAt:new Date().toISOString(),
        });
        const current=await readItem(db,actor,requestId);
        await queryAs(db,actor,'financeiro_acao_solicitacao',{
          p_id:requestId,p_revisao:current.revision,p_acao:'edit',
          p_dados:{neededAt:'2099-11-26',vehicleId:'gol'},p_operacao:crypto.randomUUID(),p_esperado:current.request,
        });
        const session=await browserSession(browser,db,1,width);
        try {
          let lose=true;
          session.faults.lose=(name,args)=>{
            if(lose&&name==='financeiro_revisar_solicitacao'&&args.p_id===requestId){lose=false;return true;}
            return false;
          };
          await card(session.page,title).click();
          await session.page.locator('#invoiceResponse').fill('Aprovado');
          await session.page.locator('#invoiceApprove').click();
          await session.page.getByRole('button',{name:'Confirmar decisão anterior'}).waitFor();
          await waitForRpc(session.page);
          assert.equal((await readItem(db,1,requestId)).request.status,'Aprovada');
          await session.page.getByRole('button',{name:'Confirmar decisão anterior'}).click();
          await session.page.locator('#invoiceApprove').waitFor({state:'hidden'});
          await card(session.page,title).getByText('Aprovada',{exact:true}).waitFor();
          const users=(await db.query("select dados from financeiro_estado_modulos where chave='usersMvp'")).rows[0].dados;
          const mirrors=users.filter(u=>u.erpId===id(actor));
          assert.equal(mirrors.length,1);
          const trips=(await db.query("select dados from financeiro_estado_modulos where chave='trips'")).rows[0].dados
            .filter(t=>t.invoiceRequestId===requestId);
          assert.equal(trips.length,1);
          assert.equal(trips[0].start,'2099-11-26');
          assert.equal(trips[0].vehicleId,'gol');
          assert.deepEqual(trips[0].assigned,[mirrors[0].id]);
          assert.deepEqual(session.pageErrors,[]);
          await assertFits(session.page);
          if(process.env.SOLICITACOES_SCREENSHOTS)
            await session.page.screenshot({path:path.join(process.env.SOLICITACOES_SCREENSHOTS,`viagem-editada-${width}.png`),fullPage:true});
        } finally { await session.context.close(); }
      }

      assert.deepEqual(admin.pageErrors, []);
      assert.deepEqual(employee.pageErrors, []);
      console.log('PASS UI: aprovação de viagem editada sem espelho e retry sem duplicação (1440/390 px).');
      console.log('PASS UI: filtros, menus, retry, conflito, anexos, devolução, revisão, vínculos e conferência de viagens semelhantes (1440/768/390 px).');
    } finally {
      await employee.context.close();
      await admin.context.close();
    }
  } finally {
    await db.close();
    await browser?.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
