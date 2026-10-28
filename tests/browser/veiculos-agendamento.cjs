/* Navegador → RPCs SQL reais (PGlite), fixture isolado, nenhuma rede externa. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {setup,login,rpc,id,foto,approve}=require('../veiculos-fixtures.cjs');
const root=path.join(__dirname,'../..'),out=path.join(root,'docs/qa-veiculos-agendamento');fs.mkdirSync(out,{recursive:true});let checks=0;
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const width of [1440,390]){
  const db=await setup(null,null,false);await login(db,1);let old=await approve(db,70);delete old.vehicleId;old.createdAt=new Date().toISOString();old.description='Pedido antigo preservado';old.title='Viagem antiga';old.history=[{action:'Aprovada'}];
  await db.query("update financeiro_estado_modulos set dados=$1 where chave='invoiceRequests'",[JSON.stringify([old])]);await db.exec('reset role');await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261028121955_financeiro_veiculos_agendamento.sql'),'utf8'));await login(db,2);
  const today=(await rpc(db,'painel')).hoje;const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);const tomorrow=date.toISOString().slice(0,10);
  const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'America/Sao_Paulo'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='fixture.test'?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"><nav class="nav"></nav><h1 id="heading"></h1><div id="content"></div></div></html>'}):r.abort());
  await page.exposeFunction('testRpc',async(name,args)=>{try{return {data:name==='financeiro_veiculos_api'?await rpc(db,args.p_acao,args.p):(await db.query('select financeiro_save_invoice_request($1,$2) data',[JSON.stringify(args.p_request),args.p_expected&&JSON.stringify(args.p_expected)])).rows[0].data}}catch(e){return {error:{message:e.message}}}});
  await page.exposeFunction('testSaveTrips',async trips=>db.query("update financeiro_estado_modulos set dados=$1 where chave='trips'",[JSON.stringify(trips)]));
  await page.goto('https://fixture.test');
  const modules=(await db.query("select chave,dados from financeiro_estado_modulos where chave in ('invoiceRequests','trips','usersMvp')")).rows;
  await page.evaluate(({driver,modules})=>{
   window.user={name:'Motorista A',role:'Funcionário',sector:'Projetos',erpId:driver,email:'a@fixture.test'};window.view='invoices';window.db={budgetRecords:[],accountMasters:[],accountPayments:[],...Object.fromEntries(modules.map(m=>[m.chave,m.dados]))};
   window.adminNav=[['trips','Viagens']];window.staffNav=[['trips','Viagens']];window.title=t=>document.querySelector('#heading').textContent=t;
   window.render=()=>{document.querySelector('#content').innerHTML=''};
   window.app=()=>{document.querySelector('.nav').innerHTML=staffNav.map(([id,label])=>`<button data-view="${id}">${label}</button>`).join('');document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});render()};
   window.save=()=>{if(user.role==='Administrador')window.tripSave=window.testSaveTrips(db.trips)};
   window.IntegralERP={sb:{auth:{getUser:async()=>({data:{user:{id:user.erpId}}})},rpc:window.testRpc}};
   window.alerts=[];window.alert=m=>alerts.push(m);window.confirm=()=>true;
  },{driver:id(2),modules});
  for(const f of ['financeiro.bundle.css','financeiro-responsive.css','financeiro-design-system.css','financeiro-invoices.css','financeiro-veiculos.css'])await page.addStyleTag({path:path.join(root,'public',f)});
  for(const f of ['financeiro-invoices.js','financeiro-trip-documents.js','financeiro-veiculos-metrics.js','financeiro-veiculos.js'])await page.addScriptTag({path:path.join(root,'public',f)});
  await page.evaluate(()=>app());await page.locator('#invoiceNew').click();
  await page.locator('[name=title]').fill('Viagem amanhã');await page.locator('#invoiceDescriptionEditor').fill('Vistoria sintética');await page.locator('[name=estimatedValue]').fill('200');
  await page.locator('[type=submit]').click();assert.equal((await rpc(db,'painel')).solicitacoes.length,1);checks++;
  await page.locator('[name=category]').selectOption('purchase');assert.equal(await page.locator('.invoice-vehicle').isVisible(),false);assert.equal(await page.locator('[name=neededAt]').getAttribute('required'),null);checks++;
  await page.locator('[name=category]').selectOption('trip');await page.locator('[name=neededAt]').fill(tomorrow);await page.locator('[name=vehicleId]').selectOption('hb20');await page.locator('[name=destination]').fill('Cidade de teste');
  await page.locator('[name=vehicleId]').blur();
  assert.equal(await page.evaluate(()=>{const m=document.querySelector('.invoice-modal'),b=document.querySelector('.invoice-compose-foot').getBoundingClientRect();return m.scrollWidth<=m.clientWidth+1&&b.top>=0&&b.bottom<=innerHeight}),true,'formulário sem corte horizontal e botão de envio visível');checks++;
  await page.screenshot({path:path.join(out,`solicitacao-${width}.png`),fullPage:true});
  await page.locator('[type=submit]').click();await page.waitForFunction(()=>db.invoiceRequests.length===2);checks++;
  let req=(await rpc(db,'painel')).solicitacoes.find(a=>a.title==='Viagem amanhã');assert.equal(req.vehicleId,'hb20');assert.equal(req.status,'Pendente');checks++;
  await page.locator('[data-view=vehicles]').click();await page.locator('[data-start=hb20]').click();await page.locator('#vehicleDialog').getByText(/precisa estar aprovada/).waitFor();assert.equal(await page.locator('[name=km_inicial]').count(),0);checks++;
  await page.locator('#vehicleDialog [data-cancel]').click();await page.locator('[data-requests]').click();
  await login(db,1);await page.evaluate(admin=>{user={role:'Administrador',erpId:admin,name:'ADM'};view='invoices';render()},id(1));
  await page.getByRole('button',{name:/Viagem amanhã/}).click();await page.locator('#invoiceResponse').fill('Aprovado no teste isolado');await page.locator('#invoiceApprove').click();await page.waitForFunction(()=>db.invoiceRequests.some(a=>a.title==='Viagem amanhã'&&a.status==='Aprovada'));await page.evaluate(()=>tripSave);
  assert.equal(await page.evaluate(()=>db.trips.find(t=>t.city==='Cidade de teste').vehicleId),'hb20');checks++;
  await login(db,2);await page.evaluate(driver=>{user={name:'Motorista A',role:'Funcionário',sector:'Projetos',erpId:driver,email:'a@fixture.test'};view='vehicles';app()},id(2));
  await page.locator('[data-start=hb20]').click();await page.locator('#vehicleDialog').getByText(/Retirada liberada somente em/).waitFor();assert.equal(await page.locator('[name=km_inicial]').count(),0);checks++;
  await page.screenshot({path:path.join(out,`data-futura-${width}.png`),fullPage:true});
  await page.locator('[data-open-requests]').click();await page.getByRole('button',{name:/Viagem antiga/}).click();
  await page.locator('#invoiceLegacyVehicle').selectOption('gol');await page.locator('#invoiceSetVehicle').click();await page.waitForFunction(()=>db.invoiceRequests.find(a=>a.title==='Viagem antiga').vehicleId==='gol');
  assert.equal(await page.locator('#invoiceSetVehicle').count(),0);const preserved=await page.evaluate(()=>db.invoiceRequests.find(a=>a.title==='Viagem antiga'));for(const [k,v] of Object.entries(old))assert.deepEqual(preserved[k],v,k);checks++;
  await page.locator('[data-invoice-close]').click();await page.locator('[data-view=vehicles]').click();await page.locator('[data-start=hb20]').click();assert.equal(await page.locator('[name=km_inicial]').count(),0);await page.locator('#vehicleDialog [data-cancel]').click();checks++;
  await page.locator('[data-start=gol]').click();await page.locator('[name=km_inicial]').fill('100');await page.locator('[name=conferencia]').check();await page.locator('[name=foto]').setInputFiles({name:'painel.png',mimeType:'image/png',buffer:Buffer.from(foto.dataUrl.split(',')[1],'base64')});await page.locator('#vehicleDialog [type=submit]').click();await page.locator('[data-finish]').first().waitFor();
  const use=(await rpc(db,'painel')).usos[0];assert.equal(use.veiculo_id,'gol');assert.equal(use.solicitacao_id,old.id);checks++;
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>alerts),[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
  await context.close();await db.close();
 }
 fs.writeFileSync(path.join(out,'agendamento-browser.json'),JSON.stringify({result:'passed',checks,viewports:[1440,390],network:'totalmente interceptada; dados sintéticos',flow:'solicitar → aprovar/converter → bloqueio futuro → completar legado → retirar carro correto'},null,2));console.log(`${checks} verificações de agendamento no navegador passaram.`);
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
