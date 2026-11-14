// Chromium com servidor simulado e rede externa bloqueada.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {rem,retorno}=require('../ailos-fixtures.cjs');
const C=require('../../public/ailos-cnab');

(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?
  {executablePath:process.env.CHROMIUM_PATH}:{channel:'chrome'})});
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
   const page=await context.newPage();
   const origin='https://fixture.test/';
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url()===origin?
    route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width"><h1 id="title"></h1><main id="content"></main>'}):route.abort());
   await page.goto(origin);
   const ready={...rem,id:'00000000-0000-4000-8000-000000000006',sequencia:2,ambiente:'homologacao',pronta:true};
   const pending={...rem,ambiente:'homologacao',pronta:false};
   const raw=retorno(rem,'06',7000);
   const events=C.retorno(raw,rem.config);
   await page.evaluate(({pending,ready,events,readyFile,pendingFile})=>{
    window.view='boletos';
    window.ERP_SUPABASE={};
    window.IntegralRecebimentosAccess={allowed:()=>true};
    window.user={role:'Administrador'};
    window.calls=[];
    window.decision=false;
    window.confirm=()=>decision;
    const remessas=[pending,ready];
    let version=0;
    window.supabase={createClient:()=>({rpc:async(_name,{acao,dados})=>{
     calls.push({acao,dados});
     if(acao==='painel')return {data:{config:pending.config,remessas,boletos:[],pagadores:{}}};
     if(acao==='remessa'){
      const item=remessas.find(r=>r.id===dados.id);
      return {data:{...item,arquivo:item.pronta?(item.id===ready.id?readyFile:pendingFile):null,nome:'HOM.rem'}};
     }
     if(acao==='finalizar'){
      remessas.find(r=>r.id===dados.id).pronta=true;
      return {data:{ok:true,arquivo:pendingFile,nome:'HOM.rem'}};
     }
     if(acao==='previa_retorno')return {data:{eventos:events,ambiente:'homologacao',revisao:String(++version)}};
     if(acao==='retorno')return dados.revisao==='1'
      ?{error:{code:'40001',message:'Refaça a conferência do retorno antes de importar'}}
      :{data:{processados:1}};
     return {error:{message:'Ação inesperada'}};
    }})};
   },{pending,ready,events,readyFile:C.remessa(ready).arquivo,pendingFile:C.remessa(pending).arquivo});
   const assets=path.join(__dirname,'../../public');
   for(const file of ['ailos-cnab.js','financeiro-boletos.js'])await page.addScriptTag({path:path.join(assets,file)});
   await page.evaluate(()=>IntegralBoletos.render());
   await page.locator('summary').click();
   await page.getByRole('tab',{name:'Remessas e boletos'}).click();
   assert.equal(await page.locator('[data-ailos-download]').count(),1);
   assert.equal(await page.locator('[data-ailos-finish]').count(),1);
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Baixar remessa'}).click()]);
   assert.equal(download.suggestedFilename(),'HOM.rem');
   assert.equal(await page.evaluate(()=>calls.filter(x=>x.acao==='finalizar').length),0);
   await page.getByRole('button',{name:'Concluir geração'}).click();
   assert.equal(await page.evaluate(()=>calls.filter(x=>x.acao==='finalizar').length),0);
   await page.evaluate(()=>{window.decision=true});
   await page.getByRole('button',{name:'Concluir geração'}).click();
   await page.getByText('Remessa concluída.',{exact:false}).waitFor();
   const finish=await page.evaluate(()=>calls.find(x=>x.acao==='finalizar').dados);
   assert.deepEqual(finish,{id:rem.id,confirmar:true});

   await page.getByRole('tab',{name:'Retorno do banco'}).click();
   await page.locator('#ailosFile').setInputFiles({name:'teste.ret',mimeType:'text/plain',buffer:Buffer.from(raw)});
   await page.locator('#ailosSource').selectOption('canal_homologacao');
   await page.getByRole('button',{name:'Conferir arquivo'}).click();
   await page.getByRole('button',{name:'Confirmar importação de teste'}).click();
   await page.getByText('O histórico mudou desde a prévia.',{exact:false}).waitFor();
   assert.equal(await page.locator('#ailosFile').evaluate(input=>input.files[0].name),'teste.ret');
   assert.match(await page.locator('#ailosReturn').innerText(),/Liquidação/);
   await page.getByRole('button',{name:'Conferir arquivo'}).click();
   await page.getByRole('button',{name:'Confirmar importação de teste'}).click();
   await page.getByText('1 ocorrência(s) processada(s).',{exact:true}).waitFor();
   const imports=await page.evaluate(()=>calls.filter(x=>x.acao==='retorno').map(x=>x.dados));
   assert.deepEqual(imports,[1,2].map(revisao=>({arquivo:raw,nome:'teste.ret',origem:'canal_homologacao',revisao:String(revisao)})));
   assert.deepEqual(errors,[]);
   await context.close();
   console.log(`Ailos ${width}px: download somente leitura, conclusão explícita, retorno bruto e nova prévia sem perder arquivo.`);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
