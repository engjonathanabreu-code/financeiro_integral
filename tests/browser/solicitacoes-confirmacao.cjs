/* Confirmação de orçamento/reparo: transporte interrompido e respostas tardias.
 * Usa as RPCs SQL reais no PGlite; nenhuma gravação ou autenticação de produção. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { setupSolicitacoes, browserSession, syntheticRequest, readItem, card, assertFits, id } = require('./solicitacoes-central.cjs');

async function screenshot(page, name) {
  if (!process.env.SOLICITACOES_SCREENSHOTS) return;
  await fs.promises.mkdir(process.env.SOLICITACOES_SCREENSHOTS, { recursive: true });
  await page.locator('#invoiceApprove').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(process.env.SOLICITACOES_SCREENSHOTS, name + '.png'), fullPage: true });
}

async function run() {
  const db = await setupSolicitacoes();
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE_PATH });
  try {
    const requestId = id(850), title = 'Conserto ABS sintético';
    await syntheticRequest(db, 2, requestId, title, {
      category: 'budget', estimatedValue: 395, neededAt: '2026-11-18', project: '', destination: '',
    });
    const session = await browserSession(browser, db, 1, 390);
    const page = session.page;
    try {
      await page.clock.install();
      await card(page, title).click();
      await page.locator('#invoiceResponse').fill('Aprovado e pago');
      await page.evaluate(() => {
        window.originalReviewAuth = IntegralERP.sb.auth.getUser;
        window.reviewRpcCalls = 0;
        const rpc = IntegralERP.sb.rpc;
        IntegralERP.sb.rpc = (name, args) => {
          if (name === 'financeiro_revisar_solicitacao') window.reviewRpcCalls++;
          return rpc(name, args);
        };
        IntegralERP.sb.auth.getUser = () => new Promise(resolve => { window.releaseReviewAuth = resolve; });
      });
      await page.locator('#invoiceApprove').click();
      await page.waitForFunction(() => typeof window.releaseReviewAuth === 'function');
      await page.clock.fastForward(35000);
      await page.getByRole('button', { name: 'Confirmar decisão anterior' }).waitFor();
      assert.equal(await page.locator('#invoiceApprove').isEnabled(), true, 'espera da autenticação não pode travar os botões');
      assert.equal((await readItem(db, 1, requestId)).request.status, 'Pendente');
      assert.equal(await page.evaluate(() => window.reviewRpcCalls), 0);
      await screenshot(page, 'sessao-sem-resposta-390');
      await page.evaluate(async () => {
        window.releaseReviewAuth(await window.originalReviewAuth());
        IntegralERP.sb.auth.getUser = window.originalReviewAuth;
      });
      await page.waitForTimeout(30);
      assert.equal(await page.evaluate(() => window.reviewRpcCalls), 0, 'auth tardia não pode disparar uma aprovação depois do timeout');
      assert.equal(await page.locator('#invoiceResponse').inputValue(), 'Aprovado e pago');
      await page.locator('#invoiceApprove').click();
      await page.locator('#invoiceApprove').waitFor({ state: 'hidden' });
      const approved = await readItem(db, 1, requestId);
      assert.equal(approved.request.status, 'Aprovada');
      assert.equal(approved.request.response, 'Aprovado e pago');
      const budgets = (await db.query("select dados from financeiro_estado_modulos where chave='budgetRecords'")).rows[0].dados;
      assert.equal(budgets.filter(row => row.invoiceRequestId === requestId).length, 1);
      await assertFits(page);
      assert.deepEqual(session.pageErrors, []);
      console.log('PASS: autenticação sem resposta libera a tela, preserva a decisão e não aprova ao chegar atrasada; orçamento confirmado uma única vez.');
    } finally { await session.context.close(); }

    for (const approved of [true, false]) {
      const requestId = id(approved ? 851 : 852), title = approved ? 'Reparo com retorno retido' : 'Rejeição com retorno retido';
      await syntheticRequest(db, 2, requestId, title, { category: 'budget', estimatedValue: 395, neededAt: '2026-11-18' });
      const session = await browserSession(browser, db, 1, 1440);
      const page = session.page;
      try {
        await page.clock.install();
        await card(page, title).click();
        await page.locator('#invoiceResponse').fill(approved ? 'Aprovado e pago' : 'Rejeitado com orientação');
        await page.evaluate(() => {
          const rpc = IntegralERP.sb.rpc;
          window.reviewPayloads = [];
          IntegralERP.sb.rpc = (name, args) => {
            if (name !== 'financeiro_revisar_solicitacao') return rpc(name, args);
            window.reviewPayloads.push(structuredClone(args));
            if (window.reviewPayloads.length > 1) return rpc(name, args);
            const held = rpc(name, args).then(result => {
              window.reviewCommitted = true;
              return new Promise(resolve => { window.releaseLateReview = () => resolve(result); });
            });
            const request = {
              then: (resolve, reject) => held.then(resolve, reject),
              abortSignal(signal) { window.reviewAbortSignal = signal; return request; },
            };
            return request;
          };
        });
        const button = approved ? '#invoiceApprove' : '#invoiceReject';
        const opposite = approved ? '#invoiceReject' : '#invoiceApprove';
        await page.locator(button).click();
        await page.waitForFunction(() => window.reviewCommitted);
        await page.clock.fastForward(25000);
        await page.getByRole('button', { name: 'Confirmar decisão anterior' }).waitFor();
        assert.equal(await page.locator(button).isEnabled(), true);
        assert.equal(await page.locator(opposite).isEnabled(), false, 'resultado incerto mantém a mesma decisão para o retry');
        assert.equal(await page.evaluate(() => window.reviewAbortSignal.aborted), true);
        await screenshot(page, approved ? 'rpc-sem-resposta-1440' : 'rejeicao-sem-resposta-1440');
        await page.locator(button).click();
        await page.locator(button).waitFor({ state: 'hidden' });
        const current = await readItem(db, 1, requestId);
        assert.equal(current.request.status, approved ? 'Aprovada' : 'Rejeitada');
        const payloads = await page.evaluate(() => window.reviewPayloads);
        assert.equal(payloads.length, 2);
        assert.deepEqual(payloads[0], payloads[1], 'retry repete o mesmo payload idempotente');
        await page.evaluate(() => window.releaseLateReview());
        await page.waitForTimeout(30);
        assert.equal(await page.evaluate(id => db.invoiceRequests.find(r => r.id === id).status, requestId), current.request.status);
        const budgets = (await db.query("select dados from financeiro_estado_modulos where chave='budgetRecords'")).rows[0].dados;
        assert.equal(budgets.filter(row => row.invoiceRequestId === requestId).length, approved ? 1 : 0);
        assert.deepEqual(session.pageErrors, []);
        console.log('PASS: retorno perdido de ' + (approved ? 'aprovação' : 'rejeição') + ' libera a tela; retry idêntico e retorno tardio preservam a decisão sem duplicação.');
      } finally { await session.context.close(); }
    }

    const staleId = id(853), staleTitle = 'Reparo durante leitura antiga';
    await syntheticRequest(db, 2, staleId, staleTitle, { category: 'budget', estimatedValue: 395 });
    const staleSession = await browserSession(browser, db, 1, 1440);
    try {
      const page = staleSession.page;
      await card(page, staleTitle).waitFor();
      await page.waitForFunction(() => window.fixtureRpcInFlight === 0);
      await page.evaluate(() => {
        const rpc = IntegralERP.sb.rpc;
        let held = false;
        IntegralERP.sb.rpc = async (name, args) => {
          if (name === 'financeiro_central_solicitacoes' && args.p_id === null && !held) {
            held = true;
            const result = await rpc(name, args);
            window.oldCentralRead = true;
            return new Promise(resolve => { window.releaseOldCentralRead = () => resolve(result); });
          }
          return rpc(name, args);
        };
        window.dispatchEvent(new Event('online'));
      });
      await page.waitForFunction(() => window.oldCentralRead);
      await card(page, staleTitle).click();
      await page.locator('#invoiceResponse').fill('Aprovado e pago');
      await page.locator('#invoiceApprove').click();
      await page.locator('#invoiceApprove').waitFor({ state: 'hidden' });
      await card(page, staleTitle).getByText('Aprovada', { exact: true }).waitFor();
      await page.evaluate(() => window.releaseOldCentralRead());
      await page.waitForTimeout(30);
      await card(page, staleTitle).getByText('Aprovada', { exact: true }).waitFor();
      assert.equal((await readItem(db, 1, staleId)).request.status, 'Aprovada');
      assert.deepEqual(staleSession.pageErrors, []);
      console.log('PASS: leitura iniciada antes da aprovação não devolve o cartão para pendente.');
    } finally { await staleSession.context.close(); }
  } finally {
    await browser.close();
    await db.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
