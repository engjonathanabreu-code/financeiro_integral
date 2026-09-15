/* Transporte compartilhado para anexos de até 20 MB. */
(function(){
'use strict';
const MAX_FILE=20*1024*1024, INLINE_LIMIT=3*1024*1024;
const nativeFetch=window.fetch.bind(window);
function validate(file){if(file.size>MAX_FILE)throw new Error('O arquivo deve ter até 20 MB.')}
async function storedUrl(file,name){
  const sb=window.IntegralERP?.sb;
  if(!sb)throw new Error('Entre no sistema para enviar o arquivo.');
  const {data,error}=await sb.auth.getUser();
  if(error||!data?.user)throw new Error('Sessão expirada. Entre novamente para enviar o arquivo.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  const safe=String(name||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120);
  const path=`${data.user.id}/financeiro-analise/${hash}-${safe}`,bucket=sb.storage.from('documentos');
  const uploaded=await bucket.upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
  // O caminho inclui o hash dos bytes: repetir a análise reutiliza o mesmo original.
  if(uploaded.error&&uploaded.error.statusCode!=='409'&&uploaded.error.statusCode!==409&&uploaded.error.error!=='Duplicate')throw uploaded.error;
  const signed=await bucket.createSignedUrl(path,600);
  if(signed.error)throw signed.error;
  if(!signed.data?.signedUrl)throw new Error('Não foi possível preparar o arquivo para análise.');
  return signed.data.signedUrl;
}
async function request(url,options){
  const payload=JSON.parse(options.body),key=typeof payload.image==='string'?'image':'file',data=payload[key];
  if(typeof data==='string'&&data.startsWith('data:')){
    const file=await (await nativeFetch(data)).blob();validate(file);
    if(file.size>INLINE_LIMIT){payload.fileUrl=await storedUrl(file,payload.fileName);delete payload[key]}
  }
  return nativeFetch(url,{...options,body:JSON.stringify(payload)});
}
window.IntegralFileUploads={MAX_FILE,validate,fetch:request};
})();
