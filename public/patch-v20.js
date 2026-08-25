/* Integral Financeiro — RH canônico
   Valor base + adicionais exclusivos do mês vigente: hora extra, comissão e bônus.
   Persistência em Supabase e sem coluna de vigência na folha mensal. */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const today=()=>new Date().toISOString().slice(0,10),monthNow=()=>today().slice(0,7);
const uid=()=>Date.now()+Math.floor(Math.random()*100000);
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
const monthLabel=m=>{const[y,mm]=String(m).split('-');return new Date(+y,+mm-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const mny=v=>typeof money==='function'?money(Number(v||0)):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const E=v=>typeof esc==='function'?esc(String(v??'')):String(v??'');
const F=d=>{if(!d)return'—';try{return typeof fmt==='function'?fmt(d):new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')}catch{return d}};
const sb=()=>window.IntegralERP?.sb||null;
let selectedHrMonth=monthNow(),cloudLoaded=false,cloudLoading=false;

function baseValue(p,m){const first=`${m}-01`,last=`${m}-31`;if(p.start&&p.start>last)return 0;if(p.end&&p.end<first)return 0;const h=[...(p.history||[])].filter(x=>x.date&&x.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));return Number(h.at(-1)?.value??p.currentValue??p.value??0)||0}
function variable(p,m){db.hrMonthlyVariables=db.hrMonthlyVariables||[];return db.hrMonthlyVariables.find(x=>String(x.personId)===String(p.id)&&x.month===m)||null}
function additions(v){return{ot:Number(v?.overtime||0),commission:Number(v?.commission||0),bonus:Number(v?.bonus||0)}}
function totalValue(p,m){const base=baseValue(p,m);if(!base)return 0;const a=additions(variable(p,m));return base+a.ot+a.commission+a.bonus}
function peopleForMonth(m){return(db.hrPeople||[]).filter(p=>baseValue(p,m)>0)}
function payment(p,m){return(db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}

async function loadCloud(){
  if(cloudLoaded||cloudLoading)return;const c=sb();if(!c||!user)return;cloudLoading=true;
  try{
    const[pr,vr,pg]=await Promise.all([
      c.from('financeiro_rh_colaboradores').select('*').eq('ativo',true).order('nome'),
      c.from('financeiro_rh_variaveis_mensais').select('*'),
      c.from('financeiro_rh_pagamentos').select('*')
    ]);
    if(pr.error)throw pr.error;if(vr.error)throw vr.error;if(pg.error)throw pg.error;
    db.hrPeople=(pr.data||[]).map(r=>{const d=r.dados||{};return{...d,id:r.id,name:r.nome,start:r.inicio||'',end:r.fim||'',currentValue:Number(r.valor_atual||0),value:Number(r.valor_atual||0),files:r.arquivos||d.files||[],history:r.historico||d.history||[]}});
    db.hrMonthlyVariables=(vr.data||[]).map(r=>{const d=r.dados||{};const combined=Number(r.bonus_comissao||0);return{...d,id:r.id,personId:r.colaborador_id,month:r.mes,overtime:Number(r.hora_extra||0),commission:Number(d.commission||0),bonus:Number(d.bonus??(d.commission?0:combined))}});
    db.hrPayments=(pg.data||[]).map(r=>({...r.dados,id:r.id,personId:r.colaborador_id,month:r.mes,value:Number(r.valor||0),status:r.status,paidAt:r.pago_em||null}));
    cloudLoaded=true;if(typeof save==='function')save();
  }catch(e){console.error('RH: falha ao carregar Supabase',e)}finally{cloudLoading=false}
}
async function savePerson(p){const c=sb();if(!c)return;const row={id:String(p.id),nome:p.name,inicio:p.start||null,fim:p.end||null,valor_atual:Number(p.currentValue??p.value??0),arquivos:p.files||[],historico:p.history||[],ativo:true,dados:p,updated_at:new Date().toISOString()};const{error}=await c.from('financeiro_rh_colaboradores').upsert(row,{onConflict:'id'});if(error)throw error}
async function saveVariable(v){const c=sb();if(!c)return;const row={id:String(v.id),colaborador_id:String(v.personId),mes:v.month,hora_extra:Number(v.overtime||0),bonus_comissao:Number(v.commission||0)+Number(v.bonus||0),dados:v,updated_at:new Date().toISOString()};const{error}=await c.from('financeiro_rh_variaveis_mensais').upsert(row,{onConflict:'colaborador_id,mes'});if(error)throw error}
async function savePayment(p){const c=sb();if(!c)return;const row={id:String(p.id),colaborador_id:String(p.personId),mes:p.month,valor:Number(p.value||0),status:p.status||'Pendente',pago_em:p.paidAt||null,dados:p,updated_at:new Date().toISOString()};const{error}=await c.from('financeiro_rh_pagamentos').upsert(row,{onConflict:'colaborador_id,mes'});if(error)throw error}
function close(x){x?.remove()}

function additionsModal(person,month){
  if(month!==monthNow()){alert('Hora extra, comissão e bônus são lançados somente no mês vigente.');return}
  db.hrMonthlyVariables=db.hrMonthlyVariables||[];const cur=variable(person,month),base=baseValue(person,month),a=additions(cur);
  const modal=typeof v2modal==='function'?v2modal(`RH • ${person.name} • ${monthLabel(month)}`,`<form id="hrExtras"><div class="modal-body"><div class="notice">Adicionais exclusivos de <b>${monthLabel(month)}</b>. Não alteram o valor base do contrato.</div><div class="form-grid"><div class="field"><label>Valor base</label><input value="${base}" readonly></div><div class="field"><label>Hora extra</label><input id="hrOT" type="number" min="0" step="0.01" value="${a.ot}"></div><div class="field"><label>Comissão</label><input id="hrCO" type="number" min="0" step="0.01" value="${a.commission}"></div><div class="field"><label>Bônus</label><input id="hrBO" type="number" min="0" step="0.01" value="${a.bonus}"></div><div class="field"><label>Total do mês</label><input id="hrTOT" readonly></div></div></div><div class="modal-foot"><button class="btn">Salvar adicionais</button></div></form>`):null;
  if(!modal)return;
  const ot=q('#hrOT',modal),co=q('#hrCO',modal),bo=q('#hrBO',modal),tot=q('#hrTOT',modal);const recalc=()=>tot.value=mny(base+Number(ot.value||0)+Number(co.value||0)+Number(bo.value||0));[ot,co,bo].forEach(i=>i.oninput=recalc);recalc();
  q('#hrExtras',modal).onsubmit=async e=>{e.preventDefault();let v=variable(person,month);const data={overtime:Math.max(0,Number(ot.value||0)),commission:Math.max(0,Number(co.value||0)),bonus:Math.max(0,Number(bo.value||0)),updatedAt:new Date().toISOString(),by:user?.name||''};if(v)Object.assign(v,data);else{v={id:`var-${person.id}-${month}`,personId:person.id,month,...data};db.hrMonthlyVariables.push(v)}const pay=payment(person,month);if(pay?.status==='Pago'){pay.value=totalValue(person,month);await savePayment(pay)}await saveVariable(v);if(typeof save==='function')save();close(modal);renderHr()}
}

function employeeModal(id){
  const p=(db.hrPeople||[]).find(x=>String(x.id)===String(id)),modal=document.createElement('div');modal.className='modal-backdrop';modal.innerHTML=`<div class="modal"><div class="modal-head"><h3>${p?'Editar colaborador':'Cadastrar colaborador'}</h3><button class="btn ghost small" data-close>Fechar</button></div><form id="hrPersonForm"><div class="modal-body"><div class="form-grid"><div class="field full"><label>Nome</label><input name="name" value="${E(p?.name||'')}" required></div><div class="field"><label>Início</label><input name="start" type="date" value="${p?.start||today()}" required></div><div class="field"><label>Fim</label><input name="end" type="date" value="${p?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" min="0" step="0.01" value="${p?.currentValue??p?.value??''}" required></div><div class="field"><label>Contrato/arquivo</label><input id="hrFile" type="file"></div></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form></div>`;document.body.appendChild(modal);q('[data-close]',modal).onclick=()=>close(modal);
  q('#hrPersonForm',modal).onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),val=Number(fd.get('value')||0),old=Number(p?.currentValue??p?.value??0),file=q('#hrFile',modal)?.files?.[0],files=[...(p?.files||[])],history=[...(p?.history||[])];if(file)files.push({name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});if(!p||val!==old)history.push({date:today(),value:val,by:user?.name||''});const obj={id:p?.id||`rh-${uid()}`,name:String(fd.get('name')||'').trim(),start:String(fd.get('start')||''),end:String(fd.get('end')||''),currentValue:val,value:val,files,history};if(p)Object.assign(p,obj);else(db.hrPeople=db.hrPeople||[]).push(obj);await savePerson(obj);if(typeof save==='function')save();close(modal);renderHr()}
}

async function renderHr(){
  if(!user||user.role!=='Administrador')return;
  if(typeof title==='function')title('RH');
  if(!cloudLoaded){const c=q('#content');if(c)c.innerHTML='<div class="card"><b>Carregando colaboradores...</b></div>';await loadCloud()}
  const start=monthNow(),months=Array.from({length:6},(_,i)=>addMonth(start,i));if(!months.includes(selectedHrMonth))selectedHrMonth=start;
  const people=peopleForMonth(selectedHrMonth),sum=a=>a.reduce((s,x)=>s+x,0),total=sum(people.map(p=>totalValue(p,selectedHrMonth))),paid=sum(people.map(p=>{const x=payment(p,selectedHrMonth);return x?.status==='Pago'?Number(x.value||totalValue(p,selectedHrMonth)):0}));
  const c=q('#content');if(!c)return;
  c.innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Adicionais de hora extra, comissão e bônus são lançados somente no mês vigente.</div></div><button class="btn" id="hrNew">+ Colaborador</button></div><section class="card hr17-month-panel"><div class="hr17-months">${months.map(m=>{const ps=peopleForMonth(m),v=sum(ps.map(p=>totalValue(p,m)));return`<button class="hr17-month ${m===selectedHrMonth?'active':''}" data-hr-month="${m}"><span>${monthLabel(m)}</span><b>${mny(v)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section><section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedHrMonth)}</h3><p>${selectedHrMonth===start?'Folha do mês vigente':'Projeção futura'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${mny(total)}</b></span><span><small>Quitado</small><b>${mny(paid)}</b></span><span><small>Em aberto</small><b>${mny(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Valor base</th><th>Hora extra</th><th>Comissão</th><th>Bônus</th><th>Total</th><th>Status</th><th>Ação</th></tr></thead><tbody>${people.map(p=>{const pay=payment(p,selectedHrMonth),done=pay?.status==='Pago',v=variable(p,selectedHrMonth),a=additions(v),base=baseValue(p,selectedHrMonth),tt=base+a.ot+a.commission+a.bonus,current=selectedHrMonth===start;return`<tr><td><b>${E(p.name)}</b></td><td><b>${mny(base)}</b></td><td>${a.ot?mny(a.ot):'—'}</td><td>${a.commission?mny(a.commission):'—'}</td><td>${a.bonus?mny(a.bonus):'—'}</td><td><b>${mny(tt)}</b></td><td>${done?(typeof badgeStatus==='function'?badgeStatus('Pago'):'Pago'):(current?'Pendente':'Previsto')}</td><td>${current?`<button class="btn small ghost" data-hr-extra="${p.id}">Adicionais</button>${!done?` <button class="btn small" data-hr-pay="${p.id}">Marcar pago</button>`:''}`:'<span class="muted">Somente projeção</span>'}</td></tr>`}).join('')||'<tr><td colspan="8"><div class="empty">Nenhum colaborador vigente.</div></td></tr>'}</tbody></table></div></section><h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr-person="${p.id}"><div><h3>${E(p.name)}</h3></div><div class="employee-facts"><span><small>Início</small><b>${F(p.start)}</b></span><span><small>Fim</small><b>${p.end?F(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${mny(p.currentValue??p.value)}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;
  q('#hrNew').onclick=()=>employeeModal();qa('[data-hr-person]').forEach(b=>b.onclick=()=>employeeModal(b.dataset.hrPerson));qa('[data-hr-month]').forEach(b=>b.onclick=()=>{selectedHrMonth=b.dataset.hrMonth;renderHr()});qa('[data-hr-extra]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hrExtra));if(p)additionsModal(p,selectedHrMonth)});qa('[data-hr-pay]').forEach(b=>b.onclick=async()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hrPay));if(!p)return;let x=payment(p,selectedHrMonth);const value=totalValue(p,selectedHrMonth);if(x)Object.assign(x,{status:'Pago',paidAt:today(),value});else{x={id:`pay-${p.id}-${selectedHrMonth}`,personId:p.id,month:selectedHrMonth,value,status:'Pago',paidAt:today()};(db.hrPayments=db.hrPayments||[]).push(x)}await savePayment(x);if(typeof save==='function')save();renderHr()})
}

window.hr=renderHr;try{hr=renderHr}catch{}
window.IntegralFinanceRH={load:loadCloud,render:renderHr};
setTimeout(()=>{if(user)loadCloud().then(()=>{try{if((typeof view!=='undefined'?view:window.view)==='hr')renderHr()}catch{}})},500);
})();
