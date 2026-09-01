/* Integral Financeiro — revisão por IA e edição dos documentos fiscais */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmt=d=>d?new Date(`${String(d).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR'):'—';
function data(){try{return db}catch{return window.db||null}}
function persist(){try{if(typeof save==='function')save();else window.save?.()}catch(e){console.error(e)}}
function redraw(){try{if(typeof documents==='function')documents()}catch(e){console.error(e)}setTimeout(decorate,40)}
async function sync(){try{await window.IntegralFinanceCloudStorage?.syncNow?.()}catch(e){console.warn('Sincronização pendente',e)}}
function candidates(){const d=data();return (d?.cashflow||[]).slice(-200).map(x=>({id:String(x.id||''),date:x.date||'',description:x.description||'',value:Number(x.value||0),source:x.source||''}))}
function modal(title,body){const x=document.createElement('div');x.className='modal-backdrop';x.innerHTML=`<section class="modal"><div class="modal-head"><h3>${esc(title)}</h3><button class="btn ghost small" data-x>Fechar</button></div>${body}</section>`;document.body.append(x);q('[data-x]',x).onclick=()=>x.remove();return x}
function getDocByName(name){const d=data();return (d?.docs||[]).find(x=>String(x.name||'').trim()===String(name||'').trim())}
async function reviewDoc(doc,button){
 if(!doc)return;
 if(!doc.dataUrl)return alert('O arquivo original deste documento não está disponível para uma nova leitura da IA. Você ainda pode editar os dados manualmente.');
 const old=button?.textContent||'';if(button){button.disabled=true;button.textContent='Revisando...'}
 try{
  const r=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:doc.dataUrl,fileName:doc.name||'',sector:doc.sector||'Administrativo',context:'documento_fiscal_revisao',candidates:candidates()})});
  const out=await r.json().catch(()=>({}));if(!r.ok||!out?.ok)throw new Error(out?.details||out?.error||`HTTP ${r.status}`);
  if(out.origin)doc.supplier=String(out.origin).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(out.date||'')))doc.date=out.date;
  if(Number.isFinite(Number(out.value)))doc.value=Number(out.value);
  if(out.expense_type)doc.cat=String(out.expense_type).trim();
  doc.status=out?.duplicate?.id?'Revisar IA':'Confirmado';doc.confidence=Number(out.confidence||0);doc.notes=String(out.notes||'');doc.aiReviewedAt=new Date().toISOString();
  persist();await sync();redraw();
 }catch(e){console.error(e);alert(`Não foi possível revisar com a IA: ${e.message||e}`)}finally{if(button){button.disabled=false;button.textContent=old}}
}
function editDoc(doc){
 const types=['Nota Fiscal','Cupom','Comprovante','Outros'], sectors=['Administrativo','Projetos','Topografia','Comercial','Financeiro','Atendimento','Pós-Protocolo'];
 const x=modal('Editar documento fiscal',`<form id="fiscalEdit"><div class="modal-body"><div class="form-grid"><div class="field full"><label>Documento</label><input name="name" value="${esc(doc.name||'')}" required></div><div class="field"><label>Tipo</label><select name="type">${types.map(v=>`<option ${v===doc.type?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="field"><label>Fornecedor</label><input name="supplier" value="${esc(doc.supplier||'')}"></div><div class="field"><label>Data</label><input name="date" type="date" value="${esc(doc.date||'')}"></div><div class="field"><label>Categoria / natureza</label><input name="cat" value="${esc(doc.cat||'')}"></div><div class="field"><label>Setor</label><select name="sector">${[...new Set([doc.sector,...sectors].filter(Boolean))].map(v=>`<option ${v===doc.sector?'selected':''}>${esc(v)}</option>`).join('')}</select></div><div class="field"><label>Valor</label><input name="value" type="number" step="0.01" min="0" value="${Number(doc.value||0)}"></div><div class="field"><label>Status</label><select name="status">${['Confirmado','Revisar IA'].map(v=>`<option ${v===doc.status?'selected':''}>${v}</option>`).join('')}</select></div></div></div><div class="modal-foot"><button type="button" class="btn ghost" id="reviewInside">Revisar com IA</button><button class="btn">Salvar alterações</button></div></form>`);
 const f=q('#fiscalEdit',x);q('#reviewInside',x).onclick=async e=>{x.remove();await reviewDoc(doc,e.currentTarget)};
 f.onsubmit=async e=>{e.preventDefault();const o=Object.fromEntries(new FormData(f));Object.assign(doc,o,{value:Number(o.value||0),manualEditedAt:new Date().toISOString()});persist();await sync();x.remove();redraw()};
}
function decorate(){
 if((q('#title')?.textContent||'').trim()!=='Documentos Fiscais')return;
 const table=qa('#content table').find(t=>/DOCUMENTO/i.test(q('thead',t)?.textContent||'')&&/FORNECEDOR/i.test(q('thead',t)?.textContent||''));if(!table)return;
 const hr=q('thead tr',table);if(hr&&!q('[data-fiscal-actions-head]',hr)){const th=document.createElement('th');th.dataset.fiscalActionsHead='1';th.textContent='Ações';hr.append(th)}
 qa('tbody tr',table).forEach(tr=>{
  if(q('[data-fiscal-actions]',tr))return;const name=(q('td b',tr)?.textContent||q('td',tr)?.textContent||'').trim(),doc=getDocByName(name);if(!doc)return;
  const td=document.createElement('td');td.dataset.fiscalActions='1';td.className='actions';td.style.whiteSpace='nowrap';td.innerHTML=`<button class="btn small ghost" data-ai>Revisar IA</button> <button class="btn small ghost" data-edit>Editar</button>`;tr.append(td);
  q('[data-ai]',td).onclick=e=>reviewDoc(doc,e.currentTarget);q('[data-edit]',td).onclick=()=>editDoc(doc);
  const badge=qa('.badge',tr).find(b=>/Revisar IA/i.test(b.textContent||''));if(badge){badge.style.cursor='pointer';badge.title='Clique para pedir uma nova revisão da IA';badge.onclick=()=>reviewDoc(doc,badge)}
 });
}
const obs=new MutationObserver(()=>queueMicrotask(decorate));obs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate);else decorate();
})();
