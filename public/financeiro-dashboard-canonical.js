/* Integral Financeiro — Dashboard canônico oficial
   Única implementação ativa da Visão Geral. */
(function(){
'use strict';
const q=s=>document.querySelector(s);
const E=v=>typeof esc==='function'?esc(String(v??'')):String(v??'');
const M=v=>typeof moneySafe==='function'?moneySafe(v):(typeof money==='function'?money(v):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
const F=d=>{if(!d)return'—';try{return typeof fmt==='function'?fmt(d):new Date(d+'T12:00:00').toLocaleDateString('pt-BR')}catch{return d}};
const today=()=>new Date().toISOString().slice(0,10);
const daysUntil=d=>Math.max(0,Math.ceil((new Date(d+'T12:00:00')-new Date(today()+'T12:00:00'))/86400000));
function getDB(){try{return db}catch{return window.db||{}}}
function isAdmin(){try{return !user||user.role==='Administrador'}catch{return true}}
function dashboardCanonical(){
  if(!isAdmin())return typeof documents==='function'?documents():null;
  if(typeof title==='function')title('Visão Geral');
  const d=getDB(),c=q('#content');if(!c)return;
  const t=today(),masters=d.accountMasters||[];
  const payments=(d.accountPayments||[]).filter(x=>!['Paga','Pago','Cancelada','Cancelado'].includes(String(x.status||''))&&String(x.due||'')>=t).sort((a,b)=>String(a.due||'').localeCompare(String(b.due||''))).slice(0,8);
  const erp=(d.erpPlannedRevenues||[]).filter(x=>Number(x.remaining||0)>0&&String(x.dueDate||'')>=t).sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||''))).slice(0,8);
  const cash=d.cashflow||[],docs=[...(d.docs||[])].sort((a,b)=>String(b.date||b.createdAt||'').localeCompare(String(a.date||a.createdAt||''))).slice(0,6),trips=(d.trips||[]).filter(x=>!/finaliz|aprovad|conclu|encerrad/i.test(String(x.status||''))).slice(0,6);
  const val=x=>Number(x?.value??x?.amount??x?.valor??x?.remaining??0),balance=cash.reduce((s,x)=>s+(x.direction==='Entrada'?val(x):-val(x)),0),openAccounts=payments.reduce((s,x)=>s+val(x),0),expected=erp.reduce((s,x)=>s+Number(x.remaining||0),0);
  const todayDate=new Date(t+'T12:00:00'),limit60=new Date(todayDate);limit60.setDate(limit60.getDate()+60);const contractDue=(d.hrPeople||[]).filter(p=>p.end&&new Date(p.end+'T12:00:00')>=todayDate&&new Date(p.end+'T12:00:00')<=limit60).sort((a,b)=>String(a.end).localeCompare(String(b.end)));
  const accountRows=payments.map(p=>{const a=masters.find(x=>String(x.id)===String(p.accountId)),n=daysUntil(p.due);return `<div class="fin-row"><div class="fin-row-main"><b>${E(a?.name||a?.supplier||'Conta')}</b><div class="fin-row-meta"><span>${F(p.due)}</span><span class="fin-dot"></span><span>${E(p.status||'A vencer')}</span></div></div><div class="fin-row-value"><strong>${M(val(p))}</strong><small>${n===0?'Hoje':n===1?'1 dia':n+' dias'}</small></div></div>`}).join('')||'<div class="empty">Nenhuma conta futura pendente.</div>';
  const erpRows=erp.map(x=>`<div class="fin-row"><div class="fin-row-main"><b>${E(x.project||'Projeto ERP')}</b><div class="fin-row-meta"><span>${E(x.origin||'Recebimento')}</span><span class="fin-dot"></span><span>${F(x.dueDate)}</span></div></div><div class="fin-row-value"><strong>${M(x.remaining)}</strong>${x.installment?`<small>${E(x.installment)}</small>`:''}</div></div>`).join('')||'<div class="empty">Nenhuma previsão do ERP disponível.</div>';
  c.innerHTML=`<div class="grid cols-4"><div class="card metric"><h3>Saldo atual do caixa</h3><b>${M(balance)}</b><small>movimentações registradas</small></div><div class="card metric"><h3>Contas a vencer</h3><b>${M(openAccounts)}</b><small>${payments.length} lançamento(s) próximo(s)</small></div><div class="card metric"><h3>Entradas previstas ERP</h3><b>${M(expected)}</b><small>${erp.length} parcela(s) próxima(s)</small></div><div class="card metric"><h3>Documentos recentes</h3><b>${docs.length}</b><small>processados no Financeiro</small></div></div>${contractDue.length?`<section class="card" style="margin-top:16px"><div class="section-head"><div><h3>Contratos próximos do vencimento</h3><p class="muted">Contratos que vencem nos próximos 60 dias.</p></div><span class="badge warn">${contractDue.length}</span></div>${contractDue.map(p=>`<div class="mini-row readonly"><span><b>${E(p.name||'Colaborador')}</b><small>Vencimento em ${F(p.end)}</small></span><strong>${daysUntil(p.end)} dias</strong></div>`).join('')}</section>`:''}<div class="dashboard-finance-panels"><section class="card dashboard-finance-panel"><div class="fin-panel-head"><div class="fin-panel-title"><span class="fin-panel-icon">▣</span><div><h3>Próximas contas a vencer</h3><p class="muted">Pagamentos já cadastrados.</p></div></div></div><div class="fin-list">${accountRows}</div><div class="fin-panel-total"><span>Total dos próximos lançamentos</span><b>${M(openAccounts)}</b></div></section><section class="card dashboard-finance-panel"><div class="fin-panel-head"><div class="fin-panel-title"><span class="fin-panel-icon">↗</span><div><h3>Próximas entradas do ERP</h3><p class="muted">Últimos dados sincronizados disponíveis.</p></div></div></div><div class="fin-list">${erpRows}</div><div class="fin-panel-total"><span>Total previsto</span><b>${M(expected)}</b></div></section></div><div class="grid cols-2" style="margin-top:16px"><section class="card"><div class="section-head"><div><h3>Últimos documentos fiscais</h3></div></div>${docs.map(x=>`<div class="mini-row readonly"><span><b>${E(x.name||'Documento')}</b><small>${E(x.supplier||'')} • ${F(x.date||x.createdAt)}</small></span><strong>${M(val(x))}</strong></div>`).join('')||'<div class="empty">Nenhum documento fiscal registrado.</div>'}</section><section class="card"><div class="section-head"><div><h3>Viagens ativas</h3></div></div>${trips.map(x=>`<div class="mini-row readonly"><span><b>${E(x.city||x.project||'Viagem')}</b><small>${E(x.employee||x.status||'')}</small></span><strong>${M(x.proven??x.spent??x.declared??0)}</strong></div>`).join('')||'<div class="empty">Nenhuma viagem ativa.</div>'}</section></div>`;
  c.dataset.canonicalView='dashboard';
}
window.renderFinanceDashboardFinal=dashboardCanonical;
window.IntegralFinanceDashboard={render:dashboardCanonical};
try{dashboard=dashboardCanonical;window.dashboard=dashboardCanonical}catch{window.dashboard=dashboardCanonical}
window.addEventListener('integral:erp-planning-synced',()=>{try{if((typeof view!=='undefined'?view:window.view)==='dashboard')dashboardCanonical()}catch{}});
})();
