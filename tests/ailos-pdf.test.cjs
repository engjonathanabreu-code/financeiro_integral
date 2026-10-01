const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../public/ailos-cnab'),{rem}=require('./ailos-fixtures.cjs');
const logo=fs.readFileSync(`${__dirname}/../public/ailos-logo.png`),source=fs.readFileSync(`${__dirname}/../public/ailos-boleto-pdf.js`,'utf8');
function renderer({ok=true}={}){
 const calls=[];
 class PDF {
  getImageProperties(){return {width:logo.readUInt32BE(16),height:logo.readUInt32BE(20)}}
  splitTextToSize(value){return String(value).split('\n')}
 }
 for(const method of ['setFontSize','text','setDrawColor','setLineWidth','rect','addPage','setLineDashPattern','line','addImage','setFillColor','setTextColor'])PDF.prototype[method]=function(...args){calls.push({method,args})};
 class FileReader{readAsDataURL(){this.result=`data:image/png;base64,${logo.toString('base64')}`;this.onload()}}
 const context=vm.createContext({AilosCNAB:C,jspdf:{jsPDF:PDF},FileReader,fetch:async url=>{calls.push({method:'fetch',args:[url]});return {ok,blob:async()=>logo}}});
 vm.runInContext(source,context);return {calls,gerar:context.AilosBoletoPDF.gerar};
}
const texts=calls=>calls.filter(c=>c.method==='text').flatMap(c=>Array.isArray(c.args[0])?c.args[0]:[c.args[0]]);
test('PDF: usa o arquivo original da nova marca Ailos, sem alterar seus bytes',()=>{
 assert.equal(crypto.createHash('sha256').update(logo).digest('hex'),'32c5aa716f912ca058038f0689bc32fbe50b3fc8d136ffe1b9193f61072608dd');
 assert.equal(logo.readUInt32BE(16),1011);assert.equal(logo.readUInt32BE(20),347);
});
test('PDF: marca atual nos dois cabeçalhos, proporcional e sem alterar a remessa',async()=>{
 const r=structuredClone(rem),before=JSON.stringify(r),cnab=C.remessa(r),{gerar,calls}=renderer();
 await gerar(r);assert.equal(JSON.stringify(r),before);assert.deepEqual(C.remessa(r),cnab);
 const images=calls.filter(c=>c.method==='addImage');assert.equal(images.length,2);
 for(const {args} of images){assert.equal(args[0],`data:image/png;base64,${logo.toString('base64')}`);assert.equal(args[1],'PNG');assert.equal(args[5],args[4]*347/1011)}
 assert.deepEqual(images.map(c=>c.args.slice(2,5)),[[10,22,28],[10,87,25]]);
 assert.equal(calls.find(c=>c.method==='fetch').args[0],'ailos-logo.png?v=20261001');
 const printed=texts(calls);assert.equal(printed.filter(s=>s==='085-0').length,2);
 assert.ok(printed.includes('HOMOLOGACAO - SEM VALOR PARA PAGAMENTO'));
 assert.ok(printed.includes('Pagar preferencialmente nas cooperativas do Sistema Ailos.'));
 assert.ok(printed.includes(rem.boletos[0].documento));assert.ok(printed.includes(rem.boletos[0].nosso_numero));
 assert.ok(printed.includes(`${r.config.agencia}-${r.config.agencia_dv} / ${r.config.conta}-${r.config.conta_dv}`));
});
test('PDF: carnê usa a nova marca nas duas fichas e preserva o agrupamento',async()=>{
 const r=structuredClone(rem);r.boletos=Array.from({length:3},(_,i)=>({...r.boletos[0],id:String(i),documento:`INT${i}`,nosso_numero:r.config.conta+r.config.conta_dv+String(254+i).padStart(9,'0')}));
 const {gerar,calls}=renderer();await gerar(r,{carne:true});
 assert.equal(calls.filter(c=>c.method==='addImage').length,3);assert.equal(calls.filter(c=>c.method==='addPage').length,1);
 assert.deepEqual(calls.filter(c=>c.method==='addImage').map(c=>c.args[3]),[14,161,14]);
});
test('PDF: mantém bloqueio de cobrança em produção antes de registro bancário',async()=>{
 const r=structuredClone(rem);r.config={...r.config,ambiente:'producao',homologado:true,protocolo:'TESTE'};
 const {gerar,calls}=renderer();await assert.rejects(gerar(r),/registro aceito/);assert.equal(calls.length,0);
 r.estados={[r.boletos[0].id]:'Registrado'};await gerar(r);assert.ok(texts(calls).includes('BOLETO DE COBRANCA'));
});
test('PDF: falha explicitamente se a marca não puder ser carregada',async()=>{
 const {gerar}=renderer({ok:false});await assert.rejects(gerar(structuredClone(rem)),/carregar a marca Ailos/);
});
