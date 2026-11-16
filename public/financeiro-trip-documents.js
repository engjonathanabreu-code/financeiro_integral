/* Comprovantes de viagem: preserva o original e reutiliza a leitura fiscal. */
(function(){
'use strict';
const MAX_FILE=20*1024*1024, MAX_AI=20*1024*1024;
const BUCKET='documentos';
const mimeByExtension={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif'};
const readDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));r.readAsDataURL(file)});
async function capture(file){
  if(file.size>MAX_FILE)throw new Error('O comprovante deve ter até 20 MB.');
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)&&file.type!=='application/pdf'&&!/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name))throw new Error('Envie um PDF ou uma imagem JPG, PNG, WebP ou GIF.');
  return {name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString(),dataUrl:await readDataURL(file)};
}
async function digest(file){
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
}
async function store(file){
  if(!file.size||file.size>MAX_FILE)throw new Error('O comprovante deve ter até 20 MB e conter dados.');
  const extension=file.name.split('.').at(-1).toLowerCase();
  const type=mimeByExtension[extension];
  if(!type||(file.type&&file.type!=='application/octet-stream'&&file.type!==type)){
    throw new Error('Envie um PDF ou uma imagem JPG, PNG, WebP ou GIF.');
  }
  const sb=window.IntegralERP?.sb;
  const identity=async()=>{
    const {data,error}=await sb?.auth?.getSession()||{};
    if(error||!data?.session?.user?.id)throw new Error('Entre novamente para enviar o comprovante.');
    return data.session.user.id;
  };
  const actor=await identity(), checksum=await digest(file);
  const path=actor+'/financeiro-viagens/'+checksum+'.'+(extension==='jpeg'?'jpg':extension);
  if(await identity()!==actor)throw new Error('A sessão mudou antes do envio.');
  const bucket=sb.storage.from(BUCKET);
  const result=await bucket.upload(path,file,{contentType:type,cacheControl:'0',upsert:false});
  if(result.error){
    const code=String(result.error.statusCode||result.error.status||'');
    if(code!=='409'&&!/already exists|duplicate/i.test(result.error.message||''))throw result.error;
    const previous=await bucket.download(path);
    if(previous.error||!previous.data||await digest(previous.data)!==checksum){
      throw new Error('O arquivo existente não pôde ser conferido. Tente novamente.');
    }
  }
  if(await identity()!==actor)throw new Error('A sessão mudou durante o envio.');
  return {name:file.name,type,size:file.size,addedAt:new Date().toISOString(),storageBucket:BUCKET,storagePath:path};
}
function source(record,linked){
  return [record?.file,record,linked?.file,linked].find(x=>x&&(x.storagePath||x.arquivoId||[x.dataUrl,x.dataURL,x.fileData].some(v=>typeof v==='string'&&v.startsWith('data:'))))||null;
}
async function blob(record,linked){
  const s=source(record,linked);if(!s)throw new Error('O registro antigo contém apenas o nome do arquivo. Anexe o comprovante em Editar despesa para baixar ou revisar com IA.');
  if(s.storagePath){
    const sb=window.IntegralERP?.sb;if(!sb)throw new Error('Conexão indisponível. Entre novamente no sistema.');
    const {data,error}=await sb.storage.from(s.storageBucket||'documentos').download(s.storagePath);if(error)throw error;return data;
  }
  let url=[s.dataUrl,s.dataURL,s.fileData].find(v=>typeof v==='string'&&v.startsWith('data:'));
  if(!url&&s.arquivoId)url=await window.IntegralFileUploads.storedContent(s.arquivoId);
  const response=await fetch(url);return response.blob();
}
async function download(record,linked){
  const file=await blob(record,linked),url=URL.createObjectURL(file),a=document.createElement('a');
  a.href=url;a.download=record?.file?.name||record?.doc||record?.name||linked?.file?.name||'comprovante';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function analyze(record,trip,candidates,linked){
  const file=await blob(record,linked);
  if(file.size>MAX_AI)throw new Error('Para revisar com IA, use um arquivo de até 20 MB. O original continua disponível para download.');
  const response=await window.IntegralFileUploads.fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:await readDataURL(file),fileName:record?.file?.name||record?.doc||record?.name||'',sector:trip.sector||'',context:'viagem',candidates})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.details||result.error||'Não foi possível analisar o documento. Tente novamente.');
  return result;
}
window.IntegralTripDocuments={capture,store,source,blob,download,analyze};
})();
