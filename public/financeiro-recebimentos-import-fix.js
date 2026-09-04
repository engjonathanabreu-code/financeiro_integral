(function(){
'use strict';

const CITY_BY_PREFIX={AGM:'Águas Mornas',AUR:'Aurora',BDN:'Benedito Novo',DRP:'Doutor Pedrinho',IBI:'Ibirama',ILH:'Ilhota'};
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const uid=()=>crypto.randomUUID();

function sbClient(){
  const cfg=window.ERP_SUPABASE||{};
  if(!window.supabase||!cfg.url||!cfg.publishableKey) throw new Error('Supabase não configurado.');
  return window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
}
function closeModal(){document.querySelector('#recebImportFixModal')?.remove()}
function modal(body){
  closeModal();
  const d=document.createElement('div');d.id='recebImportFixModal';d.className='modal-backdrop';
  d.innerHTML=`<section class="modal"><header class="modal-head"><h3>Importar dados clientes</h3><button class="btn icon ghost" data-close>×</button></header><div class="modal-body">${body}</div><footer class="modal-foot"><button class="btn ghost" data-close>Fechar</button><button class="btn" id="recebImportFixRun">Ler planilha</button></footer></section>`;
  document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeModal);return d;
}
function excelDate(v){
  if(v==null||v==='')return null;
  if(v instanceof Date&&!isNaN(v))return v;
  if(typeof v==='number'&&window.XLSX?.SSF?.parse_date_code){const p=XLSX.SSF.parse_date_code(v);if(p)return new Date(p.y,p.m-1,p.d,12)}
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);if(m){let y=Number(m[3]);if(y<100)y+=2000;return new Date(y,Number(m[2])-1,Number(m[1]),12)}
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12);
  m=s.match(/^(\d{1,2})[\/\-.](\d{2,4})$/);if(m){let y=Number(m[2]);if(y<100)y+=2000;return new Date(y,Number(m[1])-1,1,12)}
  const d=new Date(s);return isNaN(d)?null:d;
}
function isoDay15(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-15`}
function monthsInclusive(a,b){if(!a||!b)return 1;return Math.max(1,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+1)}
function num(v){if(typeof v==='number')return v;let s=String(v??'').trim().replace(/R\$\s*/gi,'').replace(/\s/g,'');if(!s)return 0;if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');else if(s.includes(','))s=s.replace(',','.');return Number(s)||0}
function detectHeader(rows){
  let best=null;
  for(let i=0;i<Math.min(rows.length,20);i++){
    const r=rows[i]||[], n=r.map(norm);let score=0;
    if(n.some(x=>['cod','codigo','clienteid'].includes(x)))score+=3;
    if(n.some(x=>['nome','cliente','nomecliente'].includes(x)))score+=3;
    if(n.some(x=>['inicio','inicial','primeirovencimento','vencimentoinicial'].includes(x)))score+=2;
    if(n.some(x=>['fim','final','ultimovencimento','vencimentofinal'].includes(x)))score+=2;
    if(n.some(x=>x.includes('vlrparc')||x.includes('valorparc')||x==='parcela'))score+=2;
    if(!best||score>best.score)best={i,score,n};
  }
  if(!best||best.score<6)throw new Error('Não consegui identificar as colunas da planilha. Preciso encontrar ao menos Código, Nome e dados de parcelas.');
  return best;
}
function idx(headers,aliases,contains=false){return headers.findIndex(h=>contains?aliases.some(a=>h.includes(a)):aliases.includes(h))}
function parseSheet(ws,fileName){
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});const h=detectHeader(rows),headers=h.n;
  const ci=idx(headers,['cod','codigo','clienteid']),ni=idx(headers,['nome','cliente','nomecliente']),si=idx(headers,['inicio','inicial','primeirovencimento','vencimentoinicial']),ei=idx(headers,['fim','final','ultimovencimento','vencimentofinal']);
  const vi=idx(headers,['vlrparc','valorparcela','parcela'],true),mi=idx(headers,['municipio','cidade','nomemunicipio']),ui=idx(headers,['uf','estado']);
  const out=[];
  for(let r=h.i+1;r<rows.length;r++){
    const row=rows[r]||[],codigo=String(row[ci]??'').trim(),nome=String(row[ni]??'').trim();if(!codigo||!nome)continue;
    if(/^(total|subtotal)$/i.test(nome))continue;
    const start=si>=0?excelDate(row[si]):null,end=ei>=0?excelDate(row[ei]):start,valor=vi>=0?num(row[vi]):0;
    const prefix=(codigo.match(/^([A-Za-z]{3})/)||fileName.match(/^([A-Za-z]{3})/)||[])[1]?.toUpperCase()||'';
    const municipio=mi>=0?String(row[mi]??'').trim():CITY_BY_PREFIX[prefix]||'';
    out.push({codigo,nome,municipio,uf:ui>=0?String(row[ui]||'SC').toUpperCase():'SC',start,end,numero_parcelas:monthsInclusive(start,end),valor_parcela:valor});
  }
  return out;
}
async function readWorkbook(file){
  if(!window.XLSX)throw new Error('Leitor de Excel não carregou. Atualize a página e tente novamente.');
  const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array',cellDates:true});let entries=[];
  for(const name of wb.SheetNames)entries.push(...parseSheet(wb.Sheets[name],file.name));
  if(!entries.length)throw new Error('A planilha foi lida, mas nenhuma linha válida de cliente foi encontrada.');
  return entries;
}
async function ensureMunicipality(sb,cache,name,uf){
  let m=cache.find(x=>norm(x.nome)===norm(name));if(m)return m;
  const q=await sb.from('fin_receb_municipios').select('*').ilike('nome',name).limit(1);if(q.error)throw q.error;if(q.data?.[0]){cache.push(q.data[0]);return q.data[0]}
  const ins=await sb.from('fin_receb_municipios').insert({nome:name,uf:uf||'SC'}).select().single();if(ins.error)throw ins.error;cache.push(ins.data);return ins.data;
}
async function importRows(entries,status){
  const sb=sbClient(),mr=await sb.from('fin_receb_municipios').select('*');if(mr.error)throw mr.error;const municipalities=mr.data||[];
  const codes=[...new Set(entries.map(x=>x.codigo).filter(Boolean))];let existing=[];
  for(let i=0;i<codes.length;i+=100){const q=await sb.from('fin_receb_clientes').select('id,codigo,municipio_id').in('codigo',codes.slice(i,i+100));if(q.error)throw q.error;existing.push(...(q.data||[]))}
  let imported=0,skipped=0,failed=0;
  for(let i=0;i<entries.length;i++){
    const x=entries[i];status.textContent=`Importando ${i+1} de ${entries.length}...`;
    if(!x.municipio){failed++;continue}
    const m=await ensureMunicipality(sb,municipalities,x.municipio,x.uf);
    if(existing.some(e=>String(e.codigo||'')===x.codigo&&e.municipio_id===m.id)){skipped++;continue}
    if(!x.start){failed++;continue}
    const count=x.numero_parcelas||1,vp=x.valor_parcela||0,first=isoDay15(x.start);
    const ins=await sb.from('fin_receb_clientes').insert({municipio_id:m.id,nome:x.nome,codigo:x.codigo,valor_global:vp*count,valor_entrada:0,numero_parcelas:count,valor_parcela:vp,primeiro_vencimento:first,dia_vencimento:15}).select().single();
    if(ins.error){failed++;continue}
    const ps=[];for(let n=0;n<count;n++){const d=new Date(x.start.getFullYear(),x.start.getMonth()+n,15,12);ps.push({id:uid(),cliente_id:ins.data.id,numero:n+1,vencimento:isoDay15(d),valor_previsto:vp,status:'Pendente'})}
    const pr=await sb.from('fin_receb_parcelas').insert(ps);if(pr.error){await sb.from('fin_receb_clientes').delete().eq('id',ins.data.id);failed++;continue}
    existing.push({id:ins.data.id,codigo:x.codigo,municipio_id:m.id});imported++;
  }
  return{imported,skipped,failed};
}
function openImporter(){
  const d=modal(`<div class="form-grid"><div class="field full"><label>Planilha Excel</label><input id="recebImportFixFile" type="file" accept=".xlsx,.xls,.xlsb,.csv"></div><div class="field full"><div class="notice">A planilha é lida diretamente pelo sistema. Códigos A/B/C são preservados como processos distintos e nunca são descartados como duplicidade. O vencimento é gerado no dia 15 de cada mês.</div></div><div id="recebImportFixStatus" class="field full"></div></div>`);
  d.querySelector('#recebImportFixRun').onclick=async()=>{
    const file=d.querySelector('#recebImportFixFile').files[0],status=d.querySelector('#recebImportFixStatus'),btn=d.querySelector('#recebImportFixRun');if(!file)return alert('Selecione a planilha.');
    btn.disabled=true;status.textContent='Lendo células da planilha...';
    try{
      const entries=await readWorkbook(file);const unknown=[...new Set(entries.filter(x=>!x.municipio).map(x=>x.codigo))];
      if(unknown.length)throw new Error(`Não consegui identificar o município de ${unknown.length} linha(s). Verifique o prefixo do código ou inclua uma coluna Município.`);
      status.innerHTML=`<div class="notice">${entries.length} linha(s) reconhecida(s). Gravando no sistema...</div>`;
      const r=await importRows(entries,status);status.innerHTML=`<div class="notice ok"><b>${r.imported}</b> processo(s) importado(s). ${r.skipped?`<b>${r.skipped}</b> já existiam e foram ignorados. `:''}${r.failed?`<b>${r.failed}</b> linha(s) não puderam ser importadas.`:''}</div>`;
      btn.textContent='Concluído';setTimeout(()=>{closeModal();window.location.reload()},1200);
    }catch(e){status.innerHTML=`<div class="notice danger">${esc(e.message||e)}</div>`;btn.disabled=false}
  };
}

document.addEventListener('click',e=>{const b=e.target.closest?.('#importClients');if(!b)return;e.preventDefault();e.stopImmediatePropagation();openImporter()},true);
})();
