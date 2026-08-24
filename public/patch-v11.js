/* Integral Financeiro V11 - Dashboard real e consolidação das previsões ERP */
(function(){
'use strict';
const monthOf=d=>String(d||'').slice(0,7);
const todayISO=()=>new Date().toISOString().slice(0,10);
const moneySafe=v=>money(Number(v||0));
const dateObj=v=>v?new Date(`${String(v).slice(0,10)}T12:00:00`):null;
const daysFromToday=v=>{const d=dateObj(v);if(!d)return null;const t=dateObj(todayISO());return Math.ceil((d-t)/86400000)};
const isActiveTrip=t=>!['Concluída','Concluida','Finalizada','Cancelada'].includes(String(t.status||''));
const accountName=p=>(db.accountMasters||[]).find(a=>String(a.id)===String(p.accountId))?.name||'Conta';
const paidAccountRows=()=> (db.accountPayments||[]).filter(p=>p.status==='Paga').map(p=>({date:(p.paidAt||p.due||'').slice(0,10),direction:'Saída',value:+p.value||0}));
const budgetRows=()=> (db.budgetExpenses||[]).map(e=>({date:e.date,direction:'Saída',value:+e.value||0}));
const cashRows=()=>[...(db.cashflow||[]),...paidAccountRows(),...budgetRows()];
const cashBalance=()=>cashRows().reduce((s,r)=>s+(r.direction==='Entrada'?+r.value||0:-(+r.value||0)),0);

async function refreshERPPlanning(){
  try{await window.IntegralFinanceERPPlanning?.sync?.();}catch(e){console.warn('Falha ao atualizar previsões ERP no dashboard',e)}
}

function upcomingAccounts(){
  return (db.accountPayments||[]).filter(p=>p.status!=='Paga'&&p.status!=='Cancelada'&&p.due).map(p=>({...p,days:daysFromToday(p.due)})).filter(p=>p.days!==null&&p.days>=0).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,8);
}
function upcomingERP(){
  return (db.erpPlannedRevenues||[]).filter(r=>r.remaining>0&&r.dueDate).map(r=>({...r,days:daysFromToday(r.dueDate)})).filter(r=>r.days===null||r.days>=0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)).slice(0,8);
}
function expiringContracts(){
  return (db.hrPeople||[]).filter(p=>p.end).map(p=>({...p,days:daysFromToday(p.end)})).filter(p=>p.days!==null&&p.days>=0&&p.days<=60).sort((a,b)=>a.end.localeCompare(b.end));
}
function openBudgets(){
  return (db.budgetRecords||[]).filter(b=>b.active!==false).map(b=>{const spent=(db.budgetExpenses||[]).filter(e=>String(e.budgetId)===String(b.id)).reduce((s,e)=>s+(+e.value||0),0);return {...b,spent,open:Math.max(0,(+b.limit||0)-spent)}}).filter(b=>b.open>0).sort((a,b)=>b.open-a.open);
}
function activeTrips(){
  return (db.trips||[]).filter(isActiveTrip).map(t=>{const spent=(db.tripExpenses||[]).filter(e=>String(e.tripId)===String(t.id)).reduce((s,e)=>s+(+e.proven||+e.declared||+e.value||0),0);return {...t,spent}});
}
function recentDocs(){return [...(db.docs||[])].sort((a,b)=>String(b.addedAt||b.createdAt||b.date||'').localeCompare(String(a.addedAt||a.createdAt||a.date||''))).slice(0,8)}

function emptyRow(cols,text){return `<tr><td colspan="${cols}"><div class="empty">${esc(text)}</div></td></tr>`}
function dashboardTable(titleText,headers,rows){return `<section class="card dashboard-section"><div class="section-head"><h3>${esc(titleText)}</h3></div><div class="table-wrap"><table class="table compact-dashboard-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`}

