/* Integral Financeiro V27 — download conjunto dos documentos fiscais em ZIP */
(function(){
'use strict';

const getDb=()=>{try{return db}catch{return window.db||null}};
const monthOf=d=>String(d||'').slice(0,7);
const safeName=(name,fallback='documento')=>String(name||fallback).replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').replace(/^\.+/,'').trim()||fallback;
const currentMonth=()=>{try{return v2state?.docsMonth||new Date().toISOString().slice(0,7)}catch{return new Date().toISOString().slice(0,7)}};
const labelMonth=m=>{try{const[y,mm]=String(m).split('-');return new Date(+y,+mm-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())}catch{return m}};

function dataUrlToBlob(dataUrl){
  const [head,body]=String(dataUrl).split(',',2);if(!body)throw new Error('Dados do arquivo inválidos.');
  const mime=(head.match(/data:([^;,]+)/)||[])[1]||'application/octet-stream';
  const binary=head.includes(';base64')?atob(body):decodeURIComponent(body);
  const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
}
async function fileBlob(doc){
  const direct=doc?.blob||doc?.fileBlob;
  if(direct instanceof Blob)return direct;
  const data=doc?.dataUrl||doc?.dataURL||doc?.base64||doc?.fileData||doc?.content;
  if(typeof data==='string'&&data.startsWith('data:'))return dataUrlToBlob(data);
  if(data instanceof ArrayBuffer||ArrayBuffer.isView(data))return new Blob([data],{type:doc?.mimeType||doc?.type||'application/octet-stream'});
  const url=doc?.url||doc?.fileUrl||doc?.downloadUrl||doc?.storageUrl||doc?.publicUrl||doc?.signedUrl;
  if(typeof url==='string'&&url){const r=await fetch(url);if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.blob()}
  return null;
}
function uniqueName(name,used){
  const clean=safeName(name);if(!used.has(clean)){used.add(clean);return clean}
  const dot=clean.lastIndexOf('.'),base=dot>0?clean.slice(0,dot):clean,ext=dot>0?clean.slice(dot):'';let i=2,n;
  do{n=`${base} (${i++})${ext}`}while(used.has(n));used.add(n);return n;
}
async function downloadMonthZip(button){
  const d=getDb(),month=currentMonth(),docs=(d?.docs||[]).filter(x=>monthOf(x.date)===month);
  if(!docs.length){alert('Não há documentos fiscais no mês selecionado.');return}
  if(typeof JSZip==='undefined'){alert('Não foi possível carregar o gerador de ZIP. Atualize a página e tente novamente.');return}
  const old=button.textContent;button.disabled=true;button.textContent='Preparando ZIP...';
  try{
    const zip=new JSZip(),used=new Set(),missing=[];
    for(const doc of docs){
      try{const blob=await fileBlob(doc);if(blob)zip.file(uniqueName(doc.name||`documento-${doc.id||Date.now()}`,used),blob);else missing.push(doc)}
      catch(err){console.warn('Documento não pôde ser incluído no ZIP:',doc?.name,err);missing.push(doc)}
    }
    if(missing.length){
      const rows=['Documento;Data;Fornecedor;Categoria;Setor;Valor;Motivo',...missing.map(x=>[x.name,x.date,x.supplier,x.cat,x.sector,x.value,'Arquivo original não disponível no armazenamento'].map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';'))];
      zip.file('_documentos_nao_disponiveis.csv','\ufeff'+rows.join('\n'));
    }
    const realCount=docs.length-missing.length;
    if(!realCount){alert('Os registros fiscais deste mês existem, mas os arquivos originais ainda não estão disponíveis para download. Nenhum ZIP foi gerado.');return}
    const out=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const a=document.createElement('a');a.href=URL.createObjectURL(out);a.download=`Documentos Fiscais - ${labelMonth(month)}.zip`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    if(missing.length)alert(`ZIP gerado com ${realCount} arquivo(s). ${missing.length} registro(s) não tinha(m) o arquivo original disponível e foram listados dentro do ZIP.`);
  }catch(err){console.error('Falha ao gerar ZIP de documentos fiscais:',err);alert(`Não foi possível gerar o ZIP: ${err?.message||err}`)}
  finally{button.disabled=false;button.textContent=old}
}
function decorate(){
  let active='';try{active=typeof view!=='undefined'?view:window.view}catch{active=window.view}
  if(active!=='documents')return;
  const content=document.querySelector('#content');if(!content||content.querySelector('#downloadFiscalZip'))return;
  const toolbar=content.querySelector('.toolbar');if(!toolbar)return;
  const upload=toolbar.querySelector('#v2UploadDocs');
  const area=upload?.parentElement||toolbar;
  const btn=document.createElement('button');btn.type='button';btn.className='btn ghost';btn.id='downloadFiscalZip';btn.textContent='Baixar ZIP do mês';btn.title='Baixar todos os documentos fiscais do mês selecionado em um único arquivo ZIP';
  btn.addEventListener('click',()=>downloadMonthZip(btn));
  if(upload)area.insertBefore(btn,upload);else area.appendChild(btn);
}
const obs=new MutationObserver(()=>queueMicrotask(decorate));
if(document.documentElement)obs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate);else decorate();
window.IntegralFiscalZip={downloadMonth:()=>{const b=document.querySelector('#downloadFiscalZip');if(b)return downloadMonthZip(b)}};
})();
