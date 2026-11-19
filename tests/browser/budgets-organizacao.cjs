/* Fixture local: renderer V9 e ciclo reais, sem autenticação nem serviços externos. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();let external=0;
 await page.route('**/*',r=>r.request().url()==='http://fixture.test/'?r.fulfill({contentType:'text/html',body:'<div id="title"></div><div id="content"></div>'}):(external++,r.abort()));
 await page.goto('http://fixture.test/');
 await page.evaluate(()=>{
  localStorage.setItem('integral_fin_real_data_reset_v1','1');
  window.user={erpId:'u1',email:'a@fixture.test',name:'Ana',role:'Funcionário',sector:'Projetos'};
  window.db={usersMvp:[{id:1,erpId:'u1',email:user.email,name:'Ana'}],budgetRecords:[{id:1,name:'Ação São José',sector:'Projetos',limit:100,assigned:[1]},{id:2,name:'Encerrado',sector:'Projetos',limit:200,status:'Fechado'},{id:3,name:'Segredo',sector:'Diretoria',limit:999999},{id:4,name:'Zero',sector:'Projetos',limit:0}],budgetExpenses:[{id:11,budgetId:1,value:100,description:'Gasto',date:'2026-11-19'},{budgetId:3,value:999999}],sectors:[]};
  window.$=s=>document.querySelector(s);window.$$=s=>[...document.querySelectorAll(s)];window.title=t=>$('#title').textContent=t;window.esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.money=v=>Number(v).toFixed(2);window.fmt=s=>s;window.save=()=>{throw Error('Proibida escrita na fixture')};window.planning=()=>{};
 });
 for(const f of ['patch-v9.js','financeiro-lifecycle.js','financeiro-budgets-organizacao.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'public',f),'utf8')});
 await page.addStyleTag({content:fs.readFileSync(path.join(root,'public/financeiro-budgets-organizacao.css'),'utf8')});
 await page.evaluate(()=>budgets());
 assert.equal(await page.locator('[data-v9-budget]').count(),3);
 assert.equal((await page.locator('[data-summary]').innerText()).includes('999999'),false);
 assert.equal(await page.locator('[name=sector] option').count(),2);
 await page.locator('[name=search]').fill('sao jose');
 assert.equal(await page.locator('[data-v9-budget]:visible').count(),1);
 await page.locator('[data-v9-budget="1"]').press('Enter');
 await page.locator('#v9BudgetBack').click();
 assert.equal(await page.locator('[name=search]').inputValue(),'sao jose');
 assert.equal(await page.locator('[data-v9-budget]:visible').count(),1);
 await page.locator('[data-clear]').click();
 await page.locator('[name=scope]').selectOption('closed');
 assert.equal(await page.locator('[data-v9-budget]:visible').count(),1);
 await page.locator('[data-v9-budget="2"]').click();
 assert.equal(await page.locator('#v9AddExpense').count(),0);
 await page.locator('#v9BudgetBack').click();
 assert.equal(await page.locator('[name=scope]').inputValue(),'closed');
 await page.locator('[data-clear]').click();
 await page.locator('[name=consumption]').selectOption('at-limit');
 assert.equal(await page.locator('[data-v9-budget]:visible').count(),1);
 await page.locator('[name=search]').fill('inexistente');
 assert.ok(await page.locator('[data-empty]').isVisible());
 await page.evaluate(()=>{user={erpId:'u2',name:'Outro',email:'other@fixture.test',role:'Funcionário',sector:'Outro'};budgets()});
 assert.equal(await page.locator('[name=search]').inputValue(),'');
 assert.equal(await page.locator('[data-v9-budget]').count(),0);
 await page.evaluate(()=>{user={erpId:'adm',role:'Administrador'};budgets()});
 assert.equal(await page.locator('[data-v9-budget]').count(),4);
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal(external,0);console.log('PASS: V9/ciclo, recorte autorizado, busca/acento, filtros, detalhe/voltar, fechado, teclado, identidade, mobile e zero rede.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
