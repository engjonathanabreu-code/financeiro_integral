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
 table.querySelectorAll('tbody tr').forEach(row=>{
   const cells=row.querySelectorAll('td');if(cells.length<7)return;
   const status=(cells[3]?.textContent||'').trim();
   const numero=(cells[1]?.textContent||'').replace('#','').trim();
   const vencText=(cells[2]?.textContent||'').trim();
   const td=document.createElement('td');td.className='receb-pay-action';td.dataset.label='Ação';
   td.innerHTML=`<button class="receb-pay-toggle ${status==='Pago'?'is-paid':''}" data-numero="${numero}" data-venc="${vencText}" data-paid="${status==='Pago'?'1':'0'}">${status==='Pago'?'Desmarcar':'✓ Pago'}</button>`;
   row.appendChild(td);
 });
}

async function toggle(btn){
 const modal=btn.closest('#recebHistoryModal');if(!modal)return;
 const title=modal.querySelector('.modal-head h3')?.textContent||'';
 const clientName=title.replace(/^Histórico\s*—\s*/i,'').trim();
 const numero=Number(btn.dataset.numero);const paid=btn.dataset.paid==='1';
 if(!clientName||!numero)return;
 btn.disabled=true;
 try{
   const c=await sb.from('fin_receb_clientes').select('id').eq('nome',clientName).limit(2);if(c.error)throw c.error;
   if(!c.data?.length)throw new Error('Cliente não encontrado.');
   let q=sb.from('fin_receb_parcelas').select('id,valor_previsto').eq('cliente_id',c.data[0].id).eq('numero',numero).limit(1);const p=await q;if(p.error)throw p.error;if(!p.data?.length)throw new Error('Parcela não encontrada.');
   const parcel=p.data[0];
   const values=paid?{status:'Pendente',pago_em:null,valor_liquidado:null,diferenca:null}:{status:'Pago',pago_em:new Date().toISOString().slice(0,10),valor_liquidado:Number(parcel.valor_previsto||0),diferenca:0};
   const u=await sb.from('fin_receb_parcelas').update(values).eq('id',parcel.id).select('id,status').single();if(u.error)throw u.error;
   const row=btn.closest('tr');const cells=row.querySelectorAll('td');
   const newPaid=!paid;btn.dataset.paid=newPaid?'1':'0';btn.textContent=newPaid?'Desmarcar':'✓ Pago';btn.classList.toggle('is-paid',newPaid);
   const statusEl=cells[3]?.querySelector('.receb-status');if(statusEl){statusEl.textContent=newPaid?'Pago':'Pendente';statusEl.className=`receb-status ${newPaid?'Pago':'Pendente'}`}
   cells[5].textContent=newPaid?new Date().toLocaleDateString('pt-BR'):'—';cells[6].textContent=newPaid?cells[4].textContent:'—';
 }catch(e){alert('Não foi possível alterar o pagamento: '+(e.message||e))}finally{btn.disabled=false}
}

document.addEventListener('click',e=>{const b=e.target.closest('.receb-pay-toggle');if(b){e.preventDefault();e.stopPropagation();toggle(b)}});
const o=new MutationObserver(enhance);o.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',enhance);css();
})();
