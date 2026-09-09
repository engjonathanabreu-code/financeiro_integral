/* Integral Financeiro — estabiliza a rota Recebimentos contra o reconciliador legado/canônico. */
(function(){
'use strict';
function setReceivablesView(){
  try{view='receivables'}catch{}
  window.view='receivables';
}
function isReceivablesButton(el){
  const b=el?.closest?.('[data-view]');
  if(!b)return null;
  const id=String(b.dataset.view||'').toLowerCase();
  return ['receivables','recebimentos','receipts'].includes(id)?b:null;
}
/* Executa antes do listener do botão. O roteador canônico consulta `view` e, sem esta
   sincronização, ainda pode enxergar `dashboard` e redesenhar a Visão Geral. */
document.addEventListener('click',e=>{
  const b=isReceivablesButton(e.target);if(!b)return;
  setReceivablesView();
  document.querySelectorAll('.nav [data-view]').forEach(x=>x.classList.toggle('active',x===b));
},true);
/* Se algum módulo assíncrono tentar restaurar dashboard logo após o clique, preserva
   Recebimentos enquanto o item da navegação estiver selecionado. */
let queued=false;
new MutationObserver(()=>{
  if(queued)return;queued=true;
  queueMicrotask(()=>{
    queued=false;
    const active=document.querySelector('.nav [data-view].active');
    const id=String(active?.dataset?.view||'').toLowerCase();
    if(['receivables','recebimentos','receipts'].includes(id))setReceivablesView();
  });
}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.IntegralReceivablesRouteFix={setReceivablesView};
})();
