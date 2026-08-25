from pathlib import Path

p=Path('public/financeiro.bundle.js')
s=p.read_text(encoding='utf-8')

old="""function hrValueForMonth(person,month){
  const first=`${month}-01`, last=`${month}-31`;
  if(person.start&&person.start>last)return 0;
  if(person.end&&person.end<first)return 0;
  const hist=[...(person.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const item=hist.length?hist[hist.length-1]:null;
  return Number(item?.value ?? person.currentValue ?? person.value ?? 0);
}
function hrPeopleForMonth(month){return (db.hrPeople||[]).filter(p=>hrValueForMonth(p,month)>0)}
function hrPayment(person,month){return (db.hrPayments||[]).find(x=>String(x.personId)===String(person.id)&&x.month===month)}
"""
new="""function hrBaseValueForMonth(person,month){
  const first=`${month}-01`, last=`${month}-31`;
  if(person.start&&person.start>last)return 0;
  if(person.end&&person.end<first)return 0;
  const hist=[...(person.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const item=hist.length?hist[hist.length-1]:null;
  return Number(item?.value ?? person.currentValue ?? person.value ?? 0);
}
function hrMonthlyVariable(person,month){
  db.hrMonthlyVariables=db.hrMonthlyVariables||[];
  return db.hrMonthlyVariables.find(x=>String(x.personId)===String(person.id)&&x.month===month)||null;
}
function hrValueForMonth(person,month){
  const base=hrBaseValueForMonth(person,month);
  if(!base)return 0;
  const variable=hrMonthlyVariable(person,month);
  return base+Number(variable?.overtime||0)+Number(variable?.bonus||0);
}
function hrPeopleForMonth(month){return (db.hrPeople||[]).filter(p=>hrBaseValueForMonth(p,month)>0)}
function hrPayment(person,month){return (db.hrPayments||[]).find(x=>String(x.personId)===String(person.id)&&x.month===month)}
function hrMonthlyVariableModal(person,month){
  if(!person||!month)return;
  db.hrMonthlyVariables=db.hrMonthlyVariables||[];
  const current=hrMonthlyVariable(person,month);
  const base=hrBaseValueForMonth(person,month);
  const overtime=Number(current?.overtime||0), bonus=Number(current?.bonus||0);
  const modal=v2modal(`RH • ${person.name} • ${monthLabel(month)}`,`<form id=\"hrMonthlyVariableForm\"><div class=\"modal-body\"><div class=\"notice\">Estes valores valem somente para <b>${monthLabel(month)}</b> e não serão repetidos nos meses seguintes.</div><div class=\"form-grid\"><div class=\"field\"><label>Valor base do mês</label><input id=\"hrMonthBase\" type=\"number\" step=\"0.01\" value=\"${base}\" readonly></div><div class=\"field\"><label>Horas extras — valor total</label><input id=\"hrMonthOvertime\" name=\"overtime\" type=\"number\" step=\"0.01\" min=\"0\" value=\"${overtime}\"></div><div class=\"field\"><label>Bônus / Comissões — valor total</label><input id=\"hrMonthBonus\" name=\"bonus\" type=\"number\" step=\"0.01\" min=\"0\" value=\"${bonus}\"></div><div class=\"field\"><label>Total do mês</label><input id=\"hrMonthTotal\" type=\"text\" value=\"${mny(base+overtime+bonus)}\" readonly></div></div></div><div class=\"modal-foot\"><button type=\"button\" class=\"btn ghost\" data-v2close>Cancelar</button><button class=\"btn\">Salvar variáveis do mês</button></div></form>`);
  const form=modal.querySelector('#hrMonthlyVariableForm');
  const overtimeInput=modal.querySelector('#hrMonthOvertime'),bonusInput=modal.querySelector('#hrMonthBonus'),totalInput=modal.querySelector('#hrMonthTotal');
  const refreshTotal=()=>{totalInput.value=mny(base+Number(overtimeInput.value||0)+Number(bonusInput.value||0))};
  overtimeInput.oninput=refreshTotal;bonusInput.oninput=refreshTotal;
  form.onsubmit=e=>{
    e.preventDefault();
    const overtimeValue=Math.max(0,Number(overtimeInput.value||0));
    const bonusValue=Math.max(0,Number(bonusInput.value||0));
    const existing=hrMonthlyVariable(person,month);
    if(existing){Object.assign(existing,{overtime:overtimeValue,bonus:bonusValue,updatedAt:new Date().toISOString(),by:user?.name||''});}
    else db.hrMonthlyVariables.push({id:uid(),personId:person.id,month,overtime:overtimeValue,bonus:bonusValue,updatedAt:new Date().toISOString(),by:user?.name||''});
    const payment=hrPayment(person,month);
    if(payment?.status==='Pago')payment.value=base+overtimeValue+bonusValue;
    save();modal.remove();renderHr20();
  };
}
"""
if old not in s:
    raise SystemExit('Bloco de cálculo RH não encontrado')
