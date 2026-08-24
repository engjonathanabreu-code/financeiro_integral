/* Integral Financeiro V20 - estabilização de navegação e RH */
(function(){
'use strict';

const q=(s)=>document.querySelector(s);
const qa=(s)=>Array.from(document.querySelectorAll(s));
const today=()=>new Date().toISOString().slice(0,10);
const monthNow=()=>today().slice(0,7);
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const monthLabel=(m)=>{const [y,mm]=String(m).split('-');return new Date(Number(y),Number(mm)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const mny=(v)=>money(Number(v||0));
let selectedHrMonth=monthNow();

function hrValueForMonth(person,month){
  const first=`${month}-01`, last=`${month}-31`;
  if(person.start&&person.start>last)return 0;
  if(person.end&&person.end<first)return 0;
  const hist=[...(person.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const item=hist.length?hist[hist.length-1]:null;
  return Number(item?.value ?? person.currentValue ?? person.value ?? 0);
}
function hrPeopleForMonth(month){return (db.hrPeople||[]).filter(p=>hrValueForMonth(p,month)>0)}
function hrPayment(person,month){return (db.hrPayments||[]).find(x=>String(x.personId)===String(person.id)&&x.month===month)}

function closeModal(el){if(el&&el.parentNode)el.remove()}

function hrEmployeeModal(id){
  const person=(db.hrPeople||[]).find(x=>String(x.id)===String(id));
  const modal=document.createElement('div');
  modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal"><div class="modal-head"><h3>${person?'Editar colaborador':'Cadastrar colaborador'}</h3><button class="btn ghost small" type="button" data-close>Fechar</button></div><form id="hr20Form"><div class="modal-body"><div class="form-section"><h4>Dados do contrato</h4><div class="form-grid"><div class="field full"><label>Nome do colaborador</label><input name="name" value="${esc(person?.name||'')}" required></div><div class="field"><label>Início do contrato</label><input name="start" type="date" value="${person?.start||today()}" required></div><div class="field"><label>Fim do contrato</label><input name="end" type="date" value="${person?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" min="0" step="0.01" value="${person?.currentValue??person?.value??''}" required></div><div class="field"><label>Adicionar contrato/arquivo</label><input id="hr20File" type="file"></div></div></div>${person?.history?.length?`<div class="form-section"><h4>Histórico de valores</h4><div class="history-list">${[...person.history].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(h=>`<div><b>${h.date?fmt(h.date):'—'}</b><span>${mny(h.value)}</span></div>`).join('')}</div></div>`:''}</div><div class="modal-foot">${person?'<button type="button" class="btn danger" id="hr20Delete">Excluir colaborador</button>':''}<button class="btn" type="submit">Salvar</button></div></form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').onclick=()=>closeModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  const form=modal.querySelector('#hr20Form');
  form.onsubmit=(e)=>{
    e.preventDefault();
    const fd=new FormData(form);
    const value=Number(fd.get('value')||0);
    const old=Number(person?.currentValue??person?.value??0);
    const file=modal.querySelector('#hr20File')?.files?.[0];
    const files=[...(person?.files||[])];
    const history=[...(person?.history||[])];
    if(file)files.push({name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});
    if(!person||value!==old)history.push({date:today(),value,by:user?.name||''});
    const obj={id:person?.id||Date.now()+Math.floor(Math.random()*10000),name:String(fd.get('name')||'').trim(),start:String(fd.get('start')||''),end:String(fd.get('end')||''),currentValue:value,value,files,history};
    db.hrPeople=db.hrPeople||[];
    if(person)Object.assign(person,obj);else db.hrPeople.push(obj);
    save();
    closeModal(modal);
    renderHr20();
  };
  const del=modal.querySelector('#hr20Delete');
  if(del)del.onclick=()=>{if(confirm(`Excluir ${person.name}?`)){db.hrPeople=(db.hrPeople||[]).filter(x=>String(x.id)!==String(person.id));db.hrPayments=(db.hrPayments||[]).filter(x=>String(x.personId)!==String(person.id));save();closeModal(modal);renderHr20();}};
}

function renderHr20(){
  if(!user||user.role!=='Administrador'){view='budgets';return typeof render==='function'?render():undefined;}
  title('RH');
  const start=monthNow();
  const months=Array.from({length:6},(_,i)=>addMonth(start,i));
  if(!months.includes(selectedHrMonth))selectedHrMonth=start;
  const people=hrPeopleForMonth(selectedHrMonth);
  const total=people.reduce((s,p)=>s+hrValueForMonth(p,selectedHrMonth),0);
  const paid=people.reduce((s,p)=>{const x=hrPayment(p,selectedHrMonth);return s+(x?.status==='Pago'?Number(x.value||hrValueForMonth(p,selectedHrMonth)):0)},0);
  const content=q('#content'); if(!content)return;
  content.innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção dos pagamentos para os próximos 6 meses.</div></div><button class="btn" id="hr20New">+ Colaborador</button></div><section class="card hr17-month-panel"><div class="section-head"><div><h3>Próximos 6 meses</h3><p class="muted">Clique em um mês para visualizar a projeção da folha.</p></div></div><div class="hr17-months">${months.map(m=>{const ps=hrPeopleForMonth(m),v=ps.reduce((s,p)=>s+hrValueForMonth(p,m),0);return`<button class="hr17-month ${m===selectedHrMonth?'active':''}" data-hr20-month="${m}"><span>${monthLabel(m)}</span><b>${mny(v)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section><section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedHrMonth)}</h3><p>${selectedHrMonth===start?'Folha do mês vigente':'Projeção de pagamentos futuros'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${mny(total)}</b></span><span><small>Quitado</small><b>${mny(paid)}</b></span><span><small>Em aberto</small><b>${mny(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Vigência</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const x=hrPayment(p,selectedHrMonth),done=x?.status==='Pago';return`<tr><td><b>${esc(p.name||'')}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${mny(hrValueForMonth(p,selectedHrMonth))}</b></td><td>${done?badgeStatus('Pago'):(selectedHrMonth===start?'Pendente':'Previsto')}</td><td>${selectedHrMonth===start&&!done?`<button class="btn small" data-hr20-pay="${p.id}">Marcar pago</button>`:(done?'Quitado':'—')}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador vigente neste mês.</div></td></tr>'}</tbody></table></div></section><h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr20-person="${p.id}"><div><h3>${esc(p.name||'')}</h3></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${mny(p.currentValue??p.value)}</b></span><span><small>Arquivos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;
  q('#hr20New').onclick=()=>hrEmployeeModal();
  qa('[data-hr20-person]').forEach(b=>b.onclick=()=>hrEmployeeModal(b.dataset.hr20Person));
  qa('[data-hr20-month]').forEach(b=>b.onclick=()=>{selectedHrMonth=b.dataset.hr20Month;renderHr20()});
  qa('[data-hr20-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Pay));if(!p)return;db.hrPayments=db.hrPayments||[];let x=hrPayment(p,start);const value=hrValueForMonth(p,start);if(x)Object.assign(x,{status:'Pago',paidAt:today(),value});else db.hrPayments.push({id:Date.now()+Math.floor(Math.random()*10000),personId:p.id,month:start,value,status:'Pago',paidAt:today()});save();renderHr20()});
}

// Última definição do RH: elimina dependência de employeeForm de patches anteriores.
window.hr=renderHr20;
try{hr=renderHr20}catch{}

// Última definição de render para garantir RH estável e manter todas as demais telas existentes.
const renderBefore20=window.render||render;
const render20=function(){if(view==='hr')return renderHr20();return renderBefore20.apply(this,arguments)};
window.render=render20;
try{render=render20}catch{}

// Clique único no menu: usa delegação em capture e evita rerender duplo do app inteiro.
document.addEventListener('click',function(e){
  const btn=e.target.closest?.('.nav [data-view]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const next=btn.dataset.view;
  if(!next)return;
  view=next;
  qa('.nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  render20();
},{capture:true});

// Remove Relatórios do menu caso algum patch anterior volte a inseri-lo.
function cleanupMenu(){qa('.nav [data-view="reports"]').forEach(x=>x.remove());qa('.nav button').filter(x=>(x.textContent||'').trim()==='Relatórios').forEach(x=>x.remove());}
cleanupMenu();

// Diagnóstico passivo: erros deixam rastros no console sem interromper a navegação.
window.addEventListener('error',e=>console.error('Integral Financeiro UI error:',e.error||e.message));
window.addEventListener('unhandledrejection',e=>console.error('Integral Financeiro async error:',e.reason));

})();
