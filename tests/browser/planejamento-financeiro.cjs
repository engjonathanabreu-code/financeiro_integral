const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {finished}=require('node:stream/promises');

const root=path.join(__dirname,'../..');
const source=name=>fs.readFileSync(path.join(root,'public',name),'utf8');
const spreadsheet=require(path.join(root,'public/vendor/sheetjs/xlsx.full.min.js'));

async function exportBytes(page,format){
  const saved=page.waitForEvent('download',{timeout:6000});
  await page.locator('[data-pp-export="'+format+'"]').click();
  const download=await saved.catch(async error=>{
    throw new Error(format+' '+(await page.locator('.pp-notice').allTextContents()).join(' '),{cause:error});
  });
  assert.ok(download.suggestedFilename().endsWith('.'+format));
  const transfer=await download.createReadStream();
  const buffer=[];
  transfer.on('data',part=>buffer.push(part));
  await finished(transfer);
  return Buffer.concat(buffer);
}

(async()=>{
  const browser=await chromium.launch({
    headless:true,...(process.env.BROWSER_EXECUTABLE_PATH
      ?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{channel:process.env.BROWSER_CHANNEL||'msedge'})
  });
  try{
    for(const width of [1440,820,390]){
      const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://fixture.test/**',route=>route.fulfill({
        contentType:'text/html',body:'<!doctype html><nav><button data-view="accounts">Contas</button></nav><main><h1 id="title"></h1><div id="content"></div></main>'
      }));
      await page.goto('https://fixture.test/');
      await page.evaluate(()=>{
        window.user={erpId:'admin-fixture',role:'Administrador'};
        window.view='planning';
        window.db={
          accountMasters:[{id:70,name:'Fornecedor A',category:'Comunicação'},{id:71,name:'Fornecedor B',category:'Material'}],
          accountPayments:[{id:100,accountId:70,status:'Paga',due:'2026-11-04',paidAt:'2026-11-04',value:40},
            ...Array.from({length:28},(_,i)=>({id:101+i,accountId:71,status:'Pendente',due:'2026-11-19',value:5}))],
          planRevenues:[{id:200,origin:'Previsão manual de teste',start:'2026-11-25',total:50}],
          erpPlannedRevenues:[{id:300,project:'Contrato sintético',origin:'Parcela de dezembro',dueDate:'2026-12-12',total:160,remaining:120}],
          hrPeople:[{id:400,name:'Colaborador sintético',start:'2026-12-01',currentValue:25}]
        };
        window.snapshot=JSON.stringify(db);
        window.documents=()=>{document.querySelector('#content').textContent='Perfil colaborador';};
        window.title=value=>{document.querySelector('#title').textContent=value;};
        window.isAdm=()=>user.role==='Administrador';
        window.planning=()=>{};
        window.save=()=>{throw Error('O painel de análise não deve gravar dados financeiros.');};
        window.esc=value=>String(value??'');
        const fixtures={
          fin_receb_parcelas:[{id:1,cliente_id:'c',status:'Parcial',valor_previsto:100,valor_liquidado:35,pago_em:'2026-11-12',vencimento:'2026-11-14'}],
          fin_receb_clientes:[{id:'c',nome:'Cliente Isolado',municipio_id:9}],
          fin_receb_municipios:[{id:9,nome:'Curitiba'}]
        };
        let authListener;
        window.leave=()=>authListener('SIGNED_OUT',null);
        window.IntegralERP={
          sb:{auth:{getSession:async()=>({data:{session:{user:{id:user.erpId}}}}),
            onAuthStateChange:callback=>{authListener=callback;return {data:{subscription:{unsubscribe(){}}}};}},
          from(table){
            let cursor;
            return {select(){return this;},order(){return this;},gt(_column,value){cursor=value;return this;},
              limit:async()=>({data:fixtures[table].filter(row=>cursor===undefined||row.id>cursor)})};
          }}
        };
      });
      for(const filename of ['financeiro-dre-shared.js','financeiro-planning-analysis.js','financeiro-planning-canonical.js','financeiro-planning-panel.js']){
        await page.addScriptTag({content:source(filename)});
      }
      await page.addScriptTag({content:source('vendor/sheetjs/xlsx.full.min.js')});
      if(process.env.PLANEJAMENTO_PDF_QA){
        for(const filename of ['jspdf.umd.min.js','jspdf.plugin.autotable.min.js']){
          await page.addScriptTag({path:path.join(process.env.PLANEJAMENTO_PDF_QA,filename)});
        }
      }
      for(const filename of ['financeiro.bundle.css','financeiro-planning-canonical.css','financeiro-targeted-ui.css','financeiro-responsive.css','financeiro-design-system.css']){
        await page.addStyleTag({content:source(filename)});
      }
      await page.evaluate(()=>{IntegralDREShared.todayISO=()=> '2026-11-16';planning();});
      assert.equal(await page.locator('[data-pc-month]').count(),12);
      const november=page.locator('[data-pc-month="2026-11"]');
      const december=page.locator('[data-pc-month="2026-12"]');
      const january=page.locator('[data-pc-month="2027-01"]');
      assert.match(await november.locator('.planning-month-balance').innerText(),/-R\$\s*90,00/);
      assert.match(await december.locator('.pc-accumulated').innerText(),/R\$\s*5,00/);
      assert.match(await january.locator('.pc-accumulated').innerText(),/-R\$\s*20,00/);
      await december.click();
      const breakdown=page.locator('.pc-month-columns');
      assert.match(await breakdown.innerText(),/Parcela de dezembro[\s\S]+ERP[\s\S]+Contrato sintético/);
      assert.match(await breakdown.innerText(),/Colaborador sintético[\s\S]+RH/);
      await page.locator('.modal-head [data-pclose]').click();
      await page.locator('#pcSimulation summary').click();
      const simulation=page.locator('#pcSimulationForm');
      async function simulate(direction,description,date,value){
        await simulation.getByLabel('Tipo').selectOption(direction);
        await simulation.getByLabel('Origem ou destino').fill(description);
        await simulation.getByLabel('Data').fill(date);
        await simulation.getByLabel('Valor (R$)').fill(value);
        await simulation.getByRole('button',{name:'Adicionar à projeção'}).click();
      }
      await simulate('Entrada','Teste receita','2026-12-20','200');
      await simulate('Saída','Teste despesa','2027-01-20','75');
      assert.match(await december.locator('.pc-accumulated').innerText(),/R\$\s*205,00/);
      assert.match(await january.locator('.pc-accumulated').innerText(),/R\$\s*105,00/);
      await january.click();
      assert.match(await breakdown.innerText(),/Teste despesa[\s\S]+Simulação/);
      await page.locator('.modal-head [data-pclose]').click();
      await page.getByRole('button',{name:'Remover simulação: Teste receita'}).click();
      assert.match(await january.locator('.pc-accumulated').innerText(),/-R\$\s*95,00/);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.getByRole('button',{name:'+ Receita planejada',exact:true}).click();
      await page.getByRole('heading',{name:'Nova receita planejada'}).waitFor();
      await page.locator('.modal-head [data-pclose]').click();
      if(process.env.PLANEJAMENTO_SCREENSHOTS){
        await fs.promises.mkdir(process.env.PLANEJAMENTO_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.PLANEJAMENTO_SCREENSHOTS,'projecao-'+width+'.png'),fullPage:true});
      }
      await page.getByRole('button',{name:'Análise detalhada'}).click();
      await page.getByText(/Recebimentos consultado às/).waitFor();
      assert.match(await page.locator('[data-pp-kpi="expected"][data-direction="Entrada"]').innerText(),/100,00/);
      assert.match(await page.locator('[data-pp-kpi="overdue"][data-direction="Entrada"]').innerText(),/65,00/);
      if(process.env.PLANEJAMENTO_SCREENSHOTS){
        await fs.promises.mkdir(process.env.PLANEJAMENTO_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:path.join(process.env.PLANEJAMENTO_SCREENSHOTS,'planejamento-'+width+'.png'),fullPage:true});
      }
      await page.locator('[data-pp-kpi="expected"][data-direction="Saída"]').click();
      assert.match(await page.locator('.pp-page').innerText(),/1 de 2/);
      await page.locator('[data-pp-page="1"]').click();
      assert.match(await page.locator('.pp-page').innerText(),/2 de 2/);

      const contents=(await exportBytes(page,'csv')).toString('utf8');
      assert.match(contents,/Fornecedor B/);
      assert.doesNotMatch(contents,/Cliente Isolado/);
      const workbook=spreadsheet.read(await exportBytes(page,'xlsx'));
      const excelRows=spreadsheet.utils.sheet_to_json(workbook.Sheets['Lançamentos'],{header:1});
      assert.equal(excelRows.length,30);
      assert.match(JSON.stringify(excelRows),/Fornecedor B/);
      assert.doesNotMatch(JSON.stringify(excelRows),/Cliente Isolado/);
      if(process.env.PLANEJAMENTO_PDF_QA){
        const pdf=await exportBytes(page,'pdf');
        assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
        assert.match(pdf.toString('latin1'),/Fornecedor B/);
        assert.doesNotMatch(pdf.toString('latin1'),/Cliente Isolado/);
      }

      await page.locator('#pp-filters [name="search"]').fill('Fornecedor A');
      await page.getByRole('button',{name:'Aplicar filtros'}).click();
      await page.locator('.pp-row-link').click();
      assert.match(await page.locator('[data-planning-detail]').innerText(),/Fornecedor A/);
      await page.keyboard.press('Escape');
      await page.locator('[data-planning-detail]').waitFor({state:'detached'});
      await page.getByRole('button',{name:'Limpar filtros'}).click();
      await page.locator('[data-pp-tab="calendar"]').click();
      await page.locator('[data-pp-day="2026-11-14"]').click();
      assert.match(await page.locator('.pp-calendar tbody').innerText(),/Cliente Isolado/);

      await page.locator('[data-pp-tab="scenarios"]').click();
      await page.locator('[data-pp-action="new-scenario"]').click();
      await page.locator('#pp-scenario-form [name="name"]').fill('Teste de caixa');
      await page.locator('#pp-scenario-form [name="outgoing"]').fill('10');
      await page.getByRole('button',{name:'Salvar cenário'}).click();
      await page.getByText('Cenário salvo neste navegador.').waitFor();
      await page.locator('[data-pp-action="archive-scenario"]').click();
      await page.getByText('Cenário arquivado.').waitFor();
      await page.getByText('Cenários arquivados').click();
      await page.locator('[data-pp-restore]').click();
      await page.getByText('Cenário recuperado.').waitFor();
      assert.equal(await page.evaluate(()=>JSON.stringify(db)),await page.evaluate(()=>snapshot));
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('[data-pp-action="manual"]').click();
      await page.getByText('Previsão manual de teste',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Projeção mensal'}).click();
      assert.equal(await page.locator('[data-pc-month]').count(),12);
      await page.evaluate(()=>{leave();user={erpId:'staff-fixture',role:'Funcionário'};planning();});
      assert.equal(await page.locator('[data-planning-panel]').count(),0);
      assert.equal(await page.getByText('Perfil colaborador').count(),1);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Planejamento validado no navegador em 1.440, 820 e 390 px.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
