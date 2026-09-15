const MAX_FILE=20*1024*1024;
const STORAGE_ORIGIN='https://ycdsyilyvaxslkwbkxyo.supabase.co';
function fail(statusCode,message){return Object.assign(new Error(message),{statusCode})}
async function resolveFile(body,key){
  if(body.fileUrl){
    let url;try{url=new URL(body.fileUrl)}catch{throw fail(400,'INVALID_FILE_URL')}
    if(url.origin!==STORAGE_ORIGIN||url.username||url.password||!/^\/storage\/v1\/object\/sign\/documentos\/[a-f0-9-]+\/financeiro-analise\/[a-f0-9]{64}-[a-zA-Z0-9._-]+$/.test(url.pathname)||!url.searchParams.get('token'))throw fail(400,'INVALID_FILE_URL');
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw fail(400,'Não foi possível acessar o arquivo. Envie novamente para renovar o acesso.');
    if(Number(response.headers.get('content-length'))>MAX_FILE){await response.body?.cancel();throw fail(413,'O arquivo deve ter até 20 MB.')}
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>MAX_FILE)throw fail(413,'O arquivo deve ter até 20 MB.');chunks.push(chunk)}
    const mime=(response.headers.get('content-type')||'application/octet-stream').split(';')[0];
    return `data:${mime};base64,${Buffer.concat(chunks).toString('base64')}`;
  }
  const value=body[key];
  if(typeof value!=='string'||!/^data:[^,]*;base64,/.test(value))throw fail(400,'FILE_REQUIRED');
  const encoded=value.slice(value.indexOf(',')+1);
  const size=encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
  if(size>MAX_FILE)throw fail(413,'O arquivo deve ter até 20 MB.');
  return value;
}
module.exports={resolveFile,MAX_FILE};
