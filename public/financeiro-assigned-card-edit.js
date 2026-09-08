/* Integral Financeiro — edição para usuários atribuídos a Orçamentos e Viagens */
(function(){
'use strict';

let activeBudgetId=null, activeTripId=null;
const str=v=>String(v??'');
const same=(a,b)=>str(a)===str(b);
const safe=v=>typeof esc==='function'?esc(str(v)):str(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const currentLocalUser=()=>{
  const users=db?.usersMvp||[];
  return users.find(u=>(user?.erpId&&same(u.erpId,user.erpId))||String(u.email||'').toLowerCase()===String(user?.email||'').toLowerCase()||u.name===user?.name)||null;
};
const isAdmin=()=>user?.role==='Administrador';
const assignedTo=record=>{
  if(isAdmin()) return true;
  const local=currentLocalUser();
  if(!local||!record) return false;
  const ids=record.assignedDirect||record.assigned||[];
  return ids.some(id=>same(id,local.id)||same(id,local.erpId));
};
const modal=(title,html)=>typeof v2modal==='function'?v2modal(title,html):null;
const persist=()=>typeof save==='function'&&save();

function resolveBudget(){
  if(activeBudgetId){const found=(db.budgetRecords||[]).find(b=>same(b.id,activeBudgetId));if(found)return found;}
  const pageTitle=document.querySelector('#title')?.textContent?.trim();
  return (db.budgetRecords||[]).find(b=>b.name===pageTitle)||null;
}
function resolveTrip(){
  if(activeTripId){const found=(db.trips||[]).find(t=>same(t.id,activeTripId));if(found)return found;}
  const pageTitle=document.querySelector('#title')?.textContent||'';
  const city=pageTitle.replace(/^Viagem\s*•\s*/,'').trim();
  return (db.trips||[]).find(t=>t.city===city)||null;
}

function editBudgetExpense(budget,expense){
  if(!budget||!expense||!assignedTo(budget))return;
  const x=modal('Editar gasto',`<form id="assignedExpenseEdit"><div class="modal-body"><div class="form-grid">
    <div class="field"><label>Data</label><input name="date" type="date" value="${safe(expense.date||'')}" required></div>
    <div class="field"><label>Valor</label><input name="value" type="number" min="0" step="0.01" value="${Number(expense.value||0)}" required></div>
    <div class="field"><label>Descrição do gasto</label><input name="description" value="${safe(expense.description||'')}" required></div>
    <div class="field"><label>Origem</label><input name="origin" value="${safe(expense.origin||'')}"></div>
    <div class="field full"><small class="muted">O comprovante já enviado é preservado. Para substituí-lo, use o fluxo de envio do próprio card.</small></div>
  </div></div><div class="modal-foot"><button class="btn">Salvar alterações</button></div></form>`);
  if(!x)return;
  const f=x.querySelector('#assignedExpenseEdit');
  f.onsubmit=e=>{
    e.preventDefault();
    const d=new FormData(f);
    expense.date=d.get('date');expense.value=Number(d.get('value')||0);expense.description=String(d.get('description')||'').trim();expense.origin=String(d.get('origin')||'').trim();
    expense.history=expense.history||[];expense.history.push({at:new Date().toISOString(),action:'Gasto editado',by:user?.name||'Usuário atribuído'});
    persist();x.remove();activeBudgetId=budget.id;
    if(window.IntegralFinanceV9?.budgetDetail)window.IntegralFinanceV9.budgetDetail(budget.id);else if(typeof budgets==='function')budgets();
  };
}

function editTrip(trip){
  if(!trip||!assignedTo(trip))return;
  const x=modal('Editar viagem',`<form id="assignedTripEdit"><div class="modal-body"><div class="form-grid">
    <div class="field"><label>Destino / cidade</label><input name="city" value="${safe(trip.city||'')}" required></div>
    <div class="field"><label>Projeto / atividade</label><input name="project" value="${safe(trip.project||'')}"></div>
    <div class="field"><label>Início</label><input name="start" type="date" value="${safe(trip.start||'')}" required></div>
    <div class="field"><label>Fim</label><input name="end" type="date" value="${safe(trip.end||'')}" required></div>
    <div class="field"><label>Equipe</label><input name="employee" value="${safe(trip.employee||'')}"></div>
    <div class="field"><label>Setor</label><input name="sector" value="${safe(trip.sector||'')}"></div>
    <div class="field full"><label>Objetivo</label><input name="objective" value="${safe(trip.objective||'')}"></div>
    <div class="field full"><label>Relatório</label><textarea name="report">${safe(trip.report||'')}</textarea></div>
  </div></div><div class="modal-foot"><button class="btn">Salvar alterações</button></div></form>`);
  if(!x)return;
  const f=x.querySelector('#assignedTripEdit');
  f.onsubmit=e=>{
    e.preventDefault();const d=new FormData(f);
    trip.city=String(d.get('city')||'').trim();trip.project=String(d.get('project')||'').trim();trip.start=d.get('start');trip.end=d.get('end');trip.employee=String(d.get('employee')||'').trim();trip.sector=String(d.get('sector')||'').trim();trip.objective=String(d.get('objective')||'').trim();trip.report=String(d.get('report')||'').trim();trip.month=String(trip.start||'').slice(0,7);
    trip.history=trip.history||[];trip.history.push({at:new Date().toISOString(),action:'Viagem editada',by:user?.name||'Usuário atribuído'});
    persist();x.remove();activeTripId=trip.id;
    if(window.IntegralFinanceV9?.tripDetail)window.IntegralFinanceV9.tripDetail(trip.id);else if(typeof trips==='function')trips();
  };
}

function enhanceBudget(){
  const add=document.querySelector('#v9AddExpense');if(!add)return;
  const budget=resolveBudget();if(!budget||!assignedTo(budget)||isAdmin())return;
  const exp=(db.budgetExpenses||[]).filter(e=>same(e.budgetId,budget.id)).sort((a,z)=>(z.date||'').localeCompare(a.date||''));
  const rows=[...document.querySelectorAll('#content table tbody tr')];
  rows.forEach((row,i)=>{
    const expense=exp[i];if(!expense)return;
    const cell=row.lastElementChild;if(!cell||cell.querySelector('[data-assigned-exp-edit]'))return;
    const btn=document.createElement('button');btn.className='icon-btn';btn.type='button';btn.dataset.assignedExpEdit=expense.id;btn.title='Editar gasto';btn.setAttribute('aria-label','Editar gasto');btn.textContent='✎';btn.onclick=ev=>{ev.stopPropagation();editBudgetExpense(budget,expense)};cell.appendChild(btn);
  });
}

function enhanceTrip(){
  const back=document.querySelector('#v9TripsBack');if(!back)return;
  const trip=resolveTrip();if(!trip||!assignedTo(trip)||isAdmin())return;
  const right=back.closest('.toolbar')?.querySelector('.right');if(!right||right.querySelector('#assignedTripEditBtn'))return;
  const btn=document.createElement('button');btn.className='btn ghost';btn.id='assignedTripEditBtn';btn.type='button';btn.textContent='Editar viagem';btn.onclick=()=>editTrip(trip);right.prepend(btn);
}

// Guarda o card aberto antes do render da tela de detalhe.
document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-v9-budget]');if(b)activeBudgetId=b.dataset.v9Budget;
  const t=e.target.closest?.('[data-v9-trip]');if(t)activeTripId=t.dataset.v9Trip;
},true);

let queued=false;
const refresh=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;try{enhanceBudget();enhanceTrip()}catch(err){console.warn('[Integral] assigned-card-edit',err)}})};
new MutationObserver(refresh).observe(document.documentElement,{subtree:true,childList:true});
refresh();
})();
