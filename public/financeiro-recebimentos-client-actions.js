(function(){
'use strict';

const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const br=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const competence=v=>v?`${v.slice(5,7)}/${v.slice(0,4)}`:'—';
let cache={clients:null,municipios:null,at:0};

function ensureStyles(){
 if(document.getElementById('recebHistoryStyles'))return;
 const s=document.createElement('style');s.id='recebHistoryStyles';s.textContent=`
 .receb-client-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(285px,1fr));gap:12px;margin-top:14px}
 .receb-client-card{border:1px solid #d6e2df;border-radius:14px;background:#fff;padding:16px;cursor:pointer;transition:.16s ease;box-shadow:0 1px 2px rgba(0,0,0,.02)}
 .receb-client-card:hover{transform:translateY(-1px);border-color:#8fb8af;box-shadow:0 5px 16px rgba(17,67,59,.08)}
 .receb-client-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
 .receb-client-card h4{margin:0;color:#173a34;font-size:16px;line-height:1.25}.receb-client-code{font-size:13px;color:#728b86;margin-top:5px}
 .receb-client-current{margin-top:13px;padding-top:12px;border-top:1px solid #edf2f0;display:grid;grid-template-columns:1fr auto;gap:6px 12px;font-size:13px}
 .receb-status{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#eef4f2;color:#325f56;white-space:nowrap}
 .receb-status.Pago{background:#e8f5ec;color:#257042}.receb-status.Inadimplente{background:#fff0ed;color:#a43a2c}.receb-status.Pendente{background:#fff7df;color:#8a6a16}
 .receb-card-actions{display:flex;gap:6px;margin-top:12px}.receb-card-actions .btn{flex:1}
 .receb-history-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-bottom:14px}.receb-history-summary .card{padding:12px}
 .receb-history-summary small{display:block;color:#6e817d;margin-bottom:4px}.receb-history-summary b{font-size:18px;color:#173a34}
 .receb-history-table td,.receb-history-table th{white-space:nowrap}.receb-history-row-ref{background:#f1f8f6}
 .receb-search-wrap{position:relative;min-width:290px}.receb-search-box{display:flex;align-items:center;gap:8px;border:1px solid #cfddda;border-radius:10px;background:#fff;padding:0 10px}.receb-search-box input{border:0!important;outline:0!important;box-shadow:none!important;min-width:240px;background:transparent}.receb-search-results{position:absolute;z-index:10050;left:0;right:0;top:calc(100% + 6px);background:#fff;border:1px solid #d4e0dd;border-radius:12px;box-shadow:0 14px 35px rgba(12,49,43,.16);max-height:360px;overflow:auto;padding:6px}.receb-search-item{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px;border-radius:8px;cursor:pointer;color:#173a34}.receb-search-item:hover{background:#f1f7f5}.receb-search-item small{display:block;color:#728b86;margin-top:2px}
 @media(max-width:800px){.receb-history-summary{grid-template-columns:repeat(2,1fr)}.receb-search-wrap{min-width:100%;width:100%}.receb-search-box input{min-width:0;width:100%}}
 `;document.head.appendChild(s);
}

async function getDirectory(force=false){
 if(!sb)return {clients:[],municipios:[]};
 if(!force&&cache.clients&&Date.now()-cache.at<30000)return cache;
 const [c,m]=await Promise.all([sb.from('fin_receb_clientes').select('*').order('nome'),sb.from('fin_receb_municipios').select('*').order('nome')]);
 if(c.error)throw c.error;if(m.error)throw m.error;
 cache={clients:c.data||[],municipios:m.data||[],at:Date.now()};return cache;
}

function currentReferenceMonth(){return document.querySelector('#recebMonth')?.value||new Date().toISOString().slice(0,7)}

function makeModal(title,body){
 document.querySelector('#recebHistoryModal')?.remove();
 const d=document.createElement('div');d.id='recebHistoryModal';d.className='modal-backdrop';d.style.zIndex='10020';
 d.innerHTML=`<section class="modal" style="max-width:1050px"><header class="modal-head"><h3>${esc(title)}</h3><button class="btn icon ghost" data-history-close>×</button></header><div class="modal-body">${body}</div><footer class="modal-foot"><button class="btn ghost" data-history-close>Fechar</button></footer></section>`;
 document.body.appendChild(d);d.querySelectorAll('[data-history-close]').forEach(b=>b.onclick=()=>d.remove());return d;
}

async function showHistory(clientId){
 if(!sb)return;
 try{
  const dir=await getDirectory();const client=dir.clients.find(c=>c.id===clientId);if(!client)return;
  const r=await sb.from('fin_receb_parcelas').select('*').eq('cliente_id',clientId).order('vencimento');if(r.error)throw r.error;
  const ps=r.data||[],paid=ps.filter(p=>p.status==='Pago'),late=ps.filter(p=>p.status==='Inadimplente'),open=ps.filter(p=>!['Pago','Inadimplente','Cancelado'].includes(p.status));
  const ref=currentReferenceMonth();
  const body=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px"><div><b>${esc(client.nome)}</b><div class="muted">${esc(client.codigo||client.cpf_cnpj||'')}</div></div><div class="receb-status">Competência selecionada ${competence(ref+'-01')}</div></div>
  <div class="receb-history-summary"><div class="card"><small>Total de parcelas</small><b>${ps.length}</b></div><div class="card"><small>Pagas</small><b>${paid.length}</b></div><div class="card"><small>Em aberto</small><b>${open.length}</b></div><div class="card"><small>Inadimplentes</small><b>${late.length}</b></div></div>
  <div class="table-wrap"><table class="table receb-history-table"><thead><tr><th>Competência</th><th>Parcela</th><th>Vencimento</th><th>Status</th><th>Valor previsto</th><th>Pago em</th><th>Valor pago</th></tr></thead><tbody>${ps.map(p=>`<tr class="${p.vencimento?.slice(0,7)===ref?'receb-history-row-ref':''}"><td><b>${competence(p.vencimento)}</b></td><td>#${p.numero}</td><td>${br(p.vencimento)}</td><td><span class="receb-status ${esc(p.status)}">${esc(p.status||'Pendente')}</span></td><td>${money(p.valor_previsto)}</td><td>${br(p.pago_em)}</td><td>${p.status==='Pago'?money(p.valor_liquidado||p.valor_previsto):'—'}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma parcela cadastrada para este cliente.</td></tr>'}</tbody></table></div>`;
  makeModal(`Histórico — ${client.nome}`,body);
 }catch(e){alert('Não foi possível carregar o histórico: '+(e.message||e));}
}

function reopenMunicipioWhenDeletionFinishes(municipioNome){
 const started=Date.now();const timer=setInterval(()=>{if(Date.now()-started>12000){clearInterval(timer);return;}if(document.querySelector('#recebModal'))return;const rows=[...document.querySelectorAll('[data-muni]')];const row=rows.find(r=>(r.querySelector('td b')?.textContent||'').trim()===municipioNome);if(row){clearInterval(timer);row.click();}},120);
}

function convertMunicipioToCards(){
 const modal=document.querySelector('#recebModal');if(!modal)return;
 const title=(modal.querySelector('.modal-head h3')?.textContent||'').trim();if(!title.endsWith('— clientes'))return;
 const municipioNome=title.replace(/\s*—\s*clientes\s*$/i,'').trim();
 const wrap=modal.querySelector('.table-wrap');if(!wrap||wrap.dataset.cardsReady==='1')return;
 const rows=[...wrap.querySelectorAll('tbody tr')].filter(r=>r.querySelector('button[data-client]'));if(!rows.length)return;
 const cards=document.createElement('div');cards.className='receb-client-cards';
 rows.forEach(row=>{
  const openBtn=row.querySelector('button[data-client]');const id=openBtn?.dataset.client;if(!id)return;
  const tds=row.querySelectorAll('td');const name=tds[0]?.querySelector('b')?.textContent?.trim()||'Cliente';const code=tds[0]?.querySelector('small')?.textContent?.trim()||'';const parcela=tds[1]?.textContent?.trim()||'—';const venc=tds[2]?.textContent?.trim()||'—';const status=tds[3]?.textContent?.trim()||'Sem parcela';const valor=tds[4]?.textContent?.trim()||'—';
  const card=document.createElement('article');card.className='receb-client-card';card.dataset.clientId=id;
  card.innerHTML=`<div class="receb-client-card-head"><div><h4>${esc(name)}</h4><div class="receb-client-code">${esc(code)}</div></div><span class="receb-status ${esc(status)}">${esc(status)}</span></div><div class="receb-client-current"><span>Parcela na competência</span><b>${esc(parcela)}</b><span>Vencimento</span><b>${esc(venc)}</b><span>Valor</span><b>${esc(valor)}</b></div><div class="receb-card-actions"><button class="btn small secondary" data-card-edit>Editar</button><button class="btn small danger" data-card-delete>Excluir</button></div>`;
  card.addEventListener('click',ev=>{if(ev.target.closest('button'))return;showHistory(id)});
  card.querySelector('[data-card-edit]').onclick=ev=>{ev.stopPropagation();openBtn.click();setTimeout(()=>document.querySelector('#editC')?.click(),0)};
  card.querySelector('[data-card-delete]').onclick=ev=>{ev.stopPropagation();openBtn.click();setTimeout(()=>{const del=document.querySelector('#delC');if(!del)return;del.click();cache.clients=null;reopenMunicipioWhenDeletionFinishes(municipioNome)},0)};
  cards.appendChild(card);
 });
 wrap.replaceChildren(cards);wrap.dataset.cardsReady='1';
}

async function addSearch(){
 if(document.querySelector('#recebClientSearch')||document.querySelector('#title')?.textContent?.trim()!=='Recebimentos')return;
 const toolbar=document.querySelector('.receb-toolbar');if(!toolbar)return;
 ensureStyles();
 const left=toolbar.querySelector('.left')||toolbar;const holder=document.createElement('div');holder.className='receb-search-wrap';holder.id='recebClientSearch';holder.innerHTML=`<div class="receb-search-box"><span aria-hidden="true">🔎</span><input type="search" placeholder="Buscar cliente pelo nome" autocomplete="off"></div><div class="receb-search-results" hidden></div>`;left.appendChild(holder);
 const input=holder.querySelector('input'),results=holder.querySelector('.receb-search-results');
 input.addEventListener('input',async()=>{const term=input.value.trim().toLocaleLowerCase('pt-BR');if(term.length<2){results.hidden=true;results.innerHTML='';return;}try{const dir=await getDirectory();const found=dir.clients.filter(c=>c.ativo!==false&&((c.nome||'').toLocaleLowerCase('pt-BR').includes(term)||(c.codigo||'').toLocaleLowerCase('pt-BR').includes(term))).slice(0,15);results.innerHTML=found.map(c=>{const m=dir.municipios.find(x=>x.id===c.municipio_id);return`<button class="receb-search-item" data-search-client="${c.id}"><b>${esc(c.nome)}</b><small>${esc(c.codigo||'')} · ${esc(m?.nome||'Município não informado')}</small></button>`}).join('')||'<div class="muted" style="padding:10px">Nenhum cliente encontrado.</div>';results.hidden=false;results.querySelectorAll('[data-search-client]').forEach(b=>b.onclick=()=>{results.hidden=true;input.value=b.querySelector('b')?.textContent||input.value;showHistory(b.dataset.searchClient)})}catch(e){results.innerHTML='<div class="muted" style="padding:10px">Não foi possível consultar os clientes.</div>';results.hidden=false;}});
 document.addEventListener('click',ev=>{if(!holder.contains(ev.target))results.hidden=true});
}

ensureStyles();
const observer=new MutationObserver(()=>{convertMunicipioToCards();addSearch();});observer.observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('click',()=>setTimeout(()=>{convertMunicipioToCards();addSearch()},0));window.addEventListener('load',()=>{convertMunicipioToCards();addSearch()});
})();