s=s.replace(old,new,1)

oldrow="""<tr><td><b>${esc(p.name||'')}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${mny(hrValueForMonth(p,selectedHrMonth))}</b></td>"""
newrow="""<tr><td><button type=\"button\" class=\"linklike\" data-hr20-variable=\"${p.id}\"><b>${esc(p.name||'')}</b></button></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${mny(hrValueForMonth(p,selectedHrMonth))}</b>${(()=>{const v=hrMonthlyVariable(p,selectedHrMonth),extra=Number(v?.overtime||0)+Number(v?.bonus||0);return extra?`<div class=\"muted\">Base ${mny(hrBaseValueForMonth(p,selectedHrMonth))} + variáveis ${mny(extra)}</div>`:''})()}</td>"""
if oldrow not in s:
    raise SystemExit('Linha da folha RH ativa não encontrada')
s=s.replace(oldrow,newrow,1)

oldhandlers="""  qa('[data-hr20-person]').forEach(b=>b.onclick=()=>hrEmployeeModal(b.dataset.hr20Person));
  qa('[data-hr20-month]').forEach(b=>b.onclick=()=>{selectedHrMonth=b.dataset.hr20Month;renderHr20()});
  qa('[data-hr20-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Pay));if(!p)return;db.hrPayments=db.hrPayments||[];let x=hrPayment(p,start);const value=hrValueForMonth(p,start);if(x)Object.assign(x,{status:'Pago',paidAt:today(),value});else db.hrPayments.push({id:Date.now()+Math.floor(Math.random()*10000),personId:p.id,month:start,value,status:'Pago',paidAt:today()});save();renderHr20()});
"""
newhandlers="""  qa('[data-hr20-person]').forEach(b=>b.onclick=()=>hrEmployeeModal(b.dataset.hr20Person));
  qa('[data-hr20-month]').forEach(b=>b.onclick=()=>{selectedHrMonth=b.dataset.hr20Month;renderHr20()});
  qa('[data-hr20-variable]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Variable));if(p)hrMonthlyVariableModal(p,selectedHrMonth)});
  qa('[data-hr20-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Pay));if(!p)return;db.hrPayments=db.hrPayments||[];let x=hrPayment(p,selectedHrMonth);const value=hrValueForMonth(p,selectedHrMonth);if(x)Object.assign(x,{status:'Pago',paidAt:today(),value});else db.hrPayments.push({id:Date.now()+Math.floor(Math.random()*10000),personId:p.id,month:selectedHrMonth,value,status:'Pago',paidAt:today()});save();renderHr20()});
"""
if oldhandlers not in s:
    raise SystemExit('Handlers RH ativos não encontrados')
s=s.replace(oldhandlers,newhandlers,1)

p.write_text(s,encoding='utf-8')

idx=Path('public/index.html')
x=idx.read_text(encoding='utf-8')
x=x.replace('financeiro.bundle.js?v=4','financeiro.bundle.js?v=5')
idx.write_text(x,encoding='utf-8')
