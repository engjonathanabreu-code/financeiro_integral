const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {webcrypto,createHash}=require('node:crypto');
const {resolveFile,MAX_FILE}=require('../lib/ai-file');
const source=fs.readFileSync(path.join(__dirname,'../public/financeiro-file-uploads.js'),'utf8');
const owner='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const auth='Bearer fixture-owner';
const signed=(hash,exp=Math.floor(Date.now()/1000)+600)=>{
  const token='header.'+Buffer.from(JSON.stringify({exp})).toString('base64url')+'.signature';
  return 'https://ycdsyilyvaxslkwbkxyo.supabase.co/storage/v1/object/sign/documentos/'+owner+'/financeiro-analise/'+hash+'-receipt.pdf?token='+token;
};
const signedUrl=signed('a'.repeat(64));
function setup(uploadError){
  const calls={uploads:[],requests:[]};
  const fetcher=async(url,options)=>{if(url.startsWith('data:'))return fetch(url);calls.requests.push(JSON.parse(options.body));return {ok:true}};
  const bucket={upload:async(p,file)=>{calls.uploads.push({path:p,file});return {error:uploadError}},createSignedUrl:async()=>({data:{signedUrl}})};
  const window={fetch:fetcher,IntegralERP:{sb:{auth:{getUser:async()=>({data:{user:{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}}})},storage:{from:()=>bucket}}}};
  vm.runInNewContext(source,{window,crypto:webcrypto,Uint8Array});return {api:window.IntegralFileUploads,calls};
}
const pdfBytes=size=>{const bytes=Buffer.alloc(size,65);bytes.write('%PDF-');return bytes};
function options(size,key='image'){return {method:'POST',body:JSON.stringify({[key]:'data:application/pdf;base64,'+pdfBytes(size).toString('base64'),fileName:'receipt.pdf',context:'viagem'})}}
test('20 MB travels through private storage; the API request stays small and bytes are preserved',async()=>{
  const {api,calls}=setup();await api.fetch('/api/ai-receipt',options(MAX_FILE));
  assert.equal(calls.uploads[0].file.size,MAX_FILE);assert.equal(new Uint8Array(await calls.uploads[0].file.arrayBuffer())[MAX_FILE-1],65);
  assert.equal(calls.requests[0].fileUrl,signedUrl);assert.equal(calls.requests[0].image,undefined);assert.equal(calls.requests[0].context,'viagem');assert.ok(JSON.stringify(calls.requests[0]).length<1000);
});
test('one byte above 20 MB is rejected before storage or API requests',async()=>{const {api,calls}=setup();await assert.rejects(api.fetch('/api/ai-receipt',options(MAX_FILE+1)),/20 MB/);assert.equal(calls.uploads.length,0);assert.equal(calls.requests.length,0)});
test('small files keep inline compatibility without requiring storage',async()=>{const {api,calls}=setup();await api.fetch('/api/ai-account',options(50));assert.equal(calls.uploads.length,0);assert.match(calls.requests[0].image,/^data:/)});
test('receivables uses the same large-file transport',async()=>{const {api,calls}=setup();await api.fetch('/api/ai-receivables',options(3*1024*1024+1,'file'));assert.equal(calls.requests[0].file,undefined);assert.equal(calls.requests[0].fileUrl,signedUrl)});
test('storage failures stop analysis instead of losing the original',async()=>{const {api,calls}=setup(new Error('permission denied'));await assert.rejects(api.fetch('/api/ai-receipt',options(3*1024*1024+1)),/permission denied/);assert.equal(calls.requests.length,0)});
test('repeated identical uploads reuse the content-addressed original',async()=>{const {api,calls}=setup({statusCode:'409'});await api.fetch('/api/ai-receipt',options(3*1024*1024+1));assert.equal(calls.requests[0].fileUrl,signedUrl)});
test('server rejects arbitrary external URLs and unsigned storage',async()=>{for(const fileUrl of ['https://example.com/file','http://127.0.0.1/file',signedUrl.split('?')[0],signedUrl.replace('ycdsyilyvaxslkwbkxyo','attacker')])await assert.rejects(resolveFile({fileUrl},'image'),e=>e.code==='INVALID_FILE_URL')});
test('server enforces exact decoded byte limit for inline originals',async()=>{await assert.rejects(resolveFile(JSON.parse(options(MAX_FILE+1).body),'image'),/20 MB/);assert.equal((await resolveFile(JSON.parse(options(5).body),'image')).split(',')[1],pdfBytes(5).toString('base64'))});
test('server checks per-object RLS, downloads only the private original and verifies SHA-256',async(t)=>{
  const bytes=pdfBytes(MAX_FILE), url=signed(createHash('sha256').update(bytes).digest('hex'));
  const calls=[];
  t.mock.method(global,'fetch',async(input,opts)=>{
    calls.push({input:String(input),opts});
    if(String(input).includes('/object/info/'))return Response.json({size:MAX_FILE});
    return new Response(bytes,{headers:{'Content-Type':'application/pdf'}});
  });
  const result=await resolveFile({fileUrl:url},'image',owner,auth);
  assert.equal(Buffer.from(result.split(',')[1],'base64').length,MAX_FILE);
  assert.match(calls[0].input,/object\/info\/documentos/);
  assert.equal(calls[0].opts.headers.Authorization,auth);
  assert.equal(calls[1].opts.headers,undefined,'JWT stays on authenticated info call');
  assert.equal(calls[1].opts.redirect,'error');
  assert.equal(calls[1].opts.cache,'no-store');

  for(const oversized of [
    new Response('x',{headers:{'Content-Length':String(MAX_FILE+1)}}),
    new Response(Buffer.alloc(MAX_FILE+1))
  ]){
    global.fetch=async(input)=>String(input).includes('/object/info/')?Response.json({size:MAX_FILE}):oversized;
    await assert.rejects(resolveFile({fileUrl:url},'image',owner,auth),/20 MB/);
  }
  global.fetch=async(input)=>String(input).includes('/object/info/')?Response.json({size:100}):
    new Response(pdfBytes(100),{headers:{'Content-Type':'application/pdf'}});
  await assert.rejects(resolveFile({fileUrl:url},'image',owner,auth),e=>e.code==='FILE_HASH_MISMATCH');
});

