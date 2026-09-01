/* Integral Financeiro V29 — navegação histórica do RH */
(function(){
'use strict';
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
function decorate(){
  let active='';try{active=typeof view!=='undefined'?view:window.view}catch{active=window.view}
  if(active!=='hr')return;
  const panel=document.querySelector('.hr17-month-panel');
  if(!panel||panel.querySelector('#rhHistoryMonth'))return;
  const months=panel.querySelector('.hr17-months');if(!months)return;
  const activeBtn=months.querySelector('.hr17-month.active');
  const current=activeBtn?.dataset?.hrMonth||new Date().toISOString().slice(0,7);
  const wrap=document.createElement('div');wrap.className='toolbar';wrap.style.marginBottom='12px';
  wrap.innerHTML=`<div class="left"><button type="button" class="btn ghost small" id="rhPrevMonth">← Mês anterior</button><input type="month" id="rhHistoryMonth" value="${current}"><button type="button" class="btn ghost small" id="rhNextMonth">Próximo mês →</button></div>`;
  panel.insertBefore(wrap,months);
  const input=wrap.querySelector('#rhHistoryMonth');
  const choose=m=>{const b=months.querySelector(`[data-hr-month="${m}"]`);if(b){b.click();return}try{selectedHrMonth=m;if(typeof renderHr==='function')renderHr()}catch(e){console.warn('RH histórico:',e)}};
  input.onchange=()=>choose(input.value);
  wrap.querySelector('#rhPrevMonth').onclick=()=>choose(addMonth(input.value,-1));
  wrap.querySelector('#rhNextMonth').onclick=()=>choose(addMonth(input.value,1));
}
const obs=new MutationObserver(()=>queueMicrotask(decorate));obs.observe(document.documentElement,{childList:true,subtree:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate);else decorate();
})();
