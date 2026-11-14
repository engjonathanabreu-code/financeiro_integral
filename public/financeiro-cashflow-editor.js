/* Integral Financeiro — Fluxo de Caixa editável com agrupamentos de exibição. */
(function(){
'use strict';

const identity=()=>user?.erpId||user?.email||user?.name;
const uid=()=>typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
const monthOf=d=>String(d||'').slice(0,7);
const nowMonth=()=>shared().todayISO().slice(0,7);
const isAdmin=()=>user?.role==='Administrador';
const kinds=()=>{
  const list=(db.natures||[]).filter(n=>n.active!==false).map(n=>n.name).filter(Boolean);
  return list.length?list:['Despesa fixa','Despesa variável','Folha e encargos','Retirada e distribuição aos sócios','Tributos','Tarifas bancárias','Receita parcelada de clientes','Receita de contratos públicos','Receita avulsa de contratos privados','Outras receitas'];
};
const kindOptions=selected=>kinds().map(k=>`<option ${k===selected?'selected':''}>${esc(k)}</option>`).join('');
const normName=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const shared=()=>window.IntegralDREShared;
const cashSort={Entrada:{key:'date',dir:'asc'},Saída:{key:'date',dir:'asc'}};

function ensure(){db.cashflow=db.cashflow||[];db.cashflowOverrides=db.cashflowOverrides||{}}
function expenseFamily(description){const n=normName(description);if(!n)return null;const tariff=/TARIFA|TARIF|BAIXA/.test(n),collection=/COBRANCA|BOLETO|PIX|LIQUIDACAO/.test(n);if(tariff&&collection)return {key:'TARIFAS_COBRANCA_BOLETOS',label:'Tarifas de cobrança e boletos',kind:'Tarifas bancárias'};return null}
function automaticGroupKey(r){const month=monthOf(r.date),name=normName(r.description);if(!month||!name)return null;if(r.direction==='Saída'){const family=expenseFamily(r.description);if(family)return {key:`${month}|SAIDA|${family.key}`,...family};return {key:`${month}|SAIDA|NOME|${name}`,label:r.description,kind:r.kind}}return {key:`${month}|ENTRADA|NOME|${name}`,label:r.description,kind:r.kind}}
function allRows(){return shared().realizedMovements(db)}
function displayRows(){return shared().registeredMovements(db)}
function editableRows(){return shared().cashMovements(db)}
function groupsHtml(rows){
  const groups=new Map();
  for(const row of rows){
    const manual=db.cashflowOverrides?.[row._sourceKey]?.displayGroup;
    const group=manual?{key:`manual:${manual}`,label:'Agrupamento manual',manual}:shared().imported(row)?automaticGroupKey(row):null;
    if(!group)continue;
    if(!groups.has(group.key))groups.set(group.key,{label:group.label,manual:group.manual,rows:[]});
    groups.get(group.key).rows.push(row);
  }
  const visible=[...groups.values()].filter(group=>group.rows.length>1);
  if(!visible.length)return '';
  return `<details class="notice"><summary>Agrupamentos do extrato e manuais</summary>${visible.map(group=>
    `<details><summary>${esc(group.label)} · ${esc(group.rows[0].direction)} · ${group.rows.length} lançamentos · ${money(shared().sumMoney(group.rows))}</summary>
    <ul>${group.rows.map(row=>`<li>${fmt(row.date)} · ${esc(row.description)} · ${esc(row.reference||'')} · ${money(row.value)}</li>`).join('')}</ul>
    ${group.manual?`<button type="button" class="btn ghost small" data-cash-ungroup="${esc(group.manual)}">Desfazer agrupamento</button>`:''}</details>`
  ).join('')}</details>`;
}
function findDisplayed(key){return editableRows().find(r=>r._sourceKey===key)}
function unambiguous(key){
  return !key?.startsWith('cash:')||(db.cashflow||[]).filter(row=>String(row.id)===key.slice(5)).length===1;
}

function setDisplayGroup(key,group){
  db.cashflowOverrides[key]={...db.cashflowOverrides[key],displayGroup:group};
}

function mergeByKeys(targetKey,sourceKey){
  const eligible=key=>key?.startsWith('cash:')&&unambiguous(key);
  if(targetKey===sourceKey||!eligible(targetKey)||!eligible(sourceKey))return;
  const target=findDisplayed(targetKey),source=findDisplayed(sourceKey);
  if(!target||!source||target.direction!==source.direction||monthOf(target.date)!==monthOf(source.date))return;
  if(!confirm(`Agrupar “${source.description}” e “${target.description}” na exibição do Fluxo de Caixa?`))return;
  ensure();
  const targetGroup=db.cashflowOverrides[targetKey]?.displayGroup;
  const sourceGroup=db.cashflowOverrides[sourceKey]?.displayGroup;
  const group=targetGroup||sourceGroup||`cash-group:${uid()}`;
  if(sourceGroup&&sourceGroup!==group){
    for(const [key,override] of Object.entries(db.cashflowOverrides)){
      if(override.displayGroup===sourceGroup)setDisplayGroup(key,group);
    }
  }
  setDisplayGroup(targetKey,group);
  setDisplayGroup(sourceKey,group);
  save();
  editableCashflow();
}

function bindGroups(){
  let dragging;
  $$('[data-cash-drag]').forEach(row=>{
    row.draggable=true;
    row.ondragstart=event=>{
      dragging=row.dataset.cashDrag;
      event.dataTransfer.setData('text/plain',dragging);
      event.dataTransfer.effectAllowed='move';
    };
    row.ondragover=event=>{if(dragging&&dragging!==row.dataset.cashDrag)event.preventDefault()};
    row.ondragend=()=>{dragging=null};
    row.ondrop=event=>{
      event.preventDefault();
      mergeByKeys(row.dataset.cashDrag,dragging);
      dragging=null;
    };
  });
  $$('[data-cash-ungroup]').forEach(button=>button.onclick=()=>{
    for(const [key,override] of Object.entries(db.cashflowOverrides||{})){
      if(override.displayGroup===button.dataset.cashUngroup)setDisplayGroup(key,null);
    }
    save();
    editableCashflow();
  });
}
function saveRow(key,data){
  ensure();
  if(key?.startsWith('cash:')){
    const candidates=db.cashflow.filter(r=>String(r.id)===key.slice(5));
    if(candidates.length!==1)return false;
    const [row]=candidates;
    if(shared().imported(row)){
      db.cashflowOverrides[key]={...db.cashflowOverrides[key],display:data,editedAt:new Date().toISOString(),editedBy:user?.name||''};
    }else Object.assign(row,data);
  }else if(key){
    db.cashflowOverrides[key]={...db.cashflowOverrides[key],...data,editedAt:new Date().toISOString(),editedBy:user?.name||''};
  }else{
    db.cashflow.push({id:uid(),...data,source:'Manual',createdAt:new Date().toISOString(),createdBy:user?.name||''});
  }
  save();
  return true;
}
function reconciliationOptions(row){
  if(!shared().imported(row)||row.mergedItems?.length)return '';
  const original=row._bankEvidence||row;
  const matches=editableRows().filter(candidate=>candidate._derived
    &&shared().dateKey(candidate.date)===shared().dateKey(original.date)
    &&candidate.direction===original.direction&&shared().cents(candidate.value)===shared().cents(original.value));
  const linked=shared().referenceKey(row);
  if(!matches.length&&!linked&&original.direction!=='Entrada')return '';
  let options=matches.map(candidate=>`<option value="${esc(candidate._sourceKey)}" ${linked===candidate._sourceKey?'selected':''}>${esc(candidate.description)} · ${esc(candidate.source)} · ${esc(candidate._sourceKey)}</option>`).join('');
  if(linked&&!linked.startsWith('receivable:')&&!matches.some(candidate=>candidate._sourceKey===linked)){
    options+=`<option value="${esc(linked)}" selected>Referência registrada · ${esc(linked)}</option>`;
  }
  const parcelInput=original.direction==='Entrada'?`<div class="field full"><label for="cash-receivable-id">ID da parcela em Recebimentos</label>
    <input id="cash-receivable-id" name="receivableParcelId" value="${esc(linked.startsWith('receivable:')?linked.slice(11):'')}" autocapitalize="off" spellcheck="false">
    <small>Informe o ID para vincular a uma baixa com a mesma data e valor do extrato.</small></div>`:'';
  return `${parcelInput}${matches.length||linked&&!linked.startsWith('receivable:')?`<div class="field full"><label>Conciliar com lançamento de origem</label>
    <select name="reconciledTo"><option value="">Pendente de conciliação</option>${options}</select>
    <small>Confirme que o lançamento e o extrato representam o mesmo movimento.</small></div>`:''}`;
}
async function confirmReconciliation(key,targetKey,data){
  const row=findDisplayed(key);
  if(!row||!shared().imported(row))return false;
  if(!targetKey||targetKey===shared().referenceKey(row))return true;
  const original=row._bankEvidence||row;
  if(shared().dateKey(original.date)!==data.date||original.direction!==data.direction
    ||Math.abs(shared().cents(original.value))!==shared().cents(data.value))return false;
  const linked=displayRows().some(item=>item._sourceKey!==key&&shared().referenceKey(item)===targetKey);
  if(linked)return false;
  if(targetKey.startsWith('receivable:')){
    const id=targetKey.slice(11);
    const client=window.IntegralERP?.sb;
    if(!client||!(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i).test(id))return false;
    const {data:parcel,error}=await client.from('fin_receb_parcelas')
      .select('id,ativo,status,pago_em,valor_liquidado').eq('id',id).maybeSingle();
    if(error)throw Error('Não foi possível conferir a parcela em Recebimentos.');
    return data.direction==='Entrada'&&parcel?.ativo!==false&&parcel?.pago_em===data.date
      &&(shared().settled(parcel.status)||shared().norm(parcel.status)==='PARCIAL')
      &&shared().cents(parcel.valor_liquidado)===shared().cents(data.value);
  }
  const target=findDisplayed(targetKey);
  return target?._derived&&shared().dateKey(target.date)===data.date&&target.direction===data.direction
    &&shared().cents(target.value)===shared().cents(data.value);
}
function editModal(key,direction){ensure();const r=key?findDisplayed(key):null,fixedDirection=direction||r?.direction||'Entrada',x=v2modal(r?'Editar lançamento':`Nova ${fixedDirection.toLowerCase()}`,`<form id="cashEditForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Data</label><input name="date" type="date" value="${r?.date||new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Tipo</label><select name="direction"><option ${fixedDirection==='Entrada'?'selected':''}>Entrada</option><option ${fixedDirection==='Saída'?'selected':''}>Saída</option></select></div><div class="field full"><label>Descrição</label><input name="description" value="${esc(r?.description||'')}" required></div><div class="field"><label>Natureza</label><select name="kind">${kindOptions(r?.kind||'')}</select></div><div class="field"><label>Valor</label><input name="value" type="number" min="0" step="0.01" value="${r?.value??''}" required></div><div class="field full"><label>Origem</label><input value="${esc(r?.source||'Manual')}" readonly></div>${r?reconciliationOptions(r):''}${r?.mergedCount>1?`<div class="full notice"><b>${r.mergedCount} lançamentos consolidados.</b> O total pode ser editado, mas o detalhamento original permanece registrado internamente.</div>`:''}${r?`<div class="full notice">${r._derived?'Esta linha veio de outro módulo. A edição será aplicada somente no Fluxo de Caixa e não modificará o cadastro original.':shared().imported(r)?'As alterações ficam no ajuste do Fluxo de Caixa. O movimento original do extrato é preservado.':'As alterações serão salvas no lançamento manual.'}</div>`:''}</div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);x.querySelector('#cashEditForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),value=Math.abs(Number(f.get('value')||0));if(!Number.isFinite(value))return alert('Informe um valor válido.');const data={date:String(f.get('date')||''),description:String(f.get('description')||'').trim(),kind:String(f.get('kind')||''),direction:String(f.get('direction')||fixedDirection),value};const targetKey=String(f.get('receivableParcelId')||'').trim().toLowerCase();
  const reconcile=f.has('reconciledTo')||f.has('receivableParcelId');
  const requestedLink=targetKey?`receivable:${targetKey}`:String(f.get('reconciledTo')||'');
  const originalActor=identity(),button=x.querySelector('button.btn');
  if(button?.disabled)return;
  if(button)button.disabled=true;
  try{
    if(reconcile){
      const allowed=await confirmReconciliation(key,requestedLink,data);
      if(identity()!==originalActor||!isAdmin()||!x.isConnected)return;
      if(!allowed)return alert('O vínculo já está em uso ou a identidade, data ou valor não conferem.');
      const row=findDisplayed(key);
      if(!row||!unambiguous(key))return alert('O lançamento mudou. Abra novamente para conferir.');
      const taken=displayRows().some(item=>item._sourceKey!==key&&requestedLink&&shared().referenceKey(item)===requestedLink);
      if(taken&&requestedLink!==shared().referenceKey(row))return alert('O vínculo mudou. Abra novamente para conferir.');
      if(requestedLink!==shared().referenceKey(row)){
        ensure();
        db.cashflowOverrides[key]={...db.cashflowOverrides[key],reconciledTo:requestedLink||null};
      }
    }
    if(!saveRow(key,data))return alert('Há mais de um lançamento com este identificador. Confira o registro antes de salvar.');
    x.remove();
    editableCashflow();
  }catch(error){alert(error.message||'Não foi possível salvar o ajuste.')}
  finally{if(button)button.disabled=false}
}}

function sortRows(rows,direction){const cfg=cashSort[direction]||cashSort.Entrada,key=cfg.key,m=cfg.dir==='asc'?1:-1;return [...rows].sort((a,b)=>{if(key==='value')return ((+a.value||0)-(+b.value||0))*m;if(key==='date')return String(a.date||'').localeCompare(String(b.date||''))*m;const map={description:'description',kind:'kind',source:'source'},f=map[key]||key;return String(a[f]||'').localeCompare(String(b[f]||''),'pt-BR',{sensitivity:'base',numeric:true})*m})}
function sortHead(label,key,direction,cls=''){const cfg=cashSort[direction],mark=cfg.key===key?(cfg.dir==='asc'?' ▲':' ▼'):'';return `<th class="${cls}" data-cash-sort="${key}" data-cash-sort-direction="${direction}" style="cursor:pointer;user-select:none" title="Ordenar por ${label}">${label}${mark}</th>`}
function renderTable(rows,direction){
  const sorted=sortRows(rows,direction),parentButtons=new Set();
  const lines=sorted.map(row=>{
    let actions=`<button type="button" class="icon-btn" title="Editar" data-cash-edit="${esc(row._sourceKey)}">✎</button>`;
    if(row._historicalPart){
      actions='<small class="muted">Parte de agrupamento anterior</small>';
      if(!parentButtons.has(row._parentKey)){
        actions+=`<button type="button" class="icon-btn" title="Ajustar agrupamento anterior" data-cash-edit="${esc(row._parentKey)}">✎</button>`;
        parentButtons.add(row._parentKey);
      }
    }
    const original=row.mergedItems?.length?`<details><summary>${row.mergedItems.length} movimentos originais</summary><ul>${row.mergedItems.map(item=>`<li>${fmt(item.date)} · ${esc(item.description||'')} · ${esc(item.reference||'')} · ${money(item.value)}</li>`).join('')}</ul></details>`:'';
    const flags=[
      row._bankIdentityDivergent?'Identidade bancária divergente. Confira o extrato.':'',
      row._reconciliationDivergent?'O vínculo bancário precisa de conferência.':'',
      db.cashflowOverrides?.[row._sourceKey]?.display?'Ajustado no Fluxo':'',
      shared().referenceKey(row)?`Vínculo: ${shared().referenceKey(row)}`:''
    ].filter(Boolean).map(flag=>`<small class="muted">${esc(flag)}</small>`).join('');
    return `<tr ${row._historicalPart?'':`data-cash-drag="${esc(row._sourceKey)}"`}>
      <td>${fmt(row.date)}</td><td><b>${esc(row.description||'')}</b>${flags}${original}</td><td>${esc(row.kind||'')}</td>
      <td>${esc(row.source||'Manual')}${row.reference?`<small class="muted">${esc(row.reference)}</small>`:''}</td>
      <td class="num ${row.direction==='Entrada'?'kpi-positive':'kpi-negative'}">${money(row.value)}</td><td>${actions}</td>
    </tr>`;
  });
  return `<div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr>${sortHead('Data','date',direction)}${sortHead('Descrição','description',direction)}${sortHead('Natureza','kind',direction)}${sortHead('Origem','source',direction)}${sortHead('Valor','value',direction,'num')}<th></th></tr></thead>
    <tbody>${lines.join('')||'<tr><td colspan="6"><div class="empty">Sem lançamentos.</div></td></tr>'}</tbody></table></div>`;
}
function bindSort(){$$('[data-cash-sort]').forEach(h=>h.onclick=()=>{const direction=h.dataset.cashSortDirection,key=h.dataset.cashSort,cfg=cashSort[direction];cashSort[direction]={key,dir:cfg.key===key&&cfg.dir==='asc'?'desc':'asc'};editableCashflow()})}
function editableCashflow(){if(!isAdmin())return documents();title('Fluxo de Caixa');const registered=displayRows(),today=shared().todayISO(),rows=registered.filter(r=>r.date<=today),m=v2state?.cashMonth||nowMonth(),rs=rows.filter(r=>monthOf(r.date)===m),future=registered.filter(r=>monthOf(r.date)===m&&r.date>today),incoming=rs.filter(r=>r.direction==='Entrada'),outgoing=rs.filter(r=>r.direction==='Saída'),iv=shared().sumMoney(incoming),ov=shared().sumMoney(outgoing),bal=(shared().cents(iv)-shared().cents(ov))/100,prev=rows.filter(r=>monthOf(r.date)<m).reduce((s,r)=>s+(r.direction==='Entrada'?1:-1)*shared().cents(r.value),0)/100,pct=iv?bal/iv*100:0;$('#content').innerHTML=`<div class="toolbar"><div>${v2picker(m,'cashEditMonth')}</div><button class="btn" id="v3ImportBank">Importar extrato com IA</button></div><div class="grid cols-4"><div class="card metric"><h3>Entradas</h3><b>${money(iv)}</b></div><div class="card metric"><h3>Saídas</h3><b>${money(ov)}</b></div><div class="card metric"><h3>Saldo</h3><b>${money(bal)}</b><small>${pct.toFixed(1)}% de sobra</small></div><div class="card metric"><h3>Acumulado</h3><b>${money((shared().cents(prev)+shared().cents(bal))/100)}</b><small>${money(prev)} mês anterior</small></div></div><div class="notice" style="margin-top:14px">Movimentos de extrato, lançamentos manuais, contas baixadas e despesas de orçamento. Valores vinculados ao mesmo movimento de extrato são contados uma vez. Arraste uma linha sobre outra do mesmo mês e tipo para agrupá-las na exibição. Os lançamentos futuros aparecem abaixo.</div>${groupsHtml(rs)}<div class="toolbar" style="margin-top:18px"><h3 class="section-title cash-in-title" style="margin:0">Entradas</h3><button class="btn small" id="cashAddIn">+ Adicionar entrada</button></div>${renderTable(incoming,'Entrada')}<div class="toolbar" style="margin-top:22px"><h3 class="section-title cash-out-title" style="margin:0">Saídas</h3><button class="btn small" id="cashAddOut">+ Adicionar saída</button></div>${renderTable(outgoing,'Saída')}${future.length?`<details class="notice"><summary>Lançamentos futuros do mês</summary>${renderTable(future.filter(r=>r.direction==='Entrada'),'Entrada')}${renderTable(future.filter(r=>r.direction==='Saída'),'Saída')}</details>`:''}`;$('#cashEditMonth').onchange=e=>{v2state.cashMonth=e.target.value;editableCashflow()};$('#cashAddIn').onclick=()=>editModal(null,'Entrada');$('#cashAddOut').onclick=()=>editModal(null,'Saída');const imp=$('#v3ImportBank');if(imp)imp.onclick=()=>window.IntegralFinanceAI?.openAiImporter?.();$$('[data-cash-edit]').forEach(b=>b.onclick=()=>editModal(b.dataset.cashEdit));bindSort();bindGroups()}
cashflow=editableCashflow;window.cashflow=editableCashflow;window.IntegralFinanceCashflowEditor={render:editableCashflow,edit:editModal,allRows,displayRows,mergeByKeys};
})();
