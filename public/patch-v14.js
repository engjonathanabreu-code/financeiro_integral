/* Integral Financeiro V14 - exportações CSV/PDF e ZIP de documentos fiscais */
(function(){
'use strict';
const monthOf=d=>String(d||'').slice(0,7);
const nowMonth=()=>new Date().toISOString().slice(0,7);
const safe=s=>String(s||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
const csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`;
const downloadBlob=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)};
const moneyNum=v=>Number(v||0);
function realRows(){
  const paid=(db.accountPayments||[]).filter(p=>p.status==='Paga').map(p=>{const m=(db.accountMasters||[]).find(a=>a.id===p.accountId);return{date:(p.paidAt||p.due||'').slice(0,10),description:m?.name||'Conta paga',kind:m?.category||'Despesa fixa',direction:'Saída',value:moneyNum(p.value),source:'Conta paga'}});
  const budget=(db.budgetExpenses||[]).map(e=>({date:e.date,description:e.description||'Gasto de orçamento',kind:'Despesa variável',direction:'Saída',value:moneyNum(e.value),source:'Orçamento'}));
  const manual=(db.cashflow||[]).filter(r=>!['Conta paga','Orçamento'].includes(r.source));
  return [...manual,...paid,...budget];
}
function exportCashCsv(month){
  const rows=realRows().filter(r=>monthOf(r.date)===month).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const lines=[['Data','Descrição','Natureza','Origem','Tipo','Valor'].map(csvCell).join(';'),...rows.map(r=>[r.date,r.description,r.kind||'',r.source||'',r.direction||'',Number(r.value||0).toFixed(2).replace('.',',')].map(csvCell).join(';'))];
  downloadBlob(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),`fluxo-caixa-${month}.csv`);
}
function exportCashPdf(month){
  if(!window.jspdf?.jsPDF){alert('Biblioteca de PDF não carregou. Recarregue a página e tente novamente.');return;}
  const rows=realRows().filter(r=>monthOf(r.date)===month).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const ins=rows.filter(r=>r.direction==='Entrada').reduce((s,r)=>s+moneyNum(r.value),0),outs=rows.filter(r=>r.direction==='Saída').reduce((s,r)=>s+moneyNum(r.value),0);
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFontSize(16);doc.text(`Fluxo de Caixa - ${month}`,14,16);doc.setFontSize(10);doc.text(`Entradas: ${money(ins)}   Saídas: ${money(outs)}   Saldo: ${money(ins-outs)}`,14,23);
  const body=rows.map(r=>[r.date||'',r.description||'',r.kind||'',r.source||'',r.direction||'',money(r.value)]);
  if(typeof doc.autoTable==='function')doc.autoTable({startY:28,head:[['Data','Descrição','Natureza','Origem','Tipo','Valor']],body,styles:{fontSize:8},columnStyles:{5:{halign:'right'}}});
  else {let y=31;body.slice(0,28).forEach(r=>{doc.text(r.join(' | ').slice(0,180),14,y);y+=6})}
  doc.save(`fluxo-caixa-${month}.pdf`);
}
async function fetchStoredFile(doc){
  if(doc.storagePath){const sb=window.IntegralERP?.sb;if(!sb)throw new Error('Supabase indisponível');const {data,error}=await sb.storage.from(doc.storageBucket||'documentos').download(doc.storagePath);if(error)throw error;return data;}
  if(doc.fileData&&String(doc.fileData).startsWith('data:')){const res=await fetch(doc.fileData);return await res.blob();}
  return null;
}
async function exportFiscalZip(month,button){
  if(!window.JSZip){alert('Biblioteca ZIP não carregou. Recarregue a página e tente novamente.');return;}
  const docs=(db.docs||[]).filter(d=>monthOf(d.date)===month);
  if(!docs.length){alert('Não há documentos fiscais neste mês.');return;}
  const old=button?.textContent;if(button){button.disabled=true;button.textContent='Preparando ZIP...'}
  try{
    const zip=new JSZip();let added=0;const missing=[];
    for(const d of docs){try{const blob=await fetchStoredFile(d);if(blob){zip.file(safe(d.name||`documento-${d.id}`),blob);added++;}else missing.push(d.name||`Documento ${d.id}`);}catch(e){missing.push(d.name||`Documento ${d.id}`)}}
    if(missing.length)zip.file('_arquivos_legados_indisponiveis.txt',`Os seguintes registros possuem apenas metadados e não têm arquivo físico disponível para exportação:\n\n${missing.join('\n')}`);
    if(!added&&missing.length===0){alert('Nenhum arquivo físico disponível para este mês.');return;}
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(blob,`documentos-fiscais-${month}.zip`);
  }finally{if(button){button.disabled=false;button.textContent=old}}
}
async function analyzeDocument(file){
  const dataUrl=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});
  const candidates=realRows().map((r,i)=>({id:String(r.id||i),date:r.date||'',description:r.description||'',value:moneyNum(r.value),source:r.source||''}));
  const r=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataUrl,fileName:file.name,sector:'',candidates})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.details||d.error||'Falha na IA');return d;
}
async function uploadFiscalDocument(){
  const x=v2modal('Enviar documento fiscal',`<form id="v14DocUpload"><div class="modal-body"><div class="dropzone"><h3>Documento fiscal ou comprovante</h3><p>A IA identifica valor, fornecedor e data. O arquivo será armazenado no Supabase para permitir exportação em ZIP.</p><input id="v14DocFile" type="file" accept="image/*,.pdf" required></div><div class="field"><label>Setor</label><select name="sector"><option value="">Não informado</option>${(db.sectors||[]).filter(s=>s.active!==false).map(s=>`<option>${esc(s.name)}</option>`).join('')}</select></div><div id="v14DocStatus" class="notice">Aguardando arquivo.</div></div><div class="modal-foot"><button class="btn">Analisar e salvar</button></div></form>`);
  x.querySelector('#v14DocUpload').onsubmit=async e=>{e.preventDefault();const file=x.querySelector('#v14DocFile').files[0],status=x.querySelector('#v14DocStatus');if(!file)return;status.textContent='Analisando e armazenando documento...';try{
    const ai=await analyzeDocument(file),sector=new FormData(e.target).get('sector')||'',sb=window.IntegralERP?.sb;if(!sb)throw new Error('Conexão com Supabase indisponível.');const {data:{user:authUser}}=await sb.auth.getUser();if(!authUser)throw new Error('Sessão do ERP não encontrada.');const date=ai.date||new Date().toISOString().slice(0,10),month=monthOf(date),path=`${authUser.id}/financeiro-fiscal/${month}/${Date.now()}-${safe(file.name)}`;const up=await sb.storage.from('documentos').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(up.error)throw up.error;
    const doc={id:Date.now()+Math.floor(Math.random()*9999),name:file.name,type:file.type||'Documento',supplier:ai.origin||'',date,cat:'Documento fiscal',sector,value:moneyNum(ai.value),status:ai.duplicate?'Duplicidade identificada':'Confirmado',file:{name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()},storageBucket:'documentos',storagePath:path,aiData:ai};db.docs=db.docs||[];db.docs.push(doc);if(!ai.duplicate&&doc.value>0){db.cashflow=db.cashflow||[];db.cashflow.push({id:Date.now()+Math.floor(Math.random()*9999),date:doc.date,direction:'Saída',description:ai.description||`Documento fiscal • ${doc.supplier||file.name}`,kind:'Despesa variável',value:doc.value,source:'Documento fiscal',documentId:doc.id})}save();x.remove();documents();
  }catch(err){status.textContent=`Não foi possível salvar: ${err.message}`}}
}
function installCashExports(){
  const old=window.cashflow;if(typeof old!=='function'||old.__v14)return;const wrapped=function(){const out=old.apply(this,arguments);setTimeout(()=>{const toolbar=document.querySelector('#content .toolbar');if(!toolbar||document.querySelector('#v14CashCsv'))return;const box=document.createElement('div');box.className='right export-actions';box.innerHTML='<button class="btn ghost" id="v14CashCsv">Exportar CSV</button><button class="btn ghost" id="v14CashPdf">Exportar PDF</button>';toolbar.appendChild(box);document.querySelector('#v14CashCsv').onclick=()=>exportCashCsv(v2state.cashMonth||nowMonth());document.querySelector('#v14CashPdf').onclick=()=>exportCashPdf(v2state.cashMonth||nowMonth());},0);return out};wrapped.__v14=true;window.cashflow=wrapped;cashflow=wrapped;
}
function installDocumentExports(){
  const old=window.documents;if(typeof old!=='function'||old.__v14)return;const wrapped=function(){const out=old.apply(this,arguments);setTimeout(()=>{const toolbar=document.querySelector('#content .toolbar');if(!toolbar)return;const upload=document.querySelector('#v10UploadDoc');if(upload)upload.onclick=uploadFiscalDocument;if(!document.querySelector('#v14DocsZip')){const b=document.createElement('button');b.id='v14DocsZip';b.className='btn ghost';b.textContent='Exportar mês em ZIP';b.onclick=()=>exportFiscalZip(v2state?.docsMonth||nowMonth(),b);toolbar.appendChild(b)}},0);return out};wrapped.__v14=true;window.documents=wrapped;documents=wrapped;
}
setTimeout(()=>{installCashExports();installDocumentExports();if(view==='cashflow')cashflow();if(view==='documents')documents();},300);
})();
