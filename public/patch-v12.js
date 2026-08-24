/* Integral Financeiro V12 - entradas ERP condensadas por fonte */
(function(){
'use strict';
const moneySafe=v=>money(Number(v||0));
const groupERP=()=>{
  const map=new Map();
  (db.erpPlannedRevenues||[]).forEach(r=>{
    const key=String(r.projectId||r.project||'erp');
    if(!map.has(key))map.set(key,{key,source:r.project||'Projeto ERP',rows:[],total:0});
    const g=map.get(key);g.rows.push(r);g.total+=Number(r.remaining||0);
  });
  return [...map.values()].sort((a,b)=>a.source.localeCompare(b.source,'pt-BR'));
};
function detail(group){
  const rows=[...group.rows].sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')));
  v2modal(`Entradas previstas • ${esc(group.source)}`,`<div class="modal-body"><div class="card metric mini erp-source-total"><h3>Total em aberto</h3><b>${moneySafe(group.total)}</b><small>${rows.length} parcela(s)/etapa(s) prevista(s)</small></div><div class="table-wrap"><table class="table"><thead><tr><th>Parcela / etapa</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Saldo a entrar</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.origin||'Recebimento')}</b></td><td>${r.dueDate?fmt(r.dueDate):'—'}</td><td>${moneySafe(r.total)}</td><td>${moneySafe(r.received)}</td><td><b>${moneySafe(r.remaining)}</b></td></tr>`).join('')||'<tr><td colspan="5">Nenhuma parcela em aberto.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);
}
function decorate(){
  if(view!=='planning')return;
  const sections=[...document.querySelectorAll('#content section.card')];
  const target=sections.find(s=>s.querySelector('.section-head h3')?.textContent.trim()==='Entradas previstas do ERP');
  if(!target)return;
  const groups=groupERP();
  target.innerHTML=`<div class="section-head"><div><h3>Entradas previstas do ERP</h3><div class="muted">Condensadas por fonte. Clique para ver cada parcela e vencimento.</div></div></div><div class="erp-source-list">${groups.map((g,i)=>`<button class="erp-source-row" data-erp-source="${i}"><span><b>${esc(g.source)}</b><small>${g.rows.length} parcela(s) em aberto</small></span><strong>${moneySafe(g.total)}</strong><span class="erp-source-chevron">›</span></button>`).join('')||'<div class="empty">Nenhuma entrada prevista no ERP.</div>'}</div>`;
  target.querySelectorAll('[data-erp-source]').forEach(b=>b.onclick=()=>detail(groups[Number(b.dataset.erpSource)]));
}
const basePlanning=planning;
planning=function(){const r=basePlanning();setTimeout(decorate,0);return r;};
window.addEventListener('integral:erp-planning-synced',()=>{if(view==='planning')setTimeout(decorate,0)});
})();
