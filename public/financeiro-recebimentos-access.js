/* Integral Financeiro — acesso à aba Recebimentos.
   A autorização real permanece protegida pelas políticas do Supabase. */
(function(){
'use strict';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function currentUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function financeAccessApi(){return window.IntegralFinanceSectorAccess}
function allowed(){const u=currentUser(),role=norm(u?.role||u?.tipo||u?.type),sector=norm(u?.setor||u?.sector);if(role==='administrador'||role==='financeiro'||sector==='financeiro')return true;try{if(financeAccessApi()?.isFinance?.())return true}catch{}return false}
function profilePending(){const u=currentUser();if(!u)return false;const role=norm(u?.role||u?.tipo||u?.type),sector=norm(u?.setor||u?.sector);return role!=='administrador'&&!sector&&!u?.erpId&&!!window.IntegralERP?.sb}
function profileReady(){
  const u=currentUser();if(!u)return false;
  if(!window.IntegralERP?.sb)return true;
  return !!u.erpId||norm(u.role)==='administrador';
}
function guard(){const buttons=[...document.querySelectorAll('.nav [data-view="receivables"]')];buttons.forEach(b=>{if(allowed()){b.hidden=false;b.style.removeProperty('display')}else if(!profilePending()){b.hidden=true;b.style.setProperty('display','none','important')}});const v=(()=>{try{return typeof view!=='undefined'?view:window.view}catch{return window.view}})();if(profileReady()&&!allowed()&&!profilePending()&&v==='receivables'){try{view='dashboard'}catch{}window.view='dashboard';const fn=window.IntegralFinanceRouter?.render;if(typeof fn==='function')fn('dashboard')}}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-view="receivables"]');if(!b)return;if(allowed()||profilePending())return;e.preventDefault();e.stopImmediatePropagation();guard()},true);
let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;guard()})}).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('load',guard);setTimeout(guard,0);window.IntegralRecebimentosAccess={allowed,guard};
})();