test('cross-profile signed URL is rejected before Storage and own path requires object authorization', async(t)=>{
  let calls=0;
  t.mock.method(global,'fetch',async(input)=>{calls++;assert.match(String(input),/object\/info/);return new Response('',{status:403})});
  await assert.rejects(resolveFile({fileUrl:signedUrl},'image','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',auth),e=>e.statusCode===403);
  assert.equal(calls,0);
  await assert.rejects(resolveFile({fileUrl:signedUrl},'image',owner,auth),e=>e.statusCode===403);
  assert.equal(calls,1);
});

test('mismatched declared MIME and content are rejected', async()=>{
 await assert.rejects(resolveFile({image:'data:image/png;base64,JVBERi0x'},'image'),error=>error.statusCode===415);
});

test('expired or rejected signing token never falls back to another download',async(t)=>{
  const attempts=[];
  t.mock.method(global,'fetch',async input=>{
    attempts.push(String(input));
    if(String(input).includes('/object/info/'))return Response.json({size:100});
    return new Response('',{status:403});
  });
  const expired=signed('a'.repeat(64),Math.floor(Date.now()/1000)-1);
  await assert.rejects(resolveFile({fileUrl:expired},'image',owner,auth),e=>e.code==='FILE_URL_EXPIRED');
  assert.equal(attempts.length,0,'signed URL expiry is checked before reaching a potentially cached endpoint');
  await assert.rejects(resolveFile({fileUrl:signedUrl},'image',owner,auth),/renovar o acesso/);
  assert.equal(attempts.length,2,'one RLS check and one rejected signed download');
});

test('browser resolves canonical attachment with current RLS and rejects session changes',async()=>{
 const stored='data:application/pdf;base64,JVBERi0x';
 let actor=owner;
 let race=false,allowed=true,reads=0;
 const window={fetch,IntegralERP:{sb:{
  auth:{getUser:async()=>({data:{user:{id:actor}}})},
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>{
    reads++;
    if(race)actor='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    return allowed?{data:{conteudo:stored}}:{error:Error('RLS recusou')};
  }})})})
 }}};
 vm.runInNewContext(source,{window});
 const file={arquivoId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'};
 assert.equal(await window.IntegralFileUploads.dataUrlOf({dataUrl:stored}),stored);
 assert.equal(reads,0,'inline legado continua acessível no próprio registro');
 assert.equal(await window.IntegralFileUploads.dataUrlOf(file),stored);
 allowed=false;
 await assert.rejects(window.IntegralFileUploads.dataUrlOf(file),/RLS recusou/);
 allowed=true;race=true;
 await assert.rejects(window.IntegralFileUploads.dataUrlOf(file),/sessão mudou/);
 assert.equal(reads,3);
});