async function renderDashboardV11(){
  title('Visão Geral');
  await refreshERPPlanning();
  const accounts=upcomingAccounts(),erp=upcomingERP(),contracts=expiringContracts(),budgets=openBudgets(),trips=activeTrips(),docs=recentDocs(),balance=cashBalance();
  const accountOpen=accounts.reduce((s,x)=>s+(+x.value||0),0),erpOpen=erp.reduce((s,x)=>s+(+x.remaining||0),0),budgetOpen=budgets.reduce((s,x)=>s+x.open,0),tripSpent=trips.reduce((s,x)=>s+x.spent,0);
  $('#content').innerHTML=`
    <div class="dashboard-kpis grid cols-4">
      <div class="card metric"><h3>Saldo atual do caixa</h3><b class="${balance>=0?'kpi-positive':'kpi-negative'}">${moneySafe(balance)}</b><small>Movimentações realizadas</small></div>
      <div class="card metric"><h3>Contas a vencer</h3><b>${moneySafe(accountOpen)}</b><small>${accounts.length} próxima(s) conta(s)</small></div>
      <div class="card metric"><h3>Entradas previstas ERP</h3><b>${moneySafe(erpOpen)}</b><small>${erp.length} próxima(s) etapa(s)</small></div>
      <div class="card metric"><h3>Orçamentos em aberto</h3><b>${moneySafe(budgetOpen)}</b><small>${budgets.length} orçamento(s) ativo(s)</small></div>
    </div>
    <div class="dashboard-grid">
      ${dashboardTable('Contas a vencer',['Conta','Vencimento','Valor'],accounts.map(p=>`<tr><td><b>${esc(accountName(p))}</b></td><td>${fmt(p.due)}</td><td>${moneySafe(p.value)}</td></tr>`).join('')||emptyRow(3,'Nenhuma conta futura cadastrada.'))}
      ${dashboardTable('Próximas entradas do ERP',['Projeto / etapa','Vencimento','Saldo previsto'],erp.map(r=>`<tr><td><b>${esc(r.project)}</b><small>${esc(r.origin)}</small></td><td>${fmt(r.dueDate)}</td><td>${moneySafe(r.remaining)}</td></tr>`).join('')||emptyRow(3,'Nenhuma entrada futura encontrada no ERP.'))}
      ${dashboardTable('Contratos de funcionários a vencer em 60 dias',['Colaborador','Fim do contrato','Valor mensal'],contracts.map(p=>`<tr><td><b>${esc(p.name||p.nome||'Colaborador')}</b></td><td>${fmt(p.end)}</td><td>${moneySafe(p.currentValue||p.value||0)}</td></tr>`).join('')||emptyRow(3,'Nenhum contrato vence nos próximos 60 dias.'))}
      ${dashboardTable('Orçamentos abertos',['Orçamento','Setor','Disponível'],budgets.slice(0,8).map(b=>`<tr><td><b>${esc(b.name)}</b></td><td>${esc(b.sector||'—')}</td><td>${moneySafe(b.open)}</td></tr>`).join('')||emptyRow(3,'Nenhum orçamento em aberto.'))}
      ${dashboardTable('Viagens ativas',['Destino / projeto','Status','Gasto comprovado'],trips.slice(0,8).map(t=>`<tr><td><b>${esc(t.city||'Viagem')}</b><small>${esc(t.project||t.objective||'')}</small></td><td>${esc(t.status||'Ativa')}</td><td>${moneySafe(t.spent)}</td></tr>`).join('')||emptyRow(3,'Nenhuma viagem ativa.'))}
      ${dashboardTable('Últimos documentos fiscais',['Documento','Data','Valor'],docs.map(d=>`<tr><td><b>${esc(d.name||'Documento')}</b><small>${esc(d.supplier||d.origin||'')}</small></td><td>${d.date?fmt(d.date):'—'}</td><td>${moneySafe(d.value)}</td></tr>`).join('')||emptyRow(3,'Nenhum documento fiscal enviado.'))}
    </div>
    <div class="dashboard-footer-summary card"><div><span>Viagens ativas</span><b>${trips.length}</b></div><div><span>Gasto nas viagens ativas</span><b>${moneySafe(tripSpent)}</b></div><div><span>Contratos vencendo em 60 dias</span><b>${contracts.length}</b></div><div><span>Documentos fiscais recentes</span><b>${docs.length}</b></div></div>`;
}

dashboard=function(){renderDashboardV11().catch(e=>{console.error(e);title('Visão Geral');$('#content').innerHTML=`<div class="notice danger">Não foi possível montar a Visão Geral: ${esc(e.message||String(e))}</div>`})};

// Reforça no Planejamento as parcelas do ERP recebidas na tabela pagamentos.
window.addEventListener('integral:erp-planning-synced',()=>{if(view==='dashboard')renderDashboardV11();});

// Garante que a tela do usuário enviado como exemplo apareça assim que o Supabase retornar os dados.
setTimeout(()=>{if(view==='dashboard')dashboard()},700);
})();
