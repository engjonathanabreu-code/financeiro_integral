/* Integral Financeiro — Fluxo de Caixa editável
   Permite adicionar Entradas/Saídas e editar qualquer linha exibida.
   Linhas derivadas de outros módulos recebem override apenas no Fluxo,
   preservando o cadastro original e a origem do lançamento. */
(function(){
'use strict';

const uid=()=>typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
const monthOf=d=>String(d||'').slice(0,7);
const nowMonth=()=>new Date().toISOString().slice(0,7);
const isAdmin=()=>user?.role==='Administrador';
const kinds=()=>{
  const list=(db.natures||[]).filter(n=>n.active!==false).map(n=>n.name).filter(Boolean);
  return list.length?list:['Despesa fixa','Despesa variável','Folha e encargos','Retirada e distribuição aos sócios','Tributos','Tarifas bancárias','Receita parcelada de clientes','Receita de contratos públicos','Receita avulsa de contratos privados','Outras receitas'];
};
const kindOptions=selected=>kinds().map(k=>`<option ${k===selected?'selected':''}>${esc(k)}</option>`).join('');

function ensure(){
  db.cashflow=db.cashflow||[];
  db.cashflowOverrides=db.cashflowOverrides||{};
}

function applyOverride(row,key){
  const o=db.cashflowOverrides?.[key];
  return o?{...row,...o,id:row.id,_sourceKey:key,_derived:true}:{...row,_sourceKey:key,_derived:true};
}

function paidRows(){
  return (db.accountPayments||[]).filter(p=>p.status==='Paga').map(p=>{
    const m=(db.accountMasters||[]).find(a=>String(a.id)===String(p.accountId));
    const row={id:`a${p.id}`,date:p.paidAt?.slice(0,10)||p.due,description:m?.name||'Conta paga',kind:m?.category||'Despesa fixa',direction:'Saída',value:+p.value||0,source:'Conta paga'};
    return applyOverride(row,`account:${p.id}`);
  });
}

function budgetRows(){
  return (db.budgetExpenses||[]).map(e=>{
    const row={id:`b${e.id}`,date:e.date,description:e.description,kind:'Despesa variável',direction:'Saída',value:+e.value||0,source:'Orçamento'};
    return applyOverride(row,`budget:${e.id}`);
  });
}

function manualRows(){
  return (db.cashflow||[]).filter(r=>!['Conta paga','Orçamento'].includes(r.source)).map(r=>({...r,_sourceKey:`cash:${r.id}`,_derived:false}));
}

function allRows(){return [...manualRows(),...paidRows(),...budgetRows()]}

function findDisplayed(key){return allRows().find(r=>r._sourceKey===key)}

function saveRow(key,data){
  ensure();
  if(key?.startsWith('cash:')){
    const id=key.slice(5),r=db.cashflow.find(x=>String(x.id)===String(id));
    if(r)Object.assign(r,data);
  }else if(key){
    db.cashflowOverrides[key]={...(db.cashflowOverrides[key]||{}),...data,editedAt:new Date().toISOString(),editedBy:user?.name||''};
  }else{
    db.cashflow.push({id:uid(),...data,source:'Manual',createdAt:new Date().toISOString(),createdBy:user?.name||''});
  }
  save();
}

function editModal(key,direction){
  ensure();
  const r=key?findDisplayed(key):null;
  const fixedDirection=direction||r?.direction||'Entrada';
  const x=v2modal(r?'Editar lançamento':`Nova ${fixedDirection.toLowerCase()}`,`<form id="cashEditForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Data</label><input name="date" type="date" value="${r?.date||new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Tipo</label><select name="direction"><option ${fixedDirection==='Entrada'?'selected':''}>Entrada</option><option ${fixedDirection==='Saída'?'selected':''}>Saída</option></select></div><div class="field full"><label>Descrição</label><input name="description" value="${esc(r?.description||'')}" required></div><div class="field"><label>Natureza</label><select name="kind">${kindOptions(r?.kind||'')}</select></div><div class="field"><label>Valor</label><input name="value" type="number" min="0" step="0.01" value="${r?.value??''}" required></div><div class="field full"><label>Origem</label><input value="${esc(r?.source||'Manual')}" readonly></div>${r?`<div class="full notice">${r._derived?'Esta linha veio de outro módulo. A edição será aplicada somente no Fluxo de Caixa e não modificará o cadastro original.':'Esta linha pode ter sido criada manualmente ou importada. As alterações serão salvas diretamente no lançamento.'}</div>`:''}</div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);
  x.querySelector('#cashEditForm').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target);const value=Math.abs(Number(f.get('value')||0));
    if(!value)return alert('Informe um valor maior que zero.');
    saveRow(key,{date:String(f.get('date')||''),description:String(f.get('description')||'').trim(),kind:String(f.get('kind')||''),direction:String(f.get('direction')||fixedDirection),value});
    x.remove();cashflow();
  };
}

function renderTable(rows){
  return `<div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Data</th><th>Descrição</th><th>Natureza</th><th>Origem</th><th class="num">Valor</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmt(r.date)}</td><td><b>${esc(r.description)}</b>${db.cashflowOverrides?.[r._sourceKey]?'<small class="muted">Ajustado no Fluxo</small>':''}</td><td>${esc(r.kind||'')}</td><td>${esc(r.source||'Manual')}</td><td class="num ${r.direction==='Entrada'?'kpi-positive':'kpi-negative'}">${money(r.value)}</td><td><button class="icon-btn" title="Editar" data-cash-edit="${esc(r._sourceKey)}">✎</button></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Sem lançamentos.</div></td></tr>'}</tbody></table></div>`;
}

function editableCashflow(){
  if(!isAdmin())return documents();
  ensure();title('Fluxo de Caixa');
  const m=v2state?.cashMonth||nowMonth();
  const rs=allRows().filter(r=>monthOf(r.date)===m).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const incoming=rs.filter(r=>r.direction==='Entrada'),outgoing=rs.filter(r=>r.direction==='Saída');
  const iv=incoming.reduce((s,r)=>s+(+r.value||0),0),ov=outgoing.reduce((s,r)=>s+(+r.value||0),0),bal=iv-ov;
  const prev=allRows().filter(r=>monthOf(r.date)<m).reduce((s,r)=>s+(r.direction==='Entrada'?+r.value:-r.value),0);
  const pct=iv?bal/iv*100:0;
  $('#content').innerHTML=`<div class="toolbar"><div>${v2picker(m,'cashEditMonth')}</div><button class="btn" id="v3ImportBank">Importar extrato com IA</button></div><div class="grid cols-4"><div class="card metric"><h3>Entradas</h3><b>${money(iv)}</b></div><div class="card metric"><h3>Saídas</h3><b>${money(ov)}</b></div><div class="card metric"><h3>Saldo</h3><b>${money(bal)}</b><small>${pct.toFixed(1)}% de sobra</small></div><div class="card metric"><h3>Acumulado</h3><b>${money(prev+bal)}</b><small>${money(prev)} mês anterior</small></div></div><div class="toolbar" style="margin-top:18px"><h3 class="section-title cash-in-title" style="margin:0">Entradas</h3><button class="btn small" id="cashAddIn">+ Adicionar entrada</button></div>${renderTable(incoming)}<div class="toolbar" style="margin-top:22px"><h3 class="section-title cash-out-title" style="margin:0">Saídas</h3><button class="btn small" id="cashAddOut">+ Adicionar saída</button></div>${renderTable(outgoing)}`;
  $('#cashEditMonth').onchange=e=>{v2state.cashMonth=e.target.value;editableCashflow()};
  $('#cashAddIn').onclick=()=>editModal(null,'Entrada');
  $('#cashAddOut').onclick=()=>editModal(null,'Saída');
  const imp=$('#v3ImportBank');if(imp)imp.onclick=()=>window.IntegralFinanceAI?.openAiImporter?.();
  $$('[data-cash-edit]').forEach(b=>b.onclick=()=>editModal(b.dataset.cashEdit));
}

cashflow=editableCashflow;
window.cashflow=editableCashflow;
window.IntegralFinanceCashflowEditor={render:editableCashflow,edit:editModal,allRows};
})();
