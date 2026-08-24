/* Integral Financeiro V16 - sincronização ERP somente manual e planejamento estável */
(function(){
'use strict';

// Restaura APIs globais interceptadas antes do V10.
const originals=window.__IntegralERPManualSyncOriginals;
if(originals){
  window.setTimeout=originals.setTimeout;
  window.setInterval=originals.setInterval;
  Document.prototype.addEventListener=originals.addEventListener;
}

const isAdm=()=>user?.role==='Administrador';
const safeMoney=v=>money(Number(v||0));

// Impede que abrir Planejamento provoque nova consulta ao ERP.
const previousPlanning=planning;
planning=function(){
  const erp=window.IntegralERP;
  const sb=erp?.sb;
  if(erp)erp.sb=null;
  try{return previousPlanning();}
  finally{if(erp)erp.sb=sb;}
};

async function manualSyncERP(button){
  if(!isAdm())return;
  const oldText=button.textContent;
  button.disabled=true;
  button.textContent='Sincronizando...';
  try{
    if(!window.IntegralERP?.sync)throw new Error('Sincronização do ERP indisponível.');
    await window.IntegralERP.sync();
    if(window.IntegralFinanceERPPlanning?.sync)await window.IntegralFinanceERPPlanning.sync();
    db.lastErpManualSync=new Date().toISOString();
    save();
    button.textContent='ERP sincronizado';
    if(view==='planning')planning();
    else if(view==='dashboard'&&typeof dashboard==='function')dashboard();
    setTimeout(()=>{if(document.body.contains(button)){button.disabled=false;button.textContent=oldText;}},1400);
  }catch(e){
    console.error('Sincronização manual ERP:',e);
    button.disabled=false;
    button.textContent='Falha ao sincronizar';
    alert(`Não foi possível sincronizar com o ERP: ${e.message||e}`);
    setTimeout(()=>{if(document.body.contains(button))button.textContent=oldText;},1800);
  }
}

function installManualSync(){
  const foot=document.querySelector('.sidebar-foot');
  if(!foot||!isAdm()||foot.querySelector('#manualErpSync'))return;
  const userMini=foot.querySelector('.user-mini');
  const wrap=document.createElement('div');
  wrap.className='manual-erp-sync-wrap';
  const btn=document.createElement('button');
  btn.id='manualErpSync';
  btn.className='btn secondary wide';
  btn.type='button';
  btn.textContent='Sincronizar com ERP';
  const small=document.createElement('small');
  small.className='muted manual-sync-time';
  small.textContent=db.lastErpManualSync?`Última: ${new Date(db.lastErpManualSync).toLocaleString('pt-BR')}`:'Sincronização somente manual';
  btn.addEventListener('click',async()=>{await manualSyncERP(btn);if(db.lastErpManualSync)small.textContent=`Última: ${new Date(db.lastErpManualSync).toLocaleString('pt-BR')}`;});
  wrap.append(btn,small);
  foot.insertBefore(wrap,userMini||foot.firstChild);
}

const previousApp=app;
app=function(){
  previousApp();
  setTimeout(installManualSync,0);
};

// Garante botão na sessão que já estiver aberta quando o patch carregar.
setTimeout(installManualSync,0);

// Reforça o clique das fontes ERP sem re-render periódico.
function wireERPSourceRows(){
  if(view!=='planning')return;
  document.querySelectorAll('[data-erp-source]').forEach(btn=>{
    btn.style.cursor='pointer';
    btn.setAttribute('aria-label',(btn.textContent||'Entrada prevista do ERP').trim());
  });
}
const oldPlanningStable=planning;
planning=function(){const r=oldPlanningStable();setTimeout(wireERPSourceRows,0);return r;};

})();
