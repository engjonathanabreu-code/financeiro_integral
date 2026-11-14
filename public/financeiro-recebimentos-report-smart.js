(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const fileData=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
const isSpreadsheet=file=>/\.(csv|xlsx|xls|xlsb)$/i.test(file?.name||'');
const MAX_REPORT_BYTES=20*1024*1024;
const MAX_REPORT_LINES=500;
async function validateReportFile(file){
 if(!file.size)throw new Error('O arquivo está vazio.');
 if(file.size>MAX_REPORT_BYTES)throw new Error('Use um relatório de até 20 MB.');
 const extension=(file.name.match(/\.([a-z0-9]+)$/i)?.[1]||'').toLowerCase();
 const pdf=extension==='pdf'||(!isSpreadsheet(file)&&file.type==='application/pdf');
 if(!pdf&&!isSpreadsheet(file))throw new Error('Selecione um PDF, CSV ou Excel.');
 const header=new Uint8Array(await file.slice(0,1024).arrayBuffer());
 const starts=(...bytes)=>bytes.every((byte,index)=>header[index]===byte);
 const prefix=new TextDecoder().decode(header);
 if(pdf){
  if(!prefix.startsWith('%PDF-'))throw new Error('O arquivo selecionado não é um PDF válido.');
  return;
 }
 const zip=starts(0x50,0x4b,0x03,0x04);
 if(extension==='csv'){
  const unicodeText=starts(0xff,0xfe)||starts(0xfe,0xff);
  if(zip||prefix.startsWith('%PDF-')||(!unicodeText&&header.includes(0))){
   throw new Error('O arquivo selecionado não é um CSV válido.');
  }
  return;
 }
 const compound=starts(0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1);
 const biff=header.length>=4&&header[0]===0x09&&[0,2,4,8].includes(header[1]);
 const legacyMarkup=/^\s*(?:<\?xml\b[\s\S]*?)?(?:<Workbook\b|<!doctype\s+html\b|<html\b|<table\b)/i.test(prefix);
 if(extension==='xls' ? !(compound||biff||legacyMarkup) : !zip){
  throw new Error('O conteúdo da planilha não corresponde ao formato selecionado.');
 }
}

function close(){document.querySelector('#recebSmartReport')?.remove()}
function modal(){close();const d=document.createElement('div');d.id='recebSmartReport';d.className='modal-backdrop';d.innerHTML=`<section class="modal"><header class="modal-head"><h3>Importar relatório de pagamentos</h3><button class="btn icon ghost" data-close>×</button></header><div class="modal-body"><div class="form-grid"><div class="field full"><label>Relatório (PDF, CSV ou Excel)</label><input id="smartPayFile" type="file" accept="application/pdf,.csv,.xlsx,.xls,.xlsb"></div><div class="field full"><div class="notice">Confira os valores no comprovante antes de registrar as baixas. A conciliação exige vencimento exato e uma referência inequívoca. Um valor menor registra pagamento parcial e mantém o saldo em aberto. Encaminhe descontos e outras divergências para revisão.<br><br>O PDF do relatório bancário (seção Liquidação) é lido direto no navegador, sem IA. Planilha CSV/Excel: informe <code>parcela_vencimento</code>, <code>valor_pago</code>, <code>data_pagamento</code> e pelo menos uma referência: <code>nosso_numero</code>, <code>documento</code>, <code>codigo_processo</code> ou <code>cpf_cnpj</code>.</div></div><div id="smartPayStatus" class="field full"></div></div></div><footer class="modal-foot"><button class="btn ghost" data-close>Fechar</button><button class="btn" id="smartPayImport">Gerar prévia</button></footer></section>`;document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(x=>x.onclick=close);d.querySelector('#smartPayImport').onclick=()=>run(d)}
async function responseJsonSafe(rr){const raw=await rr.text();let j=null;try{j=raw?JSON.parse(raw):null}catch{}if(j)return j;if(rr.status===504)throw new Error('O relatório demorou além do limite do servidor. A leitura foi otimizada; tente novamente após atualizar a página.');throw new Error(raw&&raw.length<240?raw:`Falha do servidor ao processar o relatório (HTTP ${rr.status}).`)}
function brDateToIso(value,date1904=false){
 let year,month,day;
 if(typeof value==='number'){
  const date=window.XLSX?.SSF?.parse_date_code(value,{date1904});
  if(!date)return null;
  ({y:year,m:month,d:day}=date);
 }else{
  const text=String(value??'').trim();
  const iso=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  const br=text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/);
  if(iso)[year,month,day]=iso.slice(1).map(Number);
  else if(br){
   [day,month,year]=br.slice(1).map(Number);
   if(br[3].length===2)year+=2000;
  }else return null;
 }
 const date=new Date(0);
 date.setUTCFullYear(year,month-1,day);
 if(year<1000||year>9999||date.getUTCFullYear()!==year||
    date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return date.toISOString().slice(0,10);
}
function moneyInCents(value){
 if(typeof value==='number'){
  const cents=Math.round(value*100);
  return Number.isSafeInteger(cents)&&Math.abs(value*100-cents)<1e-7?cents:null;
 }
 const text=String(value??'').trim().replace(/^R\$\s*/i,'');
 const decimal=/^(-?\d+)(?:[.,](\d{1,2}))?$/.exec(text);
 const grouped=/^(-?\d{1,3}(?:\.\d{3})+),(\d{1,2})$/.exec(text);
 const amount=decimal||grouped;
 if(!amount)return null;
 const fraction=Number((amount[2]||'').padEnd(2,'0'));
 const cents=Math.abs(Number(amount[1].replaceAll('.','')))*100+fraction;
 return Number.isSafeInteger(cents)?(amount[1].startsWith('-')?-cents:cents):null;
}
function reference(value){
 return typeof value==='number'&&!Number.isSafeInteger(value)?null:String(value??'').trim()||null;
}
function pickCol(headers,aliases){for(const a of aliases){const i=headers.indexOf(norm(a));if(i>=0)return i}return -1}
function rowsToEntries(rows,date1904=false){
 if(!rows.length)throw new Error('Planilha vazia.');
 const headers=rows[0].map(h=>norm(h));
 const ci={
  documento:pickCol(headers,['documento','doc']),
  processo:pickCol(headers,['codigoprocesso','codigo','processo','contrato']),
  nome:pickCol(headers,['nome','cliente','pagador']),
  vencimento:pickCol(headers,['parcelavencimento','vencimento']),
  pago:pickCol(headers,['valorpago','valorliquidado','pago']),
  dtpgto:pickCol(headers,['datapagamento','pagamento','dtpgto']),
  nossonumero:pickCol(headers,['nossonumero']),
  cpf:pickCol(headers,['cpfcnpj','cpf','cnpj']),
  desconto:pickCol(headers,['desconto','valordesconto']),
  abatimento:pickCol(headers,['abatimento','valorabatimento'])
 };
 if(ci.vencimento<0||ci.pago<0||ci.dtpgto<0)throw new Error('Informe as colunas parcela_vencimento, valor_pago e data_pagamento.');
 if([ci.documento,ci.processo,ci.nossonumero,ci.cpf].every(index=>index<0)){
  throw new Error('Informe uma coluna de referência: nosso_numero, documento, codigo_processo ou cpf_cnpj.');
 }
 const out=[];
 for(let r=1;r<rows.length;r++){
  const row=rows[r]||[];if(!row.length||row.every(c=>c==null||c===''))continue;
  if(out.length>=MAX_REPORT_LINES)throw new Error('O relatório deve conter de 1 a 500 linhas de pagamento.');
  const discounts=[row[ci.desconto],row[ci.abatimento]].filter(value=>String(value??'').trim()).map(moneyInCents);
  const validDiscounts=discounts.every(value=>value!==null&&value>=0);
  out.push({
   documento:reference(row[ci.documento]),
   codigo_processo:reference(row[ci.processo]),
   nosso_numero:reference(row[ci.nossonumero]),
   cpf_cnpj:reference(row[ci.cpf]),
   pagador:String(row[ci.nome]??'').trim(),
   vencimento:brDateToIso(row[ci.vencimento],date1904),
   pagamento:brDateToIso(row[ci.dtpgto],date1904),
   valor_liquidado:row[ci.pago],
   ...(discounts.length?{desconto:validDiscounts?discounts.reduce((sum,value)=>sum+value,0)/100:'inválido'}:{})
  });
 }
 if(!out.length)throw new Error('Nenhuma linha de pagamento reconhecida na planilha.');
 return out;
}
function csvRows(text,delim){
 const rows=[];
 let row=[],field='',quoted=false,closed=false;
 function endField(){row.push(field);field='';closed=false;}
 function endRow(){
  endField();
  if(row.some(value=>value.trim())){
   if(rows.length>MAX_REPORT_LINES)throw new Error('O relatório deve conter de 1 a 500 linhas de pagamento.');
   if(rows.length&&row.length!==rows[0].length)throw new Error('Há uma linha com número incorreto de colunas no CSV.');
   rows.push(row);
  }
  row=[];
 }
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(quoted){
   if(char!=='"')field+=char;
   else if(text[i+1]==='"'){field+='"';i++;}
   else{quoted=false;closed=true;}
   continue;
  }
  if(char===delim){endField();continue;}
  if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;endRow();continue;}
  if(char==='"'&&!field&&!closed){quoted=true;continue;}
  if(closed||char==='"')throw new Error('Aspas inválidas no CSV.');
  field+=char;
 }
 if(quoted)throw new Error('Campo entre aspas sem fechamento no CSV.');
 endRow();
 return rows;
}
function parseCsvText(text){
 text=text.replace(/^\uFEFF/,'');
 const firstLine=text.split(/\r\n|\n|\r/,1)[0];
 let lastError;
 for(const delimiter of [';',',','\t']){
  if(!firstLine.includes(delimiter))continue;
  try{return rowsToEntries(csvRows(text,delimiter));}
  catch(error){lastError??=error;}
 }
 throw lastError||new Error('Não encontrei colunas separadas por vírgula, ponto e vírgula ou tabulação.');
}
async function parseSpreadsheetFile(file,bytes){
 if(/\.csv$/i.test(file.name)){
  const header=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));
  const encoding=header[0]===0xff&&header[1]===0xfe?'utf-16le':header[0]===0xfe&&header[1]===0xff?'utf-16be':'utf-8';
  let text;
  try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}
  catch(error){
   if(encoding!=='utf-8')throw error;
   text=new TextDecoder('windows-1252').decode(bytes);
  }
  return parseCsvText(text);
 }
 if(!window.XLSX)throw new Error('Leitor de planilha não carregou. Atualize a página e tente novamente.');
 const wb=XLSX.read(bytes,{type:'array',raw:true,dense:true,sheetRows:MAX_REPORT_LINES+2});
 const sheet=wb.Sheets[wb.SheetNames[0]];
 if(!sheet?.['!ref'])throw new Error('Planilha vazia.');
 const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
 if(range.e.r-range.s.r>MAX_REPORT_LINES||range.e.c-range.s.c>127){
  throw new Error('Use uma planilha com até 500 linhas de pagamento e 128 colunas.');
 }
 const date1904=wb.Workbook?.WBProps?.date1904===true;
 return rowsToEntries(XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null}),date1904);
}
const PDF_OCCURRENCE=/Ocorr[eê]ncia:\s*(\d+)/i;
const PDF_PAYMENT_PREFIX=/^(COMPE|INTERNET)\s+\d+\s/i;
const PDF_PAYMENT=/^(?:COMPE|INTERNET)\s+(\d+)\s+(\S+)\s+(.+?)\s+\d{2}\/\d{2}\/\d{4}\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/i;
const PDF_PAYMENT_FIELDS=/^((?:[\d.]+,\d{2}\s+){8})\S+\s+(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\b/;

async function pdfTextLines(pdf){
 const lines=[];
 for(let number=1;number<=pdf.numPages;number++){
  const page=await pdf.getPage(number);
  const viewport=page.getViewport({scale:1});
  const {items}=await page.getTextContent();
  const rows=new Map();
  for(const item of items){
   if(!item.str?.trim())continue;
   const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
   const line=Math.round(y*2);
   if(!rows.has(line))rows.set(line,[]);
   rows.get(line).push({x,text:item.str.trim()});
  }
  for(const [,tokens] of [...rows].sort((a,b)=>a[0]-b[0])){
   lines.push(tokens.sort((a,b)=>a.x-b.x).map(token=>token.text).join(' '));
  }
 }
 return lines;
}
function bankPayment(line){
 const row=line.match(PDF_PAYMENT);
 const fields=row?.[5].match(PDF_PAYMENT_FIELDS);
 if(!fields)return null;
 const amounts=fields[1].trim().split(/\s+/).map(moneyInCents);
 const paid=amounts[6];
 const discount=amounts[1]+amounts[2];
 const vencimento=brDateToIso(row[4]),pagamento=brDateToIso(fields[2]);
 if(amounts.some(amount=>amount===null)||!vencimento||!pagamento||paid<=0)return null;
 return {
  nosso_numero:row[1],documento:row[2],pagador:row[3].trim(),vencimento,pagamento,
  valor_liquidado:paid/100,desconto:discount/100
 };
}
function readBankReport(lines){
 if(!lines.some(line=>/MOVIMENTA[CÇ][AÃ]O DE COBRAN[CÇ]A COM REGISTRO/i.test(line)))return null;
 const entries=[];
 let liquidation=false,checked=0,sum=0,subtotalSeen=false;
 for(const line of lines){
  const section=line.match(PDF_OCCURRENCE);
  if(section){
   if(liquidation&&checked!==entries.length&&section[1]!=='6')throw new Error('Confira o total da seção de liquidação no PDF.');
   liquidation=section[1]==='6';
   continue;
  }
  if(!liquidation)continue;
  const total=line.match(/^TOTAL\s+(\d+)\s+Boleto\(s\)\s+(.+)/i);
  if(total){
   const amounts=total[2].match(/[\d.]+,\d{2}/g)||[];
   const shown=moneyInCents(amounts[6]);
   if(Number(total[1])!==entries.length-checked||shown!==sum){
    throw new Error('A quantidade ou o total da liquidação diverge do PDF. Confira o arquivo original.');
   }
   checked=entries.length;
   sum=0;
   subtotalSeen=true;
   continue;
  }
  if(!PDF_PAYMENT_PREFIX.test(line))continue;
  const entry=bankPayment(line);
  if(!entry)throw new Error('Há uma liquidação ilegível no PDF. Confira o arquivo original.');
  if(entries.length>=MAX_REPORT_LINES)throw new Error('O relatório deve conter de 1 a 500 linhas de pagamento.');
  entries.push(entry);
  sum+=moneyInCents(entry.valor_liquidado);
 }
 if(!subtotalSeen||checked!==entries.length)throw new Error('Confira o total da seção de liquidação no PDF.');
 return entries;
}
async function parsePdfLocally(bytes){
 if(!window.IntegralFinancePdf)throw new Error('Leitor de PDF não carregou. Atualize a página e tente novamente.');
 const pdfjs=await window.IntegralFinancePdf.load();
 const task=pdfjs.getDocument({...window.IntegralFinancePdf.options,data:bytes,isEvalSupported:false});
 let lines;
 try{lines=await pdfTextLines(await task.promise);}
 finally{await task.destroy();}
 return readBankReport(lines);
}
const labels={
 confirmavel:'Baixa integral',
 parcial_confirmavel:'Pagamento parcial. Confira o saldo e eventual desconto.',
 registrado:'Pagamento já registrado',
 dados_invalidos:'Confira datas e valor informado',
 sem_titulo:'Nenhum título com referência e vencimento exatos',
 ambiguo:'Mais de um título corresponde à referência',
 situacao_divergente:'Parcela já movimentada ou indisponível',
 valor_divergente:'Valor difere do total com encargos',
 desconto_revisao:'Desconto ou abatimento informado. Encaminhe para revisão.',
 retorno_ailos:'Concilie pelo retorno Ailos',
 linhas_repetidas:'Mais de uma linha para o mesmo título'
};
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
function asPayment(entry){
 return {
  documento:reference(entry.documento),
  nosso_numero:reference(entry.nosso_numero),
  codigo_processo:reference(entry.codigo_processo),
  cpf_cnpj:reference(entry.cpf_cnpj),
  vencimento:brDateToIso(entry.vencimento),
  pagamento:brDateToIso(entry.pagamento),
  valor_centavos:moneyInCents(entry.valor_liquidado),
  ...(entry.desconto==null?{}:{desconto_centavos:moneyInCents(entry.desconto)??'inválido'})
 };
}
async function readFile(file,bytes,status){
 if(isSpreadsheet(file))return {entries:await parseSpreadsheetFile(file,bytes),assisted:false};
 const entries=await parsePdfLocally(bytes);
 if(entries)return {entries,assisted:false};
 status.textContent='O layout não foi reconhecido pela leitura direta. Solicitando análise do PDF...';
 const data=await fileData(file.slice(0,file.size,'application/pdf'));
 const response=await window.IntegralFileUploads.fetch('/api/ai-receivables',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({file:data,fileName:file.name,mode:'payments'})
 });
 const json=await responseJsonSafe(response);
 if(!response.ok||!json?.ok)throw new Error(json?.details||json?.error||'Falha na leitura do relatório.');
 return {entries:json.entries||[],assisted:true};
}
async function run(dialog){
 const input=dialog.querySelector('#smartPayFile');
 const status=dialog.querySelector('#smartPayStatus');
 const btn=dialog.querySelector('#smartPayImport');
 const file=input.files?.[0];
 if(!file)return alert('Selecione o arquivo.');
 btn.disabled=true;
 input.disabled=true;
 status.textContent='Montando a prévia das baixas...';
 try{
  await validateReportFile(file);
  const bytes=await file.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const {entries,assisted}=await readFile(file,bytes,status);
  if(!Array.isArray(entries)||!entries.length||entries.length>MAX_REPORT_LINES){
   throw new Error('O relatório deve conter de 1 a 500 linhas de pagamento.');
  }
  if(!dialog.isConnected||input.files?.[0]!==file)return;
  const args={p_arquivo:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''),p_itens:entries.map(asPayment)};
  const {data,error}=await sb.rpc('financeiro_baixa_relatorio',args);
  if(error)throw error;
  if(!dialog.isConnected)return;
  if(data.repetido){
   status.textContent=`Este arquivo já teve um lote de ${data.aplicadas} baixa(s) confirmado. Encaminhe as demais linhas para conferência.`;
   return;
  }
  const linhas=data.linhas;
  const confirmaveis=linhas.filter(x=>['confirmavel','parcial_confirmavel'].includes(x.situacao));
  const prontas=confirmaveis.length;
  status.innerHTML=`<div class="notice"><b>${prontas}</b> baixa(s) pronta(s). Revise as linhas antes de confirmar.${assisted?' A leitura foi assistida por IA. Confira valores, datas, referências e eventuais descontos no documento original.':''}</div>
   <div class="table-wrap" style="max-height:50vh;overflow:auto"><table class="table"><thead><tr>
   <th>Linha</th><th>Pagador</th><th>Referências do arquivo</th><th>Parcela</th><th>Vencimento</th><th>Pagamento</th><th>Valor recebido</th><th>Total do título</th><th>Conferência</th>
   </tr></thead><tbody>${linhas.map(x=>`<tr><td>${esc(x.linha)}</td><td>${esc(entries[x.linha-1]?.pagador)}</td>
   <td>${esc([args.p_itens[x.linha-1]?.nosso_numero,args.p_itens[x.linha-1]?.documento,args.p_itens[x.linha-1]?.codigo_processo,args.p_itens[x.linha-1]?.cpf_cnpj].filter(Boolean).join(' · ')||'—')}</td><td>${esc(x.numero??'—')}</td><td>${esc(x.vencimento??'—')}</td><td>${esc(x.pagamento??'—')}</td>
   <td>${esc(x.valor===null?'—':money.format(x.valor))}</td><td>${esc(x.total===null?'—':money.format(x.total))}</td><td>${esc(labels[x.situacao]||'Confira a linha')}</td></tr>`).join('')}</tbody></table></div>`;
  input.onchange=()=>{status.textContent='Gere a prévia do novo arquivo.';};
  if(!prontas)return;
  const confirmar=document.createElement('button');
  confirmar.type='button';
  confirmar.className='btn';
  confirmar.textContent=`Confirmar ${prontas} baixa(s)`;
  status.appendChild(confirmar);
  confirmar.onclick=async()=>{
   if(input.files?.[0]!==file||confirmar.disabled)return;
   if(!window.confirm('Você conferiu o arquivo original e os valores desta prévia? A confirmação registra baixas declaradas. Eventuais descontos seguem para revisão.'))return;
   confirmar.disabled=true;
   btn.disabled=true;
   input.disabled=true;
   try{
    const r=await sb.rpc('financeiro_baixa_relatorio',{...args,p_revisao:data.revisao});
    if(r.error)throw r.error;
    status.textContent=`${r.data.aplicadas} baixa(s) confirmada(s). ${linhas.length-prontas} linha(s) fora do lote.`;
    document.dispatchEvent(new CustomEvent('integral-receivables-changed'));
   }catch(e){
    status.textContent='Não foi possível confirmar o lote. '+(e.message||e)+' Gere uma nova prévia para conferir o resultado.';
   }finally{btn.disabled=false;input.disabled=false;}
  };
 }catch(e){
  status.textContent='Falha ao preparar o relatório. '+(e.message||e);
 }finally{btn.disabled=false;input.disabled=false;}
}
window.IntegralReceivablesImport={open:modal};
})();
