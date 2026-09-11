/* Comprovantes de viagem: preserva o original e reutiliza a leitura fiscal. */
(function(){
'use strict';
const MAX_FILE=10*1024*1024, MAX_AI=3*1024*1024;
const readDataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));r.readAsDataURL(file)});
async function capture(file){
  if(file.size>MAX_FILE)throw new Error('O comprovante deve ter até 10 MB.');
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type)&&file.type!=='application/pdf'&&!/\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name))throw new Error('Envie um PDF ou uma imagem JPG, PNG, WebP ou GIF.');
  return {name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString(),dataUrl:await readDataURL(file)};
}
function source(record,linked){
  return [record?.file,record,linked?.file,linked].find(x=>x&&(x.storagePath||[x.dataUrl,x.dataURL,x.fileData].some(v=>typeof v==='string'&&v.startsWith('data:'))))||null;
}
async function blob(record,linked){
  const s=source(record,linked);if(!s)throw new Error('O registro antigo contém apenas o nome do arquivo. Anexe o comprovante em Editar despesa para baixar ou revisar com IA.');
  if(s.storagePath){
    const sb=window.IntegralERP?.sb;if(!sb)throw new Error('Conexão indisponível. Entre novamente no sistema.');
    const {data,error}=await sb.storage.from(s.storageBucket||'documentos').download(s.storagePath);if(error)throw error;return data;
  }
  const url=[s.dataUrl,s.dataURL,s.fileData].find(v=>typeof v==='string'&&v.startsWith('data:'));
  const response=await fetch(url);return response.blob();
}
async function download(record,linked){
  const file=await blob(record,linked),url=URL.createObjectURL(file),a=document.createElement('a');
  a.href=url;a.download=record?.file?.name||record?.doc||record?.name||linked?.file?.name||'comprovante';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function analyze(record,trip,candidates,linked){
  const file=await blob(record,linked);
  if(file.size>MAX_AI)throw new Error('Para revisar com IA, use um arquivo de até 3 MB. O original continua disponível para download.');
  const response=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:await readDataURL(file),fileName:record?.file?.name||record?.doc||record?.name||'',sector:trip.sector||'',context:'viagem',candidates})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.details||result.error||'Não foi possível analisar o documento. Tente novamente.');
  return result;
}
window.IntegralTripDocuments={capture,source,blob,download,analyze};
})();
