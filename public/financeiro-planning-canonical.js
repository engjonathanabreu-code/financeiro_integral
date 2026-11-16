/* Integral Financeiro — Planejamento canônico e funcional */
(function(){
'use strict';
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const E=v=>typeof esc==='function'?esc(String(v??'')):String(v??'');
const M=v=>typeof moneySafe==='function'?moneySafe(v):(typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
const F=d=>{if(!d)return'—';try{return typeof fmt==='function'?fmt(d):new Date(d+'T12:00:00').toLocaleDateString('pt-BR')}catch{return d}};
const monthOf=v=>String(v||'').slice(0,7),today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10),uid=()=>window.integralUid?window.integralUid():Date.now()+Math.floor(Math.random()*1000000);
const addMonths=(date,n)=>{const d=new Date(date+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,10)};
const label=m=>{if(typeof monthLabel==='function')return monthLabel(m);const[y,mo]=String(m).split('-');return new Date(+y,+mo-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase())};
function D(){try{return db}catch{return window.db||{}}}function persist(){if(typeof save==='function')save()}
function popup(t,b){if(typeof v2modal==='function')return v2modal(t,b);const x=document.createElement('div');x.className='modal-backdrop';x.innerHTML=`<div class="modal"><div class="modal-head"><h3>${E(t)}</h3><button class="btn ghost small" data-pclose>Fechar</button></div>${b}</div>`;document.body.appendChild(x);x.onclick=e=>{if(e.target===x||e.target.closest('[data-pclose]'))x.remove()};return x}
function cadenceStep(r){const cad=r.cadence||'Mensal';return cad==='Trimestral'?3:cad==='Semestral'?6:cad==='Anual'?12:cad==='Personalizado'?Math.max(1,+r.interval||1):1}
function schedule(r,direction){
  const step=cadenceStep(r),baseDate=r.start||today(),origin=r.origin||r.name||(direction==='Entrada'?'Receita planejada':'Despesa planejada');
  const {entry,installments}=window.IntegralDREShared.planAmounts(r,direction);
  const detail=direction==='Entrada'&&(Number(r.entry||0)>0||Number(r.installmentValue||0)>0);
  const out=[];
  if(entry>0)out.push({month:monthOf(baseDate),date:baseDate,value:entry,direction,origin:`${origin} • Entrada`,source:'Planejamento'});
  for(const [index,value] of installments.entries()){
    const date=addMonths(baseDate,(entry>0?index+1:index)*step);
    out.push({month:monthOf(date),date,value,direction,origin:detail?`${origin} • ${index+1}ª parcela`:origin,source:'Planejamento'});
  }
  return out;
}
function employeeCost(p,m){const first=m+'-01',last=new Date(+m.slice(0,4),+m.slice(5,7),0).toISOString().slice(0,10);if(p.start&&p.start>last)return 0;if(p.end&&p.end<first)return 0;const h=[...(p.history||[])].filter(x=>x.date&&x.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));return Number(h.at(-1)?.value??p.currentValue??p.value??0)||0}
function rows(){const d=D();const manualIn=(d.planRevenues||[]).flatMap(r=>schedule(r,'Entrada')),manualOut=(d.planExpenses||[]).flatMap(r=>schedule(r,'Saída'));const erp=(d.erpPlannedRevenues||[]).filter(window.IntegralDREShared.openERP).map(x=>({month:x.month||monthOf(x.dueDate),date:x.dueDate,value:Number(x.remaining||0),direction:'Entrada',origin:`${x.project||'Projeto ERP'} • ${x.origin||'Recebimento'}`,source:'ERP'}));const accounts=(d.accountPayments||[]).filter(p=>p.due&&!['Cancelada','Cancelado'].includes(String(p.status||''))).map(p=>{const a=(d.accountMasters||[]).find(x=>String(x.id)===String(p.accountId));return{month:monthOf(p.due),date:p.due,value:Number(p.value||0),direction:'Saída',origin:a?.name||'Conta cadastrada',source:'Contas',category:a?.category||''}});const start=monthOf(today()),months=Array.from({length:24},(_,i)=>monthOf(addMonths(start+'-01',i)));const payroll=months.flatMap(m=>(d.hrPeople||[]).map(p=>({p,v:employeeCost(p,m)})).filter(x=>x.v>0).map(({p,v})=>({month:m,date:m+'-01',value:v,direction:'Saída',origin:p.name||'Colaborador',source:'RH',category:'Folha e colaboradores'})));return[...manualIn,...erp,...manualOut,...accounts,...payroll]}
window.integralPlanningRows=rows;
function revenueFormCanonical(id){
  const d=D();d.planRevenues=d.planRevenues||[];const r=d.planRevenues.find(x=>String(x.id)===String(id));
  const installments=Math.max(1,Number(r?.installments||1)),entry=Math.max(0,Number(r?.entry||0));
  const total=Math.max(0,Number(r?.total||0));const installmentValue=Math.max(0,Number(r?.installmentValue||((total-entry)>0?(total-entry)/installments:0)));
  const x=popup(r?'Editar receita planejada':'Nova receita planejada',`<form id="pcRevenue"><div class="modal-body"><div class="form-section"><h4>Receita planejada</h4><p class="muted">Somente previsão. Este valor não é lançado no Fluxo de Caixa.</p><div class="form-grid"><div class="field full"><label>Origem da receita</label><input name="origin" value="${E(r?.origin||'')}" required></div><div class="field"><label>Valor de entrada <span class="muted">(opcional)</span></label><input name="entry" type="number" min="0" step="0.01" value="${entry||''}" placeholder="0,00"></div><div class="field"><label>Quantidade de parcelas</label><input name="installments" type="number" min="1" value="${installments}" required></div><div class="field"><label>Valor da parcela</label><input name="installmentValue" type="number" min="0" step="0.01" value="${installmentValue||''}" placeholder="0,00"></div><div class="field"><label>Valor total</label><input name="total" type="number" min="0" step="0.01" value="${total||''}" placeholder="0,00"></div><div class="field full"><div class="notice" id="pcRevenueCalc">Preencha o valor total ou o valor da parcela. O sistema calcula o restante automaticamente.</div></div><div class="field"><label>Primeira data</label><input name="start" type="date" value="${r?.start||today()}" required><small class="muted">Com entrada: data da entrada. Sem entrada: data da 1ª parcela.</small></div><div class="field"><label>Periodicidade</label><select name="cadence">${['Mensal','Trimestral','Semestral','Anual','Personalizado'].map(v=>`<option ${v===(r?.cadence||'Mensal')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Intervalo personalizado (meses)</label><input name="interval" type="number" min="1" value="${r?.interval||1}"></div></div></div></div><div class="modal-foot">${r?'<button type="button" class="btn danger" id="pcDelRevenue">Excluir</button>':''}<button class="btn">Salvar receita</button></div></form>`);
  const f=x.querySelector('#pcRevenue'),entryEl=f.elements.entry,nEl=f.elements.installments,perEl=f.elements.installmentValue,totalEl=f.elements.total,calc=x.querySelector('#pcRevenueCalc');let lastEdited=total>0?'total':'installment';
  const recalc=source=>{if(source)lastEdited=source;const ent=Math.max(0,Number(entryEl.value||0)),n=Math.max(1,Number(nEl.value||1));if(lastEdited==='total'){const tot=Math.max(0,Number(totalEl.value||0));perEl.value=tot>=ent?((tot-ent)/n).toFixed(2):'';}else{const per=Math.max(0,Number(perEl.value||0));totalEl.value=(ent+per*n).toFixed(2);}const tot=Math.max(0,Number(totalEl.value||0)),per=Math.max(0,Number(perEl.value||0));calc.innerHTML=`<b>${M(ent)}</b> de entrada + <b>${n}</b> parcela(s) de <b>${M(per)}</b> = <b>${M(tot)}</b> no total.`;};
  entryEl.addEventListener('input',()=>recalc());nEl.addEventListener('input',()=>recalc());perEl.addEventListener('input',()=>recalc('installment'));totalEl.addEventListener('input',()=>recalc('total'));recalc();
  f.onsubmit=e=>{e.preventDefault();recalc();const z=new FormData(f),ent=Math.max(0,+z.get('entry')||0),n=Math.max(1,+z.get('installments')||1),per=Math.max(0,+z.get('installmentValue')||0),tot=Math.max(0,+z.get('total')||0);if(tot<=0||per<=0){alert('Informe o valor total ou o valor da parcela para calcular a receita.');return}if(tot<ent){alert('O valor total não pode ser menor que o valor de entrada.');return}const o={id:r?.id||uid(),origin:String(z.get('origin')||'').trim(),entry:ent,total:tot,installments:n,installmentValue:per,start:z.get('start'),cadence:z.get('cadence'),interval:+z.get('interval')||1};r?Object.assign(r,o):d.planRevenues.push(o);persist();x.remove();planningCanonical()};
  if(r)x.querySelector('#pcDelRevenue').onclick=()=>{if(confirm('Excluir esta receita planejada?')){d.planRevenues=d.planRevenues.filter(z=>String(z.id)!==String(r.id));persist();x.remove();planningCanonical()}}
}
function expenseFormCanonical(id){const d=D();d.planExpenses=d.planExpenses||[];const r=d.planExpenses.find(x=>String(x.id)===String(id));const x=popup(r?'Editar despesa planejada':'Nova despesa planejada',`<form id="pcExpense"><div class="modal-body"><div class="form-section"><h4>Despesa planejada</h4><p class="muted">Somente previsão. Este valor não é lançado no Fluxo de Caixa.</p><div class="form-grid"><div class="field full"><label>Descrição / origem</label><input name="origin" value="${E(r?.origin||r?.name||'')}" required></div><div class="field"><label>Valor total</label><input name="total" type="number" min="0" step="0.01" value="${r?.total||r?.value||''}" required></div><div class="field"><label>Ocorrências</label><input name="installments" type="number" min="1" value="${r?.installments||1}" required></div><div class="field"><label>Primeira data</label><input name="start" type="date" value="${r?.start||today()}" required></div><div class="field"><label>Periodicidade</label><select name="cadence">${['Mensal','Trimestral','Semestral','Anual','Personalizado'].map(v=>`<option ${v===(r?.cadence||'Mensal')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Intervalo personalizado (meses)</label><input name="interval" type="number" min="1" value="${r?.interval||1}"></div></div></div></div><div class="modal-foot">${r?'<button type="button" class="btn danger" id="pcDelExpense">Excluir</button>':''}<button class="btn">Salvar despesa</button></div></form>`);const f=x.querySelector('#pcExpense');f.onsubmit=e=>{e.preventDefault();const z=new FormData(f),o={id:r?.id||uid(),origin:String(z.get('origin')||'').trim(),total:+z.get('total')||0,installments:+z.get('installments')||1,start:z.get('start'),cadence:z.get('cadence'),interval:+z.get('interval')||1};r?Object.assign(r,o):d.planExpenses.push(o);persist();x.remove();planningCanonical()};if(r)x.querySelector('#pcDelExpense').onclick=()=>{if(confirm('Excluir esta despesa planejada?')){d.planExpenses=d.planExpenses.filter(z=>String(z.id)!==String(r.id));persist();x.remove();planningCanonical()}}}
function monthDetail(month,items){
  const engine=window.IntegralPlanningAnalysis;
  const {incoming,outgoing,net}=engine.totals(items,'open');
  const details=direction=>items.filter(item=>item.direction===direction).map(item=>{
    const context=[F(item.date),item.source,item.project,item.category].filter(Boolean).map(E).join(' • ');
    return `<div class="pc-detail-row"><div><b>${E(item.description)}</b><small>${context}</small></div>
      <strong class="${direction==='Entrada'?'kpi-positive':'kpi-negative'}">${M(item.amount/100)}</strong></div>`;
  }).join('')||'<div class="empty">Sem lançamentos neste mês.</div>';
  return popup(`Planejamento • ${label(month)}`,`<div class="modal-body">
    <div class="pc-month-columns">
      <section><h3 class="section-title">Entradas · ${M(incoming/100)}</h3><div class="pc-detail-list">${details('Entrada')}</div></section>
      <section><h3 class="section-title">Saídas · ${M(outgoing/100)}</h3><div class="pc-detail-list">${details('Saída')}</div></section>
    </div><p class="pc-month-result">Diferença no mês <b class="${net<0?'kpi-negative':'kpi-positive'}">${M(net/100)}</b></p>
    </div><div class="modal-foot"><button class="btn" data-v2close data-pclose>Fechar</button></div>`);
}
function listRow(r,type){const erp=type==='ERP',entry=Number(r.entry||0),meta=erp?`${E(r.origin||'Recebimento')} • ${r.dueDate?F(r.dueDate):'—'}`:type==='Receita'?`${entry>0?`Entrada ${M(entry)} • `:''}${r.installments||1} parcela(s)${r.installmentValue?` de ${M(r.installmentValue)}`:''} • ${E(r.cadence||'Mensal')}`:`${r.installments||1} ocorrência(s) • ${E(r.cadence||'Mensal')}`,name=erp?(r.project||'Projeto ERP'):(r.origin||r.name||type),value=erp?r.remaining:(r.total??r.value),attr=type==='Receita'?`data-pc-revenue="${E(r.id)}"`:type==='Despesa'?`data-pc-expense="${E(r.id)}"`:'';return `<button class="pc-list-row ${erp?'readonly':''}" ${attr}><span><b>${E(name)}</b><small>${meta}</small></span><strong>${M(value)}</strong></button>`}
async function syncERP(){
  if(!window.IntegralFinanceERPPlanning?.sync)throw Error('A integração com o ERP ainda não está disponível.');
  return window.IntegralFinanceERPPlanning.sync();
}
function planLists(data){
  const incomes=data.planRevenues||[],expenses=data.planExpenses||[];
  const erp=(data.erpPlannedRevenues||[]).filter(window.IntegralDREShared.openERP)
    .sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')));
  const list=(title,items,type)=>`<section class="card planning-source-card">
    <div class="section-head"><h3>${title}</h3><span class="badge">${items.length}</span></div>
    <div class="pc-list">${items.map(row=>listRow(row,type)).join('')||'<div class="empty">Nenhum item cadastrado.</div>'}</div>
  </section>`;
  return `<div class="pc-source-grid">${list('Receitas planejadas manuais',incomes,'Receita')}${list('Entradas programadas do ERP',erp,'ERP')}${list('Despesas planejadas manuais',expenses,'Despesa')}</div>`;
}

const planButtons=()=>`<button class="btn ghost" id="pcNewExpense">+ Despesa planejada</button>
  <button class="btn" id="pcNewRevenue">+ Receita planejada</button>`;

function bindPlans(){
  q('#pcNewRevenue').onclick=()=>revenueFormCanonical();
  q('#pcNewExpense').onclick=()=>expenseFormCanonical();
  qa('[data-pc-revenue]').forEach(button=>button.onclick=()=>revenueFormCanonical(button.dataset.pcRevenue));
  qa('[data-pc-expense]').forEach(button=>button.onclick=()=>expenseFormCanonical(button.dataset.pcExpense));
}

function manageManualPlans(){
  if(typeof isAdm==='function'&&!isAdm())return typeof documents==='function'?documents():null;
  const content=q('#content');
  if(!content)return;
  content.innerHTML=`<div class="planning-refined"><div class="planning-refined-head">
    <button class="btn ghost" id="pcReturnPanel">← Projeção mensal</button><div class="right">${planButtons()}</div>
    </div>${planLists(D())}</div>`;
  q('#pcReturnPanel').onclick=planningCanonical;
  bindPlans();
}
window.IntegralPlanningManual={render:manageManualPlans};

let simulationOwner, simulations=[];
function simulationForm(today,end){
  return `<details id="pcSimulation" class="card pc-simulation"${simulations.length?' open':''}>
    <summary>Simular entrada ou saída${simulations.length?` · ${simulations.length}`:''}</summary>
    <p class="muted">As simulações entram nos quadros desta sessão. Ao recarregar a página, os testes são descartados.</p>
    <form id="pcSimulationForm" class="pc-simulation-fields">
      <label>Tipo<select name="direction"><option>Entrada</option><option>Saída</option></select></label>
      <label>Origem ou destino<input name="description" maxlength="120" required></label>
      <label>Data<input name="date" type="date" min="${today}" max="${end}" value="${today}" required></label>
      <label>Valor (R$)<input name="value" type="number" min="0.01" step="0.01" required></label>
      <button type="submit" class="btn">Adicionar à projeção</button>
    </form>
    ${simulations.length?`<ul class="pc-simulation-items">${simulations.map(item=>`<li>
      <span><b>${E(item.description)}</b> · ${E(item.direction)} · ${F(item.date)} · ${M(item.amount/100)}</span>
      <button type="button" class="btn ghost small" data-pc-remove="${item.key}" aria-label="Remover simulação: ${E(item.description)}">Remover</button>
    </li>`).join('')}</ul>`:''}
  </details>`;
}

function planningCanonical(){
  const activeUser=typeof user==='undefined'?window.user:user;
  const actor=activeUser?.erpId;
  if(actor!==simulationOwner||!actor){simulations=[];simulationOwner=actor;}
  if(typeof isAdm==='function'&&!isAdm()){
    simulations=[];
    return typeof documents==='function'?documents():null;
  }
  if(typeof title==='function')title('Planejamento');
  const engine=window.IntegralPlanningAnalysis,shared=window.IntegralDREShared,data=D();
  const now=shared.todayISO(),start=engine.firstMonthDay(now);
  const months=Array.from({length:12},(_,index)=>engine.shiftMonths(start,index).slice(0,7));
  const end=engine.lastMonthDay(months.at(-1)+'-01');
  // Recebimentos e contratos do ERP podem representar as mesmas entradas.
  // Os quadros mantêm as fontes da projeção original, com os saldos em aberto.
  const model=engine.createModel(data,null,{today:now,start,end});
  const projected=[...model.rows,...simulations].filter(item=>item.phase==='open'&&item.date>=start&&item.date<=end);
  const grouped=new Map(engine.grouped(projected,'month','open').map(item=>[item.key,item]));
  const {incoming,outgoing,net}=engine.totals(projected,'open');
  let accumulated=0;
  const line=(title,value,style='')=>`<div class="planning-month-line"><span>${title}</span><b class="${style}">${M(value/100)}</b></div>`;
  const simulationNote=simulations.length?' · inclui simulações':'';
  const cards=months.map((month,index)=>{
    const {items=[],incoming=0,outgoing=0,net=0}=grouped.get(month)||{};
    accumulated+=net;
    const sourceTotal=source=>items.filter(item=>item.source===source).reduce((sum,item)=>sum+item.amount,0);
    return `<button type="button" class="card planning-month-card" data-pc-month="${month}">
      <div class="planning-month-title"><strong>${E(label(month))}</strong>${index===0?'<span>Atual</span>':''}</div>
      <div class="planning-month-lines">
        ${line('Entradas',incoming,'kpi-positive')}${line('Saídas',outgoing,'kpi-negative')}
        ${line('Entradas do ERP',sourceTotal('ERP'))}${line('Contas a pagar',sourceTotal('Contas'))}${line('Colaboradores',sourceTotal('RH'))}
      </div>
      <div class="planning-month-balance"><span>Diferença no mês</span><b class="${net<0?'kpi-negative':'kpi-positive'}">${M(net/100)}</b></div>
      <div class="planning-month-line pc-accumulated"><span>Acumulado</span><b class="${accumulated<0?'kpi-negative':'kpi-positive'}">${M(accumulated/100)}</b></div>
    </button>`;
  }).join('');
  const metric=(title,value,meta,style)=>`<div class="card planning-summary-card"><span>${title}</span><b class="${style}">${M(value/100)}</b><small>${meta}</small></div>`;
  q('#content').innerHTML=`<div class="planning-refined">
    <div class="planning-refined-head"><div><h3>Planejamento dos próximos 12 meses</h3>
      <p class="muted">Abra um mês para ver de onde vêm as entradas e para onde vão as saídas.</p></div>
      <div class="right pc-plan-actions"><button class="btn ghost" id="pcAnalysis">Análise detalhada</button>${planButtons()}</div>
    </div>
    <div class="planning-summary-grid">
      ${metric('Entradas previstas',incoming,'Contratos do ERP e previsões manuais'+simulationNote,'kpi-positive')}
      ${metric('Saídas previstas',outgoing,'Contas, RH e previsões manuais'+simulationNote,'kpi-negative')}
      ${metric('Movimentação líquida projetada',net,'Entradas menos saídas, sem saldo inicial',net<0?'kpi-negative':'kpi-positive')}
    </div>
    ${simulationForm(now,end)}
    <div class="planning-month-grid">${cards}</div>
    ${planLists(data)}
  </div>`;
  bindPlans();
  q('#pcAnalysis').onclick=()=>window.IntegralPlanningPanel?.render();
  qa('[data-pc-month]').forEach(button=>button.onclick=()=>{
    const month=button.dataset.pcMonth;
    const items=[...(grouped.get(month)?.items||[])].sort((a,b)=>a.date.localeCompare(b.date));
    monthDetail(month,items);
  });
  const form=q('#pcSimulationForm');
  form.onsubmit=event=>{
    event.preventDefault();
    const description=form.elements.description.value.trim();
    const direction=form.elements.direction.value;
    const date=shared.dateKey(form.elements.date.value);
    const amount=shared.cents(form.elements.value.value);
    form.elements.description.setCustomValidity(description?'':'Informe a origem ou o destino.');
    if(!form.reportValidity()||!date||date<now||date>end||!Number.isSafeInteger(amount)||amount<=0)return;
    simulations.push({key:uid(),phase:'open',source:'Simulação',description,direction,date,amount});
    planningCanonical();
    q('[data-pc-month="'+monthOf(date)+'"]').focus();
  };
  form.elements.description.oninput=()=>form.elements.description.setCustomValidity('');
  qa('[data-pc-remove]').forEach(button=>button.onclick=()=>{
    simulations=simulations.filter(item=>String(item.key)!==button.dataset.pcRemove);
    planningCanonical();
    q('#pcSimulation summary').focus();
  });
}
try{planning=planningCanonical;window.planning=planningCanonical}catch{window.planning=planningCanonical}
window.planningCanonical=planningCanonical;window.syncFinancePlanningERP=syncERP;
window.addEventListener('integral:erp-planning-synced',()=>{try{if((typeof view!=='undefined'?view:window.view)==='planning'){if(q('[data-planning-panel]'))window.IntegralPlanningPanel.render();else planningCanonical()}}catch{}});
})();