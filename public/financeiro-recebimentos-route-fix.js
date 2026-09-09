/* Integral Financeiro — estabiliza a rota Recebimentos contra o app legado/canônico. */
(function(){
'use strict';
const RECEB_IDS=new Set(['receivables','recebimentos']);
function currentView(){try{return typeof view!=='undefined'?view:window.view}catch{return window.view}}
function setReceivablesView(){
  try{view='receivables'}catch{}
  window.view='receivables';
}
function isReceivablesButton(el){
  const b=el?.closest?.('.nav [data-view]');
  if(!b)return null;
  const id=String(b.dataset.view||'').toLowerCase();
  return RECEB_IDS.has(id)?b:null;
}

/* O bundle legado não conhece a view "receivables". Quando app() é chamado com essa
   view, o render legado cai no fallback de Documentos Fiscais. Bloqueamos somente esse
   redesenho; a tela de Recebimentos continua sendo renderizada pelo módulo próprio. */
function protectLegacyApp(){
  const original=window.app;
  if(typeof original!=='function'||original.__receivablesProtected)return;
  const wrapped=function(){
    const v=String(currentView()||'').toLowerCase();
    if(RECEB_IDS.has(v))return;
    return original.apply(this,arguments);
  };
  wrapped.__receivablesProtected=true;
  wrapped.__originalApp=original;
  window.app=wrapped;
  try{app=wrapped}catch{}
}
protectLegacyApp();

/* Sincroniza a rota antes dos handlers de navegação. Não usamos "receipts" aqui:
   no bundle legado esse identificador pode representar documentos/recibos e causava
   colisão com Documentos Fiscais. */
document.addEventListener('click',e=>{
  const b=isReceivablesButton(e.target);if(!b)return;
  setReceivablesView();
  document.querySelectorAll('.nav [data-view]').forEach(x=>x.classList.toggle('active',x===b));
},true);

/* Reaplica a proteção se algum módulo posterior embrulhar app(). */
let queued=false;
new MutationObserver(()=>{
  if(queued)return;queued=true;
  queueMicrotask(()=>{
    queued=false;
    protectLegacyApp();
    const active=document.querySelector('.nav [data-view].active');
    const id=String(active?.dataset?.view||'').toLowerCase();
    if(RECEB_IDS.has(id))setReceivablesView();
  });
}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('load',protectLegacyApp);
window.IntegralReceivablesRouteFix={setReceivablesView,protectLegacyApp};
})();
