/* Organização de leitura: conserva os cards e as ações autorizadas do renderer existente. */
(function(){
'use strict';
const text=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const number=value=>Number.isFinite(Number(value))?Number(value):0;
function project(record,spent){
 const limit=number(record.limit),used=number(spent),closed=record.status==='Fechado';
 // Presentation only: compare cents, without changing the recorded amounts or refunds.
 const limitCents=Math.round(limit*100),usedCents=Math.round(used*100);
 return {record,limit,spent:used,available:limit-used,closed,
  consumption:limitCents<=0?'without-limit':usedCents>limitCents?'exceeded':usedCents===limitCents?'at-limit':'available'};
}
function matches(item,filters){
 const b=item.record;
 return (!filters.search||text([b.name,b.sector,b.erpPlan].join(' ')).includes(text(filters.search).trim()))&&
  (!filters.sector||b.sector===filters.sector)&&
  (filters.scope==='all'||(filters.scope==='closed')===item.closed)&&
  (!filters.consumption||item.consumption===filters.consumption);
}
const labels={'without-limit':'Sem limite positivo',exceeded:'Acima do limite','at-limit':'Limite atingido',available:'Saldo disponível'};
function visibleItems(records,expenses,visibleIds){
 const ids=new Set(visibleIds.map(String)),sums=new Map();
 for(const e of expenses){const id=String(e.budgetId);if(ids.has(id))sums.set(id,(sums.get(id)||0)+number(e.value));}
 return new Map(records.filter(b=>ids.has(String(b.id))).map(b=>[String(b.id),project(b,sums.get(String(b.id))||0)]));
}
const helpers={project,matches,labels,visibleItems};
if(typeof module!=='undefined'&&module.exports){module.exports=helpers;return;}
let actor=null,criteria;
const defaults=()=>({search:'',scope:'all',sector:'',consumption:''});
const base=budgets;
budgets=function(){
 const result=base.apply(this,arguments),content=document.querySelector('#content');
 if(!content||!user)return result;
 // Only decorate records already made visible by the original authorization renderer.
 const identity=JSON.stringify([user.erpId||user.id||user.email||user.name,user.role,user.sector]);
 if(identity!==actor){actor=identity;criteria=defaults();}
 const cards=[...content.querySelectorAll('[data-v9-budget]')];
 const items=visibleItems(db.budgetRecords||[],db.budgetExpenses||[],cards.map(card=>card.dataset.v9Budget));
 const rows=cards.map(card=>({card,item:items.get(String(card.dataset.v9Budget))})).filter(row=>row.item);
 const sectors=[...new Set(rows.map(({item})=>item.record.sector).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
 if(criteria.sector&&!sectors.includes(criteria.sector))criteria.sector='';
 const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const panel=document.createElement('section');panel.className='budget-organization';
 panel.innerHTML=`<form class="card budget-filters" aria-label="Filtros dos orçamentos">
 <label>Pesquisar orçamentos<input name="search" type="search" maxlength="300" placeholder="Nome, setor ou plano de trabalho" value="${E(criteria.search)}"></label>
 <label>Situação<select name="scope"><option value="all">Abertos e fechados</option><option value="open">Em aberto</option><option value="closed">Fechados</option></select></label>
 <label>Setor<select name="sector"><option value="">Todos os setores visíveis</option>${sectors.map(s=>`<option value="${E(s)}">${E(s)}</option>`).join('')}</select></label>
 <label>Consumo<select name="consumption"><option value="">Todos</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label>
 <button type="button" class="btn ghost" data-clear>Limpar filtros</button></form>
 <div class="budget-summary-metrics" data-summary aria-live="polite"></div>
 <p class="muted">Valores de todos os gastos registrados, como no detalhe do orçamento. Fechados são apenas consulta; nenhuma aprovação ou movimentação é executada aqui.</p>
 <p class="empty card" data-empty hidden>Nenhum orçamento corresponde aos filtros. Limpe os filtros para rever seus orçamentos.</p>`;
 content.querySelector('.toolbar')?.after(panel);
 const form=panel.querySelector('form');
 for(const key of Object.keys(criteria))form.elements.namedItem(key).value=criteria[key];
 for(const {card,item} of rows){
  const status=document.createElement('span');status.className='badge budget-reading-status';
  status.textContent=item.closed?'Fechado · consulta':labels[item.consumption];
  card.append(status);
  // The existing card is already a keyboard/touch-accessible action; don't duplicate it in a menu.
  card.setAttribute('aria-label',`${item.record.name||'Orçamento'}: ${status.textContent}. Abrir detalhes e histórico`);
 }
 function apply(){
  const visible=rows.filter(({item})=>matches(item,criteria)),visibleCards=new Set(visible.map(row=>row.card));
  for(const row of rows)row.card.hidden=!visibleCards.has(row.card);
  const closed=content.querySelector('#finClosedBudgets');
  if(closed)closed.hidden=!visible.some(({item})=>item.closed);
  // Suppress the base empty notices when filters have their own empty state.
  for(const empty of content.querySelectorAll(':scope > .grid > .empty'))empty.hidden=rows.length>0;
  panel.querySelector('[data-empty]').hidden=visible.length>0||rows.length===0;
  const count=content.querySelector(':scope > .toolbar > div');
  if(count)count.textContent=`${visible.length} orçamento(s) no recorte de ${rows.length} disponível(is)`;
  const totals=visible.reduce((s,{item:i})=>({limit:s.limit+i.limit,spent:s.spent+i.spent,attention:s.attention+(!i.closed&&['exceeded','at-limit'].includes(i.consumption)?1:0)}),{limit:0,spent:0,attention:0});
  panel.querySelector('[data-summary]').innerHTML=`<div class="card"><small>Neste recorte</small><strong>${visible.length} orçamento(s)</strong></div><div class="card"><small>Limite total</small><strong>${E(money(totals.limit))}</strong></div><div class="card"><small>Gastos registrados</small><strong>${E(money(totals.spent))}</strong></div><div class="card"><small>Em aberto no limite ou acima</small><strong>${totals.attention}</strong></div>`;
 }
 form.onsubmit=e=>e.preventDefault();
 const update=()=>{for(const key of Object.keys(criteria))criteria[key]=form.elements.namedItem(key).value;apply();};
 form.addEventListener('input',update);form.addEventListener('change',update);
 panel.querySelector('[data-clear]').onclick=()=>{criteria=defaults();for(const key of Object.keys(criteria))form.elements.namedItem(key).value=criteria[key];apply();form.elements.namedItem('search').focus();};
 apply();return result;
};window.budgets=budgets;
})();
