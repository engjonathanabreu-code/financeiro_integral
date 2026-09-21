(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const digits=s=>String(s||'').replace(/\D/g,'');
const fileData=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});
const isSpreadsheet=file=>/\.(csv|xlsx|xls|xlsb)$/i.test(file?.name||'');
function close(){document.querySelector('#recebSmartReport')?.remove()}
function modal(){close();const d=document.createElement('div');d.id='recebSmartReport';d.className='modal-backdrop';d.innerHTML=`<section class="modal"><header class="modal-head"><h3>Importar relatório de pagamentos</h3><button class="btn icon ghost" data-close>×</button></header><div class="modal-body"><div class="form-grid"><div class="field full"><label>Relatório (PDF, CSV ou Excel)</label><input id="smartPayFile" type="file" accept="application/pdf,.csv,.xlsx,.xls,.xlsb"></div><div class="field full"><div class="notice">Cada título liquidado é conciliado com a <b>parcela do vencimento informado no relatório</b>, inclusive parcelas de meses futuros. Se o mesmo cliente pagar várias parcelas, cada vencimento é marcado separadamente. Juros e multa recalibram apenas a parcela correspondente.<br><br>Planilha CSV/Excel: use as colunas <code>documento</code>, <code>codigo_processo</code>, <code>nome</code>, <code>parcela_vencimento</code>, <code>valor_pago</code> e <code>data_pagamento</code> (é o formato exportado a partir do relatório do banco).</div></div><div id="smartPayStatus" class="field full"></div></div></div><footer class="modal-foot"><button class="btn ghost" data-close>Fechar</button><button class="btn" id="smartPayImport">Importar</button></footer></section>`;document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(x=>x.onclick=close);d.querySelector('#smartPayImport').onclick=run}
async function responseJsonSafe(rr){const raw=await rr.text();let j=null;try{j=raw?JSON.parse(raw):null}catch{}if(j)return j;if(rr.status===504)throw new Error('O relatório demorou além do limite do servidor. A leitura foi otimizada; tente novamente após atualizar a página.');throw new Error(raw&&raw.length<240?raw:`Falha do servidor ao processar o relatório (HTTP ${rr.status}).`)}
function brDateToIso(s){s=String(s||'').trim();if(!s)return null;let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;return `${y}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`}m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;return null}
function brNum(v){if(typeof v==='number')return v;let s=String(v??'').trim().replace(/R\$\s*/gi,'');if(!s)return 0;if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');return Number(s)||0}
function pickCol(headers,aliases){for(const a of aliases){const i=headers.indexOf(norm(a));if(i>=0)return i}return -1}
function rowsToEntries(rows){
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
  cpf:pickCol(headers,['cpfcnpj','cpf','cnpj'])
 };
 if(ci.nome<0||ci.vencimento<0||ci.pago<0)throw new Error('Não encontrei as colunas esperadas (nome, parcela_vencimento, valor_pago). Confira o cabeçalho da planilha.');
 const out=[];
 for(let r=1;r<rows.length;r++){
  const row=rows[r]||[];if(!row.length||row.every(c=>c==null||c===''))continue;
  const nome=String(row[ci.nome]??'').trim();if(!nome)continue;
  const paid=brNum(row[ci.pago]);
  out.push({
   documento:ci.documento>=0?String(row[ci.documento]??'').trim():(ci.processo>=0?String(row[ci.processo]??'').trim():null),
   nosso_numero:ci.nossonumero>=0?String(row[ci.nossonumero]??'').trim():null,
   cpf_cnpj:ci.cpf>=0?String(row[ci.cpf]??'').trim():null,
   pagador:nome,
   vencimento:brDateToIso(row[ci.vencimento]),
   valor_nominal:paid,
   valor_liquidado:paid,
   pagamento:ci.dtpgto>=0?brDateToIso(row[ci.dtpgto]):null
  });
 }
 if(!out.length)throw new Error('Nenhuma linha de pagamento reconhecida na planilha.');
 return out;
}
async function parseCsvText(text){
 const lines=text.split(/\r\n|\n|\r/).filter(l=>l.trim().length);
 if(!lines.length)throw new Error('Arquivo CSV vazio.');
 const delim=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
 const rows=lines.map(l=>l.split(delim).map(c=>c.trim().replace(/^"|"$/g,'')));
 return rowsToEntries(rows);
}
async function parseSpreadsheetFile(file){
 if(/\.csv$/i.test(file.name)){const text=await file.text();return parseCsvText(text)}
 if(!window.XLSX)throw new Error('Leitor de planilha não carregou. Atualize a página e tente novamente.');
 const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array',raw:true});
 const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null});
 return rowsToEntries(rows);
}
async function run(){const file=document.querySelector('#smartPayFile')?.files?.[0],status=document.querySelector('#smartPayStatus'),btn=document.querySelector('#smartPayImport');if(!file)return alert('Selecione o arquivo.');btn.disabled=true;status.textContent='Lendo relatório e conciliando parcelas...';try{
 let entries;
 if(isSpreadsheet(file)){
  entries=await parseSpreadsheetFile(file);
 }else{
  const data=await fileData(file),rr=await window.IntegralFileUploads.fetch('/api/ai-receivables',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:data,fileName:file.name,mode:'payments'})}),j=await responseJsonSafe(rr);if(!rr.ok||!j?.ok)throw new Error(j?.details||j?.error||'Falha na leitura do relatório');
  entries=j.entries||[];
 }
 const [cr,pr]=await Promise.all([sb.from('fin_receb_clientes').select('*'),sb.from('fin_receb_parcelas').select('*')]);if(cr.error)throw cr.error;if(pr.error)throw pr.error;const clients=cr.data||[],parcels=pr.data||[];let ok=0,pending=0,adjusted=0,future=0,retroCreated=0;const misses=[],used=new Set(),currentMonth=new Date().toISOString().slice(0,7);
 const eligible=z=>z&&!used.has(z.id);
 const byClientDue=(clientId,due,nom)=>parcels.find(z=>eligible(z)&&z.cliente_id===clientId&&(!due||z.vencimento===due)&&(!nom||Math.abs(Number(z.valor_previsto||0)-nom)<0.03))||parcels.find(z=>eligible(z)&&z.cliente_id===clientId&&(!due||z.vencimento===due));
 for(const x of entries||[]){let p=null,c=null;const doc=norm(x.documento),nn=digits(x.nosso_numero),cpf=digits(x.cpf_cnpj),name=norm(x.pagador),due=String(x.vencimento||'').slice(0,10),nom=Number(x.valor_nominal||0),paid=Number(x.valor_liquidado||nom||0);
  if(nn)p=parcels.find(z=>eligible(z)&&digits(z.nosso_numero)===nn&&(!due||z.vencimento===due));
  if(!p&&doc)p=parcels.find(z=>eligible(z)&&norm(z.documento)===doc&&(!due||z.vencimento===due));
  if(!p&&doc){c=clients.find(z=>norm(z.codigo)===doc);if(c)p=byClientDue(c.id,due,nom);}
  if(!p&&cpf){c=clients.find(z=>digits(z.cpf_cnpj)===cpf);if(c)p=byClientDue(c.id,due,nom);}
  if(!p&&name){const exact=clients.filter(z=>norm(z.nome)===name);if(exact.length===1){c=exact[0];p=byClientDue(c.id,due,nom);}}
  if(!p&&name){const near=clients.filter(z=>{const n=norm(z.nome);return n&&name&&(n.startsWith(name)||name.startsWith(n))});if(near.length===1){c=near[0];p=byClientDue(c.id,due,nom);}}
  if(p){const diff=paid-nom,upd={status:'Pago',pago_em:x.pagamento||null,valor_liquidado:paid,diferenca:diff,nosso_numero:p.nosso_numero||x.nosso_numero||null,documento:p.documento||x.documento||null};if(Math.abs(diff)>0.009){upd.valor_previsto=paid;adjusted++;}const ur=await sb.from('fin_receb_parcelas').update(upd).eq('id',p.id);if(ur.error){pending++;misses.push(x.pagador||x.documento||'registro')}else{used.add(p.id);ok++;if(due&&due.slice(0,7)>currentMonth)future++;}
  }else{const retroDate=due||String(x.pagamento||'').slice(0,10),isPast=retroDate&&retroDate.slice(0,7)<currentMonth;if(c&&isPast&&paid>0){const clientParcels=parcels.filter(z=>z.cliente_id===c.id),numero=Math.max(0,...clientParcels.map(z=>Number(z.numero||0)))+1,row={id:crypto.randomUUID(),cliente_id:c.id,numero,vencimento:retroDate,status:'Pago',valor_previsto:paid,pago_em:x.pagamento||retroDate,valor_liquidado:paid,diferenca:0,nosso_numero:x.nosso_numero||null,documento:x.documento||null};const ins=await sb.from('fin_receb_parcelas').insert(row).select().single();if(ins.error){pending++;misses.push(x.pagador||x.documento||'registro')}else{parcels.push(ins.data);used.add(ins.data.id);ok++;retroCreated++;}}else{pending++;misses.push(x.pagador||x.documento||'registro')}}
 }
 status.innerHTML=`<div class="notice ok"><b>${ok}</b> parcela(s) marcada(s) como paga(s), sendo <b>${future}</b> de vencimentos futuros e <b>${retroCreated}</b> parcela(s) retroativa(s) criada(s). <b>${adjusted}</b> parcela(s) tiveram o valor recalibrado. <b>${pending}</b> ficaram pendentes para conferência.${misses.length?`<br><small>Não conciliados: ${misses.slice(0,8).join(', ')}${misses.length>8?'…':''}</small>`:''}</div>`;btn.disabled=false;
 }catch(e){status.innerHTML=`<div class="notice danger">${String(e.message||e)}</div>`;btn.disabled=false}}
document.addEventListener('click',e=>{const b=e.target.closest?.('#importReport');if(!b)return;e.preventDefault();e.stopImmediatePropagation();modal()},true);
})();
