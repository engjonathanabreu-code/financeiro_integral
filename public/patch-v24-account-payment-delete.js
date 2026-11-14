/* Arquiva um pagamento pelo estado confirmado, preservando seu ID e histórico. */
(function(){
  'use strict';

  const canArchive=()=>{try{return user?.role==='Administrador'}catch{return window.user?.role==='Administrador'}};

  function currentDb(){try{return db}catch{return window.db||null}}

  async function archive(kind, record, payments=null){
    const sb=window.IntegralERP?.sb;
    if(!sb)throw new Error('Conexão com o Supabase indisponível.');
    const {data,error}=await sb.rpc('financeiro_arquivar_conta_pagamento',{
      p_tipo:kind,p_id:String(record.id),p_esperado:record,p_pagamentos:payments,
    });
    if(error)throw error;
    if(data!==true)throw new Error('O servidor não confirmou o arquivamento.');
  }

  async function refresh(){
    const updated=await window.IntegralFinanceCloudStorage?.refresh?.();
    await window.IntegralFinanceIncrementos?.runMirror?.();
    return updated===true;
  }

  function addArchiveAction(row){
    if(!canArchive()||!row||row.dataset.lineDeleteReady==='1')return;
    const payment=(currentDb()?.accountPayments||[]).find(p=>String(p.id)===row.dataset.v2openpay);
    if(!payment||payment.archivedAt)return;
    const expected=structuredClone(payment);
    row.dataset.lineDeleteReady='1';
    row.classList.add('account-payment-line-with-delete');

    const action=document.createElement('span');
    action.className='account-payment-line-delete';
    action.setAttribute('role','button');
    action.setAttribute('tabindex','0');
    action.setAttribute('aria-label','Arquivar somente este pagamento');
    action.textContent='Arquivar';

    let running=false;
    const remove=async event=>{
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if(running||!confirm('Arquivar somente este pagamento? Pagamentos quitados permanecem no histórico.'))return;
      running=true;
      action.textContent='Arquivando…';
      try{
        await archive('pagamento',expected);
        row.closest('.modal-backdrop')?.remove();
        const updated=await refresh();
        if(!updated)alert('Arquivamento confirmado. Atualize a tela para consultar o registro.');
        else if(typeof v2AccountModal==='function')v2AccountModal(expected.accountId);
      }catch(error){
        alert('Não foi possível arquivar: '+(error?.message||'erro de conexão'));
        action.textContent='Arquivar';
      }finally{running=false}
    };

    action.addEventListener('click',remove,true);
    action.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')remove(event)},true);
    row.appendChild(action);
  }

  function scan(root=document){root.querySelectorAll?.('[data-v2openpay]').forEach(addArchiveAction)}
  const observer=new MutationObserver(records=>{
    for(const rec of records)for(const node of rec.addedNodes){
      if(node.nodeType!==1)continue;
      if(node.matches?.('[data-v2openpay]'))addArchiveAction(node);
      scan(node);
    }
  });
  if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>scan());
  else scan();

  const oldPaymentModal=typeof v2PaymentModal==='function'?v2PaymentModal:window.v2PaymentModal;
  if(typeof oldPaymentModal==='function'){
    const wrapped=function(paymentId,accountId){
      const state=currentDb();
      const payment=(state?.accountPayments||[]).find(p=>String(p.id)===String(paymentId));
      const account=(state?.accountMasters||[]).find(a=>String(a.id)===String(payment?.accountId??accountId));
      if(!payment&&account?.archivedAt){alert('A conta está arquivada.');return}
      const result=oldPaymentModal.apply(this,arguments);
      if(payment?.archivedAt){
        const form=[...document.querySelectorAll('.modal-backdrop')].at(-1)?.querySelector('#v2PayForm');
        form?.querySelectorAll('input,select,textarea,button[type="submit"],button:not([type])').forEach(field=>{field.disabled=true});
        const notice=document.createElement('p');
        notice.textContent='Pagamento arquivado. Consulte os dados e o status registrados.';
        form?.prepend(notice);
      }
      return result;
    };
    try{v2PaymentModal=wrapped}catch{}
    window.v2PaymentModal=wrapped;
  }

  window.IntegralFinanceAccountArchive={archive,refresh,canArchive};
})();
