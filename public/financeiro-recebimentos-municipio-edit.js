/* Integral Financeiro — edição de município na aba Recebimentos */
(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
if(!sb)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
const cleanPrefix=v=>norm(v).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);

function isMunicipioModal(modal){
 const title=(modal?.querySelector('.modal-head h3')?.textContent||'').trim();
 return /—\s*clientes$/i.test(title);
}
function municipioNomeFromModal(modal){
 return (modal?.querySelector('.modal-head h3')?.textContent||'').replace(/\s*—\s*clientes\s*$/i,'').trim();
}
function closeEditor(){document.querySelector('#recebMuniEditModal')?.remove()}

async function findMunicipio(nome){
 const {data,error}=await sb.from('fin_receb_municipios').select('*').order('nome');
 if(error)throw error;
 const target=norm(nome).toLocaleLowerCase('pt-BR');
 return (data||[]).find(m=>norm(m.nome).toLocaleLowerCase('pt-BR')===target)||null;
}

async function openEditor(modal){
 const nome=municipioNomeFromModal(modal);
 let municipio;
 try{municipio=await findMunicipio(nome)}catch(e){return alert('Não foi possível carregar o município: '+(e.message||e))}
 if(!municipio)return alert('Município não encontrado na base de Recebimentos.');
 closeEditor();
 const d=document.createElement('div');
 d.id='recebMuniEditModal';d.className='modal-backdrop';d.style.zIndex='10060';
 d.innerHTML=`<section class="modal" style="width:min(620px,calc(100vw - 32px))"><header class="modal-head"><h3>Editar município</h3><button class="btn icon ghost" data-muni-close>×</button></header><div class="modal-body"><form id="recebMuniEditForm" class="form-grid"><div class="field full"><label>Nome do município</label><input name="nome" value="${esc(municipio.nome||'')}" required></div><div class="field"><label>Estado (UF)</label><input name="uf" value="${esc(municipio.uf||'SC')}" maxlength="2" required></div><div class="field"><label>Prefixo</label><input name="prefixo" value="${esc(municipio.prefixo||'')}" maxlength="8" placeholder="Ex.: AGRO"></div><div class="field full"><div class="notice">O prefixo é usado para identificar automaticamente o município durante a importação das planilhas de clientes.</div></div><div id="recebMuniEditStatus" class="field full"></div></form></div><footer class="modal-foot"><button class="btn ghost" data-muni-close>Cancelar</button><button class="btn" id="recebMuniEditSave">Salvar alterações</button></footer></section>`;
 document.body.appendChild(d);
 d.querySelectorAll('[data-muni-close]').forEach(b=>b.onclick=closeEditor);
 const form=d.querySelector('#recebMuniEditForm'),save=d.querySelector('#recebMuniEditSave'),status=d.querySelector('#recebMuniEditStatus');
 const prefixInput=form.elements.prefixo;
 prefixInput.addEventListener('input',()=>{prefixInput.value=cleanPrefix(prefixInput.value)});
 save.onclick=async()=>{
  const f=Object.fromEntries(new FormData(form));
  const newName=String(f.nome||'').trim();
  const uf=String(f.uf||'').trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,2);
  const prefixo=cleanPrefix(f.prefixo);
  if(!newName)return alert('Informe o nome do município.');
  if(uf.length!==2)return alert('Informe a UF com 2 letras.');
  save.disabled=true;status.textContent='Salvando alterações...';
  try{
   if(prefixo){
    const {data:dups,error:dupErr}=await sb.from('fin_receb_municipios').select('id,nome,prefixo').neq('id',municipio.id);
    if(dupErr)throw dupErr;
    const dup=(dups||[]).find(x=>cleanPrefix(x.prefixo)===prefixo);
    if(dup)throw new Error(`O prefixo ${prefixo} já está vinculado ao município ${dup.nome}.`);
   }
   const {error}=await sb.from('fin_receb_municipios').update({nome:newName,uf,prefixo:prefixo||null}).eq('id',municipio.id);
   if(error)throw error;
   closeEditor();
   modal.remove();
   const nav=document.querySelector('.nav [data-view="recebimentos"],.nav [data-view="receipts"]');
   if(nav)nav.click();
   else location.reload();
  }catch(e){status.innerHTML=`<div class="notice danger">${esc(e.message||e)}</div>`;save.disabled=false}
 };
}

function mountEditButton(){
 const modal=document.querySelector('#recebModal');
 if(!modal||!isMunicipioModal(modal))return;
 const head=modal.querySelector('.receb-detail-head');
 if(!head||head.querySelector('#editMunicipio'))return;
 const add=head.querySelector('#addHere');
 const b=document.createElement('button');
 b.id='editMunicipio';b.className='btn small secondary';b.textContent='Editar município';
 b.onclick=e=>{e.preventDefault();e.stopPropagation();openEditor(modal)};
 if(add)head.insertBefore(b,add);else head.appendChild(b);
}

let queued=false;
function schedule(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;mountEditButton()})}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',schedule,{once:true});
setTimeout(schedule,0);
})();