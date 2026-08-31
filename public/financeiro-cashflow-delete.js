/* Integral Financeiro — exclusão explícita de lançamentos do Fluxo de Caixa */
(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
function rowByKey(key){try{return window.IntegralFinanceCashflowEditor?.allRows?.().find(r=>r._sourceKey===key)||null}catch{return null}}
function removeManual(key,row){
  const id=String(key||'').slice(5);
  const msg=`Excluir “${row?.description||'este lançamento'}” do Fluxo de Caixa?`;
  if(!confirm(msg))return;
  db.cashflow=(db.cashflow||[]).filter(r=>String(r.id)!==id);
  if(db.cashflowOverrides)delete db.cashflowOverrides[key];
  save();
  window.IntegralFinanceCashflowEditor?.render?.();
}
function explainDerived(row){
  alert(`Este lançamento vem de ${row?.source||'outro módulo'}. Para evitar apagar dados de origem, ele não é excluído diretamente por esta lixeira. Você pode editar a linha no Fluxo sem alterar o cadastro original.`);
}
function del(key){
  const row=rowByKey(key);if(!row)return;
  if(String(key).startsWith('cash:'))return removeManual(key,row);
  explainDerived(row);
}
function install(){
  if((document.querySelector('#title')?.textContent||'').trim()!=='Fluxo de Caixa')return;
  $$('[data-cash-drag]').forEach(tr=>{
    const key=tr.dataset.cashDrag;if(!key||tr.querySelector('[data-cash-delete]'))return;
    const edit=tr.querySelector('[data-cash-edit]');
    const cell=edit?.closest('td')||tr.lastElementChild;if(!cell)return;
    cell.style.whiteSpace='nowrap';
    const b=document.createElement('button');
    b.className='icon-btn';b.dataset.cashDelete=key;b.title='Excluir';b.setAttribute('aria-label','Excluir lançamento');b.textContent='🗑';b.style.marginLeft='6px';
    b.onclick=e=>{e.preventDefault();e.stopPropagation();del(key)};
    cell.appendChild(b);
  });
}
let timer;const schedule=()=>{clearTimeout(timer);timer=setTimeout(install,60)};
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('load',schedule);setTimeout(schedule,400);
window.IntegralFinanceCashflowDelete={install,delete:del};
})();