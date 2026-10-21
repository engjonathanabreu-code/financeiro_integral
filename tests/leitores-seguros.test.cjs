// FIN-05: leitura de planilhas/PDFs enviados e inventário fixo das bibliotecas de CDN.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/financeiro-leitores-seguros.js'),'utf8');

function load(window){const ctx={window,Uint8Array,String,Error,Set,Object,Array,Function,Math};vm.createContext(ctx);vm.runInContext(source,ctx);return window.IntegralSafeReaders}
const f=(name,size,type='')=>({name,size,type});

test('planilha: tipo e tamanho conferidos antes de ler; poluição de protótipo é revertida e recusada',()=>{
 let calls=0;
 const XLSX={read(buf,opts){calls++;if(buf==='mal'){Object.prototype.__poluido=1;Array.prototype.extra=2}return {SheetNames:['A'],opts}}};
 const r=load({XLSX});
 assert.deepEqual(r.workbook(f('remessa.xlsx',100),'ok',{type:'array',cellDates:false}).opts,{type:'array',cellDates:false},'opções originais preservadas');
 for(const name of ['a.xls','a.xlsb','a.csv','A.XLSX'])assert.ok(r.workbook(f(name,1),'ok',{}));
 assert.throws(()=>r.workbook(f('a.exe',10),'ok',{}),/planilha/);
 assert.throws(()=>r.workbook(f('a.xlsx',0),'ok',{}),/vazio/);
 assert.throws(()=>r.workbook(f('a.xlsx',16*1024*1024),'ok',{}),/até 15 MB/);
 const before=calls;
 assert.throws(()=>r.workbook(f('a.xlsx',10),'mal',{}),/estrutura inválida/);
 assert.equal(calls,before+1);assert.equal(({}).__poluido,undefined);assert.equal([].extra,undefined,'protótipos restaurados');
 assert.throws(()=>load({}).workbook(f('a.xlsx',1),'ok',{}),/não carregou/);
});

test('PDF: assinatura conferida e eval do pdf.js desligado',async()=>{
 let opts=null;const r=load({pdfjsLib:{getDocument(o){opts=o;return {promise:Promise.resolve('doc')}}}});
 const pdf=new TextEncoder().encode('%PDF-1.7 conteúdo').buffer;
 assert.equal(await r.pdfDocument(f('relatorio.pdf',pdf.byteLength),pdf),'doc');
 assert.equal(opts.isEvalSupported,false);assert.equal(opts.data,pdf);
 assert.ok(await r.pdfDocument(f('sem-extensao',pdf.byteLength,'application/pdf'),pdf),'aceita pelo tipo MIME');
 await assert.rejects(r.pdfDocument(f('falso.pdf',10),new TextEncoder().encode('<html>').buffer),/não é um PDF/);
 await assert.rejects(r.pdfDocument(f('grande.pdf',21*1024*1024),pdf),/até 20 MB/);
});

test('todas as leituras de planilha e PDF do Recebimentos passam pelo leitor seguro',()=>{
 for(const file of fs.readdirSync(path.join(root,'public')).filter(n=>/\.(js|mjs)$/.test(n)&&n!=='financeiro.bundle.js')){
  const s=fs.readFileSync(path.join(root,'public',file),'utf8');
  const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  if(!html.includes(file))continue;  // arquivos não carregados pela página
  assert.ok(!/(^|[^.\w])XLSX\.read\(/.test(s),`${file} chama XLSX.read diretamente`);
  assert.ok(!/pdfjsLib\.getDocument\(/.test(s)||file==='financeiro-leitores-seguros.js',`${file} chama getDocument diretamente`);
 }
});

test('bibliotecas de CDN: versão exata, arquivo explícito, SRI e crossorigin',()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 const tags=[...html.matchAll(/<script[^>]+src="(https?:[^"]+)"[^>]*>/g)];
 assert.ok(tags.length>=6);
 for(const [tag,src] of tags){
  assert.match(src,/@\d+\.\d+\.\d+\/.+\.js$/,`${src} sem versão exata/arquivo`);
  assert.match(tag,/integrity="sha384-[A-Za-z0-9+/=]{64}"/,`${src} sem SRI`);
  assert.match(tag,/crossorigin="anonymous"/,`${src} sem crossorigin`);
 }
 assert.ok(html.indexOf('financeiro-leitores-seguros.js')>html.indexOf('pdf.min.js'));
});
