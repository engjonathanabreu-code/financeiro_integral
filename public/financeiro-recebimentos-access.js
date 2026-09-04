/* Integral Financeiro — acesso à aba Recebimentos
   Defesa de interface. A autorização real também é aplicada via RLS no Supabase. */
(function(){
'use strict';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function currentUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function allowed(){const u=currentUser();const role=norm(u?.role||u?.tipo||u?.type);const sector=norm(u?.setor||u?.sector);return role==='administrador'||role==='financeiro'||sector==='financeiro'}
function guard(){
 const buttons=[...document.querySelectorAll('.nav [data-view="recebimentos"],.nav [data-view="receipts"]')];
 buttons.forEach(b=>{if(allowed()){b.hidden=false;b.style.removeProperty('display')}else{b.hidden=true;b.style.setProperty('display','none','important')}});
 const v=(()=>{try{return typeof view!=='undefined'?view:window.view}catch{return window.view}})();
 if(!allowed()&&(v==='recebimentos'||v==='receipts')){
   try{view='dashboard'}catch{}window.view='dashboard';
   const fn=window.IntegralFinanceRouter?.render;if(typeof fn==='function')fn('dashboard');
 }
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-view="recebimentos"],[data-view="receipts"]');if(b&&!allowed()){e.preventDefault();e.stopImmediatePropagation();guard()}},true);
let pending=false;new MutationObserver(()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;guard()})}).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',guard);setTimeout(guard,0);window.IntegralRecebimentosAccess={allowed,guard};
})();