/* Integral Financeiro — resumo por Natureza no rodapé do Fluxo de Caixa */
(function(){
'use strict';
const monthOf=d=>String(d||'').slice(0,7);
const esc2=s=>typeof esc==='function'?esc(s):String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money2=n=>typeof money==='function'?money(n):Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function currentMonth(){return window.v2state?.cashMonth||document.querySelector('#cashEditMonth')?.value||new Date().toISOString().slice(0,7)}
function rows(){try{return window.IntegralFinanceCashflowEditor?.allRows?.()||[]}catch(_){return []}}
function section(title,items,type){const total=items.reduce((s,x)=>s+x.value,0),positive=type==='Entrada';return `<div style="border:1px solid rgba(0,0,0,.08);border-radius:12px;overflow:hidden;background:#fff"><div style="padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.07);display:flex;justify-content:space-between;align-items:center;gap:12px"><b>${title}</b><b class="${positive?'kpi-positive':'kpi-negative'}">${money2(total)}</b></div><table class="table excel-table" style="margin:0"><thead><tr><th>Natureza</th><th class="num">Total</th></tr></thead><tbody>${items.map(x=>`<tr><td><b>${esc2(x.nature)}</b></td><td class="num ${positive?'kpi-positive':'kpi-negative'}"><b>${money2(x.value)}</b></td></tr>`).join('')||'<tr><td colspan="2"><div class="empty">Sem movimentações.</div></td></tr>'}</tbody></table></div>`}
function build(){
  const content=document.querySelector('#content'),title=document.querySelector('#title')?.textContent||'';
  if(!content||title.trim()!=='Fluxo de Caixa')return;
  content.querySelector('#cashNatureSummary')?.remove();
  const m=currentMonth(),incomeMap=new Map(),outMap=new Map();
  rows().filter(r=>monthOf(r.date)===m).forEach(r=>{const nature=String(r.kind||'Sem natureza').trim()||'Sem natureza',v=Number(r.value||0);if(!v)return;const map=r.direction==='Entrada'?incomeMap:r.direction==='Saída'?outMap:null;if(!map)return;map.set(nature,(map.get(nature)||0)+v)});
  const make=map=>[...map.entries()].map(([nature,value])=>({nature,value})).sort((a,b)=>b.value-a.value||a.nature.localeCompare(b.nature,'pt-BR'));
  const ins=make(incomeMap),outs=make(outMap),totalIn=ins.reduce((s,x)=>s+x.value,0),totalOut=outs.reduce((s,x)=>s+x.value,0),balance=totalIn-totalOut;
  const box=document.createElement('section');box.id='cashNatureSummary';box.style.marginTop='28px';box.innerHTML=`<div class="card" style="padding:16px 18px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:14px"><div><h3 style="margin:0 0 4px">Resumo por Natureza</h3><small class="muted">Somatório do mês selecionado, separado entre receitas e despesas</small></div><div style="text-align:right"><small class="muted">Saldo do mês</small><div><b class="${balance>=0?'kpi-positive':'kpi-negative'}">${money2(balance)}</b></div></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px">${section('Entradas por Natureza',ins,'Entrada')}${section('Saídas por Natureza',outs,'Saída')}</div></div>`;
  content.appendChild(box);
}
let timer=null;const schedule=()=>{clearTimeout(timer);timer=setTimeout(build,80)};
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('load',schedule);setTimeout(schedule,400);
})();
