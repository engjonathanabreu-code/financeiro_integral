/* Integral Financeiro — camada de estabilidade estrutural
   Esta camada NÃO renderiza telas de negócio. Ela apenas protege navegação e reconciliação.
   RH, Dashboard, Planejamento e demais módulos permanecem sob responsabilidade de suas implementações canônicas. */
(function(){
'use strict';

const q=(s,r=document)=>r.querySelector(s);
let scheduled=false;

function currentUser(){
  try{return typeof user!=='undefined'?user:window.user}catch{return window.user}
}
function isAdmin(){return currentUser()?.role==='Administrador'}

function ensureCriticalNav(){
  if(!isAdmin())return;
  const nav=q('.nav');
  if(!nav)return;

  // Visão Geral sempre disponível no início.
  if(!nav.querySelector('[data-view="dashboard"]')){
    const b=document.createElement('button');
    b.dataset.view='dashboard';
    b.textContent='Visão Geral';
    nav.prepend(b);
  }

  // Relatórios permanece fora do menu lateral conforme regra atual do Financeiro.
  nav.querySelectorAll('[data-view="reports"]').forEach(x=>x.remove());
  nav.querySelectorAll('button').forEach(x=>{
    if((x.textContent||'').trim()==='Relatórios')x.remove();
  });

  try{
    if(Array.isArray(adminNav)){
      for(let i=adminNav.length-1;i>=0;i--)if(adminNav[i]?.[0]==='reports')adminNav.splice(i,1);
      if(!adminNav.some(x=>x?.[0]==='dashboard'))adminNav.unshift(['dashboard','Visão Geral']);
    }
    if(typeof staffNav!=='undefined'&&Array.isArray(staffNav)){
      for(let i=staffNav.length-1;i>=0;i--)if(staffNav[i]?.[0]==='reports')staffNav.splice(i,1);
    }
  }catch{}
}

function reconcile(){
  ensureCriticalNav();
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;reconcile()});
}

window.addEventListener('load',schedule,{once:true});
document.addEventListener('click',()=>setTimeout(schedule,0),true);
const root=q('#app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
setTimeout(schedule,0);

// Marcador explícito para diagnóstico: esta versão nunca substitui dashboard() ou hr().
window.__INTEGRAL_STABILITY_NO_VIEW_OVERRIDE__=true;
})();
