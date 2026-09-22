/* Canonical receivables changes invalidate this view, including changes from Integração. */
(function(){
 const cfg=window.ERP_SUPABASE||{},sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey);if(!sb)return;
 let dirty=false,busy=false,timer;
 const changed=()=>{dirty=true;window.dispatchEvent(new Event('integral:financeiro-atualizado'));schedule();};
 function schedule(){clearTimeout(timer);timer=setTimeout(refresh,800);}
 async function refresh(){
  if(!dirty||busy)return;
  if(document.hidden||!navigator.onLine||document.querySelector('.modal-backdrop:not(#recebHistoryModal)')||document.activeElement?.matches('input,textarea,select')){schedule();return;}
  const historico=document.querySelector('#recebHistoryModal [data-cliente-id]')?.dataset.clienteId;
  if(historico){busy=true;dirty=false;try{await window.IntegralReceivablesHistory.show(historico);}catch{dirty=true;}finally{busy=false;if(dirty)schedule();}return;}
  if(!document.querySelector('.receb-muni-table')&&!document.querySelector('#recebMonth'))return;
  busy=true;dirty=false;try{await window.IntegralReceivables?.render?.();}catch{dirty=true;}finally{busy=false;if(dirty)schedule();}
 }
 sb.channel('financeiro-canonico-v1').on('postgres_changes',{event:'UPDATE',schema:'public',table:'integracao_revisoes',filter:'modulo=eq.financeiro'},changed).subscribe(status=>{if(status==='SUBSCRIBED')changed();});
 window.addEventListener('online',changed);window.addEventListener('focus',changed);document.addEventListener('visibilitychange',()=>{if(!document.hidden)changed();});
 // Reconcile missed notifications after a connection outage, without interrupting editors.
 setInterval(()=>{if(!document.hidden&&(document.querySelector('.receb-muni-table')||document.querySelector('#recebMonth')))changed();},60000);
})();
