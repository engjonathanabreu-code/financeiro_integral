/* Integral Financeiro V21 - planejamento parcelado, sincronização visível e diagnóstico da IA */
(function(){
'use strict';

const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const uid=()=>Date.now()+Math.floor(Math.random()*10000);
const today=()=>new Date().toISOString().slice(0,10);
const monthOf=d=>String(d||'').slice(0,7);
const addMonths=(date,n)=>{const d=new Date((date||today())+'T12:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,10)};
const monthLabel=m=>{if(!m)return'';const[y,n]=String(m).split('-');return new Date(Number(y),Number(n)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const mny=v=>money(Number(v||0));
const esc21=s=>typeof esc==='function'?esc(String(s??'')):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const isAdmin=()=>user?.role==='Administrador';

function revenueTotal(r){
  const count=Math.max(1,Number(r.installments||1));
  const installment=Number(r.installmentValue||r.monthly||0);
  const total=Number(r.total||0);
  return total>0?total:(installment>0?installment*count:0);
}
function revenueInstallment(r){
  const count=Math.max(1,Number(r.installments||1));
  const total=revenueTotal(r);
  const explicit=Number(r.installmentValue||r.monthly||0);
  return explicit>0?explicit:(count?total/count:total);
}
function cadenceInterval(r){
  const c=r.cadence||'Mensal';
  if(c==='Bimestral')return 2;
  if(c==='Trimestral')return 3;
  if(c==='Semestral')return 6;
  if(c==='Anual')return 12;
  if(c==='Personalizado')return Math.max(1,Number(r.interval||1));
  return 1;
}
function revenueSchedule(r){
  const count=Math.max(1,Number(r.installments||1));
  const per=revenueInstallment(r);
  const interval=cadenceInterval(r);
  return Array.from({length:count},(_,i)=>{
    const date=addMonths(r.start||today(),i*interval);
    return {month:monthOf(date),date,value:per,origin:r.origin||'Receita planejada',direction:'Entrada',source:'Planejamento'};
  });
}
function expenseSchedule(r){
  const count=Math.max(1,Number(r.installments||1));
  const total=Number(r.total||0)||Number(r.value||0)*count;
  const per=count?total/count:total;
  const interval=cadenceInterval(r);
  return Array.from({length:count},(_,i)=>{
    const date=addMonths(r.start||today(),i*interval);
    return {month:monthOf(date),date,value:per,origin:r.origin||r.name||'Despesa planejada',direction:'Saída',source:'Planejamento'};
  });
}
function plannedRows(){
  const manual=(db.planRevenues||[]).flatMap(revenueSchedule);
  const erp=(db.erpPlannedRevenues||[]).map(x=>({month:x.month||monthOf(x.dueDate),date:x.dueDate,value:Number(x.remaining||0),origin:`${x.project||'Projeto ERP'} • ${x.origin||'Recebimento'}`,direction:'Entrada',source:'ERP'}));
  const expenses=(db.planExpenses||[]).flatMap(expenseSchedule);
  return [...manual,...erp,...expenses];
}
function realRows(){return (db.cashflow||[]).map(x=>({...x,month:monthOf(x.date)}));}

function closeModal(el){if(el?.parentNode)el.remove();}
function revenueForm21(id){
  const r=(db.planRevenues||[]).find(x=>String(x.id)===String(id));
  const count=Math.max(1,Number(r?.installments||1));
  const total=revenueTotal(r||{});
  const per=revenueInstallment(r||{});
  const modal=document.createElement('div');
  modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal"><div class="modal-head"><h3>${r?'Editar receita planejada':'Nova receita planejada'}</h3><button class="btn ghost small" type="button" data-close>Fechar</button></div><form id="v21RevenueForm"><div class="modal-body">
    <div class="form-section"><h4>Identificação da receita</h4><div class="field"><label>Origem da receita</label><input name="origin" value="${esc21(r?.origin||'')}" placeholder="Ex.: Contrato Prefeitura de X" required></div></div>
    <div class="form-section"><h4>Parcelamento</h4><p class="muted">Informe a quantidade de parcelas e depois o valor da parcela ou o valor total. O outro valor é calculado automaticamente.</p><div class="form-grid">
      <div class="field"><label>Número de parcelas</label><input name="installments" type="number" min="1" max="240" value="${count}" required></div>
      <div class="field"><label>Valor de cada parcela</label><input name="installmentValue" type="number" min="0" step="0.01" value="${per||''}" placeholder="Ex.: 5.000,00"></div>
      <div class="field"><label>Valor total</label><input name="total" type="number" min="0" step="0.01" value="${total||''}" placeholder="Ex.: 120.000,00"></div>
    </div><div class="notice" id="v21RevenueCalc"></div></div>
    <div class="form-section"><h4>Datas das entradas</h4><div class="form-grid"><div class="field"><label>Data da primeira entrada</label><input name="start" type="date" value="${r?.start||today()}" required></div><div class="field"><label>Periodicidade</label><select name="cadence">${['Mensal','Bimestral','Trimestral','Semestral','Anual','Personalizado'].map(v=>`<option ${String(r?.cadence||'Mensal')===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Intervalo personalizado (meses)</label><input name="interval" type="number" min="1" max="60" value="${Number(r?.interval||1)}"></div></div></div>
  </div><div class="modal-foot">${r?'<button type="button" class="btn danger" id="v21DeleteRevenue">Excluir</button>':''}<button class="btn" type="submit">Salvar receita</button></div></form></div>`;
  document.body.appendChild(modal);
  q('[data-close]',modal).onclick=()=>closeModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  const f=q('#v21RevenueForm',modal), n=q('[name="installments"]',f), p=q('[name="installmentValue"]',f), t=q('[name="total"]',f), calc=q('#v21RevenueCalc',f);
  const refresh=(source)=>{
    const count=Math.max(1,Number(n.value||1));
    if(source==='total'){
      const total=Number(t.value||0);if(total>0)p.value=(total/count).toFixed(2);
    }else{
      const per=Number(p.value||0);if(per>0)t.value=(per*count).toFixed(2);
      else if(Number(t.value||0)>0)p.value=(Number(t.value)/count).toFixed(2);
    }
    const total=Number(t.value||0), per=Number(p.value||0);
    calc.textContent=total>0&&per>0?`${count} parcela(s) de ${mny(per)} = ${mny(total)}`:'Informe o valor da parcela ou o valor total.';
  };
  n.addEventListener('input',()=>refresh(p.value?'installment':'total'));
  p.addEventListener('input',()=>refresh('installment'));
  t.addEventListener('input',()=>refresh('total'));
  refresh(total>0&&!per?'total':'installment');
  f.onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(f), installments=Math.max(1,Number(fd.get('installments')||1));
    let installmentValue=Number(fd.get('installmentValue')||0), total=Number(fd.get('total')||0);
    if(!installmentValue&&total)installmentValue=total/installments;
    if(!total&&installmentValue)total=installmentValue*installments;
    if(total<=0||installmentValue<=0){alert('Informe o valor da parcela ou o valor total.');return;}
    const obj={id:r?.id||uid(),origin:String(fd.get('origin')||'').trim(),installments,installmentValue,total,start:String(fd.get('start')||today()),cadence:String(fd.get('cadence')||'Mensal'),interval:Math.max(1,Number(fd.get('interval')||1))};
    db.planRevenues=db.planRevenues||[];
    if(r)Object.assign(r,obj);else db.planRevenues.push(obj);
    save();closeModal(modal);planning21();
  };
  const del=q('#v21DeleteRevenue',modal);
  if(del)del.onclick=()=>{if(confirm('Excluir esta receita planejada?')){db.planRevenues=(db.planRevenues||[]).filter(x=>String(x.id)!==String(r.id));save();closeModal(modal);planning21();}};
}

function planningDetail21(m){
  const rows=plannedRows().filter(x=>x.month===m),ins=rows.filter(x=>x.direction==='Entrada'),outs=rows.filter(x=>x.direction==='Saída');
  const real=realRows().filter(x=>x.month===m);
  const iv=ins.reduce((s,x)=>s+Number(x.value||0),0),ov=outs.reduce((s,x)=>s+Number(x.value||0),0),ri=real.filter(x=>x.direction==='Entrada').reduce((s,x)=>s+Number(x.value||0),0),ro=real.filter(x=>x.direction==='Saída').reduce((s,x)=>s+Number(x.value||0),0);
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal planning-fit-modal"><div class="modal-head"><h3>Planejamento • ${monthLabel(m)}</h3><button class="btn ghost small" data-close>Fechar</button></div><div class="modal-body"><div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Entradas previstas</h3><b>${mny(iv)}</b></div><div class="card metric mini"><h3>Saídas previstas</h3><b>${mny(ov)}</b></div><div class="card metric mini"><h3>Entradas reais</h3><b>${mny(ri)}</b></div><div class="card metric mini"><h3>Saídas reais</h3><b>${mny(ro)}</b></div></div><h3 class="section-title">O que deve entrar</h3><div class="table-wrap planning-fit-table-wrap"><table class="table planning-fit-table"><thead><tr><th>Data</th><th>Origem</th><th>Fonte</th><th>Valor</th></tr></thead><tbody>${ins.map(x=>`<tr><td>${x.date?fmt(x.date):'—'}</td><td><b>${esc21(x.origin)}</b></td><td>${esc21(x.source)}</td><td>${mny(x.value)}</td></tr>`).join('')||'<tr><td colspan="4">Sem entradas previstas.</td></tr>'}</tbody></table></div><h3 class="section-title">O que deve sair</h3><div class="table-wrap planning-fit-table-wrap"><table class="table planning-fit-table"><thead><tr><th>Data</th><th>Origem</th><th>Fonte</th><th>Valor</th></tr></thead><tbody>${outs.map(x=>`<tr><td>${x.date?fmt(x.date):'—'}</td><td><b>${esc21(x.origin)}</b></td><td>${esc21(x.source)}</td><td>${mny(x.value)}</td></tr>`).join('')||'<tr><td colspan="4">Sem saídas previstas.</td></tr>'}</tbody></table></div></div></div>`;
  document.body.appendChild(modal);q('[data-close]',modal).onclick=()=>closeModal(modal);modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
}

async function syncPlanning21(button){
  if(!window.IntegralFinanceERPPlanning?.sync){alert('A conexão financeira com o ERP ainda não está disponível.');return;}
  const old=button?.textContent||'Sincronizar ERP';if(button){button.disabled=true;button.textContent='Sincronizando...';}
  try{
    if(window.IntegralERP?.sync)await window.IntegralERP.sync();
    const result=await window.IntegralFinanceERPPlanning.sync();
    db.lastErpManualSync=new Date().toISOString();db.lastErpSyncReason='manual';save();
    if(!result?.ok&&result?.reason)throw new Error(result.reason);
    planning21();
  }catch(err){console.error('Planejamento ERP V21:',err);alert(`Não foi possível concluir a sincronização: ${err.message||err}`);if(button){button.disabled=false;button.textContent=old;}}
}

function planning21(){
  if(!isAdmin())return;
  title('Planejamento');
  db.planRevenues=db.planRevenues||[];db.planExpenses=db.planExpenses||[];db.erpPlannedRevenues=db.erpPlannedRevenues||[];
  const start=monthOf(today()),months=Array.from({length:12},(_,i)=>monthOf(addMonths(`${start}-01`,i))),rows=plannedRows();
  const synced=db.lastErpManualSync||db.lastErpFinancialSync||'';
  const content=q('#content');if(!content)return;
  content.innerHTML=`<div class="toolbar"><div><b>Planejamento dos próximos 12 meses</b><div class="muted">Receitas manuais e previsões do ERP são exibidas sem alterar o Fluxo de Caixa.</div>${synced?`<div class="muted">Última sincronização ERP: ${new Date(synced).toLocaleString('pt-BR')}</div>`:'<div class="muted">ERP ainda não sincronizado nesta sessão.</div>'}</div><div class="right"><button class="btn ghost" id="v21SyncERP">Sincronizar ERP</button><button class="btn ghost" id="v21PlanExpense">+ Despesa planejada</button><button class="btn" id="v21Revenue">+ Receita planejada</button></div></div><div class="planning-month-grid">${months.map(m=>{const rs=rows.filter(x=>x.month===m),iv=rs.filter(x=>x.direction==='Entrada').reduce((s,x)=>s+Number(x.value||0),0),ov=rs.filter(x=>x.direction==='Saída').reduce((s,x)=>s+Number(x.value||0),0),rr=realRows().filter(x=>x.month===m),realBal=rr.reduce((s,x)=>s+(x.direction==='Entrada'?Number(x.value||0):-Number(x.value||0)),0);return`<button class="card planning-month-card" data-v21-month="${m}"><span>${monthLabel(m)}</span><b>${mny(iv-ov)}</b><small>Entradas ${mny(iv)} • Saídas ${mny(ov)}</small><small>Real até agora: ${mny(realBal)}</small></button>`}).join('')}</div><div class="grid cols-2"><section class="card"><div class="section-head"><h3>Receitas planejadas manuais</h3></div>${db.planRevenues.map(r=>`<button class="mini-row" data-v21-revenue-id="${r.id}"><span><b>${esc21(r.origin)}</b><small>${Math.max(1,Number(r.installments||1))} parcela(s) de ${mny(revenueInstallment(r))} • ${esc21(r.cadence||'Mensal')}</small></span><strong>${mny(revenueTotal(r))}</strong></button>`).join('')||'<div class="empty">Nenhuma receita manual cadastrada.</div>'}</section><section class="card"><div class="section-head"><h3>Entradas previstas do ERP</h3></div>${db.erpPlannedRevenues.slice(0,80).map(r=>`<div class="mini-row readonly"><span><b>${esc21(r.project||'Projeto ERP')}</b><small>${esc21(r.origin||'Recebimento')} • ${r.dueDate?fmt(r.dueDate):'—'}</small></span><strong>${mny(r.remaining)}</strong></div>`).join('')||'<div class="empty">Nenhuma entrada do ERP carregada. Use “Sincronizar ERP”.</div>'}</section></div>`;
  q('#v21Revenue').onclick=()=>revenueForm21();
  q('#v21SyncERP').onclick=e=>syncPlanning21(e.currentTarget);
  const expenseBtn=q('#v21PlanExpense');if(expenseBtn)expenseBtn.onclick=()=>{const legacy=q('#v10NewPlanExpense');if(legacy)legacy.click();else if(typeof window.expensePlanForm==='function')window.expensePlanForm();else alert('Cadastro de despesa planejada indisponível nesta versão.');};
  qa('[data-v21-month]').forEach(b=>b.onclick=()=>planningDetail21(b.dataset.v21Month));
  qa('[data-v21-revenue-id]').forEach(b=>b.onclick=()=>revenueForm21(b.dataset.v21RevenueId));
}

// Diagnóstico leve da IA na tela Contas. O resultado é mantido por 2 minutos para não gerar chamadas excessivas.
let aiState={checkedAt:0,connected:null,model:'',error:''};
async function checkAI(){
  if(Date.now()-aiState.checkedAt<120000&&aiState.connected!==null)return aiState;
  try{
    const r=await fetch('/api/ai-health',{cache:'no-store'}),d=await r.json();
    aiState={checkedAt:Date.now(),connected:!!(r.ok&&d.connected),model:d.model||'',error:d.error||d.details||''};
  }catch(e){aiState={checkedAt:Date.now(),connected:false,model:'',error:e.message||String(e)}}
  return aiState;
}
function injectAIStatus(){
  if(view!=='accounts')return;
  const toolbar=q('#content .toolbar');if(!toolbar||q('#v21AIStatus'))return;
  const el=document.createElement('div');el.id='v21AIStatus';el.className='notice';el.style.padding='8px 12px';el.textContent='IA financeira: verificando conexão...';
  toolbar.prepend(el);
  checkAI().then(s=>{if(!document.body.contains(el))return;el.textContent=s.connected?`IA financeira conectada${s.model?` • ${s.model}`:''}`:`IA financeira desconectada${s.error?` • ${s.error}`:''}`;el.classList.toggle('danger',!s.connected);el.classList.toggle('ok',!!s.connected);});
}
const previousAccounts=window.accounts||((typeof accounts==='function')?accounts:null);
if(typeof previousAccounts==='function'){
  const wrapped=function(){const out=previousAccounts.apply(this,arguments);setTimeout(injectAIStatus,0);return out;};
  window.accounts=wrapped;try{accounts=wrapped}catch{}
}

window.planning=planning21;try{planning=planning21}catch{}
window.IntegralFinancePlanningV21={revenueSchedule,revenueTotal,revenueInstallment,checkAI,sync:syncPlanning21};
if(view==='planning')setTimeout(planning21,0);if(view==='accounts')setTimeout(injectAIStatus,0);
})();
