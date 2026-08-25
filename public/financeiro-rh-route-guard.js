/* Integral Financeiro — roteamento exclusivo do RH canônico.
   Este arquivo não renderiza uma segunda versão de RH; apenas impede que o RH legado
   embutido no bundle seja chamado e encaminha a navegação para IntegralFinanceRH. */
(function(){
'use strict';

function currentView(){
  try{return typeof view!=='undefined'?view:window.view}catch{return window.view}
}
function setCurrentView(v){
  try{window.view=v;view=v}catch{window.view=v}
}
function markNav(){
  document.querySelectorAll('.nav [data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view==='hr'));
}
async function openCanonicalRH(){
  setCurrentView('hr');
  markNav();
  const api=window.IntegralFinanceRH;
  if(!api||typeof api.render!=='function'){
    console.error('RH canônico não está disponível.');
    return;
  }
  await api.render();
}

// Captura antes dos onclicks do bundle legado.
document.addEventListener('click',function(ev){
  const btn=ev.target.closest?.('[data-view="hr"]');
  if(!btn)return;
  ev.preventDefault();
  ev.stopPropagation();
  ev.stopImmediatePropagation();
  openCanonicalRH();
},true);

// Se alguma rotina interna tentar voltar ao RH legado, corrige imediatamente.
const observer=new MutationObserver(()=>{
  if(currentView()!=='hr')return;
  const content=document.querySelector('#content');
  if(!content)return;
  const legacy=/Contratos e quita[cç][aã]o mensal|sal[aá]rios vigentes/i.test(content.textContent||'');
  if(legacy)openCanonicalRH();
});
observer.observe(document.documentElement,{childList:true,subtree:true});

window.IntegralFinanceRHRoute={open:openCanonicalRH};
})();
