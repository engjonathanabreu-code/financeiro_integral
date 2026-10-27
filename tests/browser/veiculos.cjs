/* QA isolado: navegador -> RPC real em PGlite. Toda rede é interceptada, sem credenciais. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {setup,login,rpc,id,foto,approve}=require('../veiculos-fixtures.cjs');
const root=path.join(__dirname,'../..'),output=path.join(root,'docs/qa-veiculos');fs.mkdirSync(output,{recursive:true});
const body=Buffer.from(foto.dataUrl.split(',')[1],'base64');let checks=0;
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 for(const width of [1440,834,390]){
  const db=await setup();await login(db,1);await approve(db);await login(db,2);
  const context=await browser.newContext({viewport:{width,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width, initial-scale=1"><body><canvas id="matrix"></canvas><div id="app"></div></body></html>'});
   const f=path.join(root,'public',url.pathname);if(fs.existsSync(f))return route.fulfill({path:f});return route.fulfill({status:404,body:'missing'});
  });
  await page.exposeFunction('vehicleRpc',async args=>{try{return {data:await rpc(db,args.p_acao,args.p)}}catch(e){return {error:{message:e.message}}}});
  await page.goto('https://fixture.test');
  await page.evaluate(()=>{localStorage.setItem('integral_fin_real_data_reset_v1','1');window.fixtureSB={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:null}}),signOut:async()=>({})},rpc:(name,args)=>window.fixtureFail?Promise.resolve({error:{message:'Falha sintética de upload/transação'}}):window.vehicleRpc(args)};window.supabase={createClient:()=>fixtureSB};window.ERP_SUPABASE={};});
  for(const f of ['financeiro.bundle.css','financeiro-responsive.css','financeiro-design-system.css','financeiro-theme-dark.css','financeiro-marca.css','financeiro-navigation.css','financeiro-icons.css','financeiro-veiculos.css'])await page.addStyleTag({path:path.join(root,'public',f)});
  await page.addScriptTag({path:path.join(root,'public/financeiro.bundle.js')});
  await page.locator('#erpFinLogin').waitFor();
  await page.evaluate(driver=>{user={name:'Motorista sintético',role:'Funcionário',sector:'Projetos',erpId:driver,email:'a@fixture.test'};db={accounts:[],docs:[],budgets:[],budgetRecords:[{id:11,name:'Viagem de campo',sector:'Projetos',limit:1000,active:true}],budgetExpenses:[],trips:[{id:21,city:'Destino sintético',sector:'Projetos',assigned:[2]}],tripExpenses:[],tripDocuments:[],usersMvp:[{id:2,erpId:driver,name:'Motorista sintético',email:'a@fixture.test'}],sectors:[],plans:[],revenues:[]};view='budgets';app()},id(2));
  for(const f of ['financeiro-trip-documents.js','financeiro-canonical-router.js','financeiro-finance-sector-access.js','financeiro-navigation.js','financeiro-veiculos-metrics.js','financeiro-veiculos.js'])await page.addScriptTag({path:path.join(root,'public',f)});
  await page.evaluate(()=>{window.IntegralFileUploads={fetch:async()=>({ok:false,json:async()=>({details:'IA sintética indisponível. Preencha manualmente.'})})}});
  await page.locator('[data-view=vehicles]').click();await page.locator('[data-start=gol]').waitFor();checks++;
  assert.equal(await page.locator('[data-requests]').count(),0);assert.equal(await page.getByText('Painel administrativo',{exact:true}).count(),0);checks++;
  await page.locator('[data-start=gol]').click();await page.locator('[name=km_inicial]').fill('100');await page.locator('[name=destino]').fill('Destino de QA');await page.locator('[name=foto]').setInputFiles({name:'painel-sintetico.png',mimeType:'image/png',buffer:body});
  await page.locator('[data-read]').click();await page.getByText('IA sintética indisponível. Preencha manualmente.').waitFor();assert.equal(await page.locator('[name=km_inicial]').inputValue(),'100');checks++;
  await page.screenshot({path:path.join(output,`retirada-${width}.png`),fullPage:true});
  await page.locator('#vehicleDialog [data-cancel]').click();assert.equal((await rpc(db,'painel')).usos.length,0);checks++;
  await page.locator('[data-start=gol]').click();await page.locator('[name=km_inicial]').fill('100');await page.locator('[name=destino]').fill('Destino de QA');await page.locator('[name=foto]').setInputFiles({name:'painel-sintetico.png',mimeType:'image/png',buffer:body});await page.locator('[name=conferencia]').check();
  await page.evaluate(()=>window.fixtureFail=true);await page.locator('#vehicleDialog [type=submit]').click();await page.getByText('Falha sintética de upload/transação').waitFor();assert.equal((await rpc(db,'painel')).usos.length,0);checks++;await page.evaluate(()=>window.fixtureFail=false);
  await page.locator('#vehicleDialog [type=submit]').click();await page.locator('[data-finish]').first().waitFor();assert.equal((await rpc(db,'painel')).usos.length,1);checks++;
  await page.evaluate(()=>app());await page.locator('[data-finish]').first().waitFor();assert.equal(await page.evaluate(()=>view),'vehicles');checks++;
  await page.locator('[data-view=trips]').click();await page.locator('[data-view=vehicles]').click();await page.locator('[data-finish]').first().waitFor();checks++;
  await page.locator('[data-finish]').first().click();await page.locator('[name=km_final]').fill('120');await page.locator('[name=foto]').setInputFiles({name:'devolucao.png',mimeType:'image/png',buffer:body});await page.locator('[name=conferencia]').check();await page.locator('#vehicleDialog [type=submit]').click();await page.getByText('20 km reais',{exact:false}).first().waitFor();checks++;
  await page.locator('[data-link]').first().click();await page.locator('[data-open-trip]').click();assert.equal(await page.evaluate(()=>view),'trips');await page.locator('[data-view=vehicles]').click();await page.locator('[data-link]').first().waitFor();checks++;
  const fuel={id:91,tripId:21,type:'Combustível',date:new Date().toISOString().slice(0,10),value:120,origin:'Posto sintético',file:{arquivoId:id(91),name:'recibo-sintetico.pdf'}};
  await db.exec('reset role');await db.query("update financeiro_estado_modulos set dados=$1 where chave='tripExpenses'",[JSON.stringify([fuel])]);await login(db,2);
  await page.locator('[data-refresh]').click();await page.locator('[data-link]').first().click();await page.locator('[name=litros]').fill('20');await page.locator('[name=revisado]').check();await page.locator('#vehicleDialog [type=submit]').click();await page.getByText('R$ 120,00',{exact:true}).first().waitFor();assert.equal((await rpc(db,'painel')).despesas.length,1);checks++;
  await page.locator('[data-report=gol]').click();await page.locator('[name=descricao]').fill('Risco observado na inspeção; alegação sintética para QA.');await page.locator('[name=fotos]').setInputFiles({name:'relato.png',mimeType:'image/png',buffer:body});await page.locator('#vehicleDialog [type=submit]').click();await page.getByText('Risco observado na inspeção; alegação sintética para QA.').waitFor();checks++;
  await page.screenshot({path:path.join(output,`colaborador-${width}.png`),fullPage:true});
  if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,80)})).filter(e=>e.right>innerWidth+1)));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'sem overflow horizontal');checks++;
  await page.screenshot({path:path.join(output,`colaborador-${width}.png`),fullPage:true});
  await login(db,5);await page.evaluate(fin=>{user={name:'Financeiro sintético',role:'Funcionário',tipo:'Financeiro',setor:'Financeiro',sector:'Financeiro',erpId:fin};view='vehicles';app()},id(5));await page.locator('[data-start=gol]').waitFor();assert.equal(await page.getByText('Painel administrativo',{exact:true}).count(),0);checks++;
  await login(db,1);await page.evaluate(admin=>{user={name:'Administrador sintético',role:'Administrador',erpId:admin};view='vehicles';app()},id(1));await page.getByText('Painel administrativo',{exact:true}).waitFor();await page.locator('[data-requests]').waitFor();checks++;
  await page.screenshot({path:path.join(output,`administrador-${width}.png`),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);checks++;
  await context.close();await db.close();
 }
 fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify({checks,viewports:[1440,834,390],network:'interceptada integralmente; sem chamadas externas',database:'PGlite com migração real',result:'passed'},null,2));
 console.log(`${checks} verificações de navegador passaram; screenshots em docs/qa-veiculos.`);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
