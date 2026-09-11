const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/financeiro-trip-documents.js'),'utf8');
function setup(overrides={}){
  class FileReader{async readAsDataURL(file){try{this.result=`data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`;this.onload()}catch{this.onerror()}}}
  const context={window:{},FileReader,fetch,URL,document:{},setTimeout,...overrides};vm.runInNewContext(source,context);return context.window.IntegralTripDocuments;
}
const receipt=()=>new File(['original bytes'],'recibo.pdf',{type:'application/pdf'});
test('preserves original PDF bytes and filename',async()=>{const api=setup(),file=await api.capture(receipt());assert.equal(file.name,'recibo.pdf');assert.equal(await (await api.blob({file})).text(),'original bytes')});
test('preserves original image bytes',async()=>{const api=setup(),file=await api.capture(new File(['png bytes'],'nota.png',{type:'image/png'}));assert.equal(await (await api.blob({file})).text(),'png bytes')});
test('rejects files larger than 10 MB',async()=>{await assert.rejects(setup().capture({size:11*1024*1024}),/10 MB/)});
test('rejects executable and SVG attachments',async()=>{for(const type of ['application/javascript','image/svg+xml'])await assert.rejects(setup().capture({size:2,type,name:'unsafe.bin'}),/PDF/)});
test('legacy metadata is never treated as the original',async()=>{await assert.rejects(setup().blob({file:{name:'recibo.pdf'}}),/registro antigo/)});
test('finds original through an explicitly linked document',async()=>{const api=setup(),linked={file:await api.capture(receipt())};assert.equal(await (await api.blob({file:{name:'recibo.pdf'}},linked)).text(),'original bytes')});
test('retains legacy dataURL and fileData formats',async()=>{const api=setup();for(const key of ['dataURL','fileData'])assert.equal(await (await api.blob({[key]:'data:application/pdf;base64,eA=='})).text(),'x')});
test('downloads protected storage through the existing authenticated client',async()=>{const calls=[];const api=setup({window:{IntegralERP:{sb:{storage:{from:bucket=>({download:async path=>{calls.push([bucket,path]);return {data:new Blob(['stored'])}}})}}}}});assert.equal(await (await api.blob({storagePath:'user/receipt',storageBucket:'documentos'})).text(),'stored');assert.deepEqual(calls,[['documentos','user/receipt']])});
test('does not hide storage permission failures',async()=>{const api=setup({window:{IntegralERP:{sb:{storage:{from:()=>({download:async()=>({error:new Error('denied')})})}}}}});await assert.rejects(api.blob({storagePath:'private'}),/denied/)});
test('analysis sends original bytes and travel context without mutating the record',async()=>{let payload;const api=setup({fetch:async(url,options)=>{if(url.startsWith('data:'))return fetch(url);payload=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true,value:20})}}});const record={file:await api.capture(receipt()),value:12};const before=JSON.stringify(record);await api.analyze(record,{sector:'Projetos'},[{id:'trip-other'}]);assert.equal(JSON.stringify(record),before);assert.equal(payload.context,'viagem');assert.equal(payload.fileName,'recibo.pdf');assert.deepEqual(payload.candidates,[{id:'trip-other'}])});
test('analysis guards platform request size before making an API call',async()=>{const api=setup();const file=await api.capture(new File([new Uint8Array(3*1024*1024+1)],'large.pdf',{type:'application/pdf'}));await assert.rejects(api.analyze({file},{},[]),/3 MB/);assert.ok(await api.blob({file}))});
test('analysis reports service errors',async()=>{const api=setup({fetch:async(url)=>url.startsWith('data:')?fetch(url):{ok:false,json:async()=>({error:'Serviço indisponível'})}});const file=await api.capture(receipt());await assert.rejects(api.analyze({file},{},[]),/Serviço indisponível/)});
test('download uses original filename and revokes its temporary URL',async()=>{let clicked=false,revoked=false,anchor;const api=setup({URL:{createObjectURL:()=> 'blob:receipt',revokeObjectURL:()=>{revoked=true}},setTimeout:fn=>fn(),document:{body:{append(){}},createElement:()=>anchor={click(){clicked=true},remove(){}}}});const file=await api.capture(receipt());await api.download({file});assert.equal(anchor.download,'recibo.pdf');assert.equal(anchor.href,'blob:receipt');assert.ok(clicked&&revoked)});
