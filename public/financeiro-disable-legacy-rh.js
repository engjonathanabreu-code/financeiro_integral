/* Integral Financeiro — bloqueio definitivo do RH legado.
   O bundle consolidado ainda contém a implementação histórica `hr()` por compatibilidade.
   Este arquivo substitui essa função por uma ponte para o RH canônico antes de qualquer restauração de sessão. */
(function(){
'use strict';

const LEGACY_MARKER='Contratos e quitação mensal';
let pending=false;

function currentView(){
  try{return typeof view!=='undefined'?view:window.view}catch{return window.view}
}

async function renderCanonicalRH(){
  if(currentView()!=='hr')return;
  const canonical=window.IntegralFinanceRH?.render;
  if(typeof canonical==='function'){
    pending=false;
    return canonical();
  }
  if(pending)return;
  pending=true;
  const content=document.querySelector('#content');
  if(content){
    content.innerHTML='<div class="card"><b>Carregando RH...</b></div>';
    content.dataset.rhCanonicalPending='1';
  }
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    const fn=window.IntegralFinanceRH?.render;
    if(typeof fn==='function'){
      clearInterval(timer);pending=false;
      try{fn()}catch(e){console.error('RH canônico:',e)}
    }else if(tries>120){
      clearInterval(timer);pending=false;
      console.error('RH canônico não foi carregado.');
    }
  },25);
}

function install(){
  const bridge=function(){return renderCanonicalRH()};
  bridge.__integralCanonicalRH=true;
  try{hr=bridge}catch{}
  window.hr=bridge;
}

/* Instala imediatamente após o bundle, antes de qualquer rotina de sessão. */
install();

/* Defesa adicional: se algum código legado guardar uma referência antiga e ainda tentar desenhar
   a tela histórica, ela é removida no mesmo ciclo e substituída pela versão canônica. */
const root=document.getElementById('app')||document.documentElement;
let scheduled=false;
new MutationObserver(()=>{
  if(scheduled)return;
  scheduled=true;
  queueMicrotask(()=>{
    scheduled=false;
    if(currentView()!=='hr')return;
    const content=document.querySelector('#content');
    if(!content)return;
    if((content.textContent||'').includes(LEGACY_MARKER)){
      content.innerHTML='<div class="card"><b>Carregando RH...</b></div>';
      renderCanonicalRH();
    }
  });
}).observe(root,{childList:true,subtree:true});

window.__INTEGRAL_LEGACY_RH_DISABLED__='2026-09-01-v1';
})();
