/* Integral Financeiro V18 - correção final independente de RH e Relatórios */
(function(){
'use strict';

const qs=(s)=>document.querySelector(s), qsa=(s)=>Array.from(document.querySelectorAll(s));
const now=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>now().slice(0,7);
const addMonth=(m,n)=>{const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const monthLabel=(m)=>{const parts=String(m).split('-');return new Date(Number(parts[0]),Number(parts[1])-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const money18=(v)=>money(Number(v||0));
let selectedMonth18=currentMonth();

function valueForMonth18(p,m){
  const first=m+'-01', last=m+'-31';
  if(p.start&&p.start>last)return 0;
  if(p.end&&p.end<first)return 0;
  const hist=(p.history||[]).filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const lastHist=hist.length?hist[hist.length-1]:null;
  return Number(lastHist&&lastHist.value!=null?lastHist.value:(p.currentValue!=null?p.currentValue:(p.value||0)));
}
function activePeople18(m){return (db.hrPeople||[]).filter(p=>valueForMonth18(p,m)>0)}
function paymentFor18(p,m){return (db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}

function renderHr18(){
  if(!user||user.role!=='Administrador'){view='budgets';app();return;}
  title('RH');
  const start=currentMonth();
  const months=Array.from({length:6},(_,i)=>addMonth(start,i));
  if(months.indexOf(selectedMonth18)===-1)selectedMonth18=start;
  const people=activePeople18(selectedMonth18);
  const total=people.reduce((s,p)=>s+valueForMonth18(p,selectedMonth18),0);
  const paid=people.reduce((s,p)=>{const q=paymentFor18(p,selectedMonth18);return s+(q&&q.status==='Pago'?Number(q.value||valueForMonth18(p,selectedMonth18)):0)},0);

  qs('#content').innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção de pagamentos para os próximos 6 meses.</div></div><button class="btn" id="hr18New">+ Colaborador</button></div>
  <section class="card hr17-month-panel"><div class="section-head"><div><h3>Próximos 6 meses</h3><p class="muted">Clique em um mês para visualizar a folha projetada.</p></div></div><div class="hr17-months">${months.map(m=>{const ps=activePeople18(m),t=ps.reduce((s,p)=>s+valueForMonth18(p,m),0);return `<button class="hr17-month ${m===selectedMonth18?'active':''}" data-hr18-month="${m}"><span>${monthLabel(m)}</span><b>${money18(t)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section>
  <section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedMonth18)}</h3><p>${selectedMonth18===start?'Folha do mês vigente':'Projeção de pagamentos futuros'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${money18(total)}</b></span><span><small>Quitado</small><b>${money18(paid)}</b></span><span><small>Em aberto</small><b>${money18(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Vigência</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const q=paymentFor18(p,selectedMonth18),done=q&&q.status==='Pago';return `<tr><td><b>${esc(p.name||'')}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${money18(valueForMonth18(p,selectedMonth18))}</b></td><td>${done?badgeStatus('Pago'):(selectedMonth18===start?'Pendente':'Previsto')}</td><td>${selectedMonth18===start&&!done?`<button class="btn small" data-hr18-pay="${p.id}">Marcar pago</button>`:(done?'Quitado':'—')}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador vigente neste mês.</div></td></tr>'}</tbody></table></div></section>
  <h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr18-person="${p.id}"><div><h3>${esc(p.name||'')}</h3></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${money18(p.currentValue||p.value)}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;

  qsa('[data-hr18-month]').forEach(b=>b.onclick=()=>{selectedMonth18=b.dataset.hr18Month;renderHr18();});
  qsa('[data-hr18-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr18Pay));if(!p)return;let q=paymentFor18(p,start),v=valueForMonth18(p,start);if(q){q.status='Pago';q.paidAt=now();q.value=v}else{db.hrPayments=db.hrPayments||[];db.hrPayments.push({id:Date.now(),personId:p.id,month:start,value:v,status:'Pago',paidAt:now()});}save();renderHr18();});
  if(qs('#hr18New'))qs('#hr18New').onclick=()=>{if(typeof employeeForm==='function')employeeForm();else if(window.employeeForm)window.employeeForm();};
  qsa('[data-hr18-person]').forEach(b=>b.onclick=()=>{if(typeof employeeForm==='function')employeeForm(b.dataset.hr18Person);else if(window.employeeForm)window.employeeForm(b.dataset.hr18Person);});
}

function removeReportsEverywhere(){
  try{
    if(Array.isArray(adminNav))for(let i=adminNav.length-1;i>=0;i--)if(adminNav[i]&&adminNav[i][0]==='reports')adminNav.splice(i,1);
    if(typeof staffNav!=='undefined'&&Array.isArray(staffNav))for(let i=staffNav.length-1;i>=0;i--)if(staffNav[i]&&staffNav[i][0]==='reports')staffNav.splice(i,1);
  }catch(e){console.warn('Falha ao limpar menu Relatórios:',e);}
  qsa('[data-view="reports"]').forEach(el=>el.remove());
  qsa('.nav button').forEach(el=>{if((el.textContent||'').trim()==='Relatórios')el.remove();});
}

function installTripReportButton(){
  if(view!=='trips')return;
  const toolbar=qs('#content .toolbar');
  if(!toolbar||qs('#tripReport18'))return;
  let right=toolbar.querySelector('.right');
  if(!right){right=document.createElement('div');right.className='right';toolbar.appendChild(right);}
  const btn=document.createElement('button');btn.id='tripReport18';btn.className='btn ghost';btn.type='button';btn.textContent='Relatório de Viagens';
  btn.onclick=()=>{const tripsList=db.trips||[];const declared=tripsList.reduce((s,t)=>s+Number(t.declared||0),0);const proven=tripsList.reduce((s,t)=>s+Number(t.proven||t.spent||0),0);v2modal('Relatório de Viagens',`<div class="modal-body"><div class="grid cols-3"><div class="card metric"><h3>Viagens</h3><b>${tripsList.length}</b></div><div class="card metric"><h3>Declarado</h3><b>${money18(declared)}</b></div><div class="card metric"><h3>Comprovado</h3><b>${money18(proven)}</b></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Projeto</th><th>Declarado</th><th>Comprovado</th><th>Status</th></tr></thead><tbody>${tripsList.map(t=>`<tr><td><b>${esc(t.city||t.destination||'—')}</b></td><td>${esc(t.period||'—')}</td><td>${esc(t.employee||t.team||'—')}</td><td>${esc(t.project||'—')}</td><td>${money18(t.declared)}</td><td>${money18(t.proven||t.spent)}</td><td>${esc(t.status||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma viagem registrada.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);};
  right.prepend(btn);
}

const previousRender18=render;
render=function(){
  removeReportsEverywhere();
  if(view==='hr')return renderHr18();
  const r=previousRender18();
  setTimeout(()=>{removeReportsEverywhere();installTripReportButton();},0);
  return r;
};

const previousApp18=app;
app=function(){const r=previousApp18();setTimeout(removeReportsEverywhere,0);return r;};

const obs=new MutationObserver(()=>removeReportsEverywhere());
obs.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(removeReportsEverywhere,0);

})();
