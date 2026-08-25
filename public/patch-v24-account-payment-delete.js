/* Integral Financeiro V24 — excluir somente uma linha/pagamento dentro da conta */
(function(){
  'use strict';

  const paymentIdFromRow=row=>row?.dataset?.v2openpay || row?.getAttribute?.('data-v2openpay');

  function currentDb(){
    try{return db;}catch{return window.db||null;}
  }

  function persist(){
    try{
      if(typeof save==='function') return save();
      if(typeof window.save==='function') return window.save();
    }catch(err){console.error('Falha ao salvar exclusão do pagamento:',err);}
  }

  function refreshAccountModal(accountId,modal){
    try{modal?.remove();}catch{}
    setTimeout(()=>{
      try{
        if(typeof v2AccountModal==='function') v2AccountModal(accountId);
        else if(typeof accounts==='function') accounts();
      }catch(err){console.error('Falha ao atualizar conta:',err);}
    },0);
  }

  function addDeleteAction(row){
    if(!row || row.dataset.lineDeleteReady==='1') return;
    const id=paymentIdFromRow(row);
    if(!id) return;
    row.dataset.lineDeleteReady='1';
    row.classList.add('account-payment-line-with-delete');

    const action=document.createElement('span');
    action.className='account-payment-line-delete';
    action.setAttribute('role','button');
    action.setAttribute('tabindex','0');
    action.setAttribute('title','Excluir somente este pagamento');
    action.setAttribute('aria-label','Excluir somente este pagamento');
    action.textContent='Excluir';

    const remove=e=>{
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      const d=currentDb();
      if(!d) return;
      const payment=(d.accountPayments||[]).find(p=>String(p.id)===String(id));
      if(!payment) return;
      if(!confirm('Excluir somente esta linha de pagamento? A conta cadastrada e os demais pagamentos serão mantidos.')) return;
      const accountId=payment.accountId;
      d.accountPayments=(d.accountPayments||[]).filter(p=>String(p.id)!==String(id));
      persist();
      const modal=row.closest('.modal-backdrop');
      refreshAccountModal(accountId,modal);
    };

    action.addEventListener('click',remove,true);
    action.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){remove(e);}},true);
    row.appendChild(action);
  }

  function scan(root=document){
    root.querySelectorAll?.('[data-v2openpay]').forEach(addDeleteAction);
  }

  const observer=new MutationObserver(records=>{
    for(const rec of records){
      for(const node of rec.addedNodes){
        if(node.nodeType!==1) continue;
        if(node.matches?.('[data-v2openpay]')) addDeleteAction(node);
        scan(node);
      }
    }
  });

  if(document.documentElement) observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>scan()); else scan();
})();
