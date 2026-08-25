/* Integral Financeiro V20 - RH canônico, persistido no Supabase */
(function(){
'use strict';
const q=s=>document.querySelector(s), qa=s=>Array.from(document.querySelectorAll(s));
const today=()=>new Date().toISOString().slice(0,10), monthNow=()=>today().slice(0,7);
const uid20=()=>Date.now()+Math.floor(Math.random()*10000);
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const monthLabel=m=>{const [y,mm]=String(m).split('-');return new Date(+y,+mm-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const mny=v=>money(Number(v||0));
let selectedHrMonth=monthNow(), cloudLoaded=false, cloudLoading=false;
const sb=()=>window.IntegralERP?.sb||null;

function hrBaseValueForMonth(p,m){const first=`${m}-01`,last=`${m}-31`;if(p.start&&p.start>last)return 0;if(p.end&&p.end<first)return 0;const hist=[...(p.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));const item=hist.at(-1);return Number(item?.value??p.currentValue??p.value??0)}
function hrMonthlyVariable(p,m){db.hrMonthlyVariables=db.hrMonthlyVariables||[];return db.hrMonthlyVariables.find(x=>String(x.personId)===String(p.id)&&x.month===m)||null}
function hrValueForMonth(p,m){const base=hrBaseValueForMonth(p,m);if(!base)return 0;const v=hrMonthlyVariable(p,m);return base+Number(v?.overtime||0)+Number(v?.bonus||0)}
function hrPeopleForMonth(m){return (db.hrPeople||[]).filter(p=>hrBaseValueForMonth(p,m)>0)}
function hrPayment(p,m){return (db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}

async function loadRhCloud(){
  if(cloudLoaded||cloudLoading)return; const c=sb(); if(!c||!user)return;
  cloudLoading=true;
  try{
    const [pr,vr,pg]=await Promise.all([
      c.from('financeiro_rh_colaboradores').select('*').eq('ativo',true).order('nome'),
      c.from('financeiro_rh_variaveis_mensais').select('*'),
      c.from('financeiro_rh_pagamentos').select('*')
    ]);
    if(pr.error)throw pr.error;if(vr.error)throw vr.error;if(pg.error)throw pg.error;
    db.hrPeople=(pr.data||[]).map(r=>{const d=r.dados||{};return {...d,id:r.id,name:r.nome,start:r.inicio||'',end:r.fim||'',currentValue:Number(r.valor_atual||0),value:Number(r.valor_atual||0),files:r.arquivos||d.files||[],history:r.historico||d.history||[]}});
    db.hrMonthlyVariables=(vr.data||[]).map(r=>({...r.dados,id:r.id,personId:r.colaborador_id,month:r.mes,overtime:Number(r.hora_extra||0),bonus:Number(r.bonus_comissao||0)}));
    db.hrPayments=(pg.data||[]).map(r=>({...r.dados,id:r.id,personId:r.colaborador_id,month:r.mes,value:Number(r.valor||0),status:r.status,paidAt:r.pago_em||null}));
    cloudLoaded=true;save();
  }catch(e){console.error('RH: falha ao carregar Supabase',e);}
  finally{cloudLoading=false;}
}
async function savePersonCloud(p){const c=sb();if(!c)return;const row={id:String(p.id),nome:p.name,inicio:p.start||null,fim:p.end||null,valor_atual:Number(p.currentValue??p.value??0),arquivos:p.files||[],historico:p.history||[],ativo:true,dados:p,updated_at:new Date().toISOString()};const {error}=await c.from('financeiro_rh_colaboradores').upsert(row,{onConflict:'id'});if(error)throw error}
async function saveVariableCloud(v){const c=sb();if(!c)return;const row={id:String(v.id),colaborador_id:String(v.personId),mes:v.month,hora_extra:Number(v.overtime||0),bonus_comissao:Number(v.bonus||0),dados:v,updated_at:new Date().toISOString()};const {error}=await c.from('financeiro_rh_variaveis_mensais').upsert(row,{onConflict:'colaborador_id,mes'});if(error)throw error}
async function savePaymentCloud(p){const c=sb();if(!c)return;const row={id:String(p.id),colaborador_id:String(p.personId),mes:p.month,valor:Number(p.value||0),status:p.status||'Pendente',pago_em:p.paidAt||null,dados:p,updated_at:new Date().toISOString()};const {error}=await c.from('financeiro_rh_pagamentos').upsert(row,{onConflict:'colaborador_id,mes'});if(error)throw error}

function closeModal(el){if(el?.parentNode)el.remove()}
function hrMonthlyVariableModal(person,month){
  db.hrMonthlyVariables=db.hrMonthlyVariables||[];const current=hrMonthlyVariable(person,month),base=hrBaseValueForMonth(person,month),o=Number(current?.overtime||0),b=Number(current?.bonus||0);
  const modal=v2modal(`RH • ${person.name} • ${monthLabel(month)}`,`<form id="hrVarForm"><div class="modal-body"><div class="notice">Estes valores valem somente para <b>${monthLabel(month)}</b>.</div><div class="form-grid"><div class="field"><label>Valor base</label><input value="${base}" readonly></div><div class="field"><label>Hora Extra — valor total</label><input id="hrOT" type="number" min="0" step="0.01" value="${o}"></div><div class="field"><label>Bônus / Comissões — valor total</label><input id="hrBN" type="number" min="0" step="0.01" value="${b}"></div><div class="field"><label>Total do mês</label><input id="hrTOT" value="${mny(base+o+b)}" readonly></div></div></div><div class="modal-foot"><button class="btn">Salvar variáveis</button></div></form>`);
  const ot=modal.querySelector('#hrOT'),bn=modal.querySelector('#hrBN'),tot=modal.querySelector('#hrTOT');const recalc=()=>tot.value=mny(base+Number(ot.value||0)+Number(bn.value||0));ot.oninput=recalc;bn.oninput=recalc;
  modal.querySelector('#hrVarForm').onsubmit=async e=>{e.preventDefault();const ov=Math.max(0,Number(ot.value||0)),bo=Math.max(0,Number(bn.value||0));let v=hrMonthlyVariable(person,month);if(v)Object.assign(v,{overtime:ov,bonus:bo,updatedAt:new Date().toISOString(),by:user?.name||''});else{v={id:`var-${person.id}-${month}`,personId:person.id,month,overtime:ov,bonus:bo,updatedAt:new Date().toISOString(),by:user?.name||''};db.hrMonthlyVariables.push(v)}const pay=hrPayment(person,month);if(pay?.status==='Pago'){pay.value=base+ov+bo;await savePaymentCloud(pay)}await saveVariableCloud(v);save();modal.remove();renderHr20()};
}
function hrEmployeeModal(id){
  const p=(db.hrPeople||[]).find(x=>String(x.id)===String(id));const modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal"><div class="modal-head"><h3>${p?'Editar colaborador':'Cadastrar colaborador'}</h3><button class="btn ghost small" data-close>Fechar</button></div><form id="hr20Form"><div class="modal-body"><div class="form-grid"><div class="field full"><label>Nome</label><input name="name" value="${esc(p?.name||'')}" required></div><div class="field"><label>Início</label><input name="start" type="date" value="${p?.start||today()}" required></div><div class="field"><label>Fim</label><input name="end" type="date" value="${p?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" min="0" step="0.01" value="${p?.currentValue??p?.value??''}" required></div><div class="field"><label>Contrato/arquivo</label><input id="hrFile" type="file"></div></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form></div>`;document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=()=>closeModal(modal);
  modal.querySelector('#hr20Form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),val=Number(fd.get('value')||0),old=Number(p?.currentValue??p?.value??0),file=modal.querySelector('#hrFile')?.files?.[0],files=[...(p?.files||[])],history=[...(p?.history||[])];if(file)files.push({name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});if(!p||val!==old)history.push({date:today(),value:val,by:user?.name||''});const obj={id:p?.id||`rh-${uid20()}`,name:String(fd.get('name')||'').trim(),start:String(fd.get('start')||''),end:String(fd.get('end')||''),currentValue:val,value:val,files,history};if(p)Object.assign(p,obj);else(db.hrPeople=db.hrPeople||[]).push(obj);await savePersonCloud(obj);save();closeModal(modal);renderHr20()};
}

async function renderHr20(){
  if(!user||user.role!=='Administrador'){view='budgets';return typeof render==='function'?render():undefined} title('RH');
  if(!cloudLoaded){const c=q('#content');if(c)c.innerHTML='<div class="card"><b>Carregando colaboradores...</b></div>';await loadRhCloud()}
  const start=monthNow(),months=Array.from({length:6},(_,i)=>addMonth(start,i));if(!months.includes(selectedHrMonth))selectedHrMonth=start;const people=hrPeopleForMonth(selectedHrMonth),total=people.reduce((s,p)=>s+hrValueForMonth(p,selectedHrMonth),0),paid=people.reduce((s,p)=>{const x=hrPayment(p,selectedHrMonth);return s+(x?.status==='Pago'?Number(x.value||hrValueForMonth(p,selectedHrMonth)):0)},0),content=q('#content');if(!content)return;
  content.innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção dos pagamentos para os próximos 6 meses.</div></div><button class="btn" id="hr20New">+ Colaborador</button></div><section class="card hr17-month-panel"><div class="hr17-months">${months.map(m=>{const ps=hrPeopleForMonth(m),v=ps.reduce((s,p)=>s+hrValueForMonth(p,m),0);return`<button class="hr17-month ${m===selectedHrMonth?'active':''}" data-hr20-month="${m}"><span>${monthLabel(m)}</span><b>${mny(v)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section><section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedHrMonth)}</h3><p>${selectedHrMonth===start?'Folha do mês vigente':'Projeção futura'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${mny(total)}</b></span><span><small>Quitado</small><b>${mny(paid)}</b></span><span><small>Em aberto</small><b>${mny(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Valor base</th><th>Hora Extra</th><th>Bônus / Comissões</th><th>Total</th><th>Status</th><th>Ação</th></tr></thead><tbody>${people.map(p=>{const pay=hrPayment(p,selectedHrMonth),done=pay?.status==='Pago',v=hrMonthlyVariable(p,selectedHrMonth),base=hrBaseValueForMonth(p,selectedHrMonth),ot=Number(v?.overtime||0),bo=Number(v?.bonus||0),tt=base+ot+bo;return`<tr><td><button class="linklike" data-hr20-var="${p.id}"><b>${esc(p.name)}</b></button></td><td><b>${mny(base)}</b></td><td>${ot?mny(ot):'—'}</td><td>${bo?mny(bo):'—'}</td><td><b>${mny(tt)}</b></td><td>${done?badgeStatus('Pago'):(selectedHrMonth===start?'Pendente':'Previsto')}</td><td><button class="btn small ghost" data-hr20-var="${p.id}">Editar variáveis</button>${selectedHrMonth===start&&!done?` <button class="btn small" data-hr20-pay="${p.id}">Marcar pago</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="7"><div class="empty">Nenhum colaborador vigente.</div></td></tr>'}</tbody></table></div></section><h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr20-person="${p.id}"><div><h3>${esc(p.name)}</h3></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${mny(p.currentValue??p.value)}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;
  q('#hr20New').onclick=()=>hrEmployeeModal();qa('[data-hr20-person]').forEach(b=>b.onclick=()=>hrEmployeeModal(b.dataset.hr20Person));qa('[data-hr20-month]').forEach(b=>b.onclick=()=>{selectedHrMonth=b.dataset.hr20Month;renderHr20()});qa('[data-hr20-var]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Var));if(p)hrMonthlyVariableModal(p,selectedHrMonth)});qa('[data-hr20-pay]').forEach(b=>b.onclick=async()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Pay));if(!p)return;let x=hrPayment(p,selectedHrMonth),value=hrValueForMonth(p,selectedHrMonth);if(x)Object.assign(x,{status:'Pago',paidAt:today(),value});else{x={id:`pay-${p.id}-${selectedHrMonth}`,personId:p.id,month:selectedHrMonth,value,status:'Pago',paidAt:today()};(db.hrPayments=db.hrPayments||[]).push(x)}await savePaymentCloud(x);save();renderHr20()});
}
window.hr=renderHr20;try{hr=renderHr20}catch{};
const renderBefore20=window.render||render;const render20=function(){if(view==='hr')return renderHr20();return renderBefore20.apply(this,arguments)};window.render=render20;try{render=render20}catch{};
window.IntegralFinanceRH={load:loadRhCloud,render:renderHr20};
setTimeout(()=>{if(user)loadRhCloud().then(()=>{if(view==='hr')renderHr20()})},700);
})();
