/* Integral Financeiro V17 - RH consolidado e relatório dentro de Viagens */
(function(){
'use strict';
const $q=q=>document.querySelector(q), $$q=q=>[...document.querySelectorAll(q)];
const uid=()=>Date.now()+Math.floor(Math.random()*9999);
const today=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>today().slice(0,7);
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const monthLabel=m=>{const[y,n]=String(m).split('-');return new Date(+y,+n-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const money17=v=>money(Number(v||0));
const isAdm=()=>user?.role==='Administrador';
let selectedMonth=currentMonth();

function valueForMonth(p,m){
  const first=`${m}-01`, last=`${m}-31`;
  if(p.start&&p.start>last)return 0;
  if(p.end&&p.end<first)return 0;
  const hist=[...(p.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return Number(hist.at(-1)?.value ?? p.currentValue ?? p.value ?? 0);
}
function activePeople(m){return (db.hrPeople||[]).filter(p=>valueForMonth(p,m)>0)}
function paymentFor(p,m){return (db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}

function employeeModal(id){
  const p=(db.hrPeople||[]).find(x=>String(x.id)===String(id));
  const x=v2modal(p?'Editar colaborador':'Cadastrar colaborador',`<form id="hr17Form"><div class="modal-body"><div class="form-section"><h4>Contrato do colaborador</h4><div class="form-grid"><div class="field full"><label>Nome do colaborador</label><input name="name" value="${esc(p?.name||'')}" required></div><div class="field"><label>Início do contrato</label><input name="start" type="date" value="${p?.start||today()}" required></div><div class="field"><label>Fim do contrato</label><input name="end" type="date" value="${p?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" step="0.01" min="0" value="${p?.currentValue??p?.value??''}" required></div><div class="field"><label>Adicionar contrato/arquivo</label><input id="hr17File" type="file"></div></div></div><div class="notice">Alterações no valor mensal ficam registradas no histórico e passam a valer nas projeções futuras.</div>${p?.history?.length?`<div class="form-section"><h4>Histórico de valores</h4><div class="history-list">${[...p.history].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(h=>`<div><b>${h.date?fmt(h.date):'—'}</b><span>${money17(h.value)}</span></div>`).join('')}</div></div>`:''}</div><div class="modal-foot">${p?'<button type="button" class="btn danger" id="hr17Delete">Excluir colaborador</button>':''}<button class="btn">Salvar</button></div></form>`);
  const form=x.querySelector('#hr17Form');
  form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),val=Number(f.get('value')||0),old=Number(p?.currentValue??p?.value??0),file=x.querySelector('#hr17File').files[0],files=[...(p?.files||[])],history=[...(p?.history||[])];if(file)files.push({name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});if(!p||val!==old)history.push({date:today(),value:val,by:user?.name||''});const o={id:p?.id||uid(),name:String(f.get('name')||'').trim(),start:f.get('start'),end:f.get('end')||'',currentValue:val,files,history};if(p)Object.assign(p,o);else (db.hrPeople=db.hrPeople||[]).push(o);save();x.remove();hr();};
  if(p)x.querySelector('#hr17Delete').onclick=()=>{if(confirm(`Excluir ${p.name}?`)){db.hrPeople=db.hrPeople.filter(q=>q.id!==p.id);db.hrPayments=(db.hrPayments||[]).filter(q=>String(q.personId)!==String(p.id));save();x.remove();hr();}};
}

window.hr=hr=function(){
  if(!isAdm()){view='budgets';return app();}
  title('RH');
  const start=currentMonth();
  const months=Array.from({length:6},(_,i)=>addMonth(start,i));
  if(!months.includes(selectedMonth))selectedMonth=start;
  const people=activePeople(selectedMonth);
  const total=people.reduce((s,p)=>s+valueForMonth(p,selectedMonth),0);
  const paid=people.reduce((s,p)=>{const q=paymentFor(p,selectedMonth);return s+(q?.status==='Pago'?Number(q.value||valueForMonth(p,selectedMonth)):0)},0);
  $('#content').innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção dos pagamentos dos próximos 6 meses.</div></div><button class="btn" id="hr17New">+ Cadastrar colaborador</button></div>
  <section class="card hr17-month-panel"><div class="section-head"><div><h3>Próximos 6 meses</h3><p class="muted">Clique em um mês para abrir a folha projetada daquele período.</p></div></div><div class="hr17-months">${months.map(m=>{const ps=activePeople(m),t=ps.reduce((s,p)=>s+valueForMonth(p,m),0);return`<button class="hr17-month ${m===selectedMonth?'active':''}" data-hr17-month="${m}"><span>${monthLabel(m)}</span><b>${money17(t)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section>
  <section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedMonth)}</h3><p>${selectedMonth===start?'Folha do mês vigente':'Projeção de pagamentos futuros'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${money17(total)}</b></span><span><small>Quitado</small><b>${money17(paid)}</b></span><span><small>Em aberto</small><b>${money17(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Colaborador</th><th>Vigência</th><th>Valor previsto</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const q=paymentFor(p,selectedMonth),done=q?.status==='Pago';return`<tr><td><b>${esc(p.name)}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${money17(valueForMonth(p,selectedMonth))}</b></td><td>${done?badgeStatus('Pago'):(selectedMonth===start?'Pendente':'Previsto')}</td><td>${selectedMonth===start&&!done?`<button class="btn small" data-hr17-pay="${p.id}">Marcar pago</button>`:done?'Quitado':'—'}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador vigente neste mês.</div></td></tr>'}</tbody></table></div></section>
  <h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr17-person="${p.id}"><div><h3>${esc(p.name)}</h3><span class="badge">${p.end&&p.end<today()?'Encerrado':'Vigente'}</span></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${money17(p.currentValue||p.value)}</b></span><span><small>Arquivos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;
  $('#hr17New').onclick=()=>employeeModal();
  $$q('[data-hr17-person]').forEach(b=>b.onclick=()=>employeeModal(b.dataset.hr17Person));
  $$q('[data-hr17-month]').forEach(b=>b.onclick=()=>{selectedMonth=b.dataset.hr17Month;hr();});
  $$q('[data-hr17-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr17Pay));if(!p)return;let q=paymentFor(p,start),v=valueForMonth(p,start);if(q){q.status='Pago';q.paidAt=today();q.value=v}else(db.hrPayments=db.hrPayments||[]).push({id:uid(),personId:p.id,month:start,value:v,status:'Pago',paidAt:today()});save();hr();});
};

function travelReport(){
  const trips=(db.trips||[]), active=trips.filter(t=>!['Finalizada','Aprovada','Encerrada'].includes(t.status)), spent=trips.reduce((s,t)=>s+Number(t.proven||t.spent||0),0), declared=trips.reduce((s,t)=>s+Number(t.declared||0),0), divergence=trips.filter(t=>String(t.status||'').includes('Diverg'));
  v2modal('Relatório de Viagens',`<div class="modal-body"><div class="grid cols-3 compact-metrics"><div class="card metric mini"><h3>Viagens registradas</h3><b>${trips.length}</b></div><div class="card metric mini"><h3>Comprovado</h3><b>${money17(spent)}</b></div><div class="card metric mini"><h3>Declarado</h3><b>${money17(declared)}</b></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Projeto</th><th>Declarado</th><th>Comprovado</th><th>Status</th></tr></thead><tbody>${trips.map(t=>`<tr><td><b>${esc(t.city||t.destination||'—')}</b></td><td>${esc(t.period||'—')}</td><td>${esc(t.employee||t.team||'—')}</td><td>${esc(t.project||'—')}</td><td>${money17(t.declared)}</td><td>${money17(t.proven||t.spent)}</td><td>${esc(t.status||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma viagem registrada.</td></tr>'}</tbody></table></div>${divergence.length?`<div class="notice warn">${divergence.length} viagem(ns) com divergência de prestação de contas.</div>`:''}</div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);
}

// Remove Relatórios do menu lateral: relatório passa a ser parte de Viagens.
for(let i=adminNav.length-1;i>=0;i--)if(adminNav[i]?.[0]==='reports')adminNav.splice(i,1);
if(Array.isArray(staffNav))for(let i=staffNav.length-1;i>=0;i--)if(staffNav[i]?.[0]==='reports')staffNav.splice(i,1);

const previousTrips=trips;
window.trips=trips=function(){
  const r=previousTrips();
  const toolbar=$q('#content .toolbar');
  if(toolbar&&!$q('#travelReportBtn')){
    let right=toolbar.querySelector('.right');if(!right){right=document.createElement('div');right.className='right';toolbar.appendChild(right);}
    const btn=document.createElement('button');btn.className='btn ghost';btn.id='travelReportBtn';btn.type='button';btn.textContent='Relatório de Viagens';btn.onclick=travelReport;right.prepend(btn);
  }
  return r;
};

// Força o roteamento final do RH consolidado.
const previousRender17=render;
render=function(){if(view==='hr')return hr();return previousRender17();};
})();
