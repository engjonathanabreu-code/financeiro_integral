(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
if(!sb)return;

function css(){
 if(document.getElementById('recebPayToggleCss'))return;
 const s=document.createElement('style');s.id='recebPayToggleCss';s.textContent=`
 .receb-pay-toggle{border:1px solid #bfd4cf;background:#fff;color:#245f54;border-radius:7px;padding:4px 7px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
 .receb-pay-toggle:hover{background:#edf6f3}.receb-pay-toggle.is-paid{color:#6b7673;border-color:#d4dddb}
 .receb-pay-toggle:disabled{opacity:.5;cursor:wait}
 .receb-history-table th.receb-pay-action,.receb-history-table td.receb-pay-action{width:11%!important;text-align:center}
 @media(max-width:720px){.receb-history-table td.receb-pay-action{display:grid!important}.receb-pay-toggle{justify-self:end!important}}
 `;document.head.appendChild(s);
}

function enhance(){
 css();
 const modal=document.querySelector('#recebHistoryModal');if(!modal)return;
 const table=modal.querySelector('.receb-history-table');if(!table||table.dataset.payReady==='1')return;
 table.dataset.payReady='1';
 const hr=table.querySelector('thead tr');if(hr){const th=document.createElement('th');th.className='receb-pay-action';th.textContent='Ação';hr.appendChild(th)}
 table.querySelectorAll('tbody tr[data-parcela-id]').forEach(row=>{
   const {parcelaStatus:status,parcelaVersao:versao,parcelaOrigem:origem}=row.dataset;
   const td=document.createElement('td');td.className='receb-pay-action';td.dataset.label='Ação';
   if ((['Pendente','Inadimplente'].includes(status)||(status==='Pago'&&origem==='manual'))&&/^\d+$/.test(versao||'')) {
     const btn=document.createElement('button');
     btn.type='button';
     btn.className='receb-pay-toggle'+(status==='Pago'?' is-paid':'');
     btn.textContent=status==='Pago'?'Estornar baixa manual':'Registrar baixa manual';
     td.appendChild(btn);
   } else if (status==='Parcial'||status==='Pago') {
     td.textContent='Em conferência';
   }
   row.appendChild(td);
 });
}

async function toggle(btn){
 const modal=btn.closest('#recebHistoryModal');
 const row=btn.closest('tr');
 if(!modal||!row||btn.disabled)return;
 const {parcelaId,parcelaVersao,parcelaStatus,clienteId}=row.dataset;
 if(!parcelaId||!/^\d+$/.test(parcelaVersao||''))return;
 const estorno=parcelaStatus==='Pago';
 const motivo=estorno?window.prompt('Motivo do estorno da baixa manual (até 500 caracteres):')?.trim():null;
 if(estorno&&!motivo)return;
 if(!estorno&&!window.confirm('Confirma a baixa manual pelo valor da parcela mais os encargos registrados?'))return;

 btn.disabled=true;
 try{
   const {error}=await sb.rpc('financeiro_baixa_manual',{
     p_id:parcelaId,p_versao:parcelaVersao,p_status:parcelaStatus,
     p_acao:estorno?'estornar':'baixar',p_motivo:motivo
   });
   if(error)throw error;
   document.dispatchEvent(new CustomEvent('integral-receivables-changed'));
   if(modal.isConnected)await window.IntegralReceivablesHistory.show(clienteId);
 }catch(e){
   alert('Não foi possível confirmar a alteração: '+(e.message||e)+' Confira a parcela no histórico antes de tentar novamente.');
   if(modal.isConnected)await window.IntegralReceivablesHistory.show(clienteId);
 }finally{btn.disabled=false}
}

document.addEventListener('click',e=>{const b=e.target.closest('.receb-pay-toggle');if(b){e.preventDefault();e.stopPropagation();toggle(b)}});
const o=new MutationObserver(enhance);o.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',enhance);css();
})();
