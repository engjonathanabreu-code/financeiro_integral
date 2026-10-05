/* Transporte compartilhado para anexos de até 20 MB. */
(function(){
'use strict';
const MAX_FILE=20*1024*1024, INLINE_LIMIT=3*1024*1024;
const rawFetch=window.fetch.bind(window);
/* As rotas /api exigem a sessão do ERP: o token vai junto em toda chamada do próprio site. */
async function authFetch(input,init){
  try{
    const href=typeof input==='string'?input:(input&&input.url)||'';
    const target=new URL(href,location.href);
    if(target.origin===location.origin&&target.pathname.startsWith('/api/')){
      const headers=new Headers((init&&init.headers)||(input instanceof Request?input.headers:undefined));
      if(!headers.has('Authorization')){
        const sb=window.IntegralERP?.sb;
        const session=sb?(await sb.auth.getSession())?.data?.session:null;
        if(session?.access_token){headers.set('Authorization','Bearer '+session.access_token);init={...(init||{}),headers}}
      }
    }
  }catch{}
  return rawFetch(input,init);
}
window.fetch=authFetch;
const nativeFetch=authFetch;
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
/* Anexos guardados em financeiro_arquivos: o módulo tem só o arquivoId. */
const storedCache=new Map();
function inlineData(x){return x&&typeof x==='object'?[x.dataUrl,x.dataURL,x.fileData,x.base64,x.content].find(v=>typeof v==='string'&&v.startsWith('data:'))||'':''}
function storedRef(x){return x&&typeof x==='object'&&typeof x.arquivoId==='string'&&x.arquivoId?x.arquivoId:''}
async function storedContent(arquivoId){
  if(!arquivoId)throw new Error('Arquivo não informado.');
  if(storedCache.has(arquivoId))return storedCache.get(arquivoId);
  const sb=window.IntegralERP?.sb;if(!sb)throw new Error('Conexão indisponível. Entre novamente no sistema.');
  const promise=(async()=>{const {data,error}=await sb.from('financeiro_arquivos').select('conteudo').eq('id',arquivoId).maybeSingle();if(error)throw error;if(!data?.conteudo)throw new Error('O arquivo original não foi encontrado.');return data.conteudo})();
  storedCache.set(arquivoId,promise);promise.catch(()=>storedCache.delete(arquivoId));
  return promise;
}
/* Devolve o data URL do anexo, esteja ele embutido (registros antigos/novos ainda não salvos) ou guardado. */
async function dataUrlOf(...records){
  for(const r of records){const d=inlineData(r)||inlineData(r?.file);if(d)return d}
  for(const r of records){const id=storedRef(r)||storedRef(r?.file);if(id)return storedContent(id)}
  return '';
}
function hasFile(x){return !!(inlineData(x)||storedRef(x))}
window.IntegralFileUploads={MAX_FILE,validate,fetch:request,storedContent,dataUrlOf,hasFile};
})();
