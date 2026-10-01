(function(){
'use strict';
const q=s=>document.querySelector(s),adm=()=>typeof user!=='undefined'&&user?.role==='Administrador';
const closed=b=>b?.status==='Fechado';
async function closeBudget(b,button){
 if(!adm()||closed(b))return;
 if(!confirm(`Fechar o orçamento "${b.name}"? Ele será mantido em Orçamentos fechados, com gastos e histórico para consulta.`))return;
 button.disabled=true;
 try{
  const storage=window.IntegralFinanceCloudStorage;if(!storage?.closeBudget)throw Error('Entre novamente para fechar o orçamento com segurança.');
  const result=await storage.closeBudget(b);
  budgets();
  if(result.conflicts)alert('Orçamento fechado. Há edições simultâneas que precisam de revisão; as duas versões foram preservadas e o envio automático de orçamentos foi interrompido. Mantenha esta tela aberta e solicite suporte.');
  else if(result.changedDuringClose)alert('Orçamento fechado. As alterações feitas durante o encerramento foram preservadas; confira o histórico.');
 }catch(e){alert('Não foi possível fechar: '+e.message)}finally{button.disabled=false}
}
function enhanceDetail(b){
 const add=q('#v9AddExpense');if(!add)return;
 if(closed(b)){
  const note=document.createElement('p');note.className='notice';note.textContent=`Orçamento fechado em ${b.closedAt?new Date(b.closedAt).toLocaleString('pt-BR'):'data não informada'}. Histórico preservado para consulta.`;add.closest('.toolbar').after(note);
  // Closed records remain consultable; do not expose modification shortcuts.
  q('#v9BudgetEdit')?.remove();add.remove();document.querySelectorAll('[data-v9-exp-edit],[data-v9-exp-del],[data-assigned-exp-edit]').forEach(x=>x.remove());return;
 }
 if(adm()){
  const btn=document.createElement('button');btn.className='btn ghost';btn.id='finCloseBudget';btn.textContent='Fechar orçamento';btn.onclick=()=>closeBudget(b,btn);add.before(btn);
 }
}
const base=budgets;
budgets=function(){
 const result=base.apply(this,arguments),content=q('#content');if(!content)return result;
 const cards=[...content.querySelectorAll('[data-v9-budget]')];
 const section=document.createElement('section');section.id='finClosedBudgets';section.innerHTML='<h3 class="section-title">Orçamentos fechados</h3><div class="grid cols-2 responsive-cards"></div>';
 const target=section.querySelector('.grid');let n=0;
 for(const card of cards){const b=(db.budgetRecords||[]).find(b=>String(b.id)===card.dataset.v9Budget);if(closed(b)){target.append(card);n++}}
 const count=content.querySelector('.toolbar b');if(count)count.textContent=String(cards.length-n);
 if(!n)target.innerHTML='<p class="empty">Nenhum orçamento fechado disponível para consulta.</p>';
 if(cards.length===n&&n){const empty=document.createElement('p');empty.className='empty';empty.textContent='Nenhum orçamento em aberto.';content.querySelector('.grid')?.append(empty)}
 content.append(section);return result;
};window.budgets=budgets;
window.IntegralBudgetLifecycle={closed,close:closeBudget,enhanceDetail};
})();
