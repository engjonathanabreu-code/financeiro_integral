const MAX_FILE=20*1024*1024;
const STORAGE_ORIGIN='https://ycdsyilyvaxslkwbkxyo.supabase.co';
function fail(statusCode,message){return Object.assign(new Error(message),{statusCode})}
function verifySignature(bytes,mime){
  const starts=value=>bytes.subarray(0,value.length).equals(value);
  const valid={
    'application/pdf':()=>starts(Buffer.from('%PDF-')),
    'image/jpeg':()=>starts(Buffer.from('ffd8ff','hex')),
    'image/png':()=>starts(Buffer.from('89504e470d0a1a0a','hex')),
    'image/webp':()=>starts(Buffer.from('RIFF'))&&bytes.subarray(8,12).toString()==='WEBP',
    'image/gif':()=>/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()),
  };
  if(!Object.hasOwn(valid,mime)||!valid[mime]())throw fail(415,'Tipo ou conteúdo do arquivo inválido.');
}
async function resolveFile(body,key,ownerId){
  if(body.fileUrl){
    let url;try{url=new URL(body.fileUrl)}catch{throw fail(400,'INVALID_FILE_URL')}
    if(url.origin!==STORAGE_ORIGIN||url.username||url.password||!/^\/storage\/v1\/object\/sign\/documentos\/[a-f0-9-]+\/financeiro-analise\/[a-f0-9]{64}-[a-zA-Z0-9._-]+$/.test(url.pathname)||!url.searchParams.get('token'))throw fail(400,'INVALID_FILE_URL');
    const pathOwner=url.pathname.split('/')[6];
    if(!ownerId||pathOwner.toLowerCase()!==String(ownerId).toLowerCase())throw fail(403,'FILE_OWNER_MISMATCH');
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!response.ok)throw fail(400,'Não foi possível acessar o arquivo. Envie novamente para renovar o acesso.');
    if(Number(response.headers.get('content-length'))>MAX_FILE){await response.body?.cancel();throw fail(413,'O arquivo deve ter até 20 MB.')}
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>MAX_FILE)throw fail(413,'O arquivo deve ter até 20 MB.');chunks.push(chunk)}
    const mime=(response.headers.get('content-type')||'application/octet-stream').split(';')[0].trim().toLowerCase();
    const bytes=Buffer.concat(chunks);
    verifySignature(bytes,mime);
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }
  const value=body[key];
  if(typeof value!=='string'||!/^data:[^,]*;base64,/.test(value))throw fail(400,'FILE_REQUIRED');
  const encoded=value.slice(value.indexOf(',')+1);
  const size=encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
  if(size>MAX_FILE)throw fail(413,'O arquivo deve ter até 20 MB.');
  const mime=value.slice(5,value.indexOf(';')).toLowerCase();
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4===1)throw fail(400,'INVALID_BASE64');
  verifySignature(Buffer.from(encoded,'base64'),mime);
  return value;
}
module.exports={resolveFile,MAX_FILE};
