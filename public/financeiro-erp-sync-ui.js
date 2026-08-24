/* Integral Financeiro - sincronização ERP no login + botão manual + Planejamento responsivo */
(function(){
'use strict';

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
let autoSyncUserKey=null;
let syncing=false;

function currentUserObj(){
  try{return window.user||(typeof user!=='undefined'?user:null)}catch{return null}
}
function currentDb(){
  try{return window.db||(typeof db!=='undefined'?db:null)}catch{return null}
}
function isAuthenticated(){return !!currentUserObj()&&!!q('.shell')}
function isAdmin(){return currentUserObj()?.role==='Administrador'}
function userKey(){const u=currentUserObj()||{};return String(u.erpId||u.email||u.name||'usuario')}
function currentViewName(){try{return window.view||(typeof view!=='undefined'?view:'')}catch{return ''}}
function persist(){try{if(typeof save==='function')save()}catch(e){console.warn('Financeiro ERP persist:',e)}}
function rerenderCurrent(){
  try{
    const v=currentViewName();
    if(v==='planning'&&typeof planning==='function')planning();
    else if(v==='dashboard'&&typeof dashboard==='function')dashboard();
  }catch(e){console.warn('Financeiro ERP rerender:',e)}
}

async function syncERP({button=null,automatic=false}={}){
  if(syncing)return;
  syncing=true;
  const oldText=button?.textContent||'';
  if(button){button.disabled=true;button.textContent='Sincronizando...';}
  try{
    if(!window.IntegralERP?.sync)throw new Error('Integração com o ERP ainda não está disponível.');
    await window.IntegralERP.sync();
    if(window.IntegralFinanceERPPlanning?.sync)await window.IntegralFinanceERPPlanning.sync();
    const d=currentDb();
    if(d){d.lastErpManualSync=new Date().toISOString();d.lastErpSyncReason=automatic?'login':'manual';persist();}
    if(button)button.textContent='ERP sincronizado';
    updateSyncCaption();
    rerenderCurrent();
    if(button)setTimeout(()=>{if(document.body.contains(button)){button.disabled=false;button.textContent=oldText||'Sincronizar ERP';}},1200);
  }catch(e){
    console.error('Sincronização ERP:',e);
    if(button){button.disabled=false;button.textContent='Falha ao sincronizar';setTimeout(()=>{if(document.body.contains(button))button.textContent=oldText||'Sincronizar ERP';},1800);}
    if(!automatic)alert(`Não foi possível sincronizar com o ERP: ${e.message||e}`);
  }finally{syncing=false;}
}

function updateSyncCaption(){
  const d=currentDb();
  const el=q('#erpSyncCaption');
  if(!el)return;
  const when=d?.lastErpManualSync;
  el.textContent=when?`Última sincronização: ${new Date(when).toLocaleString('pt-BR')}`:'Sincroniza automaticamente ao entrar';
}

function installSyncButton(){
  const foot=q('.sidebar-foot');
  if(!foot||!isAuthenticated())return;
  // Mantém a regra administrativa definida para a sincronização manual.
  if(!isAdmin()){q('#erpSyncControl')?.remove();return;}
  if(q('#erpSyncControl')){updateSyncCaption();return;}
  const wrap=document.createElement('div');
  wrap.id='erpSyncControl';
  wrap.className='erp-sync-control';
  wrap.innerHTML=`<button type="button" class="btn secondary wide" id="erpSyncButton">Sincronizar ERP</button><small class="muted" id="erpSyncCaption"></small>`;
  const userMini=foot.querySelector('.user-mini');
  foot.insertBefore(wrap,userMini||foot.firstChild);
  q('#erpSyncButton',wrap).onclick=()=>syncERP({button:q('#erpSyncButton',wrap),automatic:false});
  updateSyncCaption();
}

function maybeAutoSyncAfterLogin(){
  if(!isAuthenticated())return;
  const key=userKey();
  if(!key||autoSyncUserKey===key)return;
  autoSyncUserKey=key;
  // Dá tempo para os módulos IntegralERP/Planning terminarem de carregar após autenticação.
  setTimeout(async()=>{
    if(!isAuthenticated()||userKey()!==key){autoSyncUserKey=null;return;}
    await syncERP({automatic:true});
    installSyncButton();
  },150);
}

function resetWhenLoginVisible(){
  if(q('#erpFinLogin')||q('.login-wrap'))autoSyncUserKey=null;
}

function decoratePlanningModal(){
  qa('.modal-backdrop .modal').forEach(modal=>{
    const title=(q('.modal-head h3',modal)?.textContent||q('h3',modal)?.textContent||'').trim();
    if(!/^Planejamento\s*•/i.test(title)&&!/^Planejamento\b/i.test(title))return;
    if(modal.classList.contains('planning-fit-modal'))return;
    modal.classList.add('planning-fit-modal');
    qa('.table-wrap',modal).forEach(w=>w.classList.add('planning-fit-table-wrap'));
    qa('table',modal).forEach(t=>t.classList.add('planning-fit-table'));
  });
}

function injectStyles(){
  if(q('#financeiroErpSyncUiStyles'))return;
  const style=document.createElement('style');style.id='financeiroErpSyncUiStyles';
  style.textContent=`
    .erp-sync-control{display:grid;gap:6px;margin:0 0 12px;width:100%}
    .erp-sync-control small{display:block;line-height:1.25;text-align:left;white-space:normal}
    .planning-fit-modal{width:min(920px,calc(100vw - 24px))!important;max-width:920px!important;overflow-x:hidden!important}
    .planning-fit-modal .modal-body{overflow-x:hidden!important}
    .planning-fit-modal .planning-fit-table-wrap{overflow-x:hidden!important;width:100%!important;max-width:100%!important}
    .planning-fit-modal .planning-fit-table{width:100%!important;min-width:0!important;table-layout:fixed!important}
    .planning-fit-modal .planning-fit-table th,.planning-fit-modal .planning-fit-table td{white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;vertical-align:top!important;padding-left:12px!important;padding-right:12px!important}
    .planning-fit-modal .planning-fit-table th:nth-child(1),.planning-fit-modal .planning-fit-table td:nth-child(1){width:18%}
    .planning-fit-modal .planning-fit-table th:nth-child(2),.planning-fit-modal .planning-fit-table td:nth-child(2){width:48%}
    .planning-fit-modal .planning-fit-table th:nth-child(3),.planning-fit-modal .planning-fit-table td:nth-child(3){width:14%}
    .planning-fit-modal .planning-fit-table th:nth-child(4),.planning-fit-modal .planning-fit-table td:nth-child(4){width:20%;text-align:right;white-space:nowrap!important}
    .planning-fit-modal .grid.cols-4{grid-template-columns:repeat(4,minmax(0,1fr))!important}
    .planning-fit-modal .card.metric{min-width:0!important}
    .planning-fit-modal .card.metric b{font-size:clamp(1rem,2.3vw,1.35rem)!important;white-space:normal!important;overflow-wrap:anywhere}
    @media(max-width:720px){
      .planning-fit-modal{width:calc(100vw - 12px)!important;max-height:calc(100vh - 12px)!important}
      .planning-fit-modal .grid.cols-4{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .planning-fit-modal .planning-fit-table th,.planning-fit-modal .planning-fit-table td{padding:9px 7px!important;font-size:.88rem!important}
      .planning-fit-modal .planning-fit-table th:nth-child(1),.planning-fit-modal .planning-fit-table td:nth-child(1){width:22%}
      .planning-fit-modal .planning-fit-table th:nth-child(2),.planning-fit-modal .planning-fit-table td:nth-child(2){width:42%}
      .planning-fit-modal .planning-fit-table th:nth-child(3),.planning-fit-modal .planning-fit-table td:nth-child(3){width:14%}
      .planning-fit-modal .planning-fit-table th:nth-child(4),.planning-fit-modal .planning-fit-table td:nth-child(4){width:22%}
    }
  `;
  document.head.appendChild(style);
}

function reconcile(){
  injectStyles();
  resetWhenLoginVisible();
  installSyncButton();
  maybeAutoSyncAfterLogin();
  decoratePlanningModal();
}

const observer=new MutationObserver(()=>reconcile());
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',reconcile);
setTimeout(reconcile,0);

})();
