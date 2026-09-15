const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {webcrypto}=require('node:crypto');
const {resolveFile,MAX_FILE}=require('../lib/ai-file');
const source=fs.readFileSync(path.join(__dirname,'../public/financeiro-file-uploads.js'),'utf8');
const signedUrl='https://ycdsyilyvaxslkwbkxyo.supabase.co/storage/v1/object/sign/documentos/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/financeiro-analise/'+ 'a'.repeat(64)+'-receipt.pdf?token=test';
function setup(uploadError){
  const calls={uploads:[],requests:[]};
  const fetcher=async(url,options)=>{if(url.startsWith('data:'))return fetch(url);calls.requests.push(JSON.parse(options.body));return {ok:true}};
  const bucket={upload:async(p,file)=>{calls.uploads.push({path:p,file});return {error:uploadError}},createSignedUrl:async()=>({data:{signedUrl}})};
  const window={fetch:fetcher,IntegralERP:{sb:{auth:{getUser:async()=>({data:{user:{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'}}})},storage:{from:()=>bucket}}}};
  vm.runInNewContext(source,{window,crypto:webcrypto,Uint8Array});return {api:window.IntegralFileUploads,calls};
}
function options(size,key='image'){return {method:'POST',body:JSON.stringify({[key]:'data:application/pdf;base64,'+Buffer.alloc(size,65).toString('base64'),fileName:'receipt.pdf',context:'viagem'})}}
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
test('server rejects arbitrary external URLs and unsigned storage',async()=>{for(const fileUrl of ['https://example.com/file','http://127.0.0.1/file',signedUrl.replace('?token=test',''),signedUrl.replace('ycdsyilyvaxslkwbkxyo','attacker')])await assert.rejects(resolveFile({fileUrl},'image'),/INVALID_FILE_URL/)});
test('server enforces exact decoded byte limit for inline originals',async()=>{await assert.rejects(resolveFile(JSON.parse(options(MAX_FILE+1).body),'image'),/20 MB/);assert.equal((await resolveFile(JSON.parse(options(5).body),'image')).split(',')[1],Buffer.alloc(5,65).toString('base64'))});
test('server downloads the signed original, checks size and refuses redirects',async(t)=>{
  let params;t.mock.method(global,'fetch',async(url,opts)=>{params=opts;return new Response(Buffer.alloc(MAX_FILE,65),{headers:{'Content-Type':'application/pdf'}})});
  const result=await resolveFile({fileUrl:signedUrl},'image');assert.equal(Buffer.from(result.split(',')[1],'base64').length,MAX_FILE);assert.equal(params.redirect,'error');
  global.fetch=async()=>new Response('x',{headers:{'Content-Length':String(MAX_FILE+1)}});await assert.rejects(resolveFile({fileUrl:signedUrl},'image'),/20 MB/);
  global.fetch=async()=>new Response(Buffer.alloc(MAX_FILE+1));await assert.rejects(resolveFile({fileUrl:signedUrl},'image'),/20 MB/);
});
