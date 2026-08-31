/* Integral Financeiro — resumo por Natureza no rodapé do Fluxo de Caixa */
(function(){
'use strict';
const monthOf=d=>String(d||'').slice(0,7);
const esc2=s=>typeof esc==='function'?esc(s):String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money2=n=>typeof money==='function'?money(n):Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function currentMonth(){return window.v2state?.cashMonth||document.querySelector('#cashEditMonth')?.value||new Date().toISOString().slice(0,7)}
function rows(){try{return window.IntegralFinanceCashflowEditor?.allRows?.()||[]}catch(_){return []}}
function build(){
  const content=document.querySelector('#content');
  const title=document.querySelector('#title')?.textContent||'';
  if(!content||title.trim()!=='Fluxo de Caixa')return;
  content.querySelector('#cashNatureSummary')?.remove();
  const m=currentMonth(),map=new Map();
  rows().filter(r=>monthOf(r.date)===m).forEach(r=>{
    const nature=String(r.kind||'Sem natureza').trim()||'Sem natureza';
    if(!map.has(nature))map.set(nature,{nature,income:0,out:0});
    const g=map.get(nature),v=Number(r.value||0);
    if(r.direction==='Entrada')g.income+=v;else if(r.direction==='Saída')g.out+=v;
  });
  const items=[...map.values()].sort((a,b)=>(b.income+b.out)-(a.income+a.out)||a.nature.localeCompare(b.nature,'pt-BR'));
  const totalIn=items.reduce((s,x)=>s+x.income,0),totalOut=items.reduce((s,x)=>s+x.out,0);
  const box=document.createElement('section');box.id='cashNatureSummary';box.style.marginTop='28px';box.innerHTML=`
    <div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 18px;border-bottom:1px solid rgba(0,0,0,.08);display:flex;justify-content:space-between;gap:12px;align-items:end;flex-wrap:wrap">
        <div><h3 style="margin:0 0 4px">Resumo por Natureza</h3><small class="muted">Somatório do mês selecionado no Fluxo de Caixa</small></div>
        <small class="muted">${items.length} natureza(s)</small>
      </div>
      <div class="table-wrap" style="border:0;border-radius:0"><table class="table excel-table" style="margin:0"><thead><tr><th>Natureza</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo</th></tr></thead><tbody>
      ${items.map(x=>{const bal=x.income-x.out;return `<tr><td><b>${esc2(x.nature)}</b></td><td class="num kpi-positive">${money2(x.income)}</td><td class="num kpi-negative">${money2(x.out)}</td><td class="num"><b class="${bal>=0?'kpi-positive':'kpi-negative'}">${money2(bal)}</b></td></tr>`}).join('')||'<tr><td colspan="4"><div class="empty">Sem movimentações para resumir.</div></td></tr>'}
      </tbody><tfoot><tr><th>Total</th><th class="num kpi-positive">${money2(totalIn)}</th><th class="num kpi-negative">${money2(totalOut)}</th><th class="num"><b class="${totalIn-totalOut>=0?'kpi-positive':'kpi-negative'}">${money2(totalIn-totalOut)}</b></th></tr></tfoot></table></div>
    </div>`;
  content.appendChild(box);
}
let timer=null;const schedule=()=>{clearTimeout(timer);timer=setTimeout(build,80)};
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('load',schedule);setTimeout(schedule,400);
})();
