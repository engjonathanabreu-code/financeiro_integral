/* Integral Financeiro — roteador canônico oficial
   Um único caminho de navegação para Dashboard, Planejamento e RH.
   Impede que as implementações legadas embutidas no bundle sejam renderizadas. */
(function(){
'use strict';
const canonicalViews=new Set(['dashboard','planning','hr']);
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
function currentView(){try{return typeof view!=='undefined'?view:window.view}catch{return window.view}}
function setView(id){try{view=id}catch{}window.view=id}
function currentUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function isAdmin(){return currentUser()?.role==='Administrador'}
function setActive(id){qa('.nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id))}
function ensureNav(){
  if(!isAdmin())return;
  const nav=q('.nav');if(!nav)return;
  nav.querySelectorAll('[data-view="reports"]').forEach(x=>x.remove());
  qa('.nav button').forEach(x=>{if((x.textContent||'').trim()==='Relatórios')x.remove()});
  if(!nav.querySelector('[data-view="dashboard"]')){const b=document.createElement('button');b.dataset.view='dashboard';b.textContent='Visão Geral';nav.prepend(b)}
}
async function renderCanonical(id){
  if(!canonicalViews.has(id))return false;
  setView(id);setActive(id);ensureNav();
  const c=q('#content');if(c)c.removeAttribute('data-canonical-view');
  try{
    if(id==='dashboard'){
      const fn=window.IntegralFinanceDashboard?.render||window.renderFinanceDashboardFinal;
      if(typeof fn!=='function')return false;
      await fn();
    }else if(id==='planning'){
      const fn=window.planningCanonical;
      if(typeof fn!=='function')return false;
      await fn();
    }else if(id==='hr'){
      const fn=window.IntegralFinanceRH?.render;
      if(typeof fn!=='function')return false;
      await fn();
    }
    const out=q('#content');if(out)out.dataset.canonicalView=id;
    return true;
  }catch(err){console.error('Roteador canônico:',id,err);return false}
}

/* Intercepta antes do listener legado. Assim a tela antiga nunca chega a ser desenhada no clique. */
document.addEventListener('click',ev=>{
  const btn=ev.target.closest?.('[data-view]');if(!btn)return;
  const id=btn.dataset.view;if(!canonicalViews.has(id))return;
  ev.preventDefault();ev.stopImmediatePropagation();
  renderCanonical(id);
},true);

/* O app legado ainda monta shell/sidebar. Reaproveitamos isso, mas substituímos a tela de negócio
   no mesmo ciclo de microtask, antes do próximo paint. */
try{
  const legacyApp=typeof app==='function'?app:null;
  if(legacyApp&&!legacyApp.__canonicalWrapped){
    const wrapped=function(){
      const result=legacyApp.apply(this,arguments);
      const id=currentView();
      if(canonicalViews.has(id))queueMicrotask(()=>renderCanonical(id));
      else queueMicrotask(ensureNav);
      return result;
    };
    wrapped.__canonicalWrapped=true;
    app=wrapped;window.app=wrapped;
  }
}catch{}

/* Segurança contra qualquer rotina antiga que tente redesenhar uma das três telas depois. */
let reconcileScheduled=false;
function reconcile(){
  reconcileScheduled=false;ensureNav();
  const id=currentView();if(!canonicalViews.has(id))return;
  const c=q('#content');if(!c)return;
  if(c.dataset.canonicalView===id)return;
  renderCanonical(id);
}
function scheduleReconcile(){if(reconcileScheduled)return;reconcileScheduled=true;queueMicrotask(reconcile)}
const root=q('#app');if(root)new MutationObserver(scheduleReconcile).observe(root,{childList:true,subtree:true});
window.addEventListener('load',scheduleReconcile,{once:true});
setTimeout(scheduleReconcile,0);

window.IntegralFinanceRouter={render:renderCanonical,canonicalViews:[...canonicalViews]};
window.__INTEGRAL_FINANCEIRO_CANONICAL__='2026-08-25';
})();
