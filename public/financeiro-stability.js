/* Integral Financeiro - camada final de estabilidade
   Mantém regras críticas independentes do bundle legado consolidado. */
(function(){
'use strict';

const q=s=>document.querySelector(s), qa=s=>Array.from(document.querySelectorAll(s));
const esc2=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const mny=v=>typeof money==='function'?money(Number(v||0)):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today2=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>today2().slice(0,7);
const fmt2=d=>{if(!d)return '—';try{return typeof fmt==='function'?fmt(d):new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')}catch{return d}};
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const monthLabel=m=>{const[y,mm]=String(m).split('-');return new Date(+y,+mm-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
let selectedHrMonth=currentMonth();

function isAdmin(){return !!(window.user?.role==='Administrador'||(typeof user!=='undefined'&&user?.role==='Administrador'));}
function DB(){return window.db||(typeof db!=='undefined'?db:null)}
function currentView(){try{return window.view||(typeof view!=='undefined'?view:'')}catch{return ''}}
function setView(v){try{window.view=v;view=v}catch{window.view=v}}
function setTitle(t){const el=q('#title')||q('#pageTitle');if(el)el.textContent=t;}

function ensureCriticalNav(){
  if(!isAdmin())return;
  const nav=q('.nav'); if(!nav)return;
  // Visão Geral deve existir e ficar no início.
  if(!nav.querySelector('[data-view="dashboard"]')){
    const b=document.createElement('button');b.dataset.view='dashboard';b.textContent='Visão Geral';nav.prepend(b);
  }
  // Relatórios nunca deve existir no menu lateral.
  nav.querySelectorAll('[data-view="reports"]').forEach(x=>x.remove());
  nav.querySelectorAll('button').forEach(x=>{if((x.textContent||'').trim()==='Relatórios')x.remove()});
  try{
    if(Array.isArray(adminNav)){
      for(let i=adminNav.length-1;i>=0;i--)if(adminNav[i]?.[0]==='reports')adminNav.splice(i,1);
      if(!adminNav.some(x=>x?.[0]==='dashboard'))adminNav.unshift(['dashboard','Visão Geral']);
    }
    if(typeof staffNav!=='undefined'&&Array.isArray(staffNav))for(let i=staffNav.length-1;i>=0;i--)if(staffNav[i]?.[0]==='reports')staffNav.splice(i,1);
  }catch{}
}

function accountPaid(a){return /paga|pago/i.test(String(a?.status||''));}
function dueDate(a){return a?.due||a?.dueDate||a?.vencimento||''}
function amount(x){return Number(x?.value??x?.amount??x?.valor??x?.total??0)}
function plannedEntries(d){
  const all=[...(d.erpPlannedEntries||[]),...(d.erpEntries||[]),...(d.plannedEntries||[]),...(d.erpRevenues||[])];
  if(all.length)return all;
  return (d.revenues||[]).map(r=>({source:r.source||r.origin||r.name||'Receita',value:r.monthly||r.value||0,due:r.start||r.date||''}));
}
function budgetOpen(b){
  const limit=Number(b?.limit??b?.total??b?.amount??b?.value??0), spent=Number(b?.spent??b?.used??b?.gasto??0);
  return Math.max(0,limit-spent);
}
function tripSpent(t){return Number(t?.proven??t?.spent??t?.declared??0)}
function isTripActive(t){return !/finaliz|aprovad|encerrad|conclu/i.test(String(t?.status||''));}

function renderDashboardStable(){
  const d=DB(); if(!d||!q('#content'))return;
  setTitle('Visão Geral');
  const today=today2();
  const upcoming=(d.accounts||[]).filter(a=>!accountPaid(a)&&dueDate(a)&&dueDate(a)>=today).sort((a,b)=>String(dueDate(a)).localeCompare(String(dueDate(b)))).slice(0,6);
  const entries=plannedEntries(d).filter(x=>{const dt=x.due||x.date||x.expectedDate||x.vencimento||'';return !dt||dt>=today}).sort((a,b)=>String(a.due||a.date||'9999').localeCompare(String(b.due||b.date||'9999'))).slice(0,6);
  const sixty=new Date();sixty.setDate(sixty.getDate()+60);const sixtyIso=sixty.toISOString().slice(0,10);
  const ending=(d.hrPeople||[]).filter(p=>p.end&&p.end>=today&&p.end<=sixtyIso).sort((a,b)=>String(a.end).localeCompare(String(b.end))).slice(0,6);
  const paidOut=(d.accounts||[]).filter(accountPaid).reduce((s,a)=>s+amount(a),0)+(d.docs||[]).reduce((s,x)=>s+amount(x),0);
  const realizedIn=Number(d.currentCashIn??d.realizedIncome??0);
  const currentBalance=Number(d.currentBalance??d.cashBalance??d.saldoAtual??(realizedIn-paidOut));
  const budgetOpenTotal=(d.budgets||[]).reduce((s,b)=>s+budgetOpen(b),0);
  const activeTrips=(d.trips||[]).filter(isTripActive), activeTripSpent=activeTrips.reduce((s,t)=>s+tripSpent(t),0);
  const docs=[...(d.docs||[])].sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''))).slice(0,6);
  q('#content').innerHTML=`
    <div class="grid cols-4">
      <div class="card metric"><h3>Saldo atual do caixa</h3><b>${mny(currentBalance)}</b><small>posição registrada</small></div>
      <div class="card metric"><h3>Contas a vencer</h3><b>${upcoming.length}</b><small>${mny(upcoming.reduce((s,a)=>s+amount(a),0))}</small></div>
      <div class="card metric"><h3>Orçamentos em aberto</h3><b>${mny(budgetOpenTotal)}</b><small>saldo disponível</small></div>
      <div class="card metric"><h3>Viagens ativas</h3><b>${activeTrips.length}</b><small>${mny(activeTripSpent)} gastos</small></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card"><div class="section-head"><div><h3>Próximas contas a vencer</h3><p class="muted">Contas ainda não quitadas.</p></div></div>${upcoming.map(a=>`<div class="mini-payment detailed"><div><strong>${esc2(a.desc||a.name||a.description||'Conta')}</strong><small>${esc2(a.supplier||a.origin||'')} · ${fmt2(dueDate(a))}</small></div><b>${mny(amount(a))}</b></div>`).join('')||'<div class="empty compact">Nenhuma conta futura pendente.</div>'}</section>
      <section class="card"><div class="section-head"><div><h3>Próximas entradas programadas</h3><p class="muted">Previsões já sincronizadas do ERP/Planejamento.</p></div></div>${entries.map(x=>`<div class="mini-payment detailed"><div><strong>${esc2(x.source||x.origin||x.name||x.description||'Entrada')}</strong><small>${fmt2(x.due||x.date||x.expectedDate||x.vencimento)}</small></div><b>${mny(amount(x))}</b></div>`).join('')||'<div class="empty compact">Nenhuma entrada futura registrada.</div>'}</section>
      <section class="card"><div class="section-head"><div><h3>Contratos a vencer em 60 dias</h3><p class="muted">Colaboradores com término de contrato próximo.</p></div></div>${ending.map(p=>`<div class="mini-payment detailed"><div><strong>${esc2(p.name||'Colaborador')}</strong><small>Término ${fmt2(p.end)}</small></div><b>${mny(p.currentValue??p.value)}</b></div>`).join('')||'<div class="empty compact">Nenhum contrato vence nos próximos 60 dias.</div>'}</section>
      <section class="card"><div class="section-head"><div><h3>Últimos documentos fiscais</h3><p class="muted">Arquivos processados mais recentemente.</p></div></div>${docs.map(x=>`<div class="mini-payment detailed"><div><strong>${esc2(x.name||x.fileName||'Documento')}</strong><small>${esc2(x.supplier||x.type||'')} · ${fmt2(x.date||x.createdAt)}</small></div><b>${mny(amount(x))}</b></div>`).join('')||'<div class="empty compact">Nenhum documento fiscal registrado.</div>'}</section>
    </div>`;
}

function hrValue(person,month){
  const first=`${month}-01`,last=`${month}-31`;
  if(person.start&&person.start>last)return 0;if(person.end&&person.end<first)return 0;
  const h=[...(person.history||[])].filter(x=>x.date&&x.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return Number(h.length?h[h.length-1].value:(person.currentValue??person.value??0));
}
function hrPeople(month){const d=DB();return (d?.hrPeople||[]).filter(p=>hrValue(p,month)>0)}
function hrPayment(p,m){const d=DB();return (d?.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}
function employeeModalStable(id){
  const d=DB();if(!d)return;const p=(d.hrPeople||[]).find(x=>String(x.id)===String(id));
  const el=document.createElement('div');el.className='modal-backdrop';
  el.innerHTML=`<div class="modal"><div class="modal-head"><h3>${p?'Editar colaborador':'Cadastrar colaborador'}</h3><button class="btn ghost small" type="button" data-close>Fechar</button></div><form id="stableHrForm"><div class="modal-body"><div class="form-grid"><div class="field full"><label>Nome do colaborador</label><input name="name" required value="${esc2(p?.name||'')}"></div><div class="field"><label>Início do contrato</label><input name="start" type="date" required value="${p?.start||today2()}"></div><div class="field"><label>Fim do contrato</label><input name="end" type="date" value="${p?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" min="0" step="0.01" required value="${p?.currentValue??p?.value??''}"></div><div class="field"><label>Contrato / arquivo</label><input id="stableHrFile" type="file"></div></div>${p?.history?.length?`<h4>Histórico de valores</h4><div class="history-list">${[...p.history].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(h=>`<div><b>${fmt2(h.date)}</b><span>${mny(h.value)}</span></div>`).join('')}</div>`:''}</div><div class="modal-foot">${p?'<button type="button" id="stableHrDelete" class="btn danger">Excluir</button>':''}<button class="btn" type="submit">Salvar</button></div></form></div>`;
  document.body.appendChild(el);el.querySelector('[data-close]').onclick=()=>el.remove();el.onclick=e=>{if(e.target===el)el.remove()};
  el.querySelector('#stableHrForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget),value=Number(f.get('value')||0),old=Number(p?.currentValue??p?.value??0),file=el.querySelector('#stableHrFile')?.files?.[0],files=[...(p?.files||[])],history=[...(p?.history||[])];if(file)files.push({name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});if(!p||value!==old)history.push({date:today2(),value,by:(typeof user!=='undefined'?user?.name:'')||''});const obj={id:p?.id||Date.now()+Math.floor(Math.random()*9999),name:String(f.get('name')||'').trim(),start:String(f.get('start')||''),end:String(f.get('end')||''),value,currentValue:value,files,history};d.hrPeople=d.hrPeople||[];if(p)Object.assign(p,obj);else d.hrPeople.push(obj);if(typeof save==='function')save();el.remove();renderHrStable();};
  el.querySelector('#stableHrDelete')?.addEventListener('click',()=>{if(confirm(`Excluir ${p.name}?`)){d.hrPeople=(d.hrPeople||[]).filter(x=>String(x.id)!==String(p.id));d.hrPayments=(d.hrPayments||[]).filter(x=>String(x.personId)!==String(p.id));if(typeof save==='function')save();el.remove();renderHrStable();}});
}
function renderHrStable(){
  const d=DB();if(!d||!q('#content')||!isAdmin())return;
  setTitle('RH');const start=currentMonth(),months=Array.from({length:6},(_,i)=>addMonth(start,i));if(!months.includes(selectedHrMonth))selectedHrMonth=start;
  const people=hrPeople(selectedHrMonth),total=people.reduce((s,p)=>s+hrValue(p,selectedHrMonth),0),paid=people.reduce((s,p)=>{const x=hrPayment(p,selectedHrMonth);return s+(x?.status==='Pago'?Number(x.value||hrValue(p,selectedHrMonth)):0)},0);
  q('#content').innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção dos pagamentos para os próximos 6 meses.</div></div><button class="btn" id="stableHrNew">+ Colaborador</button></div><section class="card hr17-month-panel"><div class="section-head"><div><h3>Próximos 6 meses</h3><p class="muted">Clique em um mês para visualizar a folha projetada.</p></div></div><div class="hr17-months">${months.map(m=>{const ps=hrPeople(m),t=ps.reduce((s,p)=>s+hrValue(p,m),0);return`<button class="hr17-month ${m===selectedHrMonth?'active':''}" data-stable-hr-month="${m}"><span>${monthLabel(m)}</span><b>${mny(t)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section><section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedHrMonth)}</h3><p>${selectedHrMonth===start?'Folha do mês vigente':'Projeção de pagamentos futuros'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${mny(total)}</b></span><span><small>Quitado</small><b>${mny(paid)}</b></span><span><small>Em aberto</small><b>${mny(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Vigência</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const x=hrPayment(p,selectedHrMonth),done=x?.status==='Pago';return`<tr><td><b>${esc2(p.name||'')}</b></td><td>${fmt2(p.start)} → ${p.end?fmt2(p.end):'Indeterminado'}</td><td><b>${mny(hrValue(p,selectedHrMonth))}</b></td><td>${done?'Pago':(selectedHrMonth===start?'Pendente':'Previsto')}</td><td>${selectedHrMonth===start&&!done?`<button class="btn small" data-stable-hr-pay="${p.id}">Marcar pago</button>`:(done?'Quitado':'—')}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador vigente neste mês.</div></td></tr>'}</tbody></table></div></section><h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(d.hrPeople||[]).map(p=>`<button class="card employee-card" data-stable-hr-person="${p.id}"><div><h3>${esc2(p.name||'')}</h3></div><div class="employee-facts"><span><small>Início</small><b>${fmt2(p.start)}</b></span><span><small>Fim</small><b>${p.end?fmt2(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${mny(p.currentValue??p.value)}</b></span><span><small>Arquivos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;
  q('#stableHrNew').onclick=()=>employeeModalStable();qa('[data-stable-hr-person]').forEach(b=>b.onclick=()=>employeeModalStable(b.dataset.stableHrPerson));qa('[data-stable-hr-month]').forEach(b=>b.onclick=()=>{selectedHrMonth=b.dataset.stableHrMonth;renderHrStable()});qa('[data-stable-hr-pay]').forEach(b=>b.onclick=()=>{const p=(d.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.stableHrPay));if(!p)return;d.hrPayments=d.hrPayments||[];let x=hrPayment(p,start),value=hrValue(p,start);if(x)Object.assign(x,{status:'Pago',paidAt:today2(),value});else d.hrPayments.push({id:Date.now(),personId:p.id,month:start,value,status:'Pago',paidAt:today2()});if(typeof save==='function')save();renderHrStable()});
}

function installTripReport(){
  if(currentView()!=='trips')return;const toolbar=q('#content .toolbar');if(!toolbar||q('#stableTravelReport'))return;let right=toolbar.querySelector('.right');if(!right){right=document.createElement('div');right.className='right';toolbar.appendChild(right)}const b=document.createElement('button');b.id='stableTravelReport';b.className='btn ghost';b.textContent='Relatório de Viagens';b.onclick=()=>{const d=DB(),ts=d?.trips||[],spent=ts.reduce((s,t)=>s+tripSpent(t),0),decl=ts.reduce((s,t)=>s+Number(t.declared||0),0);const body=`<div class="modal-body"><div class="grid cols-3"><div class="card metric"><h3>Viagens</h3><b>${ts.length}</b></div><div class="card metric"><h3>Declarado</h3><b>${mny(decl)}</b></div><div class="card metric"><h3>Comprovado</h3><b>${mny(spent)}</b></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Projeto</th><th>Declarado</th><th>Comprovado</th><th>Status</th></tr></thead><tbody>${ts.map(t=>`<tr><td>${esc2(t.city||t.destination||'—')}</td><td>${esc2(t.period||'—')}</td><td>${esc2(t.employee||t.team||'—')}</td><td>${esc2(t.project||'—')}</td><td>${mny(t.declared)}</td><td>${mny(tripSpent(t))}</td><td>${esc2(t.status||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma viagem registrada.</td></tr>'}</tbody></table></div></div>`;if(typeof v2modal==='function'){v2modal('Relatório de Viagens',body+'<div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>')}else alert(`Viagens: ${ts.length}\nDeclarado: ${mny(decl)}\nComprovado: ${mny(spent)}`)};right.prepend(b);
}

function stabilizeCurrentScreen(){
  ensureCriticalNav();const v=currentView();
  if(v==='dashboard')renderDashboardStable();
  else if(v==='hr')renderHrStable();
  else if(v==='trips')installTripReport();
}

// Captura apenas as telas críticas; as demais continuam usando o sistema atual.
document.addEventListener('click',e=>{
  const b=e.target.closest?.('.nav [data-view]');if(!b)return;const next=b.dataset.view;
  if(!['dashboard','hr'].includes(next))return;
  e.preventDefault();e.stopImmediatePropagation();setView(next);qa('.nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===next));
  if(next==='dashboard')renderDashboardStable();else renderHrStable();
},{capture:true});

let scheduled=false;
const obs=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;ensureCriticalNav();if(currentView()==='trips')installTripReport();});});
obs.observe(document.documentElement,{childList:true,subtree:true});

window.IntegralFinanceiroStability={renderDashboard:renderDashboardStable,renderHR:renderHrStable,refresh:stabilizeCurrentScreen};
setTimeout(stabilizeCurrentScreen,0);
})();
