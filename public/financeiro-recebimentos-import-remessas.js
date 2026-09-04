(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
if(!sb)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const uid=()=>crypto.randomUUID();
const CITY_BY_PREFIX={AGM:'Águas Mornas',AUR:'Aurora',BDN:'Benedito Novo',DRP:'Doutor Pedrinho',IBI:'Ibirama',ILH:'Ilhota',LON:'Lontras',LNT:'Lontras',RSL:'Rio do Sul',NRSL:'Rio do Sul',JB:'José Boiteux',STA:'Santa Terezinha'};
let binding=false;

function injectStyles(){
 if(document.getElementById('recebRemessaStyles'))return;
 const s=document.createElement('style');s.id='recebRemessaStyles';s.textContent=`
 #recebModal .receb-client-cards{display:block!important;margin-top:10px!important}
 .receb-remessa-section{margin:0 0 14px}.receb-remessa-section+.receb-remessa-section{padding-top:4px}
 .receb-remessa-title{display:flex;align-items:center;gap:10px;margin:0 2px 7px;padding:7px 10px;border-radius:9px;background:#f1f7f5;color:#234b44;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
 .receb-remessa-title small{font-size:11px;font-weight:600;color:#78908b;letter-spacing:0;text-transform:none}
 .receb-remessa-list{display:grid;grid-template-columns:1fr;gap:6px}
 #recebModal .receb-client-card{padding:9px 11px!important;border-radius:10px!important;display:grid!important;grid-template-columns:minmax(260px,1.35fr) minmax(390px,2fr) auto;align-items:center;gap:10px;min-height:0!important}
 #recebModal .receb-client-card-head{align-items:center!important;gap:8px!important}
 #recebModal .receb-client-card h4{font-size:14px!important;line-height:1.15!important}
 #recebModal .receb-client-code{font-size:11px!important;margin-top:2px!important}
 #recebModal .receb-client-current{margin:0!important;padding:0!important;border:0!important;display:grid!important;grid-template-columns:auto auto auto auto auto auto;gap:2px 7px!important;align-items:center;font-size:11px!important}
 #recebModal .receb-client-current span{color:#718681;white-space:nowrap}
 #recebModal .receb-client-current b{font-size:12px;white-space:nowrap}
 #recebModal .receb-card-actions{margin:0!important;display:flex!important;gap:5px!important}
 #recebModal .receb-card-actions .btn{padding:5px 9px!important;min-height:28px!important;font-size:11px!important;flex:none!important}
 #recebModal .receb-status{font-size:10px!important;padding:3px 7px!important}
 .receb-import-preview{margin-top:8px;padding:9px 11px;border:1px solid #d9e5e2;border-radius:9px;background:#f8fbfa;font-size:12px;line-height:1.45}
 .receb-import-preview b{color:#204c43}
 @media(max-width:1050px){#recebModal .receb-client-card{grid-template-columns:minmax(210px,1fr) minmax(320px,1.7fr) auto}#recebModal .receb-client-current{grid-template-columns:auto auto auto auto}.receb-client-current span:nth-of-type(3),.receb-client-current b:nth-of-type(3){display:none}}
 @media(max-width:780px){#recebModal .receb-client-card{grid-template-columns:1fr auto!important}#recebModal .receb-client-current{grid-column:1/-1;grid-template-columns:1fr auto 1fr auto 1fr auto!important;border-top:1px solid #edf2f0!important;padding-top:6px!important}#recebModal .receb-card-actions{grid-column:1/-1;justify-content:flex-end}.receb-client-current span:nth-of-type(3),.receb-client-current b:nth-of-type(3){display:block}}
 @media(max-width:540px){#recebModal .receb-client-card{display:block!important}#recebModal .receb-client-current{margin-top:7px!important;grid-template-columns:1fr auto!important}#recebModal .receb-card-actions{margin-top:7px!important;justify-content:stretch}#recebModal .receb-card-actions .btn{flex:1!important}}
 `;document.head.appendChild(s);
}

function xlsDate(v){
 if(v==null||v==='')return null;
 if(v instanceof Date&&!isNaN(v))return v;
 if(typeof v==='number'&&window.XLSX?.SSF?.parse_date_code){const d=XLSX.SSF.parse_date_code(v);if(d)return new Date(d.y,d.m-1,d.d||1,12)}
 const d=new Date(v);return isNaN(d)?null:d;
}
function ymd15(d){if(!d)return null;return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-15`}
function monthCount(a,b){if(!a||!b)return 1;return Math.max(1,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+1)}
function fileRemessa(name){const base=norm(String(name||'').replace(/\.[^.]+$/,''));const m=base.match(/(?:^|\b)([A-Z]{2,5}\d{1,3})(?:\b|\s|-|_)/);return m?.[1]||null}
function rowRemessa(code,fileName){const c=norm(code);const m=c.match(/^([A-Z]{2,5}\d{1,3})_/);if(m)return m[1];return fileRemessa(fileName)||c.match(/^([A-Z]{2,5}\d{1,3})/)?.[1]||null}
function cityFromRemessa(remessa){const p=norm(remessa).match(/^([A-Z]+)/)?.[1]||'';return CITY_BY_PREFIX[p]||null}
function findHeader(rows){for(let i=0;i<Math.min(rows.length,20);i++){const r=(rows[i]||[]).map(norm);if(r.some(x=>x==='COD'||x==='CODIGO'||x==='CÓDIGO')&&r.some(x=>x==='NOME'||x==='CLIENTE'))return i}return -1}
function col(headers,aliases){const n=headers.map(norm);for(const a of aliases){const i=n.indexOf(norm(a));if(i>=0)return i}return -1}
function parseWorkbook(file){
 return file.arrayBuffer().then(buf=>{
  if(!window.XLSX)throw new Error('Leitor Excel não carregado. Atualize a página e tente novamente.');
  const wb=XLSX.read(buf,{type:'array',cellDates:false});let entries=[];
  wb.SheetNames.forEach(sheetName=>{
   const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,raw:true,defval:null});const hi=findHeader(rows);if(hi<0)return;
   const h=rows[hi]||[],ci=col(h,['COD','CÓDIGO','CODIGO']),ni=col(h,['NOME','CLIENTE']),ii=col(h,['INÍCIO','INICIO','1º VENCIMENTO','PRIMEIRO VENCIMENTO']),fi=col(h,['FIM','ÚLTIMO VENCIMENTO','ULTIMO VENCIMENTO']),vi=col(h,['VLR.PARC.','VLR PARC','VALOR PARCELA','PARCELA','VALOR']);
   for(let r=hi+1;r<rows.length;r++){
    const row=rows[r]||[],code=String(row[ci]??'').trim(),name=String(row[ni]??'').trim();if(!code&&!name)continue;if(['JUROS','MULTA','TOTAL','OBS','OBSERVAÇÃO','OBSERVACAO'].includes(norm(code)))continue;if(!code||!name)continue;
    const start=xlsDate(row[ii]),end=xlsDate(row[fi]??row[ii]),vp=Number(row[vi]||0);if(!start||!vp)continue;
    const remessa=rowRemessa(code,file.name),city=cityFromRemessa(remessa||fileRemessa(file.name));entries.push({codigo:code,nome:name,remessa,municipio:city,primeiro_vencimento:ymd15(start),numero_parcelas:monthCount(start,end||start),valor_parcela:vp,dia_vencimento:15,sourceSheet:sheetName});
   }
  });
  return entries;
 });
}
async function ensureMunicipio(name){
 const all=await sb.from('fin_receb_municipios').select('*');if(all.error)throw all.error;let m=(all.data||[]).find(x=>norm(x.nome)===norm(name));if(m)return m;
 const ins=await sb.from('fin_receb_municipios').insert({nome:name,uf:'SC'}).select().single();if(ins.error)throw ins.error;return ins.data;
}
async function ensureRemessa(municipioId,codigo,fileName,first){
 if(!codigo)return null;const r=await sb.from('fin_receb_remessas').select('*').eq('municipio_id',municipioId).eq('codigo',codigo).limit(1);if(r.error)throw r.error;if(r.data?.length)return r.data[0];
 const base=String(fileName||'').replace(/\.[^.]+$/,'');const ins=await sb.from('fin_receb_remessas').insert({municipio_id:municipioId,codigo,nome:base||codigo,data_emissao:first||new Date().toISOString().slice(0,10),observacoes:'Criada automaticamente na importação de planilha.',ativo:true}).select().single();if(ins.error)throw ins.error;return ins.data;
}
async function importEntries(entries,fileName,statusEl){
 let imported=0,skipped=0,failed=0;const grouped=new Map();for(const e of entries){const key=e.remessa||'SEM-REMESSA';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(e)}
 for(const [remCode,list] of grouped){const city=list.find(x=>x.municipio)?.municipio;if(!city){failed+=list.length;continue}let m;try{m=await ensureMunicipio(city)}catch(_){failed+=list.length;continue}let rem=null;try{rem=await ensureRemessa(m.id,remCode,fileName,list[0].primeiro_vencimento)}catch(_){failed+=list.length;continue}
  for(const e of list){try{const ex=await sb.from('fin_receb_clientes').select('id').eq('municipio_id',m.id).eq('codigo',e.codigo).limit(1);if(ex.error)throw ex.error;if(ex.data?.length){skipped++;continue}const count=e.numero_parcelas,vp=e.valor_parcela;const client=await sb.from('fin_receb_clientes').insert({municipio_id:m.id,remessa_id:rem?.id||null,codigo:e.codigo,nome:e.nome,valor_global:Number((vp*count).toFixed(2)),valor_entrada:0,numero_parcelas:count,valor_parcela:vp,primeiro_vencimento:e.primeiro_vencimento,dia_vencimento:15,ativo:true}).select().single();if(client.error)throw client.error;const d0=new Date(e.primeiro_vencimento+'T12:00:00'),ps=[];for(let i=0;i<count;i++){const d=new Date(d0.getFullYear(),d0.getMonth()+i,15,12);ps.push({id:uid(),cliente_id:client.data.id,numero:i+1,vencimento:d.toISOString().slice(0,10),valor_previsto:vp,status:'Pendente',valor_liquidado:0,diferenca:0})}const pr=await sb.from('fin_receb_parcelas').insert(ps);if(pr.error){await sb.from('fin_receb_clientes').delete().eq('id',client.data.id);throw pr.error}imported++;}catch(_){failed++}
   if(statusEl)statusEl.textContent=`Importando... ${imported} incluído(s), ${skipped} já existente(s), ${failed} falha(s).`;
  }
 }
 return {imported,skipped,failed};
}
function bindImporter(){
 const btn=document.querySelector('#importClients');if(!btn||btn.dataset.robustImport==='1'||binding)return;binding=true;btn.dataset.robustImport='1';btn.onclick=function(ev){ev?.preventDefault?.();ev?.stopPropagation?.();
  const old=document.querySelector('#recebModal');old?.remove();const d=document.createElement('div');d.id='recebModal';d.className='modal-backdrop';d.innerHTML=`<section class="modal"><header class="modal-head"><h3>Importar dados clientes</h3><button class="btn icon ghost" data-close>×</button></header><div class="modal-body"><div class="form-grid"><div class="field full"><label>Planilha Excel</label><input id="robustClientsFile" type="file" accept=".xlsx,.xls,.xlsb,.csv"></div><div class="field full"><div class="notice">O sistema lê diretamente COD, NOME, INÍCIO, FIM e valor da parcela. As letras A/B/C/D no código são preservadas como processos diferentes. Município e remessa são identificados pelo código.</div></div><div id="robustPreview" class="field full"></div><div id="robustStatus" class="field full"></div></div></div><footer class="modal-foot"><button class="btn ghost" data-close>Fechar</button><button class="btn" id="robustImportSave">Importar</button></footer></section>`;document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>d.remove());const input=d.querySelector('#robustClientsFile'),preview=d.querySelector('#robustPreview'),save=d.querySelector('#robustImportSave'),status=d.querySelector('#robustStatus');let parsed=[];
  input.onchange=async()=>{preview.textContent='Lendo planilha...';status.textContent='';try{parsed=await parseWorkbook(input.files[0]);const rems=[...new Set(parsed.map(x=>x.remessa).filter(Boolean))],cities=[...new Set(parsed.map(x=>x.municipio).filter(Boolean))];const unknown=parsed.filter(x=>!x.municipio).length;preview.innerHTML=`<div class="receb-import-preview"><b>${parsed.length}</b> linha(s) reconhecida(s)<br>Município(s): ${esc(cities.join(', ')||'não identificado')}<br>Remessa(s): ${esc(rems.join(', ')||'não identificada')}${unknown?`<br><b>${unknown}</b> linha(s) sem município reconhecido.`:''}</div>`}catch(e){parsed=[];preview.innerHTML=`<div class="notice danger">${esc(e.message)}</div>`}};
  save.onclick=async()=>{if(!input.files[0])return alert('Selecione a planilha.');if(!parsed.length){try{parsed=await parseWorkbook(input.files[0])}catch(e){return alert(e.message)}}if(!parsed.length)return alert('Nenhum cliente reconhecido. Verifique se a planilha possui as colunas COD, NOME, INÍCIO, FIM e valor da parcela.');if(parsed.some(x=>!x.municipio))return alert('Há códigos cujo município ainda não está mapeado. O sistema não vai importar parcialmente para evitar cadastro incorreto.');save.disabled=true;status.textContent='Importando clientes e parcelas...';try{const r=await importEntries(parsed,input.files[0].name,status);status.innerHTML=`<div class="notice ok"><b>${r.imported}</b> cliente(s) importado(s); <b>${r.skipped}</b> já existente(s); <b>${r.failed}</b> falha(s).</div>`;setTimeout(()=>{d.remove();document.querySelector('.nav [data-view="receivables"]')?.click()},900)}catch(e){status.innerHTML=`<div class="notice danger">${esc(e.message)}</div>`;save.disabled=false}}
 };binding=false;
}
async function groupRemessas(){
 injectStyles();const modal=document.querySelector('#recebModal');if(!modal)return;const title=(modal.querySelector('.modal-head h3')?.textContent||'').trim();if(!/—\s*clientes$/i.test(title))return;const cards=modal.querySelector('.receb-client-cards');if(!cards||cards.dataset.remessaGrouped==='1')return;const cardList=[...cards.querySelectorAll('.receb-client-card[data-client-id]')];if(!cardList.length)return;cards.dataset.remessaGrouped='1';
 try{const ids=cardList.map(c=>c.dataset.clientId);const [cr,rr]=await Promise.all([sb.from('fin_receb_clientes').select('id,remessa_id,codigo').in('id',ids),sb.from('fin_receb_remessas').select('id,codigo,nome')]);if(cr.error||rr.error)throw cr.error||rr.error;const clients=new Map((cr.data||[]).map(x=>[x.id,x])),rems=new Map((rr.data||[]).map(x=>[x.id,x]));const groups=new Map();cardList.forEach(card=>{const c=clients.get(card.dataset.clientId),r=c?.remessa_id?rems.get(c.remessa_id):null;const fallback=rowRemessa(c?.codigo||'','');const code=r?.codigo||fallback||'SEM REMESSA';const label=r?.nome&&norm(r.nome)!==norm(code)?`${code} — ${r.nome}`:code;if(!groups.has(code))groups.set(code,{label,cards:[]});groups.get(code).cards.push(card)});cards.innerHTML='';[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR',{numeric:true})).forEach(([code,g])=>{const sec=document.createElement('section');sec.className='receb-remessa-section';sec.innerHTML=`<div class="receb-remessa-title">${esc(g.label)} <small>${g.cards.length} cliente(s)</small></div><div class="receb-remessa-list"></div>`;const list=sec.querySelector('.receb-remessa-list');g.cards.forEach(c=>list.appendChild(c));cards.appendChild(sec)})}catch(e){cards.dataset.remessaGrouped='0'}
}

injectStyles();const obs=new MutationObserver(()=>{bindImporter();groupRemessas()});obs.observe(document.documentElement,{subtree:true,childList:true});document.addEventListener('click',()=>setTimeout(()=>{bindImporter();groupRemessas()},20));window.addEventListener('load',()=>{bindImporter();groupRemessas()});setTimeout(()=>{bindImporter();groupRemessas()},300);
})();