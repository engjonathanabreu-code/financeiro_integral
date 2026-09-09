/* Integral Financeiro — roteador canônico oficial.
   Todas as telas especiais passam por um único controlador de navegação. */
(function(){
'use strict';
const canonicalViews=new Set(['dashboard','planning','hr','receivables']);
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
function currentView(){try{return typeof view!=='undefined'?view:window.view}catch{return window.view}}
function setView(id){try{view=id}catch{}window.view=id}
function currentUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function norm(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function canSeeReceivables(){const u=currentUser();return norm(u?.role)==='administrador'||norm(u?.tipo)==='administrador'||norm(u?.role)==='financeiro'||norm(u?.tipo)==='financeiro'||norm(u?.setor)==='financeiro'||norm(u?.sector)==='financeiro'}
function isAdmin(){return norm(currentUser()?.role||currentUser()?.tipo)==='administrador'}
function setActive(id){qa('.nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===id))}
function ensureNav(){
  const nav=q('.nav');if(!nav)return;
  if(isAdmin()){
    nav.querySelectorAll('[data-view="reports"]').forEach(x=>x.remove());
    qa('.nav button').forEach(x=>{if((x.textContent||'').trim()==='Relatórios')x.remove()});
    if(!nav.querySelector('[data-view="dashboard"]')){const b=document.createElement('button');b.dataset.view='dashboard';b.textContent='Visão Geral';nav.prepend(b)}
  }
  if(canSeeReceivables()){
    nav.querySelectorAll('[data-view="recebimentos"],[data-view="receipts"]').forEach(x=>x.remove());
    let b=nav.querySelector('[data-view="receivables"]');
    if(!b){b=document.createElement('button');b.dataset.view='receivables';b.textContent='Recebimentos';const cash=nav.querySelector('[data-view="cashflow"]');nav.insertBefore(b,cash||nav.firstChild)}
  }
}
async function renderCanonical(id){
  if(!canonicalViews.has(id))return false;
  if(id==='receivables'&&!canSeeReceivables())return false;
  setView(id);ensureNav();setActive(id);
  const c=q('#content');if(c)c.removeAttribute('data-canonical-view');
  try{
    if(id==='dashboard'){
      const fn=window.IntegralFinanceDashboard?.render||window.renderFinanceDashboardFinal;if(typeof fn!=='function')return false;await fn();
    }else if(id==='planning'){
      const fn=window.planningCanonical;if(typeof fn!=='function')return false;await fn();
    }else if(id==='hr'){
      const fn=window.IntegralFinanceRH?.render;if(typeof fn!=='function')return false;await fn();
    }else if(id==='receivables'){
      const fn=window.IntegralReceivables?.render;if(typeof fn!=='function')throw new Error('Módulo de Recebimentos não carregado.');await fn();
    }
    const out=q('#content');if(out)out.dataset.canonicalView=id;
    setActive(id);return true;
  }catch(err){console.error('Roteador canônico:',id,err);const out=q('#content');if(out)out.innerHTML=`<div class="notice danger">Não foi possível carregar esta tela: ${String(err?.message||err)}</div>`;return false}
}

let pendingCanonical=null;
function requestCanonical(id){
  if(pendingCanonical===id)return;
  pendingCanonical=id;
  queueMicrotask(async()=>{
    try{ await renderCanonical(id) } finally { pendingCanonical=null }
  });
}

document.addEventListener('click',ev=>{
  const btn=ev.target.closest?.('.nav [data-view]');if(!btn)return;
  const id=btn.dataset.view;if(!canonicalViews.has(id))return;
  ev.preventDefault();ev.stopImmediatePropagation();
  setView(id);ensureNav();setActive(id);requestCanonical(id);
},true);

/* A shell (sidebar, #content, botão Sair) é responsabilidade exclusiva do
   app legado e precisa SEMPRE ser montada, inclusive no login. */
try{
  const legacyApp=typeof app==='function'?app:null;
  if(legacyApp&&!legacyApp.__canonicalWrapped){
    const wrappedApp=function(){
      const result=legacyApp.apply(this,arguments);
      queueMicrotask(ensureNav);
      return result;
    };
    wrappedApp.__canonicalWrapped=true;
    wrappedApp.__legacyApp=legacyApp;
    app=wrappedApp;window.app=wrappedApp;
  }
}catch{}

/* O render legado é quem pinta a tela de negócio. Para views canônicas ele
   não desenha nada — assim Documentos nunca sobrescreve Recebimentos. */
try{
  const legacyRender=typeof render==='function'?render:window.render;
  if(typeof legacyRender==='function'&&!legacyRender.__canonicalRenderWrapped){
    const wrappedRender=function(){
      const id=currentView();
      if(canonicalViews.has(id)){ ensureNav(); requestCanonical(id); return; }
      return legacyRender.apply(this,arguments);
    };
    wrappedRender.__canonicalRenderWrapped=true;
    wrappedRender.__legacyRender=legacyRender;
    render=wrappedRender;window.render=wrappedRender;
  }
}catch{}

let reconcileScheduled=false;
function reconcile(){
  reconcileScheduled=false;ensureNav();const id=currentView();if(!canonicalViews.has(id))return;
  const c=q('#content');if(!c||c.dataset.canonicalView===id)return;requestCanonical(id);
}
function scheduleReconcile(){if(reconcileScheduled)return;reconcileScheduled=true;queueMicrotask(reconcile)}
const root=q('#app');if(root)new MutationObserver(scheduleReconcile).observe(root,{childList:true,subtree:true});
window.addEventListener('load',scheduleReconcile,{once:true});setTimeout(scheduleReconcile,0);
window.IntegralFinanceRouter={render:renderCanonical,canonicalViews:[...canonicalViews],ensureNav};
window.__INTEGRAL_FINANCEIRO_CANONICAL__='2026-09-09-shellfix';
})();