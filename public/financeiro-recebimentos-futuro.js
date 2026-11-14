(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}});
const shared=window.IntegralDREShared;
if(!sb||!shared)return;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const monthLabel=m=>m.split('-').reverse().join('/');
let request=0,owner;
function ensureCss(){
  if(document.getElementById('recebFutureCss'))return;
  const style=document.createElement('style');
  style.id='recebFutureCss';
  style.textContent=`
#recebFutureModal .modal{width:min(1480px,calc(100vw - 28px));max-width:none!important}
.receb-future-head{margin-bottom:14px}
.receb-future-legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin:12px 0}
.receb-future-legend span{display:flex;align-items:center;gap:6px}
.receb-future-dot{width:10px;height:10px;border-radius:3px;background:#126b60}
.receb-future-dot.gross,.receb-future-bar.gross{background:#7d9e99}
.receb-future-scroll{overflow-x:auto;padding:4px 2px 12px}
.receb-future-chart{display:flex;align-items:flex-start;gap:12px;min-width:max-content;padding:8px}
.receb-future-col{width:110px;text-align:center}
.receb-future-bars{height:180px;display:flex;align-items:flex-end;justify-content:center;gap:7px;border-bottom:1px solid #d9e4e1}
.receb-future-bar{width:24px;border-radius:5px 5px 0 0;background:#126b60}
.receb-future-month{display:block;margin:6px 0;font-size:12px}
.receb-future-value,.receb-future-ending{display:block;font-size:11px;line-height:1.35;overflow-wrap:anywhere}
.receb-future-ending{margin-top:5px;color:var(--muted)}
.receb-future-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:10px;margin:14px 0 10px}
.receb-future-summary .card{padding:12px}.receb-future-summary small{display:block;color:var(--muted);margin-bottom:4px}.receb-future-summary b{font-size:18px}
@media(max-width:700px){#recebFutureModal .modal{width:calc(100vw - 12px)}.receb-future-col{width:96px}}
`;
  document.head.appendChild(style);
}
function close(){document.querySelector('#recebFutureModal')?.remove()}
function addButton(){
  if(document.querySelector('#futureReceb')||document.querySelector('#title')?.textContent?.trim()!=='Recebimentos')return;
  const right=document.querySelector('.receb-toolbar .right');
  if(!right)return;
  const button=document.createElement('button');
  button.id='futureReceb';
  button.type='button';
  button.className='btn secondary';
  button.textContent='Futuro';
  button.onclick=()=>openFuture(button);
  right.prepend(button);
}
function summarize(parcels,clientRows,municipalities,start){
  const clients=new Map(clientRows.filter(row=>row.ativo!==false).map(row=>[row.id,row]));
  const munis=new Map(municipalities.filter(row=>row.ativo!==false).map(row=>[row.id,row.nome]));
  const totals=new Map(),lastByMunicipality=new Map();
  let grossCents=0,openCents=0,lastOpen='';
  for(const parcel of parcels){
    const client=clients.get(parcel.cliente_id);
    if(!client||parcel.ativo===false||shared.cancelled(parcel.status))continue;
    const month=shared.dateKey(parcel.vencimento).slice(0,7);
    if(!month||month<start)continue;
    const gross=shared.cents(parcel.valor_previsto);
    const balance=shared.cents(shared.outstanding(parcel));
    const row=totals.get(month)||{month,gross:0,balance:0,ending:[]};
    row.gross+=gross;
    row.balance+=balance;
    totals.set(month,row);
    grossCents+=gross;
    openCents+=balance;
    if(balance>0){
      if(lastOpen<month)lastOpen=month;
      const id=client.municipio_id;
      if(munis.has(id)&&(!lastByMunicipality.has(id)||lastByMunicipality.get(id)<month))lastByMunicipality.set(id,month);
    }
  }
  for(const [id,month] of lastByMunicipality){
    totals.get(month).ending.push(munis.get(id)||'Município');
  }
  const months=[...totals.values()].sort((a,b)=>a.month.localeCompare(b.month));
  for(const row of months)row.ending.sort((a,b)=>a.localeCompare(b,'pt-BR'));
  return {months,grossCents,openCents,lastOpen,endings:lastByMunicipality.size};
}
function renderFuture(result,start,today,button){
  const {months,grossCents,openCents,lastOpen,endings}=result;
  const maximum=months.reduce((max,row)=>Math.max(max,row.gross,row.balance),1);
  const height=value=>value>0?Math.max(2,Math.round(value/maximum*170)):0;
  const chart=months.map(row=>`
    <div class="receb-future-col">
      <div class="receb-future-bars" aria-hidden="true">
        <div class="receb-future-bar gross" style="height:${height(row.gross)}px"></div>
        <div class="receb-future-bar" style="height:${height(row.balance)}px"></div>
      </div>
      <strong class="receb-future-month">${monthLabel(row.month)}</strong>
      <span class="receb-future-value">Bruto ${money(row.gross)}</span>
      <span class="receb-future-value">Saldo ${money(row.balance)}</span>
      ${row.ending.length?`<span class="receb-future-ending">Último saldo em aberto: ${esc(row.ending.join(', '))}</span>`:''}
    </div>`).join('');
  close();
  const modal=document.createElement('div');
  modal.id='recebFutureModal';
  modal.className='modal-backdrop';
  modal.style.zIndex='10030';
  modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="recebFutureTitle">
    <header class="modal-head"><h3 id="recebFutureTitle">Recebimentos futuros</h3><button type="button" class="btn icon ghost" data-future-close aria-label="Fechar">×</button></header>
    <div class="modal-body"><div class="receb-future-head">
    <b>Vencimentos a partir de ${monthLabel(start)}</b>
    <div class="muted">O bruto é o principal contratado. O saldo esperado considera encargos registrados e desconta o valor já liquidado.</div>
    ${start<today.slice(0,7)?'<div class="muted">Competências anteriores mostram o saldo atual por vencimento.</div>':''}
    ${months.some(row=>row.month<'1900-01')?'<div class="notice warn">Há vencimentos anteriores a 1900 nos registros. Confira essas datas no cadastro.</div>':''}
    </div><div class="receb-future-summary">
      <div class="card"><small>Valor contratual bruto</small><b>${money(grossCents)}</b></div>
      <div class="card"><small>Saldo esperado em caixa</small><b>${money(openCents)}</b></div>
      <div class="card"><small>Último mês com saldo</small><b>${lastOpen?monthLabel(lastOpen):'—'}</b></div>
      <div class="card"><small>Municípios com saldo</small><b>${endings}</b></div>
    </div>
    ${months.length?`<div class="receb-future-legend"><span><i class="receb-future-dot gross"></i>Valor contratual bruto</span><span><i class="receb-future-dot"></i>Saldo esperado em caixa</span></div>
      <div class="receb-future-scroll"><div class="receb-future-chart">${chart}</div></div>`:'<p class="empty">Nenhuma parcela ativa a partir desta competência.</p>'}
    </div><footer class="modal-foot"><button type="button" class="btn ghost" data-future-close>Fechar</button></footer>
  </section>`;
  document.body.appendChild(modal);
  const dismiss=()=>{close();if(button.isConnected)button.focus()};
  modal.querySelectorAll('[data-future-close]').forEach(control=>{control.onclick=dismiss});
  modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();dismiss()}});
  modal.querySelector('[data-future-close]')?.focus();
}
async function sessionUser(){
  const {data,error}=await sb.auth.getSession();
  if(error)throw error;
  return data?.session?.user?.id;
}
async function openFuture(button){
  const current=++request;
  const today=shared.todayISO();
  const selected=document.querySelector('#recebMonth')?.value;
  const start=shared.dateKey(selected+'-01')?selected:today.slice(0,7);
  const stillOpen=()=>request===current&&button.isConnected;
  button.disabled=true;
  button.textContent='Carregando…';
  try{
    const userId=await sessionUser();
    if(!userId)throw Error('Entre novamente para consultar os recebimentos.');
    if(!stillOpen())return;
    owner=userId;
    const [parcels,clients,municipalities]=await Promise.all([
      shared.allPages(sb,'fin_receb_parcelas','id,cliente_id,vencimento,valor_previsto,valor_liquidado,juros,multa,status,ativo',
        query=>query.gte('vencimento',start+'-01')),
      shared.allPages(sb,'fin_receb_clientes','id,municipio_id,ativo'),
      shared.allPages(sb,'fin_receb_municipios','id,nome,ativo')
    ]);
    if(await sessionUser()!==userId||!stillOpen())return;
    renderFuture(summarize(parcels,clients,municipalities,start),start,today,button);
  }catch(error){
    if(stillOpen())alert('Não foi possível montar a visão futura: '+(error.message||error));
  }finally{
    button.disabled=false;
    button.textContent='Futuro';
  }
}
sb.auth.onAuthStateChange?.((_event,session)=>{
  if(owner&&session?.user?.id!==owner){owner=undefined;request++;close()}
});
ensureCss();
new MutationObserver(addButton).observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener('load',addButton);
addButton();
})();
