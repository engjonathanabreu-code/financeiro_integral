/* Integral Financeiro V25 — exclusão segura de conta completa */
(function(){
  'use strict';

  const oldModal = typeof v2AccountModal === 'function' ? v2AccountModal : window.v2AccountModal;
  if (typeof oldModal !== 'function') return;

  const sameId = (a,b)=>String(a)===String(b);
  const getDb = ()=>{ try { return db; } catch { return window.db || null; } };
  const getSb = ()=>window.IntegralERP?.sb || null;

  async function deleteCloudAccount(accountId){
    const sb=getSb();
    if(!sb) throw new Error('Conexão com o Supabase indisponível.');
    const {data:{session},error:sessionError}=await sb.auth.getSession();
    if(sessionError) throw sessionError;
    if(!session) throw new Error('Sessão expirada. Entre novamente no sistema.');

    const paymentDelete=await sb.from('financeiro_pagamentos').delete().eq('conta_id',String(accountId));
    if(paymentDelete.error) throw paymentDelete.error;

    const accountDelete=await sb.from('financeiro_contas').delete().eq('id',String(accountId));
    if(accountDelete.error) throw accountDelete.error;
  }

  async function removeAccount(accountId, modal, button){
    const d=getDb();
    const account=(d?.accountMasters||[]).find(a=>sameId(a.id,accountId));
    if(!d||!account) return;
    const payments=(d.accountPayments||[]).filter(p=>sameId(p.accountId,accountId));
    const suffix=payments.length===1?'1 pagamento vinculado':`${payments.length} pagamentos vinculados`;
    if(!confirm(`Excluir a conta “${account.name||'Conta'}” e ${suffix}?\n\nEssa ação remove a conta e todos os pagamentos vinculados a ela.`)) return;

    const oldText=button.textContent;
    button.disabled=true;
    button.textContent='Excluindo...';
    try{
      await deleteCloudAccount(accountId);
      d.accountPayments=(d.accountPayments||[]).filter(p=>!sameId(p.accountId,accountId));
      d.accountMasters=(d.accountMasters||[]).filter(a=>!sameId(a.id,accountId));
      if(typeof save==='function') save(); else if(typeof window.save==='function') window.save();
      try{ await window.IntegralFinanceCloudStorage?.syncNow?.(); }catch{}
      modal?.remove();
      if(typeof accounts==='function') accounts(); else if(typeof window.accounts==='function') window.accounts();
    }catch(err){
      console.error('Falha ao excluir conta:',err);
      alert(`Não foi possível excluir a conta: ${err?.message||err}`);
      button.disabled=false;
      button.textContent=oldText;
    }
  }

  function decorateModal(accountId){
    if(accountId===undefined||accountId===null) return;
    requestAnimationFrame(()=>{
      const modals=[...document.querySelectorAll('.modal-backdrop')];
      const backdrop=modals.at(-1);
      if(!backdrop) return;
      const form=backdrop.querySelector('#v2AccountForm');
      const foot=form?.querySelector('.modal-foot');
      if(!form||!foot||foot.querySelector('[data-delete-account]')) return;
      const saveButton=foot.querySelector('button:not([type="button"])') || foot.querySelector('.btn:last-child');
      const del=document.createElement('button');
      del.type='button';
      del.className='btn danger';
      del.dataset.deleteAccount=String(accountId);
      del.textContent='Excluir conta';
      del.style.marginRight='auto';
      del.addEventListener('click',()=>removeAccount(accountId,backdrop,del));
      if(saveButton) foot.insertBefore(del,saveButton); else foot.prepend(del);
    });
  }

  const wrapped=function(id){
    const result=oldModal.apply(this,arguments);
    decorateModal(id);
    return result;
  };

  try{ v2AccountModal=wrapped; }catch{}
  window.v2AccountModal=wrapped;
})();
