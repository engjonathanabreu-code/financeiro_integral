/* Integral Financeiro V28 — conclui o fluxo de upload de documentos fiscais */
(function(){
'use strict';

const q=(s,r=document)=>r.querySelector(s);
const escHtml=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const uid=()=>Date.now()+Math.floor(Math.random()*100000);
const today=()=>new Date().toISOString().slice(0,10);

function getDb(){try{return db}catch{return window.db||null}}
function saveDb(){try{if(typeof save==='function')save();else window.save?.()}catch(e){console.error('Falha ao salvar documento fiscal',e)}}
function readDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(r.error||new Error('Falha ao ler arquivo'));r.readAsDataURL(file)})}
function docType(file){const n=String(file?.name||'').toLowerCase();if(/cupom|recibo/.test(n))return 'Cupom';if(/comprovante|pix|pagamento/.test(n))return 'Comprovante';return 'Nota Fiscal'}
function normalizeDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):today()}
function normalizeCategory(v){const s=String(v||'').trim();return s||'Outros'}
function normalizeSupplier(v){const s=String(v||'').trim();return s||'Fornecedor não identificado'}
function existingCandidates(){const d=getDb();return (d?.cashflow||[]).slice(-200).map(x=>({id:String(x.id||''),date:x.date||'',description:x.description||'',value:Number(x.value||0),source:x.source||''}))}

async function analyzeFile(file,dataUrl){
  try{
    const r=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataUrl,fileName:file.name,sector:'Administrativo',context:'documento_fiscal',candidates:existingCandidates()})});
    const out=await r.json().catch(()=>({}));
    if(!r.ok||!out?.ok)throw new Error(out?.details||out?.error||`HTTP ${r.status}`);
    return out;
  }catch(e){console.warn('Documento salvo sem classificação completa da IA:',file?.name,e);return null}
}

async function processFiles(files,button,statusEl,modal){
  const d=getDb();if(!d)return alert('Não foi possível acessar os dados do sistema.');
  d.docs=Array.isArray(d.docs)?d.docs:[];
  const old=button.textContent;button.disabled=true;
  let done=0,failed=0;
  try{
    for(let i=0;i<files.length;i++){
      const file=files[i];
      button.textContent=`Enviando ${i+1}/${files.length}...`;
      statusEl.textContent=`Lendo ${file.name}...`;
      try{
        if(file.size>10*1024*1024)throw new Error('Arquivo maior que 10 MB');
        const dataUrl=await readDataUrl(file);
        const ai=await analyzeFile(file,dataUrl);
        const duplicate=ai?.duplicate?.id?true:false;
        d.docs.unshift({
          id:uid(),
          name:file.name,
          type:docType(file),
          supplier:normalizeSupplier(ai?.origin),
          date:normalizeDate(ai?.date),
          cat:normalizeCategory(ai?.expense_type),
          sector:'Administrativo',
          value:Number(ai?.value||0),
          status:duplicate?'Revisar IA':(ai?'Confirmado':'Revisar IA'),
          confidence:Number(ai?.confidence||0),
          notes:String(ai?.notes||''),
          dataUrl,
          mimeType:file.type||'application/octet-stream',
          size:file.size,
          uploadedAt:new Date().toISOString(),
          source:'Upload documento fiscal'
        });
        done++;
      }catch(e){failed++;console.error('Falha no upload fiscal:',file?.name,e)}
    }
    saveDb();
    try{await window.IntegralFinanceCloudStorage?.syncNow?.()}catch(e){console.warn('Sincronização fiscal pendente',e)}
    if(done){
      statusEl.textContent=`${done} documento(s) enviado(s) com sucesso${failed?` • ${failed} falhou(aram)`:''}.`;
      setTimeout(()=>{modal.remove();try{if(typeof documents==='function')documents()}catch{}},450);
    }else{
      statusEl.textContent='Nenhum documento foi enviado.';
      alert('Não foi possível enviar os documentos selecionados. Verifique o formato e o tamanho dos arquivos.');
    }
  }finally{button.disabled=false;button.textContent=old}
}

function decorateModal(modal){
  if(!modal||modal.dataset.fiscalSubmitReady==='1')return;
  const heading=modal.textContent||'';
  const input=q('input[type="file"][accept*=".pdf"]',modal);
  if(!input||!/Notas, cupons e comprovantes/i.test(heading))return;
  modal.dataset.fiscalSubmitReady='1';

  const drop=input.closest('.dropzone')||input.parentElement;
  const footer=q('.modal-foot',modal);
  if(!drop||!footer)return;

  const selected=document.createElement('div');
  selected.id='fiscalSelectedFiles';
  selected.className='muted';
  selected.style.cssText='margin-top:10px;line-height:1.45';
  selected.textContent='Nenhum arquivo selecionado.';
  drop.appendChild(selected);

  const status=document.createElement('div');
  status.id='fiscalUploadStatus';
  status.className='muted';
  status.style.cssText='margin-right:auto;align-self:center';
  footer.insertBefore(status,footer.firstChild);

  const send=document.createElement('button');
  send.type='button';
  send.className='btn';
  send.id='fiscalUploadSend';
  send.textContent='Enviar documento';
  send.style.display='none';
  footer.appendChild(send);

  input.addEventListener('change',()=>{
    const files=Array.from(input.files||[]);
    if(!files.length){selected.textContent='Nenhum arquivo selecionado.';send.style.display='none';status.textContent='';return}
    selected.innerHTML=`<b>${files.length===1?'Arquivo selecionado':'Arquivos selecionados'}:</b><br>${files.map(f=>`• ${escHtml(f.name)}`).join('<br>')}`;
    send.textContent=files.length===1?'Enviar documento':`Enviar ${files.length} documentos`;
    send.style.display='inline-flex';
    status.textContent='Pronto para enviar.';
  });

  send.addEventListener('click',()=>{
    const files=Array.from(input.files||[]);
    if(!files.length)return;
    processFiles(files,send,status,modal);
  });
}

function scan(){document.querySelectorAll('.modal-backdrop').forEach(decorateModal)}
const obs=new MutationObserver(()=>queueMicrotask(scan));
if(document.documentElement)obs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
})();
