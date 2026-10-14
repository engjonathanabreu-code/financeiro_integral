import {abrirEditorPlano} from './editor-plano-parcelas.mjs';
const permitido=()=>window.IntegralRecebimentosAccess?.allowed?.()===true;
function atualizar(){
 const modal=document.querySelector('#recebHistoryModal'),id=modal?.dataset.planoCliente;if(!modal||!id)return;
 const existente=modal.querySelector('[data-revisar-plano]');if(!permitido()){existente?.remove();return;}if(existente)return;
 const local=modal.querySelector('[data-add-parcel]')?.parentElement;if(!local)return;
 const botao=document.createElement('button');botao.type='button';botao.className='btn small';botao.dataset.revisarPlano='';botao.textContent='Revisar quantidade e valores';local.append(botao);
 botao.onclick=()=>{if(!permitido())return;const cfg=window.ERP_SUPABASE||{},sb=window.IntegralERP?.sb||window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});if(!sb)return;
 abrirEditorPlano({clienteId:id,rpc:async(nome,dados)=>{const {data,error}=await sb.rpc(nome,dados);if(error)throw new Error(error.message);return data;},salvo:async()=>{await window.IntegralReceivablesHistory?.show?.(id);await window.IntegralReceivables?.reload?.();}});};
}
new MutationObserver(atualizar).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',atualizar);atualizar();
