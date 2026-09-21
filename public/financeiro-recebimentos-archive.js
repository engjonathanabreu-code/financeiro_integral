/* Integral Financeiro — arquivar/reativar municípios, clientes e parcelas. */
(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
if(!sb)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const br=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'—';

function ensureStyles(){
 if(document.getElementById('recebArchiveStyles'))return;
 const s=document.createElement('style');s.id='recebArchiveStyles';s.textContent=`
 [data-archive-muni],[data-archive-client]{margin-left:6px}
 .receb-archived-list{display:grid;gap:8px;margin-top:8px}
 .receb-archived-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 11px;border:1px solid #d9e5e2;border-radius:10px;background:#f8fbfa}
 .receb-archived-row small{display:block;color:#728b86;margin-top:2px}
 `;document.head.appendChild(s);
}

async function reloadReceivables(){await window.IntegralReceivables?.render?.()}

async function setAtivo(table,id,ativo){
 const r=await sb.from(table).update({ativo}).eq('id',id);
 if(r.error){alert('Não foi possível atualizar: '+r.error.message);return false}
 return true;
}

// ---- Arquivar município (linha da tabela principal) ----
function decorateMunicipioRows(){
 const state=window.IntegralReceivables?.getState?.();if(!state)return;
 document.querySelectorAll('.receb-muni-table tbody tr[data-muni]').forEach(row=>{
  if(row.querySelector('[data-archive-muni]'))return;
  const id=row.dataset.muni,m=state.municipios.find(x=>x.id===id);if(!m)return;
  const lastTd=row.querySelector('td:last-child');if(!lastTd)return;
  const btn=document.createElement('button');
  btn.className='btn small secondary';btn.dataset.archiveMuni=id;btn.textContent='Arquivar';
  btn.onclick=async(ev)=>{ev.stopPropagation();if(!confirm(`Arquivar o município ${m.nome}? Ele deixará de aparecer nas listas ativas (os dados não são apagados).`))return;btn.disabled=true;if(await setAtivo('fin_receb_municipios',id,false))await reloadReceivables()};
  lastTd.appendChild(btn);
 });
}

// ---- Arquivar cliente (cartões de cliente dentro do modal do município) ----
function decorateClientCards(){
 document.querySelectorAll('.receb-client-card[data-client-id]').forEach(card=>{
  const actions=card.querySelector('.receb-card-actions');if(!actions||actions.querySelector('[data-archive-client]'))return;
  const id=card.dataset.clientId;
  const btn=document.createElement('button');
  btn.className='btn small secondary';btn.dataset.archiveClient=id;btn.textContent='Arquivar';
  btn.onclick=async(ev)=>{ev.stopPropagation();if(!confirm('Arquivar este cliente? Ele deixará de aparecer nas listas ativas (os dados e o histórico são mantidos).'))return;btn.disabled=true;if(await setAtivo('fin_receb_clientes',id,false)){await reloadReceivables();document.querySelector('#recebModal')?.remove()}};
  actions.appendChild(btn);
 });
}

// ---- Arquivar parcela (linhas do histórico do cliente) ----
function decorateHistoryRows(){
 document.querySelectorAll('.receb-history-table tbody tr[data-parcela-id]').forEach(row=>{
  if(row.querySelector('[data-archive-parcela]'))return;
  const lastTd=row.querySelector('td:last-child');if(!lastTd)return;
  const id=row.dataset.parcelaId;
  const btn=document.createElement('button');
  btn.className='btn small ghost';btn.dataset.archiveParcela=id;btn.textContent='Arquivar';btn.style.marginLeft='6px';
  btn.onclick=async(ev)=>{ev.stopPropagation();if(!confirm('Arquivar esta parcela? Ela deixará de contar nos totais do mês.'))return;btn.disabled=true;if(await setAtivo('fin_receb_parcelas',id,false)){await reloadReceivables();row.remove()}};
  lastTd.appendChild(btn);
 });
}

// ---- Modal "Arquivados" (município/cliente/parcela) com opção de reativar ----
function closeArchivedModal(){document.querySelector('#recebArchivedModal')?.remove()}
function archivedModal(body){
 closeArchivedModal();
 const d=document.createElement('div');d.id='recebArchivedModal';d.className='modal-backdrop';d.style.zIndex='10030';
 d.innerHTML=`<section class="modal"><header class="modal-head"><h3>Arquivados</h3><button class="btn icon ghost" data-close>×</button></header><div class="modal-body">${body}</div><footer class="modal-foot"><button class="btn ghost" data-close>Fechar</button></footer></section>`;
 document.body.appendChild(d);d.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeArchivedModal);return d;
}
async function openArchived(){
 ensureStyles();
 const [m,c,p]=await Promise.all([
  sb.from('fin_receb_municipios').select('*').eq('ativo',false).order('nome'),
  sb.from('fin_receb_clientes').select('*, fin_receb_municipios(nome)').eq('ativo',false).order('nome'),
  sb.from('fin_receb_parcelas').select('*, fin_receb_clientes(nome)').eq('ativo',false).order('vencimento')
 ]);
 const municipios=m.data||[],clientes=c.data||[],parcelas=p.data||[];
 const section=(title,rows)=>`<h4 style="margin:16px 0 6px">${esc(title)}</h4><div class="receb-archived-list">${rows||'<div class="muted">Nenhum registro arquivado.</div>'}</div>`;
 const muniRows=municipios.map(x=>`<div class="receb-archived-row" data-row><span><b>${esc(x.nome)}</b><small>${esc(x.uf||'')}</small></span><button class="btn small" data-unarchive-muni="${x.id}">Reativar</button></div>`).join('');
 const clienteRows=clientes.map(x=>`<div class="receb-archived-row" data-row><span><b>${esc(x.nome)}</b><small>${esc(x.codigo||x.cpf_cnpj||'')} · ${esc(x.fin_receb_municipios?.nome||'')}</small></span><button class="btn small" data-unarchive-cliente="${x.id}">Reativar</button></div>`).join('');
 const parcelaRows=parcelas.map(x=>`<div class="receb-archived-row" data-row><span><b>${esc(x.fin_receb_clientes?.nome||'Cliente')}</b><small>Parcela #${x.numero} · Vencimento ${br(x.vencimento)} · ${money(x.valor_previsto)}</small></span><button class="btn small" data-unarchive-parcela="${x.id}">Reativar</button></div>`).join('');
 const d=archivedModal(section('Municípios',muniRows)+section('Clientes',clienteRows)+section('Parcelas',parcelaRows));
 d.querySelectorAll('[data-unarchive-muni]').forEach(b=>b.onclick=async()=>{b.disabled=true;if(await setAtivo('fin_receb_municipios',b.dataset.unarchiveMuni,true)){await reloadReceivables();b.closest('[data-row]').remove()}});
 d.querySelectorAll('[data-unarchive-cliente]').forEach(b=>b.onclick=async()=>{b.disabled=true;if(await setAtivo('fin_receb_clientes',b.dataset.unarchiveCliente,true)){await reloadReceivables();b.closest('[data-row]').remove()}});
 d.querySelectorAll('[data-unarchive-parcela]').forEach(b=>b.onclick=async()=>{b.disabled=true;if(await setAtivo('fin_receb_parcelas',b.dataset.unarchiveParcela,true)){await reloadReceivables();b.closest('[data-row]').remove()}});
}

function ensureArchivedButton(){
 const toolbar=document.querySelector('.receb-toolbar .right');
 if(!toolbar||toolbar.querySelector('#recebArchivedBtn'))return;
 const btn=document.createElement('button');btn.className='btn secondary';btn.id='recebArchivedBtn';btn.textContent='Arquivados';
 btn.onclick=openArchived;
 toolbar.appendChild(btn);
}

ensureStyles();
let scheduled=false;
function tick(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;ensureArchivedButton();decorateMunicipioRows();decorateClientCards();decorateHistoryRows()})}
new MutationObserver(tick).observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('click',()=>setTimeout(tick,0));
window.addEventListener('load',tick);setTimeout(tick,0);
})();
