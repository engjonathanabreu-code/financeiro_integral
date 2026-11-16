const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium,webkit,devices}=require('playwright');

const root=path.join(__dirname,'../../public');
const origin='https://menu-financeiro.test/';
const styles=['financeiro.bundle.css','financeiro-responsive.css','financeiro-icons.css','financeiro-navigation.css','financeiro-design-system.css','financeiro-theme-dark.css'];
const shell=(admin)=>`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<div id="app"><div class="shell"><aside class="sidebar"><div class="brand">Integral Financeiro</div>
<nav class="nav"><button class="active" data-view="documents">Documentos</button><button data-view="trips">Viagens</button>
${admin?'<button data-view="planning">Planejamento</button><button data-view="users">Usuários</button>':''}</nav>
<div class="sidebar-foot"><div class="user-mini">Perfil sintético</div><button class="btn" id="logout">Sair</button></div>
</aside><section class="main"><header class="topbar"><h2 id="title">Documentos</h2><span class="badge">${admin?'Administrador':'Funcionário'}</span></header>
<div id="content" class="content"><form><label>Documento<input id="form-test"></label></form></div></section></div></div></html>`;

async function load(browser,config,admin){
  const context=await browser.newContext(config);
  await context.route('**/*',route=>route.request().url()===origin
    ?route.fulfill({body:shell(admin),contentType:'text/html'})
    :route.abort());
  const page=await context.newPage();
  await page.goto(origin);
  await page.evaluate(administrator=>{
    window.view='documents';
    window.user={role:administrator?'Administrador':'Funcionário'};
    window.planningCanonical=()=>{
      document.querySelector('#title').textContent='Planejamento';
      document.querySelector('#content').textContent='Visão de planejamento';
    };
    document.querySelector('[data-view="trips"]').onclick=()=>{
      window.view='trips';
      document.querySelector('.active')?.classList.remove('active');
      document.querySelector('[data-view="trips"]').classList.add('active');
      document.querySelector('#title').textContent='Viagens';
    };
  },admin);
  for(const file of styles)await page.addStyleTag({path:path.join(root,file)});
  for(const file of ['financeiro-canonical-router.js','financeiro-navigation.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.locator('#finMobileNavigation').waitFor({state:'attached'});
  return {context,page};
}

async function mobile(browser,label,config,admin){
  const {context,page}=await load(browser,config,admin);
  try{
    const trigger=page.getByRole('button',{name:'Abrir menu de navegação'});
    const drawer=page.locator('#finMobileNavigation');
    const close=page.getByRole('button',{name:'Fechar menu de navegação'});
    assert.ok(await trigger.isVisible(),label);
    assert.ok(!(await drawer.isVisible()),'não ocupa o rodapé quando fechado');
    await page.locator('#form-test').fill('Rascunho sintético');
    await trigger.click();
    await drawer.waitFor({state:'visible'});
    assert.equal(await trigger.getAttribute('aria-expanded'),'true');
    assert.ok(await page.locator('.main').evaluate(el=>el.inert));
    assert.equal(await page.evaluate(()=>document.activeElement.className.includes('fin-drawer-close')),true);
    assert.ok(await drawer.getByRole('button',{name:'Documentos'}).getAttribute('aria-current'));
    assert.equal(await drawer.locator('[data-view="planning"]').count(),admin?1:0);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'finConfigurationToggle');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.className.includes('fin-drawer-close')),true);
    await page.keyboard.press('Escape');
    await drawer.waitFor({state:'hidden'});
    assert.ok(await trigger.evaluate(el=>el===document.activeElement));
    await trigger.click();
    const {width}=page.viewportSize();
    await page.mouse.click(width-8,34);
    await drawer.waitFor({state:'hidden'});
    assert.equal(await page.locator('#form-test').inputValue(),'Rascunho sintético');
    await trigger.click();
    await close.click();
    await drawer.waitFor({state:'hidden'});
    await trigger.click();
    if(admin){
      await drawer.getByRole('button',{name:'Configuração'}).click();
      await drawer.getByRole('button',{name:'Usuários'}).waitFor({state:'visible'});
      await page.keyboard.press('Escape');
      await drawer.getByRole('button',{name:'Planejamento'}).click();
      await page.getByText('Visão de planejamento').waitFor();
    }else{
      await drawer.getByRole('button',{name:'Viagens'}).click();
      assert.equal(await page.locator('#title').textContent(),'Viagens');
    }
    await drawer.waitFor({state:'hidden'});
    assert.ok(!await page.locator('.main').evaluate(el=>el.inert));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    if(process.env.MENU_QA_DIR){
      await trigger.click();
      await page.screenshot({path:path.join(process.env.MENU_QA_DIR,label+'.png'),animations:'disabled'});
    }
    console.log('PASS',label);
  }finally{await context.close()}
}

(async()=>{
  const executablePath=process.env.BROWSER_EXECUTABLE_PATH;
  const useWebKit=process.env.BROWSER_ENGINE==='webkit';
  const browser=await (useWebKit?webkit:chromium).launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
    const phones=useWebKit?[['iphone-webkit','iPhone 13']]:[['iphone','iPhone 13'],['android','Pixel 7']];
    for(const [name,model] of phones){
      const {defaultBrowserType,...device}=devices[model];
      await mobile(browser,name+'-vertical',device,true);
      await mobile(browser,name+'-horizontal',{...device,viewport:{width:device.viewport.height,height:device.viewport.width}},false);
    }
    for(const [label,config] of [['desktop',{viewport:{width:1440,height:900}}],['tablet',{hasTouch:true,isMobile:true,viewport:{width:820,height:1120}}]]){
      const {context,page}=await load(browser,config,true);
      assert.ok(await page.locator('#finMobileNavigation').isVisible());
      assert.ok(!(await page.locator('.fin-drawer-toggle').isVisible()));
      assert.ok(!(await page.locator('.main').evaluate(el=>el.inert)));
      console.log('PASS',label);
      await context.close();
    }
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
