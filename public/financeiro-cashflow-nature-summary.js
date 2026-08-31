/* Integral Financeiro — resumo por Natureza no rodapé do Fluxo de Caixa */
(function(){
'use strict';
const monthOf=d=>String(d||'').slice(0,7);
const esc2=s=>typeof esc==='function'?esc(s):String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money2=n=>typeof money==='function'?money(n):Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function currentMonth(){return window.v2state?.cashMonth||document.querySelector('#cashEditMonth')?.value||new Date().toISOString().slice(0,7)}
function rows(){try{return window.IntegralFinanceCashflowEditor?.allRows?.()||[]}catch(_){return []}}
function ensureStyle(){if(document.querySelector('#cashNatureSummaryStyle'))return;const s=document.createElement('style');s.id='cashNatureSummaryStyle';s.textContent=`
.cash-nature-card{border:1px solid rgba(13,56,59,.12);border-radius:14px;background:#fff;overflow:hidden;min-width:0}
.cash-nature-head{padding:14px 16px;border-bottom:1px solid rgba(13,56,59,.09);display:flex;justify-content:space-between;align-items:center;gap:14px}
.cash-nature-head strong{font-size:15px}.cash-nature-head .amount{font-size:17px;white-space:nowrap}
.cash-nature-columns,.cash-nature-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(130px,auto);gap:18px;align-items:center}
.cash-nature-columns{padding:8px 14px;background:rgba(13,56,59,.035);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.cash-nature-columns span:last-child{text-align:right}.cash-nature-row{position:relative;padding:11px 14px;border-top:1px solid rgba(13,56,59,.075);min-height:42px;overflow:hidden}
.cash-nature-row:first-child{border-top:0}.cash-nature-row .name{position:relative;z-index:1;min-width:0;font-weight:700;overflow-wrap:anywhere}.cash-nature-row .value{position:relative;z-index:1;text-align:right;font-weight:800;white-space:nowrap}
.cash-nature-share{position:absolute;left:0;bottom:0;height:2px;background:currentColor;opacity:.20;max-width:100%}
.cash-nature-empty{padding:24px 14px;text-align:center;color:var(--muted)}
.cash-nature-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start}
.cash-nature-summary-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px}
.cash-nature-balance{text-align:right;padding:9px 12px;border-radius:10px;background:rgba(13,56,59,.04);min-width:160px}.cash-nature-balance b{font-size:18px;white-space:nowrap}
@media(max-width:980px){.cash-nature-grid{grid-template-columns:1fr}.cash-nature-summary-head{align-items:flex-start}.cash-nature-balance{text-align:left}}
@media(max-width:560px){.cash-nature-columns,.cash-nature-row{grid-template-columns:minmax(0,1fr) auto;gap:10px}.cash-nature-row{padding:10px 12px}.cash-nature-head{padding:12px}.cash-nature-head .amount{font-size:15px}}
`;document.head.appendChild(s)}
function section(title,items,type){const total=items.reduce((s,x)=>s+x.value,0),positive=type==='Entrada',max=Math.max(1,...items.map(x=>x.value)),cls=positive?'kpi-positive':'kpi-negative';return `<section class="cash-nature-card"><div class="cash-nature-head"><strong>${title}</strong><span class="amount ${cls}">${money2(total)}</span></div><div class="cash-nature-columns"><span>Natureza</span><span>Total</span></div><div>${items.length?items.map(x=>`<div class="cash-nature-row"><span class="name">${esc2(x.nature)}</span><span class="value ${cls}">${money2(x.value)}</span><i class="cash-nature-share ${cls}" style="width:${Math.max(2,(x.value/max)*100).toFixed(1)}%"></i></div>`).join(''):'<div class="cash-nature-empty">Sem movimentações.</div>'}</div></section>`}
function build(){
  const content=document.querySelector('#content'),title=document.querySelector('#title')?.textContent||'';
  if(!content||title.trim()!=='Fluxo de Caixa')return;
  ensureStyle();content.querySelector('#cashNatureSummary')?.remove();
  const m=currentMonth(),incomeMap=new Map(),outMap=new Map();
  rows().filter(r=>monthOf(r.date)===m).forEach(r=>{const nature=String(r.kind||'Sem natureza').trim()||'Sem natureza',v=Number(r.value||0);if(!v)return;const map=r.direction==='Entrada'?incomeMap:r.direction==='Saída'?outMap:null;if(!map)return;map.set(nature,(map.get(nature)||0)+v)});
  const make=map=>[...map.entries()].map(([nature,value])=>({nature,value})).sort((a,b)=>b.value-a.value||a.nature.localeCompare(b.nature,'pt-BR'));
  const ins=make(incomeMap),outs=make(outMap),totalIn=ins.reduce((s,x)=>s+x.value,0),totalOut=outs.reduce((s,x)=>s+x.value,0),balance=totalIn-totalOut;
  const box=document.createElement('section');box.id='cashNatureSummary';box.style.marginTop='28px';box.innerHTML=`<div class="card" style="padding:18px"><div class="cash-nature-summary-head"><div><h3 style="margin:0 0 4px">Resumo por Natureza</h3><small class="muted">Somatório do mês selecionado, separado entre receitas e despesas</small></div><div class="cash-nature-balance"><small class="muted">Saldo do mês</small><div><b class="${balance>=0?'kpi-positive':'kpi-negative'}">${money2(balance)}</b></div></div></div><div class="cash-nature-grid">${section('Entradas por Natureza',ins,'Entrada')}${section('Saídas por Natureza',outs,'Saída')}</div></div>`;
  content.appendChild(box);
}
let timer=null;const schedule=()=>{clearTimeout(timer);timer=setTimeout(build,80)};
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('load',schedule);setTimeout(schedule,400);
})();
