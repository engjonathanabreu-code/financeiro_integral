const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {createHash}=require('node:crypto');
const {chromium}=require('playwright');


(async()=>{
const root=path.join(__dirname,'../../public');
const mime={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'};
const html='<div id="content"></div><script src="/financeiro-pdf-loader.js"></script><script src="/vendor/sheetjs/xlsx.full.min.js"></script>';
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 try{
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return}
  const p=path.join(root,url.pathname);
  if(!p.startsWith(root+'/'))throw Error('Caminho');
  res.setHeader('Content-Type',mime[path.extname(p)]??'application/octet-stream');res.end(await fs.readFile(p));
 }catch{res.writeHead(404).end()}
});
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE_PATH?{executablePath:process.env.BROWSER_EXECUTABLE_PATH}:{channel:process.env.BROWSER_CHANNEL||'chrome'})});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const prefix='http://127.0.0.1:'+server.address().port+'/';
 await context.route('**/*',r=>r.request().url().startsWith(prefix)?r.continue():r.abort());
 const page=await context.newPage();
 await page.goto(prefix);
 await page.evaluate(()=>{
  window.calls=[];
  window.confirmed=new Map();
  window.rejected=false;
  window.fallbacks=0;
  window.confirm=()=>true;
  window.supabase={createClient:()=>({rpc:async(name,args)=>{
   calls.push({name,args});
   if(args.p_revisao){
    confirmed.set(args.p_arquivo,args.p_revisao);
    if(window.rejected)return {error:{message:'A conexão foi interrompida'}};
    return {data:{aplicadas:1,repetido:false}};
   }
   if(confirmed.has(args.p_arquivo))return {data:{aplicadas:1,repetido:true}};
   const linhas=args.p_itens.map((x,i)=>({
    linha:i+1,numero:7,valor:x.valor_centavos==null?null:x.valor_centavos/100,total:100,
    vencimento:x.vencimento,pagamento:x.pagamento,
    situacao:x.valor_centavos==null||!x.pagamento||!x.vencimento?'dados_invalidos'
     :x.desconto_centavos>0?'desconto_revisao':x.valor_centavos<10000?'parcial_confirmavel':'confirmavel'
   }));
   return {data:{linhas,revisao:'a'.repeat(64)}};
  }})};
  window.IntegralFileUploads={fetch:async(_url,opts)=>{
   window.fallbacks++;
   if(!JSON.parse(opts.body).file.startsWith('data:application/pdf'))throw Error('MIME inválido');
   return {ok:true,text:async()=>JSON.stringify({ok:true,entries:[{documento:'SINTETICO',pagador:'Exemplo',vencimento:'2026-11-15',pagamento:'2026-11-13',valor_liquidado:42.5,desconto:7.5}]})};
  }};
 });
 await page.addScriptTag({path:path.join(root,'financeiro-recebimentos-report-smart.js')});
 await page.evaluate(()=>IntegralReceivablesImport.open());
 const input=page.locator('#smartPayFile'),submit=page.locator('#smartPayImport');
 const status=page.locator('#smartPayStatus');
 const choose=async(name,buffer,mimeType='application/octet-stream')=>{await input.setInputFiles({name,buffer,mimeType});await submit.click()};
 const calls=()=>page.evaluate(()=>window.calls);
 const CSV=Buffer.from('documento;nome;parcela_vencimento;valor_pago;data_pagamento;desconto;abatimento\r\n"000012";"Nome; ""Exemplo""\r\nFilial";15/11/2026;"50,00";13/11/2026;;\r\n"000013";"Outra";16/11/2026;"80,00";13/11/2026;"10,00";"10,00"\r\n');
 await choose('sintetico.csv',CSV);await status.getByText('Desconto ou abatimento informado.',{exact:false}).waitFor();
 let log=await calls();
 assert.equal(log.length,1);assert.equal(log[0].name,'financeiro_baixa_relatorio');
 assert.equal(log[0].args.p_arquivo,createHash('sha256').update(CSV).digest('hex'));
 assert.deepEqual(log[0].args.p_itens.map(x=>[x.documento,x.valor_centavos,x.desconto_centavos]),[['000012',5000,undefined],['000013',8000,2000]]);
 assert.match(await status.innerText(),/Nome; "Exemplo"/);
 await page.evaluate(()=>{window.rejected=true});
 await status.getByRole('button',{name:/Confirmar 1/}).click();
 await status.getByText('A conexão foi interrompida',{exact:false}).waitFor();
 log=await calls();assert.equal(log.length,2);assert.deepEqual(log[1].args.p_itens,log[0].args.p_itens);assert.equal(log[1].args.p_revisao,'a'.repeat(64));
 await choose('copia.csv',CSV);await status.getByText('Este arquivo já teve um lote',{exact:false}).waitFor();
 assert.equal(await status.getByRole('button',{name:/Confirmar/}).count(),0);
 console.log('PASS CSV multilinha e entre aspas, hash de bytes, parcial e desconto, confirmação com revisão, resposta perdida e arquivo repetido');
 const UTF16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('codigo_processo\tparcela_vencimento\tvalor_pago\tdata_pagamento\nP-001\t31/02/2026\t12e3\t13/11/2026','utf16le')]);
 await choose('utf16.csv',UTF16);await status.getByText('Confira datas e valor informado').waitFor();
 log=await calls();assert.equal(log.at(-1).args.p_itens[0].codigo_processo,'P-001');assert.equal(log.at(-1).args.p_itens[0].vencimento,null);assert.equal(log.at(-1).args.p_itens[0].valor_centavos,null);
 const before=log.length;
 await choose('aspas.csv',Buffer.from('documento;nome;parcela_vencimento;valor_pago;data_pagamento\n1;"Teste;2026-11-15;12;2026-11-13'));
 await status.getByText('Campo entre aspas sem fechamento no CSV.',{exact:false}).waitFor();assert.equal((await calls()).length,before);
 console.log('PASS CSV UTF-16, data e valor ambíguos e aspas abertas rejeitadas antes da RPC');
 const books=await page.evaluate(()=>{
  const wb=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['documento','parcela_vencimento','valor_pago','data_pagamento'],['000123',46341,42.5,46339]]);
  XLSX.utils.book_append_sheet(wb,sheet,'fixture');
  return ['xlsx','xls','xlsb'].map(bookType=>({bookType,bytes:Array.from(new Uint8Array(XLSX.write(wb,{bookType,type:'array'})))}));
 });
 for(const book of books){
  await choose('sintetico.'+book.bookType,Buffer.from(book.bytes));
  await status.getByRole('button',{name:/Confirmar 1/}).waitFor();
  const last=(await calls()).at(-1).args.p_itens[0];
  assert.equal(last.documento,'000123');assert.equal(last.valor_centavos,4250);assert.match(last.vencimento,/^2026-/);
 }
 console.log('PASS XLSX, XLS e XLSB reais preservam código de texto, data serial e centavos');
 const row='COMPE 000123 TIT-01 ANA EXEMPLO 04/09/2024 15/11/2026 100,00 20,00 0,00 2,00 0,00 0,00 82,00 1,41 104/0423 13/11/2026 14/11/2026 31 - Liq em banco';
 const row2=row.replace('COMPE 000123','INTERNET 000124').replace('TIT-01','TIT-02').replace('20,00','0,00').replace('82,00','102,00');
 function pdf(lines){
  // Documento de uma página inteiramente sintético, em Helvetica com WinAnsi.
  const text=lines.map((line,i)=>{
   const bytes=Buffer.from(line,'latin1').toString('hex');
   return '1 0 0 1 20 '+(565-i*16)+' Tm <'+bytes+'> Tj';
  }).join('\n');
  const stream='BT /F1 9 Tf\n'+text+'\nET\n';
  const objects=[
   '<< /Type /Catalog /Pages 2 0 R >>',
   '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
   '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1100 600] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
   '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
   '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'endstream'
  ];
  let contents='%PDF-1.4\n';
  const offsets=objects.map((object,i)=>{
   const offset=Buffer.byteLength(contents);
   contents+=(i+1)+' 0 obj\n'+object+'\nendobj\n';
   return offset;
  });
  const xref=Buffer.byteLength(contents);
  contents+='xref\n0 6\n0000000000 65535 f \n';
  contents+=offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
  return Buffer.from(contents+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 }
 const lines=['MOVIMENTAÇÃO DE COBRANÇA COM REGISTRO','Ocorrência: 2 - Entrada',row2,'Ocorrência: 6 - Liquidacao',row,row2,'TOTAL 2 Boleto(s) 200,00 20,00 0,00 4,00 0,00 0,00 184,00 2,82','Ocorrência: 9 - Baixa',row2];
 const PDF=pdf(lines);
 await choose('banco.pdf',PDF);await status.getByText('Desconto ou abatimento informado.',{exact:false}).waitFor();
 log=await calls();assert.equal(log.at(-1).args.p_arquivo,createHash('sha256').update(PDF).digest('hex'));
 const paid=log.at(-1).args.p_itens;
 assert.deepEqual(paid.map(x=>[x.documento,x.nosso_numero,x.vencimento,x.pagamento,x.desconto_centavos,x.valor_centavos]),
 [['TIT-01','000123','2026-11-15','2026-11-13',2000,8200],['TIT-02','000124','2026-11-15','2026-11-13',0,10200]]);
 await choose('banco-inconsistente.pdf',pdf(lines.map(l=>l.replace('184,00','185,00'))));
 await status.getByText('A quantidade ou o total da liquidação diverge do PDF.',{exact:false}).waitFor();
 assert.equal((await calls()).length,log.length);assert.equal(await page.evaluate(()=>window.fallbacks),0);
 await choose('maior.pdf',Buffer.alloc(20*1024*1024+1));
 await status.getByText('Use um relatório de até 20 MB.',{exact:false}).waitFor();
 await choose('corrompido.pdf',Buffer.from('%PDF-1.7\ncorpo ilegível'));
 await status.getByText('Falha ao preparar o relatório.',{exact:false}).waitFor();
 assert.equal((await calls()).length,log.length);assert.equal(await page.evaluate(()=>window.fallbacks),0);
 await choose('outro.pdf',pdf(['Outro layout contendo um pagamento']));
 await status.getByText('A leitura foi assistida por IA.',{exact:false}).waitFor();
 assert.equal((await calls()).length,log.length+1);assert.equal(await page.evaluate(()=>window.fallbacks),1);
 assert.equal((await calls()).at(-1).args.p_itens[0].desconto_centavos,750);
 console.log('PASS PDF real com worker, somente liquidações, data de pagamento distinta do crédito, desconto, total divergente, PDF grande e corrompido e análise assistida simulada');
}finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
