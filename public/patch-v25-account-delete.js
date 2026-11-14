/* Arquivamento transacional da conta e dos pagamentos vinculados. */
(function(){
  'use strict';

  const oldModal=typeof v2AccountModal==='function'?v2AccountModal:window.v2AccountModal;
  if(typeof oldModal!=='function')return;
  const sameId=(a,b)=>String(a)===String(b);
  const getDb=()=>{try{return db}catch{return window.db||null}};

  async function archiveAccount(account,payments,modal,button){
    const archive=window.IntegralFinanceAccountArchive;
    if(!confirm('Arquivar a conta e os pagamentos vinculados? Os registros quitados permanecem no histórico.'))return;

    button.disabled=true;
    button.textContent='Arquivando…';
    try{
      await archive.archive('conta',account,payments);
      modal.remove();
      if(!await archive.refresh())alert('Arquivamento confirmado. Atualize a tela para consultar o registro.');
      if(typeof accounts==='function')accounts();
    }catch(error){
      alert('Não foi possível arquivar: '+(error?.message||'erro de conexão'));
      button.disabled=false;
      button.textContent='Arquivar conta';
    }
  }

  function decorateModal(account){
    if(!account)return;
    const backdrop=[...document.querySelectorAll('.modal-backdrop')].at(-1);
    const form=backdrop?.querySelector('#v2AccountForm');
    const foot=form?.querySelector('.modal-foot');
    if(!foot||foot.querySelector('[data-delete-account]'))return;
    if(account.archivedAt){
      form.querySelectorAll('input,select,textarea,#v2AddPay,.modal-foot .btn:not([type]),.modal-foot button[type="submit"]').forEach(field=>{field.disabled=true});
      const notice=document.createElement('p');
      notice.textContent='Conta arquivada. O cadastro e os pagamentos continuam disponíveis para consulta.';
      form.prepend(notice);
      return;
    }
    if(!window.IntegralFinanceAccountArchive?.canArchive())return;
    const button=document.createElement('button');
    button.type='button';
    button.className='btn danger';
    button.dataset.deleteAccount=String(account.id);
    button.textContent='Arquivar conta';
    button.style.marginRight='auto';
    const expected=structuredClone(account);
    const payments=structuredClone((getDb()?.accountPayments||[]).filter(p=>sameId(p.accountId,account.id)));
    button.addEventListener('click',()=>archiveAccount(expected,payments,backdrop,button));
    foot.prepend(button);
  }

  const wrapped=function(id){
    const account=(getDb()?.accountMasters||[]).find(a=>sameId(a.id,id));
    const result=oldModal.apply(this,arguments);
    decorateModal(account);
    return result;
  };

  try{v2AccountModal=wrapped}catch{}
  window.v2AccountModal=wrapped;
})();
