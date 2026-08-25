/* Complemento V21 - preserva cadastro de despesas planejadas */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s);
const uid=()=>Date.now()+Math.floor(Math.random()*10000);
const today=()=>new Date().toISOString().slice(0,10);
const esc21=s=>typeof esc==='function'?esc(String(s??'')):String(s??'');
function close(el){el?.remove();}
function expenseForm(id){
  const r=(db.planExpenses||[]).find(x=>String(x.id)===String(id));
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal"><div class="modal-head"><h3>${r?'Editar despesa planejada':'Nova despesa planejada'}</h3><button class="btn ghost small" type="button" data-close>Fechar</button></div><form id="v21ExpenseForm"><div class="modal-body"><div class="form-section"><h4>Despesa</h4><div class="field"><label>Descrição / origem</label><input name="origin" value="${esc21(r?.origin||r?.name||'')}" required></div></div><div class="form-section"><h4>Valor e recorrência</h4><div class="form-grid"><div class="field"><label>Valor total previsto</label><input name="total" type="number" min="0" step="0.01" value="${Number(r?.total||r?.value||0)||''}" required></div><div class="field"><label>Número de ocorrências</label><input name="installments" type="number" min="1" max="240" value="${Math.max(1,Number(r?.installments||1))}" required></div><div class="field"><label>Primeira data</label><input name="start" type="date" value="${r?.start||today()}" required></div><div class="field"><label>Periodicidade</label><select name="cadence">${['Mensal','Bimestral','Trimestral','Semestral','Anual','Personalizado'].map(v=>`<option ${String(r?.cadence||'Mensal')===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Intervalo personalizado (meses)</label><input name="interval" type="number" min="1" max="60" value="${Math.max(1,Number(r?.interval||1))}"></div></div></div></div><div class="modal-foot">${r?'<button type="button" class="btn danger" id="v21DeleteExpense">Excluir</button>':''}<button class="btn">Salvar despesa</button></div></form></div>`;
  document.body.appendChild(modal);q('[data-close]',modal).onclick=()=>close(modal);modal.addEventListener('click',e=>{if(e.target===modal)close(modal)});
  q('#v21ExpenseForm',modal).onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:r?.id||uid(),origin:String(f.get('origin')||'').trim(),total:Number(f.get('total')||0),installments:Math.max(1,Number(f.get('installments')||1)),start:String(f.get('start')||today()),cadence:String(f.get('cadence')||'Mensal'),interval:Math.max(1,Number(f.get('interval')||1))};db.planExpenses=db.planExpenses||[];if(r)Object.assign(r,o);else db.planExpenses.push(o);save();close(modal);if(typeof planning==='function')planning();};
  const del=q('#v21DeleteExpense',modal);if(del)del.onclick=()=>{if(confirm('Excluir esta despesa planejada?')){db.planExpenses=(db.planExpenses||[]).filter(x=>String(x.id)!==String(r.id));save();close(modal);if(typeof planning==='function')planning();}};
}
document.addEventListener('click',e=>{const b=e.target.closest?.('#v21PlanExpense');if(!b)return;e.preventDefault();e.stopImmediatePropagation();expenseForm();},{capture:true});
window.IntegralFinanceExpenseV21={open:expenseForm};
})();
