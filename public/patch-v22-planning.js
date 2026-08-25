/* Integral Financeiro V22 — Planejamento integrado a Contas e RH */
(function(){
  'use strict';

  const monthOf22=v=>String(v||'').slice(0,7);
  const today22=()=>new Date().toISOString().slice(0,10);
  const addMonths22=(date,n)=>{const d=new Date((date||today22())+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,10)};
  const monthLabel22=m=>{if(typeof monthLabel==='function')return monthLabel(m);const[y,mo]=String(m).split('-');return new Date(+y,+mo-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})};
  const money22=v=>typeof moneySafe==='function'?moneySafe(v):money(v);

  function employeeCost22(p,m){
    const first=m+'-01';
    const last=new Date(+m.slice(0,4),+m.slice(5,7),0).toISOString().slice(0,10);
    if(p.start&&p.start>last)return 0;
    if(p.end&&p.end<first)return 0;
    const hist=[...(p.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    return Number(hist.at(-1)?.value??p.currentValue??p.value??0)||0;
  }

  function revenueSchedule22(r){
    if(typeof revenueSchedule==='function')return revenueSchedule(r);
    const count=Math.max(1,+r.installments||1),total=+r.total||0,interval=r.cadence==='Trimestral'?3:r.cadence==='Semestral'?6:r.cadence==='Anual'?12:r.cadence==='Personalizado'?Math.max(1,+r.interval||1):1;
    return Array.from({length:count},(_,i)=>{const date=addMonths22(r.start||today22(),i*interval);return{month:monthOf22(date),date,value:total/count,origin:r.origin||'Receita planejada',source:'Planejamento'}});
  }

  function expenseSchedule22(r){
    if(typeof expenseSchedule==='function')return expenseSchedule(r);
    const count=Math.max(1,+r.installments||1),total=+r.total||(+r.value||0)*count,interval=r.cadence==='Trimestral'?3:r.cadence==='Semestral'?6:r.cadence==='Anual'?12:r.cadence==='Personalizado'?Math.max(1,+r.interval||1):1;
    return Array.from({length:count},(_,i)=>{const date=addMonths22(r.start||today22(),i*interval);return{month:monthOf22(date),date,value:total/count,origin:r.origin||r.name||'Despesa planejada',source:'Planejamento'}});
  }

  function accountPlanningRows22(){
    return (db.accountPayments||[])
      .filter(p=>p.due&&p.status!=='Cancelada')
      .map(p=>{const a=(db.accountMasters||[]).find(x=>String(x.id)===String(p.accountId));return{
        month:monthOf22(p.due),date:p.due,value:Number(p.value||0),direction:'Saída',
        origin:a?.name||'Conta cadastrada',source:'Contas',category:a?.category||'',status:p.status||''
      }});
  }

  function payrollPlanningRows22(){
    const start=new Date();start.setDate(1);
    const months=Array.from({length:24},(_,i)=>{const d=new Date(start);d.setMonth(d.getMonth()+i);return d.toISOString().slice(0,7)});
    return months.flatMap(m=>(db.hrPeople||[]).map(p=>({p,value:employeeCost22(p,m)})).filter(x=>x.value>0).map(({p,value})=>({
      month:m,date:m+'-01',value,direction:'Saída',origin:p.name||'Colaborador',source:'RH',category:'Folha e colaboradores'
    })));
  }

  window.integralPlanningRows=function(){
    const manualIn=(db.planRevenues||[]).flatMap(revenueSchedule22).map(x=>({...x,direction:'Entrada'}));
    const erpIn=(db.erpPlannedRevenues||[]).map(x=>({month:x.month,date:x.dueDate,value:Number(x.remaining||0),origin:`${x.project||'ERP'} • ${x.origin||'Receita'}`,direction:'Entrada',source:'ERP'}));
    const manualOut=(db.planExpenses||[]).flatMap(expenseSchedule22).map(x=>({...x,direction:'Saída'}));
    return [...manualIn,...erpIn,...manualOut,...accountPlanningRows22(),...payrollPlanningRows22()];
  };

  function realRows22(){return (db.cashflow||[]).map(x=>({...x,month:monthOf22(x.date)}));}

  planningMonthDetail=function(m){
    const rows=window.integralPlanningRows().filter(x=>x.month===m),ins=rows.filter(x=>x.direction==='Entrada'),outs=rows.filter(x=>x.direction==='Saída');
    const iv=ins.reduce((s,x)=>s+Number(x.value||0),0),ov=outs.reduce((s,x)=>s+Number(x.value||0),0),real=realRows22().filter(x=>x.month===m),ri=real.filter(x=>x.direction==='Entrada').reduce((s,x)=>s+Number(x.value||0),0),ro=real.filter(x=>x.direction==='Saída').reduce((s,x)=>s+Number(x.value||0),0);
    return v2modal(`Planejamento • ${monthLabel22(m)}`,`<div class="modal-body"><div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Entradas previstas</h3><b>${money22(iv)}</b></div><div class="card metric mini"><h3>Saídas previstas</h3><b>${money22(ov)}</b></div><div class="card metric mini"><h3>Entradas reais</h3><b>${money22(ri)}</b></div><div class="card metric mini"><h3>Saídas reais</h3><b>${money22(ro)}</b></div></div><h3 class="section-title">O que deve entrar</h3><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Origem</th><th>Fonte</th><th>Valor</th></tr></thead><tbody>${ins.map(r=>`<tr><td>${r.date?fmt(r.date):'—'}</td><td><b>${esc(r.origin)}</b></td><td>${esc(r.source)}</td><td>${money22(r.value)}</td></tr>`).join('')||'<tr><td colspan="4">Sem entradas previstas.</td></tr>'}</tbody></table></div><h3 class="section-title">O que deve sair</h3><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Origem</th><th>Fonte</th><th>Valor</th></tr></thead><tbody>${outs.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).map(r=>`<tr><td>${r.date?fmt(r.date):'—'}</td><td><b>${esc(r.origin)}</b>${r.category?`<small>${esc(r.category)}</small>`:''}</td><td>${esc(r.source)}</td><td>${money22(r.value)}</td></tr>`).join('')||'<tr><td colspan="4">Sem saídas previstas.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);
  };

  planning=function(){
    if(typeof isAdm==='function'&&!isAdm())return documents();
    title('Planejamento');
    if(typeof syncERPReceivables==='function')syncERPReceivables();
    const start=monthOf22(today22()),months=Array.from({length:12},(_,i)=>monthOf22(addMonths22(start+'-01',i))),rows=window.integralPlanningRows();
    $('#content').innerHTML=`<div class="toolbar"><div><b>Planejamento dos próximos 12 meses</b><div class="muted">Contas cadastradas, custos de colaboradores e entradas do ERP são incorporados automaticamente ao mês correspondente. O planejamento não altera o Fluxo de Caixa.</div></div><div class="right"><button class="btn ghost" id="v22NewPlanExpense">+ Despesa planejada</button><button class="btn" id="v22NewRevenue">+ Receita planejada</button></div></div><div class="planning-month-grid">${months.map(m=>{const a=rows.filter(x=>x.month===m),iv=a.filter(x=>x.direction==='Entrada').reduce((s,x)=>s+Number(x.value||0),0),ov=a.filter(x=>x.direction==='Saída').reduce((s,x)=>s+Number(x.value||0),0),rr=realRows22().filter(x=>x.month===m),realBal=rr.reduce((s,x)=>s+(x.direction==='Entrada'?Number(x.value||0):-Number(x.value||0)),0),accounts=a.filter(x=>x.source==='Contas').reduce((s,x)=>s+Number(x.value||0),0),payroll=a.filter(x=>x.source==='RH').reduce((s,x)=>s+Number(x.value||0),0);return`<button class="card planning-month-card" data-v22-month="${m}"><span>${monthLabel22(m)}</span><b>${money22(iv-ov)}</b><small>Entradas ${money22(iv)} • Saídas ${money22(ov)}</small><small>Contas ${money22(accounts)} • Colaboradores ${money22(payroll)}</small><small>Real até agora: ${money22(realBal)}</small></button>`}).join('')}</div><div class="grid cols-2"><section class="card"><div class="section-head"><h3>Receitas planejadas manuais</h3></div>${(db.planRevenues||[]).map(r=>`<button class="mini-row" data-v22-revenue="${r.id}"><span><b>${esc(r.origin)}</b><small>${r.installments} parcela(s) • ${esc(r.cadence)}</small></span><strong>${money22(r.total)}</strong></button>`).join('')||'<div class="empty">Nenhuma receita manual cadastrada.</div>'}</section><section class="card"><div class="section-head"><h3>Entradas previstas do ERP</h3></div>${(db.erpPlannedRevenues||[]).slice(0,50).map(r=>`<div class="mini-row readonly"><span><b>${esc(r.project)}</b><small>${esc(r.origin)} • ${r.dueDate?fmt(r.dueDate):'—'}</small></span><strong>${money22(r.remaining)}</strong></div>`).join('')||'<div class="empty">Nenhuma entrada futura sincronizada do ERP.</div>'}</section></div><div class="grid cols-2"><section class="card"><div class="section-head"><h3>Contas incorporadas automaticamente</h3></div><div class="muted">Cada pagamento aparece no mês do vencimento cadastrado em Contas.</div></section><section class="card"><div class="section-head"><h3>Custos de colaboradores</h3></div><div class="muted">O valor mensal vigente de cada contrato de RH entra automaticamente nos meses em que o colaborador estiver ativo.</div></section></div><section class="card"><div class="section-head"><h3>Despesas planejadas manuais</h3></div>${(db.planExpenses||[]).map(r=>`<button class="mini-row" data-v22-plan-exp="${r.id}"><span><b>${esc(r.origin||r.name||'Despesa')}</b><small>${r.installments||1} ocorrência(s) • ${esc(r.cadence||'Mensal')}</small></span><strong>${money22(r.total||r.value)}</strong></button>`).join('')||'<div class="empty">Nenhuma despesa planejada manual.</div>'}</section>`;
    $('#v22NewRevenue').onclick=()=>typeof revenueForm==='function'&&revenueForm();
    $('#v22NewPlanExpense').onclick=()=>typeof expensePlanForm==='function'&&expensePlanForm();
    $$('[data-v22-month]').forEach(b=>b.onclick=()=>planningMonthDetail(b.dataset.v22Month));
    $$('[data-v22-revenue]').forEach(b=>b.onclick=()=>typeof revenueForm==='function'&&revenueForm(b.dataset.v22Revenue));
    $$('[data-v22-plan-exp]').forEach(b=>b.onclick=()=>typeof expensePlanForm==='function'&&expensePlanForm(b.dataset.v22PlanExp));
  };

  window.addEventListener('integral:erp-planning-synced',()=>{if(window.view==='planning'||typeof view!=='undefined'&&view==='planning')planning()});
})();
