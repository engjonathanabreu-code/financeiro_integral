const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
const {fakeModules}=require('../fake-modulos-supabase.cjs');

const actor='00000000-0000-4000-8000-000000000010';
const assets=path.join(__dirname,'../../public');
const home='https://fixture.test';
const modules={trips:[{id:'sintetica',city:'Lages',sector:'Projetos',status:'Planejada',assigned:[]}],
  tripExpenses:[],tripDocuments:[]};

(async()=>{
 const engine=process.env.TRIP_BROWSER==='webkit'?webkit:chromium;
 const browser=await engine.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{
   executablePath:process.env.BROWSER_EXECUTABLE_PATH
 }:{})});
 try{
  const context=await browser.newContext({viewport:{width:390,height:800},hasTouch:true,isMobile:true});
  const page=await context.newPage(),errors=[],calls=[],receipts=new Map(),objects=new Map();
  page.setDefaultTimeout(8000);
  page.on('pageerror',error=>errors.push(error.message));
  const table=fakeModules(modules);
  let loseResponse=true,allowUploads=false;
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==home)return route.abort();
    return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main><h1 id="title"></h1><div id="content"></div></main>'});
  });
  await page.exposeFunction('readModules',keys=>table.rows(keys));
  await page.exposeFunction('fakeRpc',async(name,args)=>{
    if(name==='is_admin')return {data:false};
    if(name==='financeiro_listar_modulos_visiveis')return table.rows(args.p_chaves);
    if(name==='financeiro_salvar_modulo_com_recibo')return table.save(args);
    if(name!=='financeiro_salvar_viagem')throw Error('Unexpected RPC '+name);
    calls.push(args);
    if(receipts.has(args.p_operacao))return {data:{status:'salvo',viagem:receipts.get(args.p_operacao),repetido:true}};
    const travel={id:args.p_id,...args.p_campos};
    modules.trips.push(travel);
    receipts.set(args.p_operacao,travel);
    if(loseResponse){loseResponse=false;return {error:{message:'Resposta perdida depois do commit'}}}
    return {data:{status:'salvo',viagem:travel}};
  });
  await page.exposeFunction('mockObjectUpload',(objectPath,data)=>{
    if(!allowUploads)return {error:{message:'Sem conexão'}};
    if(objects.has(objectPath))return {error:{statusCode:'409'}};
    objects.set(objectPath,Buffer.from(data));
    return {data:{path:objectPath}};
  });
  await context.addInitScript(({actor})=>{
    const setItem=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){
      if(key.startsWith('integral_fin_pendente_v3:')||key.startsWith('integral_fin_viagem_form:')){
        throw new DOMException('Quota simulada','QuotaExceededError');
      }
      return setItem.call(this,key,value);
    };
    window.user={erpId:actor,name:'Pessoa sintética',role:'Funcionário',sector:'Projetos'};
    window.db={trips:[],tripExpenses:[],tripDocuments:[],usersMvp:[]};
    window.title=label=>{document.querySelector('#title').textContent=label};
    window.money=n=>String(n);
    window.view='trips';
    window.render=()=>window.trips?.();
    window.save=()=>{};
    window.v2modal=(title,html)=>{
      const modal=document.createElement('div');
      modal.className='modal-backdrop';
      const content=document.createElement('section');
      content.className='modal';
      const heading=document.createElement('h2');heading.textContent=title;
      content.append(heading);
      content.insertAdjacentHTML('beforeend',html);
      modal.append(content);
      document.body.append(modal);
      return modal;
    };
    window.IntegralERP={sb:{
      auth:{getSession:async()=>({data:{session:{user:{id:actor}}}})},
      from:()=>({select:()=>({then:(resolve,reject)=>readModules(null).then(resolve,reject),in:(_column,keys)=>readModules(keys)})}),
      rpc:(name,args)=>fakeRpc(name,args),
      storage:{from:()=>({upload:async(objectPath,file)=>mockObjectUpload(objectPath,[...new Uint8Array(await file.arrayBuffer())])})}
    }};
  },{actor});
  async function boot(reload=false){
    if(reload)await page.reload();
    else await page.goto(home);
    await page.addStyleTag({path:path.join(assets,'financeiro.bundle.css')});
    for(const asset of ['financeiro-cloud-storage.js','financeiro-trip-documents.js','patch-v26-trip-ai.js']){
      await page.addScriptTag({path:path.join(assets,asset)});
    }
    assert.equal(await page.evaluate(()=>IntegralFinanceCloudStorage.initialize()),true);
    await page.locator('#trip26New').waitFor();
  }
  await boot();
  await page.locator('#trip26New').evaluate(button=>{button.click();button.click()});
  const create=page.locator('#trip26Form');
  await create.waitFor();
  assert.equal(await create.count(),1);
  await create.locator('[name=city]').fill('Ibirama');
  await create.locator('[name=start]').fill('2026-11-21');
  await create.locator('[name=end]').fill('2026-11-22');
  await create.locator('button').evaluate(button=>{button.click();button.click()});
  await page.getByText(/resposta perdida depois do commit/i).waitFor();
  assert.equal(modules.trips.length,2);
  await boot(true);
  await page.locator('#trip26New').click();
  await page.getByText(/há um envio pendente/i).waitFor();
  await create.locator('button').click();
  await create.waitFor({state:'detached'});
  assert.equal(modules.trips.length,2);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0],calls[1]);

  await page.locator('[data-trip26-open="sintetica"]').click();
  await page.locator('#trip26Manual').click();
  const expense=page.locator('#trip26Expense');
  await expense.locator('[name=value]').fill('25');
  await expense.locator('[name=file]').setInputFiles({name:'recibo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.5\nfixture')});
  await expense.getByText('Salvar despesa').click();
  await expense.getByText(/envio sem confirmação.*sem conexão/i).waitFor();
  assert.equal(modules.tripExpenses.length,0);
  assert.equal(objects.size,0);
  await boot(true);
  allowUploads=true;
  const recovered=await page.evaluate(async actor=>{
    const draft=await IntegralFinanceCloudStorage.tripUploadDraft(actor,'manual:sintetica:nova');
    return draft?{name:draft.file?.name,size:draft.file?.size}:null;
  },actor);
  assert.deepEqual(recovered,{name:'recibo.pdf',size:16});
  await page.locator('[data-trip26-open="sintetica"]').click();
  await page.locator('#trip26Manual').click();
  await expense.getByText(/rascunho retomado com recibo.pdf/i).waitFor();
  await expense.getByText('Retomar envio').click();
  await expense.waitFor({state:'detached'});
  assert.equal(objects.size,1);
  assert.equal(modules.tripExpenses.length,1);
  assert.equal(modules.tripExpenses[0].tripId,'sintetica');
  assert.equal(modules.tripExpenses[0].file.dataUrl,undefined);
  assert.deepEqual(errors,[]);
  console.log(engine.name()+' 390 px: toque duplo, recibo perdido, recarga, quota bloqueada, arquivo offline e retomada com vínculo único.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
