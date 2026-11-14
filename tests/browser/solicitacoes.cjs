// Run with Node and Playwright available via NODE_PATH. Uses isolated browser fixtures.
const {chromium}=require('playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'../..');
const staffId='00000000-0000-4000-8000-000000000001';
const adminId='00000000-0000-4000-8000-000000000002';
(async()=>{
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{channel:process.env.BROWSER_CHANNEL||'chrome'})});
try{
const cases=[
 ['Financeiro',390],['Financeiro',1440],
 ...['Projetos','Comercial','Jurídico','Marketing','Topografia','Pós-protocolo',''].map(sector=>[sector,1440])
];
for(const [sector,width] of cases){
 const page=await browser.newPage({viewport:{width,height:900}});
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/*',r=>r.abort());
 await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="app"><nav class="nav"></nav><div id="content"></div></div>'}));
 await page.goto('https://fixture.test/');
 await page.evaluate(({sector,staffId})=>{
  window.user={role:'Funcionário',sector,setor:sector,erpId:staffId,name:'Funcionário'};
  window.view='invoices';window.db={invoiceRequests:[],usersMvp:[{id:1,erpId:staffId,active:true}],trips:[],budgetRecords:[],accountMasters:[],accountPayments:[]};
  window.adminNav=[['trips','Viagens']];window.staffNav=[['trips','Viagens']];
  window.save=()=>{};window.title=()=>{};window.render=()=>{};
  window.accountRoles=[];window.accounts=()=>accountRoles.push(user.role);
  window.app=()=>{document.querySelector('.nav').innerHTML=staffNav.map(([id,label])=>`<button data-view="${id}">${label}</button>`).join('');document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});render()};
  window.alerts=[];window.alert=m=>alerts.push(m);window.confirm=()=>true;
  window.server=[];window.serverTrips=[];window.fail=false;window.loseReviewResponse=false;window.sessionExpired=false;
  window.reviewAttempts=[];
  window.IntegralFinanceCloudStorage={refresh:async()=>{db.trips=structuredClone(serverTrips)}};
  window.IntegralERP={sb:{auth:{getUser:async()=>({data:{user:sessionExpired?null:{id:user.erpId}}})},rpc:async(name,args)=>{if(name==='financeiro_listar_solicitacoes')return {data:structuredClone(server)};if(fail)return {error:{message:'Servidor recusou'}};
   if(name==='financeiro_revisar_solicitacao'){
    reviewAttempts.push(structuredClone(args));
    const i=server.findIndex(x=>x.id===args.p_id);
    if(i>=0&&server[i].status==='Aprovada'&&args.p_aprovar
     &&JSON.stringify(args)===JSON.stringify(reviewAttempts.at(-2)))return {data:structuredClone(server)};
    if(i<0||server[i].status!=='Pendente'||JSON.stringify(server[i])!==JSON.stringify(args.p_esperado))return {error:{code:'40001',message:'Solicitação atualizada'}};
    const request=server[i];
    const matches=db.usersMvp.filter(profile=>profile.erpId===request.requesterId&&profile.active);
    if(args.p_aprovar&&(!(request.estimatedValue>0)||!request.vehicleId||!request.neededAt||matches.length!==1)){
     return {error:{code:'P0001',message:'Confira veículo, data, orçamento e vínculo do solicitante'}};
    }
    const convertedId=args.p_aprovar?88:undefined;
    server[i]={...server[i],status:args.p_aprovar?'Aprovada':'Rejeitada',response:args.p_resposta,convertedId,
     reviewedAt:'2026-10-29T12:00:00Z',reviewedById:user.erpId};
    if(args.p_aprovar)serverTrips.push({id:convertedId,invoiceRequestId:args.p_id,assigned:[matches[0].id],plannedAmount:request.estimatedValue});
    if(loseReviewResponse){loseReviewResponse=false;throw Error('Conexão interrompida após gravar')}
    return {data:structuredClone(server)};
   }
   if(args.p_expected){const i=server.findIndex(x=>x.id===args.p_request.id);server[i]=structuredClone(args.p_request)}else server.push(structuredClone(args.p_request));return {data:structuredClone(server)}}}};
 },{sector,staffId});
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'public/financeiro-invoices.js'),'utf8')});
 // Exercise the actual legacy navigation wrapper that used to redirect every staff route.
 const bundle=fs.readFileSync(path.join(root,'public/financeiro.bundle.js'),'utf8');
 const legacy=bundle.slice(bundle.indexOf('  const isFinanceSector='),bundle.indexOf('  const baseBudgets=budgets;',bundle.indexOf('  function enforceLimitedNav(){')));
 await page.addScriptTag({content:`(function(){const isAdm=()=>user?.role==='Administrador';const normalizeAssignments=()=>{};const syncSectorsFromERP=()=>{};${legacy}})();`});
 // Freeze observers for the sector guard; exercise its actual click listener and reconcile explicitly.
 await page.evaluate(()=>{window.MutationObserver=class{observe(){}};window.setTimeout=fn=>queueMicrotask(fn)});
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'public/financeiro-finance-sector-access.js'),'utf8')});
 await page.evaluate(()=>app());
 if(sector==='Financeiro'){
  await page.locator('[data-view="accounts"]').click();
  assert.deepEqual(await page.evaluate(()=>accountRoles),['Funcionário']);
 }
 await page.locator('[data-view="invoices"]').click();
 await page.locator('#invoiceNew').click();
 await page.locator('[name=vehicleId]').selectOption('gol');await page.locator('[name=neededAt]').fill('2026-10-29');
 await page.locator('[name="estimatedValue"]').fill('10');
 await page.locator('[name="title"]').fill('Pedido de teste');
 await page.locator('#invoiceDescriptionEditor').fill('Descrição de teste');
 await page.locator('[type="submit"]').click();
 await page.locator('[data-invoice-id]').waitFor();
 assert.equal(await page.evaluate(()=>server[0].requesterId),staffId);
 await page.locator('[data-invoice-id]').click();
 assert.equal(await page.locator('#invoiceApprove,#invoiceReject').count(),0);
 await page.locator('[data-invoice-close]').click();
 if(sector==='Financeiro'){
  await page.evaluate(adminId=>{user={role:'Administrador',erpId:adminId,name:'ADM'};render()},adminId);
  await page.locator('[data-invoice-id]').click();
  assert.equal(await page.locator('#invoiceApprove,#invoiceReject').count(),2);
  await page.locator('#invoiceResponse').fill('Aprovado para teste');
  await page.evaluate(()=>loseReviewResponse=true);
  await page.locator('#invoiceApprove').click();
  await page.waitForFunction(()=>server[0].status==='Aprovada');
  await page.waitForFunction(()=>alerts.length===1);
  assert.equal(await page.evaluate(()=>db.invoiceRequests[0].status),'Pendente');
  assert.equal(await page.locator('#invoiceReject').isDisabled(),true);
  await page.locator('[data-invoice-close]').click();
  await page.locator('[data-invoice-id]').click();
  assert.equal(await page.locator('#invoiceResponse').inputValue(),'Aprovado para teste');
  await page.getByRole('button',{name:'Confirmar decisão anterior'}).click();
  await page.waitForFunction(()=>db.invoiceRequests[0].status==='Aprovada'&&db.trips.length===1);
  assert.equal(await page.evaluate(()=>JSON.stringify(reviewAttempts[0])===JSON.stringify(reviewAttempts[1])),true);
  assert.equal(await page.evaluate(()=>serverTrips.length),1);
  assert.deepEqual(await page.evaluate(()=>db.trips[0]),{
   id:88,invoiceRequestId:await page.evaluate(()=>db.invoiceRequests[0].id),assigned:[1],plannedAmount:10
  });
  assert.equal(await page.evaluate(()=>db.invoiceRequests[0].convertedId),88);
  await page.evaluate(()=>alerts.length=0);
  assert.equal(await page.evaluate(()=>db.trips.length),1);
  await page.locator('#invoiceNew').click();
 await page.locator('[name=vehicleId]').selectOption('gol');await page.locator('[name=neededAt]').fill('2026-10-29');
  await page.locator('[name="estimatedValue"]').fill('10');
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
 await page.locator('[name=vehicleId]').selectOption('gol');await page.locator('[name=neededAt]').fill('2026-10-29');
  await page.locator('[name="estimatedValue"]').fill('10');
 await page.locator('[name="title"]').fill('Falha controlada');
  await page.locator('#invoiceDescriptionEditor').fill('Não deve fechar ao falhar');
  await page.evaluate(()=>fail=true);
  await page.locator('[type="submit"]').click();
  await page.waitForFunction(()=>alerts.length===1);
  assert.equal(await page.locator('#invoiceCreate').count(),1);
  assert.equal(await page.evaluate(()=>server.length),2);
  await page.evaluate(()=>{alerts.length=0;fail=false;sessionExpired=true});
  await page.locator('[type="submit"]').click();
  await page.waitForFunction(()=>alerts.length===1);
  assert.match(await page.evaluate(()=>alerts[0]),/entre novamente/i);
  assert.equal(await page.locator('[name="title"]').inputValue(),'Falha controlada');
  assert.equal(await page.evaluate(()=>server.length),2);
 }
 assert.deepEqual(pageErrors,[]);
 await page.close();
 console.log('PASS UI:',sector||'sem setor',width+'px');
}
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
