/* Integral Financeiro — estabiliza definitivamente a tela Recebimentos. */
(function(){
'use strict';
const RECEB_IDS=new Set(['receivables','recebimentos']);
let restoring=false,queued=false;
function currentView(){try{return typeof view!=='undefined'?view:window.view}catch{return window.view}}
function setReceivablesView(){try{view='receivables'}catch{}window.view='receivables'}
function activeReceb(){const a=document.querySelector('.nav [data-view].active');return RECEB_IDS.has(String(a?.dataset?.view||'').toLowerCase())}
function canonicalButton(){return document.querySelector('.nav [data-view="receivables"]')}
function protectLegacyApp(){const original=window.app;if(typeof original!=='function'||original.__receivablesProtected)return;const wrapped=function(){const v=String(currentView()||'').toLowerCase();if(RECEB_IDS.has(v))return;return original.apply(this,arguments)};wrapped.__receivablesProtected=true;wrapped.__originalApp=original;window.app=wrapped;try{app=wrapped}catch{}}
function restoreScreen(){if(restoring||!activeReceb())return;setReceivablesView();const title=(document.querySelector('#title')?.textContent||'').trim();if(title==='Recebimentos')return;const b=canonicalButton();if(!b)return;restoring=true;/* O listener próprio de financeiro-recebimentos.js é quem possui load()+render(). */
 setTimeout(()=>{try{b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}))}finally{setTimeout(()=>{restoring=false},40)}},0)}
protectLegacyApp();
/* Se houver um botão legado "recebimentos" e também o canônico, encaminha o clique ao canônico. */
document.addEventListener('click',e=>{const b=e.target.closest?.('.nav [data-view]');if(!b)return;const id=String(b.dataset.view||'').toLowerCase();if(!RECEB_IDS.has(id))return;setReceivablesView();document.querySelectorAll('.nav [data-view]').forEach(x=>x.classList.toggle('active',x===b||String(x.dataset.view).toLowerCase()==='receivables'));if(id==='recebimentos'){const c=canonicalButton();if(c&&c!==b){e.preventDefault();e.stopImmediatePropagation();setTimeout(()=>c.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window})),0)}}},true);
function reconcile(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;protectLegacyApp();if(activeReceb()){setReceivablesView();restoreScreen()}})}
new MutationObserver(reconcile).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('load',reconcile);setTimeout(reconcile,0);
window.IntegralReceivablesRouteFix={setReceivablesView,protectLegacyApp,restoreScreen};
})();
