/* Integral Financeiro V13 - RH estável com projeção mensal de 6 meses */
(function(){
'use strict';
const uid13=()=>typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
const today13=()=>new Date().toISOString().slice(0,10);
const month13=d=>String(d||'').slice(0,7);
const addMonths13=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const label13=m=>{const [y,n]=String(m).split('-');return new Date(+y,+n-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const money13=v=>money(Number(v||0));
const isAdm13=()=>user?.role==='Administrador';
let selectedHrMonth=month13(today13());

function valueForMonth(p,m){
  const first=`${m}-01`, last=`${m}-31`;
  if(p.start&&p.start>last)return 0;
  if(p.end&&p.end<first)return 0;
  const hist=[...(p.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return Number(hist.at(-1)?.value ?? p.currentValue ?? p.value ?? 0);
}
function paymentFor(p,m){return (db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}
function activePeople(m){return (db.hrPeople||[]).filter(p=>valueForMonth(p,m)>0)}
function totalMonth(m){return activePeople(m).reduce((s,p)=>s+valueForMonth(p,m),0)}

function openHrMonth(m){
  selectedHrMonth=m;
  hr();
  setTimeout(()=>document.querySelector('.hr-selected-payroll')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
}

const previousHr=window.hr;
window.hr=hr=function(){
  if(!isAdm13()){
    if(typeof previousHr==='function')return previousHr();
    return;
  }
  title('RH');
  const current=month13(today13());
  const months=Array.from({length:6},(_,i)=>addMonths13(current,i));
  if(!months.includes(selectedHrMonth))selectedHrMonth=current;
  const people=activePeople(selectedHrMonth), monthTotal=totalMonth(selectedHrMonth);
  const paidTotal=people.reduce((s,p)=>{const q=paymentFor(p,selectedHrMonth);return s+(q?.status==='Pago'?Number(q.value||valueForMonth(p,selectedHrMonth)):0)},0);

  $('#content').innerHTML=`
    <div class="toolbar hr13-toolbar">
      <div><b>Gestão de colaboradores e contratos</b><div class="muted">Consulte a projeção da folha para os próximos 6 meses.</div></div>
      <button class="btn" id="hr13NewEmployee">+ Cadastrar colaborador</button>
    </div>

    <section class="card hr13-projection">
      <div class="section-head"><div><h3>Projeção de pagamentos de colaboradores</h3><p class="muted">Selecione um mês para ver quem estará vigente e quanto está previsto para pagamento.</p></div></div>
      <div class="hr13-months">${months.map(m=>`<button class="hr13-month ${m===selectedHrMonth?'active':''}" data-hr13-month="${m}"><span>${label13(m)}</span><b>${money13(totalMonth(m))}</b><small>${activePeople(m).length} colaborador(es)</small></button>`).join('')}</div>
    </section>

    <section class="hr-selected-payroll">
      <div class="page-intro hr13-month-head"><div><h3>${label13(selectedHrMonth)}</h3><p>${selectedHrMonth===current?'Folha do mês vigente':'Projeção de folha futura'}</p></div><div class="hr13-summary"><span><small>Previsto</small><b>${money13(monthTotal)}</b></span><span><small>Quitado</small><b>${money13(paidTotal)}</b></span><span><small>Em aberto</small><b>${money13(Math.max(0,monthTotal-paidTotal))}</b></span></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Colaborador</th><th>Contrato</th><th>Valor previsto</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const q=paymentFor(p,selectedHrMonth),isPaid=q?.status==='Pago';return`<tr><td><b>${esc(p.name)}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${money13(valueForMonth(p,selectedHrMonth))}</b></td><td>${isPaid?badgeStatus('Pago'):(selectedHrMonth===current?'Pendente':'Previsto')}</td><td>${selectedHrMonth===current&&!isPaid?`<button class="btn small" data-hr13-pay="${p.id}">Marcar pago</button>`:isPaid?'Quitado':'—'}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador com contrato vigente neste mês.</div></td></tr>'}</tbody></table></div>
    </section>

    <h3 class="section-title">Funcionários cadastrados</h3>
    <div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr13-employee="${p.id}"><div><h3>${esc(p.name)}</h3><span class="badge">${p.end&&p.end<today13()?'Encerrado':'Vigente'}</span></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${money13(p.currentValue||p.value)}</b></span><span><small>Contratos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;

  $('#hr13NewEmployee').onclick=()=>{ if(typeof employeeForm==='function') employeeForm(); };
  $$('[data-hr13-employee]').forEach(b=>b.onclick=()=>{ if(typeof employeeForm==='function') employeeForm(b.dataset.hr13Employee); });
  $$('[data-hr13-month]').forEach(b=>b.onclick=()=>openHrMonth(b.dataset.hr13Month));
  $$('[data-hr13-pay]').forEach(b=>b.onclick=()=>{
    const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr13Pay)); if(!p)return;
    let q=paymentFor(p,current),val=valueForMonth(p,current);
    if(q){q.status='Pago';q.paidAt=today13();q.value=val;}
    else (db.hrPayments=db.hrPayments||[]).push({id:uid13(),personId:p.id,month:current,value:val,status:'Pago',paidAt:today13()});
    save();hr();
  });
};
})();
