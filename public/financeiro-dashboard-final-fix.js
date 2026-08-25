/* Integral Financeiro - Visao Geral resiliente
   Dashboard nao depende de sincronizacao remota para renderizar. */
(function(){
'use strict';
const q=s=>document.querySelector(s);
const m=v=>typeof money==='function'?money(Number(v||0)):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const e=v=>typeof esc==='function'?esc(String(v??'')):String(v??'');
const f=d=>{if(!d)return '—';try{return typeof fmt==='function'?fmt(d):new Date(d+'T12:00:00').toLocaleDateString('pt-BR')}catch{return d}};
const D=()=>{try{return typeof db!=='undefined'?db:window.db}catch{return window.db||{}}};
const U=()=>{try{return typeof user!=='undefined'?user:window.user}catch{return window.user}};
const dateOf=x=>x?.due||x?.dueDate||x?.date||x?.vencimento||'';
const valueOf=x=>Number(x?.value??x?.amount??x?.valor??x?.remaining??0);

function renderDashboardFinal(){
  if(U()?.role!=='Administrador')return;
  const d=D()||{};
  if(typeof title==='function')title('Visão Geral');
  const c=q('#content');if(!c)return;
  const today=new Date().toISOString().slice(0,10);
  const payments=(d.accountPayments||[]).filter(x=>!['Paga','Pago','Cancelada','Cancelado'].includes(String(x.status||''))&&dateOf(x)>=today).sort((a,b)=>dateOf(a).localeCompare(dateOf(b))).slice(0,8);
  const masters=d.accountMasters||[];
  const erp=(d.erpPlannedRevenues||[]).filter(x=>Number(x.remaining||0)>0&&String(x.dueDate||'')>=today).sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||''))).slice(0,8);
  const cash=(d.cashflow||[]);
  const balance=cash.reduce((s,x)=>s+(x.direction==='Entrada'?valueOf(x):-valueOf(x)),0);
  const openAccounts=payments.reduce((s,x)=>s+valueOf(x),0);
  const expected=erp.reduce((s,x)=>s+Number(x.remaining||0),0);
  const docs=[...(d.docs||[])].sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''))).slice(0,6);
  const trips=(d.trips||[]).filter(x=>!/finaliz|aprovad|conclu|encerrad/i.test(String(x.status||''))).slice(0,6);

  c.innerHTML=`
    <div class="grid cols-4">
      <div class="card metric"><h3>Saldo atual do caixa</h3><b>${m(balance)}</b><small>movimentações registradas</small></div>
      <div class="card metric"><h3>Contas a vencer</h3><b>${m(openAccounts)}</b><small>${payments.length} lançamento(s) próximo(s)</small></div>
      <div class="card metric"><h3>Entradas previstas ERP</h3><b>${m(expected)}</b><small>${erp.length} parcela(s) próxima(s)</small></div>
      <div class="card metric"><h3>Documentos recentes</h3><b>${docs.length}</b><small>processados no Financeiro</small></div>
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <section class="card"><div class="section-head"><div><h3>Próximas contas a vencer</h3><p class="muted">Pagamentos já cadastrados.</p></div></div>
        ${payments.map(p=>{const a=masters.find(x=>String(x.id)===String(p.accountId));return `<div class="mini-row readonly"><span><b>${e(a?.name||a?.supplier||'Conta')}</b><small>${f(dateOf(p))} • ${e(p.status||'A vencer')}</small></span><strong>${m(valueOf(p))}</strong></div>`}).join('')||'<div class="empty">Nenhuma conta futura pendente.</div>'}
      </section>
      <section class="card"><div class="section-head"><div><h3>Próximas entradas do ERP</h3><p class="muted">Últimos dados sincronizados disponíveis.</p></div></div>
        ${erp.map(x=>`<div class="mini-row readonly"><span><b>${e(x.project||'Projeto ERP')}</b><small>${e(x.origin||'Recebimento')} • ${f(x.dueDate)}</small></span><strong>${m(x.remaining)}</strong></div>`).join('')||'<div class="empty">Nenhuma previsão do ERP disponível. Use Sincronizar ERP no Planejamento.</div>'}
      </section>
      <section class="card"><div class="section-head"><div><h3>Últimos documentos fiscais</h3></div></div>
        ${docs.map(x=>`<div class="mini-row readonly"><span><b>${e(x.name||'Documento')}</b><small>${e(x.supplier||'')} • ${f(x.date||x.createdAt)}</small></span><strong>${m(valueOf(x))}</strong></div>`).join('')||'<div class="empty">Nenhum documento fiscal registrado.</div>'}
      </section>
      <section class="card"><div class="section-head"><div><h3>Viagens ativas</h3></div></div>
        ${trips.map(x=>`<div class="mini-row readonly"><span><b>${e(x.city||x.project||'Viagem')}</b><small>${e(x.employee||x.status||'')}</small></span><strong>${m(x.proven??x.spent??x.declared??0)}</strong></div>`).join('')||'<div class="empty">Nenhuma viagem ativa.</div>'}
      </section>
    </div>`;
}

window.renderFinanceDashboardFinal=renderDashboardFinal;
try{dashboard=renderDashboardFinal;window.dashboard=renderDashboardFinal}catch{window.dashboard=renderDashboardFinal}

// Se algum patch antigo limpar a tela depois do boot, restaura somente quando a view atual for dashboard.
setTimeout(()=>{try{if((typeof view!=='undefined'?view:window.view)==='dashboard')renderDashboardFinal()}catch(e){console.error('Dashboard final:',e)}},900);
window.addEventListener('integral:erp-planning-synced',()=>{try{if((typeof view!=='undefined'?view:window.view)==='dashboard')renderDashboardFinal()}catch{}});
})();
