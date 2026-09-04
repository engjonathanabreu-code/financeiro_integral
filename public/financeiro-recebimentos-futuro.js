(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
if(!sb)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const monthLabel=m=>{const [y,mo]=m.split('-');return `${mo}/${y}`};
function ensureCss(){if(document.getElementById('recebFutureCss'))return;const s=document.createElement('style');s.id='recebFutureCss';s.textContent=`
#recebFutureModal .modal{width:min(1480px,calc(100vw - 28px));max-width:none!important}
#recebFutureModal .modal-body{overflow:hidden}
.receb-future-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}
.receb-future-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#667b76}.receb-future-legend span{display:flex;align-items:center;gap:6px}.receb-future-dot{width:10px;height:10px;border-radius:3px;background:#126b60}.receb-future-dot.red{background:#c64040}
.receb-future-scroll{overflow-x:auto;padding:8px 4px 12px}.receb-future-chart{display:flex;align-items:flex-end;gap:12px;min-height:390px;min-width:max-content;border-bottom:1px solid #d9e4e1;padding:36px 14px 0}
.receb-future-col{width:72px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px;position:relative}
.receb-future-bars{height:280px;width:58px;display:flex;align-items:flex-end;gap:5px;justify-content:center}.receb-future-bar{width:25px;min-height:2px;border-radius:7px 7px 2px 2px;background:#126b60;position:relative;transition:.15s}.receb-future-bar.red{background:#c64040}.receb-future-bar:hover{filter:brightness(.96)}
.receb-future-value{font-size:10px;font-weight:700;color:#315d55;white-space:nowrap;transform:rotate(-42deg);transform-origin:center;margin-bottom:13px}.receb-future-month{font-size:11px;font-weight:700;color:#173a34;white-space:nowrap}.receb-future-ending{font-size:10px;color:#a53030;line-height:1.2;text-align:center;max-width:88px;min-height:25px}
.receb-future-summary{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;margin-bottom:10px}.receb-future-summary .card{padding:12px}.receb-future-summary small{display:block;color:#70847f;margin-bottom:4px}.receb-future-summary b{font-size:18px;color:#173a34}
@media(max-width:700px){#recebFutureModal .modal{width:calc(100vw - 12px)}.receb-future-summary{grid-template-columns:1fr}.receb-future-col{width:64px}.receb-future-bars{width:52px}}
`;document.head.appendChild(s)}
function close(){document.querySelector('#recebFutureModal')?.remove()}
function addButton(){if(document.querySelector('#futureReceb')||document.querySelector('#title')?.textContent?.trim()!=='Recebimentos')return;const right=document.querySelector('.receb-toolbar .right');if(!right)return;const b=document.createElement('button');b.id='futureReceb';b.className='btn secondary';b.textContent='Futuro';b.onclick=openFuture;right.prepend(b)}
async function openFuture(){ensureCss();try{
 const start=document.querySelector('#recebMonth')?.value||new Date().toISOString().slice(0,7);
 const [pr,cr,mr]=await Promise.all([
   sb.from('fin_receb_parcelas').select('cliente_id,vencimento,valor_previsto,status').gte('vencimento',`${start}-01`).neq('status','Cancelado').order('vencimento'),
   sb.from('fin_receb_clientes').select('id,municipio_id,ativo'),
   sb.from('fin_receb_municipios').select('id,nome,ativo')
 ]);
 const err=[pr,cr,mr].find(x=>x.error);if(err?.error)throw err.error;
 const clients=new Map((cr.data||[]).filter(c=>c.ativo!==false).map(c=>[c.id,c]));const munis=new Map((mr.data||[]).filter(m=>m.ativo!==false).map(m=>[m.id,m]));
 const rows=(pr.data||[]).filter(p=>clients.has(p.cliente_id));if(!rows.length){alert('Não há parcelas futuras cadastradas.');return}
 const totals=new Map(),muniLast=new Map(),muniMonthValue=new Map();
 for(const p of rows){const mo=p.vencimento.slice(0,7),v=Number(p.valor_previsto||0),c=clients.get(p.cliente_id);totals.set(mo,(totals.get(mo)||0)+v);const mid=c?.municipio_id;if(mid){if(!muniLast.has(mid)||mo>muniLast.get(mid))muniLast.set(mid,mo);const k=`${mid}|${mo}`;muniMonthValue.set(k,(muniMonthValue.get(k)||0)+v)}}
 const months=[...totals.keys()].sort();const max=Math.max(...months.map(m=>totals.get(m)||0),1);
 const endingByMonth=new Map();for(const [mid,mo] of muniLast){if(!endingByMonth.has(mo))endingByMonth.set(mo,[]);endingByMonth.get(mo).push({name:munis.get(mid)?.nome||'Município',value:muniMonthValue.get(`${mid}|${mo}`)||0})}
 const totalFuture=months.reduce((s,m)=>s+(totals.get(m)||0),0),last=months[months.length-1],endingCount=[...endingByMonth.values()].reduce((s,a)=>s+a.length,0);
 const cols=months.map(m=>{const total=totals.get(m)||0,ends=endingByMonth.get(m)||[],red=ends.reduce((s,x)=>s+x.value,0),h=Math.max(3,Math.round(total/max*260)),rh=red?Math.max(3,Math.round(red/max*260)):0,names=ends.map(x=>x.name).join(', ');return `<div class="receb-future-col" title="${esc(monthLabel(m))} — Total ${esc(money(total))}${ends.length?` — Finalizam: ${esc(names)}`:''}"><div class="receb-future-value">${esc(money(total))}</div><div class="receb-future-bars"><div class="receb-future-bar" style="height:${h}px"></div>${red?`<div class="receb-future-bar red" style="height:${rh}px" title="${esc(names)} — ${esc(money(red))}"></div>`:''}</div><div class="receb-future-month">${monthLabel(m)}</div><div class="receb-future-ending">${ends.length?esc(names):''}</div></div>`}).join('');
 close();const d=document.createElement('div');d.id='recebFutureModal';d.className='modal-backdrop';d.style.zIndex='10030';d.innerHTML=`<section class="modal"><header class="modal-head"><h3>Recebimentos futuros</h3><button class="btn icon ghost" data-future-close>×</button></header><div class="modal-body"><div class="receb-future-head"><div><b>Previsão mensal a partir de ${monthLabel(start)}</b><div class="muted">Até o último mês com parcelas cadastradas.</div></div><div class="receb-future-legend"><span><i class="receb-future-dot"></i>Total previsto no mês</span><span><i class="receb-future-dot red"></i>Município(s) que encerram naquele mês</span></div></div><div class="receb-future-summary"><div class="card"><small>Total futuro previsto</small><b>${money(totalFuture)}</b></div><div class="card"><small>Último mês com entrada</small><b>${monthLabel(last)}</b></div><div class="card"><small>Encerramentos municipais</small><b>${endingCount}</b></div></div><div class="receb-future-scroll"><div class="receb-future-chart">${cols}</div></div></div><footer class="modal-foot"><button class="btn ghost" data-future-close>Fechar</button></footer></section>`;document.body.appendChild(d);d.querySelectorAll('[data-future-close]').forEach(x=>x.onclick=close);
 }catch(e){alert('Não foi possível montar a visão futura: '+(e.message||e))}}
ensureCss();const ob=new MutationObserver(addButton);ob.observe(document.documentElement,{subtree:true,childList:true});document.addEventListener('click',()=>setTimeout(addButton,0));window.addEventListener('load',addButton);addButton();
})();
