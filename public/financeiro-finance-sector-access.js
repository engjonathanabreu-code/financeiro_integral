/* Integral Financeiro — permissões do setor Financeiro.
   A navegação usa os mesmos IDs canônicos do restante do sistema. */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const allowedFinanceViews=new Set(['accounts','documents','receivables','boletos','budgets','trips','invoices','vehicles']);
function getUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function getView(){try{return typeof view!=='undefined'?view:window.view}catch{return window.view}}
function setView(v){try{view=v}catch{}window.view=v}
function isAdmin(){return norm(getUser()?.role||getUser()?.tipo||getUser()?.type)==='administrador'}
function isFinance(){const u=getUser();const role=norm(u?.tipo||u?.type||u?.role);return !!u&&u.ativo!==false&&!isAdmin()&&!role.startsWith('diretor')&&(norm(u.setor||u.sector)==='financeiro'||norm(u.tipo||u.type)==='financeiro'||norm(u.role)==='financeiro')}
function currentLocalUser(){const u=getUser();const list=(()=>{try{return db?.usersMvp||[]}catch{return window.db?.usersMvp||[]}})();return list.find(x=>x.erpId===u?.erpId||norm(x.email)===norm(u?.email)||x.name===u?.name)}
function directIds(row){return Array.isArray(row?.assignedDirect)?row.assignedDirect:(Array.isArray(row?.assigned)?row.assigned:[])}
function directlyAssigned(row){const local=currentLocalUser();if(!local)return false;return directIds(row).map(String).includes(String(local.id))}
/* O perfil é consultado uma vez por usuário, não a cada mudança na tela. */
async function hydrateProfile(force){const u=getUser(),sb=window.IntegralERP?.sb;if(!u||!sb)return;if(u.__profileHydrated&&!force)return;if(u.__profilePromise)return u.__profilePromise;u.__profilePromise=(async()=>{try{const {data:{user:authUser}}=await sb.auth.getUser();if(!authUser)return;const {data,error}=await sb.from('profiles').select('id,nome,email,tipo,setor,ativo').eq('id',authUser.id).maybeSingle();if(error||!data)return;u.erpId=data.id;u.ativo=data.ativo;u.tipo=data.tipo||u.tipo;u.setor=data.setor||'';/* Orçamentos, viagens e usersMvp usam o tipo do perfil como setor (igual ao login). */u.sector=data.tipo||u.sector;u.email=data.email||authUser.email||u.email;if(norm(data.tipo)==='administrador')u.role='Administrador';u.__profileHydrated=true}catch(e){console.warn('Financeiro: não foi possível atualizar o perfil de acesso.',e)}finally{u.__profilePromise=null}})();return u.__profilePromise}
function ensureButton(nav,id,label,beforeId){let b=nav.querySelector(`[data-view="${id}"]`);if(b)return b;b=document.createElement('button');b.dataset.view=id;b.textContent=label;const before=beforeId?nav.querySelector(`[data-view="${beforeId}"]`):null;if(before)nav.insertBefore(b,before);else nav.appendChild(b);return b}
function enforceNav(){if(!isFinance())return;const nav=q('.nav');if(!nav)return;nav.querySelectorAll('[data-view="recebimentos"],[data-view="receipts"]').forEach(x=>x.remove());ensureButton(nav,'accounts','Contas','documents');ensureButton(nav,'documents','Documentos Fiscais','budgets');ensureButton(nav,'receivables','Recebimentos','budgets');ensureButton(nav,'budgets','Orçamentos','trips');ensureButton(nav,'trips','Viagens');ensureButton(nav,'invoices','Solicitações');qa('button[data-view]',nav).forEach(b=>{const ok=allowedFinanceViews.has(b.dataset.view);b.hidden=!ok;if(ok)b.style.removeProperty('display');else b.style.setProperty('display','none','important')});const badge=q('.topbar .badge');if(badge&&badge.textContent!=='Financeiro')badge.textContent='Financeiro';const mini=q('.user-mini');if(mini){const strong=mini.querySelector('strong');const expected=(strong?.textContent||'')+'Financeiro';if(mini.textContent!==expected){mini.innerHTML='';if(strong)mini.appendChild(strong);mini.append(document.createTextNode('Financeiro'))}}}
function invokeDirectOnly(fn){const u=getUser();if(!u||typeof fn!=='function')return;const oldSector=u.sector,oldSetor=u.setor;u.sector='__acesso_individual__';u.setor='__acesso_individual__';try{return fn()}finally{u.sector=oldSector;u.setor=oldSetor}}
const originalBudgets=typeof budgets==='function'?budgets:window.budgets;if(typeof originalBudgets==='function'){const wrapped=function(){return isFinance()?invokeDirectOnly(originalBudgets):originalBudgets.apply(this,arguments)};window.budgets=wrapped;try{budgets=wrapped}catch{}}
const originalTrips=typeof trips==='function'?trips:window.trips;if(typeof originalTrips==='function'){const wrapped=function(){if(!isFinance())return originalTrips.apply(this,arguments);const d=(()=>{try{return db}catch{return window.db}})();if(!d)return invokeDirectOnly(originalTrips);const all=d.trips||[];d.trips=all.filter(t=>directlyAssigned(t)||window.IntegralFinanceRequests?.ownsApprovedTrip(t));try{return invokeDirectOnly(originalTrips)}finally{d.trips=all}};window.trips=wrapped;try{trips=wrapped}catch{}}
const originalApp=typeof app==='function'?app:window.app;
if(typeof originalApp==='function'){
  const wrapped=function(){
    if(!isFinance())return originalApp.apply(this,arguments);
    if(!allowedFinanceViews.has(getView()))setView('documents');
    const result=originalApp.apply(this,arguments);
    queueMicrotask(enforceNav);
    return result;
  };
  window.app=wrapped;try{app=wrapped}catch{}
}
document.addEventListener('click',event=>{
  if(!isFinance())return;
  const button=event.target.closest?.('.nav [data-view]');
  if(!button)return;
  const id=button.dataset.view;
  if(!allowedFinanceViews.has(id)){
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if(id!=='accounts'&&id!=='documents')return;
  event.preventDefault();
  event.stopImmediatePropagation();
  setView(id);
  if(id==='accounts')window.accounts?.();
  else window.documents?.();
  qa('.nav [data-view]').forEach(item=>item.classList.toggle('active',item.dataset.view===id));
  enforceNav();
},true);
let scheduled=false;function reconcile(){if(scheduled)return;scheduled=true;queueMicrotask(async()=>{scheduled=false;await hydrateProfile();enforceNav();window.IntegralFinanceRouter?.ensureNav?.()})}new MutationObserver(reconcile).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('load',reconcile,{once:true});setTimeout(reconcile,0);
window.IntegralFinanceSectorAccess={isFinance,canOperateAccounts:isFinance,directlyAssigned,enforceNav,hydrateProfile};
})();