/* Integral Financeiro - leitura de planilhas e PDFs enviados por usuários (FIN-05).
   SheetJS 0.18.5 tem poluição de protótipo (CVE-2023-30533) e ReDoS (CVE-2024-22363); pdf.js 3.11.174
   executa código de fontes quando eval está ligado (CVE-2024-4367). Enquanto as versões corrigidas
   não são publicadas (ver docs/SECURITY.md), toda leitura passa por aqui: tipo e tamanho conferidos,
   protótipos vigiados e eval do pdf.js desligado (mitigação indicada pelo próprio pdf.js). */
(function(){
'use strict';
const LIMITS={planilha:15*1024*1024,pdf:20*1024*1024};
const TYPES={planilha:/\.(xlsx|xls|xlsb|csv)$/i,pdf:/\.pdf$/i};
const MIMES={planilha:/^$/,pdf:/^application\/pdf$/i};
const mb=n=>Math.round(n/1024/1024);

function check(file,kind){
  if(!file||typeof file.size!=='number')throw new Error('Arquivo inválido.');
  if(!TYPES[kind].test(String(file.name||''))&&!(file.type&&MIMES[kind].test(file.type)))throw new Error(kind==='pdf'?'Envie um arquivo PDF.':'Envie uma planilha .xlsx, .xls, .xlsb ou .csv.');
  if(file.size<=0)throw new Error('O arquivo está vazio.');
  if(file.size>LIMITS[kind])throw new Error(`O arquivo deve ter até ${mb(LIMITS[kind])} MB.`);
}

const PROTOS=[Object.prototype,Array.prototype,Function.prototype,String.prototype];
function guardPrototypes(fn){
  const before=PROTOS.map(p=>new Set(Object.getOwnPropertyNames(p)));
  const restore=()=>{let polluted=false;PROTOS.forEach((p,i)=>{for(const k of Object.getOwnPropertyNames(p))if(!before[i].has(k)){polluted=true;try{delete p[k]}catch{}}});return polluted};
  let out;
  try{out=fn()}catch(e){restore();throw e}
  if(restore())throw new Error('A planilha contém estrutura inválida e foi recusada.');
  return out;
}

function workbook(file,buf,options){
  check(file,'planilha');
  if(!window.XLSX)throw new Error('Leitor de planilha não carregou. Atualize a página e tente novamente.');
  return guardPrototypes(()=>window.XLSX.read(buf,options));
}

async function pdfDocument(file,buf){
  check(file,'pdf');
  const lib=window.pdfjsLib;if(!lib)throw new Error('Leitor de PDF não carregou. Atualize a página e tente novamente.');
  const head=new Uint8Array(buf.slice(0,5));
  if(String.fromCharCode(...head)!=='%PDF-')throw new Error('O arquivo não é um PDF válido.');
  return lib.getDocument({data:buf,isEvalSupported:false}).promise;
}

window.IntegralSafeReaders={check,workbook,pdfDocument,LIMITS};
})();
