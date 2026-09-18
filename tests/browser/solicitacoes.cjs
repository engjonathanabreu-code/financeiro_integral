// Run with Node and Playwright available via NODE_PATH. Uses isolated browser fixtures.
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'../..');
(async()=>{
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
try{
for(const sector of ['Financeiro','Projetos','Comercial','Jurídico','Marketing','Topografia','Pós-protocolo','']){
 const page=await browser.newPage();
 await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="app"><nav class="nav"></nav><div id="content"></div></div>'}));
 await page.goto('https://fixture.test/');
 await page.evaluate(sector=>{
  window.user={role:'Funcionário',sector,setor:sector,erpId:'staff',name:'Funcionário'};
  window.view='invoices';window.db={invoiceRequests:[],usersMvp:[],trips:[],budgetRecords:[],accountMasters:[],accountPayments:[]};
  window.adminNav=[['trips','Viagens']];window.staffNav=[['trips','Viagens']];
  window.save=()=>{};window.title=()=>{};window.render=()=>{};
  window.app=()=>{document.querySelector('.nav').innerHTML=staffNav.map(([id,label])=>`<button data-view="${id}">${label}</button>`).join('');document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});render()};
  window.alerts=[];window.alert=m=>alerts.push(m);window.confirm=()=>true;
  window.server=[];window.fail=false;window.IntegralERP={sb:{auth:{getUser:async()=>({data:{user:{id:user.erpId}}})},rpc:async(name,args)=>{if(fail)return {error:{message:'Servidor recusou'}};if(args.p_expected){const i=server.findIndex(x=>x.id===args.p_request.id);server[i]=structuredClone(args.p_request)}else server.push(structuredClone(args.p_request));return {data:structuredClone(server)}}}};
 },sector);
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'public/financeiro-invoices.js'),'utf8')});
 // Freeze timers/observers for the sector guard; exercise its actual click listener and reconcile explicitly.
 await page.evaluate(()=>{window.MutationObserver=class{observe(){}};window.setTimeout=()=>0});
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'public/financeiro-finance-sector-access.js'),'utf8')});
 await page.evaluate(()=>app());
 await page.locator('[data-view="invoices"]').click();
 await page.locator('#invoiceNew').click();
 await page.locator('[name="title"]').fill('Pedido de teste');
 await page.locator('#invoiceDescriptionEditor').fill('Descrição de teste');
 await page.locator('[type="submit"]').click();
 await page.locator('[data-invoice-id]').waitFor();
 assert.equal(await page.evaluate(()=>server[0].requesterId),'staff');
 await page.locator('[data-invoice-id]').click();
 assert.equal(await page.locator('#invoiceApprove,#invoiceReject').count(),0);
 await page.locator('[data-invoice-close]').click();
 if(sector==='Financeiro'){
  await page.evaluate(()=>{user={role:'Administrador',erpId:'admin',name:'ADM'};render()});
  await page.locator('[data-invoice-id]').click();
  assert.equal(await page.locator('#invoiceApprove,#invoiceReject').count(),2);
  await page.locator('#invoiceResponse').fill('Aprovado para teste');
  await page.locator('#invoiceApprove').click();
  await page.waitForFunction(()=>server[0].status==='Aprovada');
  assert.equal(await page.evaluate(()=>db.trips.length),1);
  await page.locator('#invoiceNew').click();
  await page.locator('[name="title"]').fill('Pedido para rejeitar');
  await page.locator('#invoiceDescriptionEditor').fill('Teste rejeição');
  await page.locator('[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-invoice-id]').length===2);
  await page.getByRole('button',{name:/Pedido para rejeitar/}).click();
  await page.locator('#invoiceResponse').fill('Rejeitado para teste');
  await page.locator('#invoiceReject').click();
  await page.waitForFunction(()=>server[1].status==='Rejeitada');
  assert.equal(await page.evaluate(()=>db.trips.length),1);
  await page.locator('#invoiceNew').click();
  await page.locator('[name="title"]').fill('Falha controlada');
  await page.locator('#invoiceDescriptionEditor').fill('Não deve fechar ao falhar');
  await page.evaluate(()=>fail=true);
  await page.locator('[type="submit"]').click();
  await page.waitForFunction(()=>alerts.length===1);
  assert.equal(await page.locator('#invoiceCreate').count(),1);
  assert.equal(await page.evaluate(()=>server.length),2);
 }
 await page.close();
 console.log('PASS UI:',sector||'sem setor');
}
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
