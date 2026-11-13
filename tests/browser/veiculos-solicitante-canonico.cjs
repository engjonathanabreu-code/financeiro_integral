/* Navegador -> RPC SQL PGlite. Rede interceptada; somente identidades e foto sintéticas. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {setup,login,rpc,id,approve}=require('../veiculos-fixtures.cjs');
const root=path.join(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'})});
 let checks=0;
 try{for(const width of [1440,390]){
  const db=await setup();const context=await browser.newContext({viewport:{width,height:1000},timezoneId:'America/Sao_Paulo'});
  try{
   await login(db,1);await approve(db,10,'hb20');const zero=await approve(db,11,'hb20');
   await db.query('select financeiro_save_invoice_request($1,$2)',[JSON.stringify({...zero,estimatedValue:0}),JSON.stringify(zero)]);
   await db.exec(`reset role;update profiles set tipo='Comercial',setor=null where id='${id(2)}';update financeiro_estado_modulos set dados='[]' where chave='usersMvp';update financeiro_estado_modulos set dados=(select jsonb_agg(t||'{"assigned":[]}'::jsonb) from jsonb_array_elements(dados)t) where chave='trips';`);
   await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261113173933_financeiro_veiculos_solicitante_canonico.sql'),'utf8'));await login(db,2);
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>new URL(r.request().url()).hostname==='fixture.test'?r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"><nav class="nav"></nav><h1 id="heading"></h1><div id="content"></div></div></html>'}):r.abort());
   await page.exposeFunction('testRpc',async(name,args)=>{try{return {data:await rpc(db,args.p_acao,args.p)}}catch(error){return {error:{message:error.message}}}});
   await page.goto('https://fixture.test');
   await page.evaluate(driver=>{
    window.user={name:'Motorista sintético',role:'Funcionário',sector:'Comercial',erpId:driver};window.view='vehicles';window.db={invoiceRequests:[],usersMvp:[],trips:[]};window.adminNav=[['trips','Viagens']];window.staffNav=[['trips','Viagens']];window.render=()=>{};window.app=()=>render();window.title=t=>document.querySelector('#heading').textContent=t;
    window.IntegralERP={sb:{rpc:window.testRpc}};window.alerts=[];window.alert=m=>alerts.push(m);
   },id(2));
   for(const name of ['financeiro.bundle.css','financeiro-design-system.css','financeiro-veiculos.css'])await page.addStyleTag({path:path.join(root,'public',name)});
   for(const name of ['financeiro-veiculos-metrics.js','financeiro-veiculos.js'])await page.addScriptTag({path:path.join(root,'public',name)});
   await page.evaluate(()=>app());await page.locator('[data-start=hb20]').waitFor();
   assert.equal(await page.getByText(/Liberada para retirada hoje/).count(),1);assert.equal(await page.getByText(/orçamento maior que zero/).count(),1);checks+=2;
   await page.locator('[data-start=hb20]').click();await page.locator('[name=km_inicial]').waitFor();
   const options=await page.locator('[name=solicitacao_id] option').evaluateAll(os=>os.map(o=>o.value));assert.deepEqual(options,[id(10)]);checks++;
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);checks++;
   await page.locator('#vehicleDialog [data-cancel]').click();
   await login(db,3);await page.evaluate(()=>app());await page.locator('[data-start=hb20]').waitFor();await page.locator('[data-start=hb20]').click();await page.getByRole('heading',{name:'Retirada indisponível'}).waitFor();assert.equal(await page.locator('[name=km_inicial]').count(),0);checks++;
   assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>alerts),[]);assert.equal((await rpc(db,'painel')).usos.length,0);checks+=3;
  }finally{await context.close();await db.close()}
 }}finally{await browser.close()}
 console.log(`${checks} verificações passaram em 1440/390 px: solicitação positiva selecionável, orçamento zero/terceiro bloqueados, sem retirada registrada.`);
})().catch(error=>{console.error(error);process.exitCode=1});
