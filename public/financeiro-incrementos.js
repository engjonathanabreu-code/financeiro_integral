/* Integral Financeiro — incrementos trazidos das versões V10 a V19 do bundle (que nunca chegaram a rodar).
   Tudo aqui ACRESCENTA ao sistema atual: nenhuma função existente é substituída, nenhuma tela é redesenhada
   e nenhum dado existente é reescrito. Cada bloco se liga à tela já montada pelos módulos atuais.

   1. Contas      — leitura real de boletos/contas pela IA no botão "Enviar boletos para IA" (V10).
   2. Contas      — matrícula e recorrência nos cards de "Todas as contas cadastradas" (V10).
   3. Visão Geral — painel "Acompanhamento" com contas a vencer, entradas do ERP, contratos a vencer,
                    orçamentos abertos, viagens ativas e últimos documentos (V11).
   4. Planejamento— entradas do ERP também agrupadas por projeto, com detalhe das parcelas (V12/V16).
   5. Fluxo       — exportar o mês em CSV e PDF, exatamente com as linhas mostradas na tela (V14).
   6. Viagens     — relatório de viagens por mês, respeitando o que cada usuário pode ver (V17/V18).
   7. Contas      — espelho das contas e pagamentos nas tabelas financeiro_contas / financeiro_pagamentos,
                    usadas pelos lembretes automáticos (V19). Só envia; nunca lê de volta nem apaga.
*/
(function(){
'use strict';

/* ---------- utilidades ---------- */
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const E=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const M=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const D=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const localToday=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const monthOf=v=>String(v||'').slice(0,7);
const monthLabel=m=>{if(!/^\d{4}-\d{2}$/.test(m||''))return m||'';const s=new Date(m+'-01T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});return s.charAt(0).toUpperCase()+s.slice(1)};
const daysFromToday=v=>{if(!v)return null;const a=new Date(String(v).slice(0,10)+'T12:00:00'),b=new Date(localToday()+'T12:00:00');return Math.round((a-b)/86400000)};
const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const newId=()=>window.integralUid?window.integralUid():Date.now()+Math.floor(Math.random()*100000);
function data(){try{return db}catch{return window.db||null}}
function currentUser(){try{return user}catch{return window.user||null}}
function currentView(){try{return view}catch{return window.view}}
function isAdmin(){return currentUser()?.role==='Administrador'}
function titleText(){return (q('#title')?.textContent||'').trim()}
function persist(){try{if(typeof save==='function')save();else window.save?.()}catch(e){console.error('Incrementos: falha ao salvar',e)}}
function readDataUrl(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||''));r.onerror=()=>no(r.error||new Error('Falha ao ler o arquivo'));r.readAsDataURL(file)})}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)}
const csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`;
function modal(titleStr,body,foot=''){
  const el=document.createElement('div');el.className='modal-backdrop fin-inc-modal';
  el.innerHTML=`<section class="modal"><header class="modal-head"><h3>${E(titleStr)}</h3><button type="button" class="btn icon ghost" data-close aria-label="Fechar">×</button></header><div class="modal-body">${body}</div><footer class="modal-foot">${foot}<button type="button" class="btn ghost" data-close>Fechar</button></footer></section>`;
  document.body.appendChild(el);qa('[data-close]',el).forEach(b=>b.onclick=()=>el.remove());el.addEventListener('click',e=>{if(e.target===el)el.remove()});return el;
}

/* ======================================================================
   1. Contas — leitura de boletos pela IA (V10)
   O modal "Leitura de boletos por IA" já existe, mas não tinha ação. Aqui ele ganha a lista de arquivos
   e o botão de envio. Conta já cadastrada (mesma conta ou mesma matrícula + fornecedor) recebe só o novo
   pagamento; pagamento igual (mesma conta, vencimento e valor) não é duplicado.
   ====================================================================== */
async function analyzeAccount(file){
  const d=data(),image=await readDataUrl(file);
  const accounts=(d?.accountMasters||[]).map(a=>({id:a.id,name:a.name,supplier:a.supplier,registration:a.registration||'',category:a.category,sector:a.sector}));
  const r=await window.IntegralFileUploads.fetch('/api/ai-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,fileName:file.name,accounts})});
  const out=await r.json().catch(()=>({}));
  if(!r.ok||!out?.ok)throw new Error(out?.details||out?.error||`Falha na leitura da conta (HTTP ${r.status})`);
  return out;
}
function applyAnalyzedAccount(ai,file){
  const d=data();d.accountMasters=Array.isArray(d.accountMasters)?d.accountMasters:[];d.accountPayments=Array.isArray(d.accountPayments)?d.accountPayments:[];
  let master=d.accountMasters.find(a=>String(a.id)===String(ai.matchedAccountId));
  if(!master&&ai.registration)master=d.accountMasters.find(a=>norm(a.registration)===norm(ai.registration)&&norm(a.supplier)===norm(ai.supplier));
  let created=false;
  if(!master){
    master={id:newId(),name:ai.name||ai.supplier||'Conta',supplier:ai.supplier||'',registration:ai.registration||'',recurrence:ai.recurrence||'Não identificada',category:ai.category||'Outros',sector:ai.sector||'Administrativo',method:ai.paymentMethod||'Outro',active:true,createdByAI:true};
    d.accountMasters.push(master);created=true;
  }else{
    /* Conta existente: só completa campos vazios, nunca sobrescreve o que já foi cadastrado. */
    if(ai.registration&&!master.registration)master.registration=ai.registration;
    if(ai.recurrence&&!master.recurrence)master.recurrence=ai.recurrence;
    if(ai.paymentMethod&&!master.method)master.method=ai.paymentMethod;
  }
  const due=/^\d{4}-\d{2}-\d{2}$/.test(String(ai.dueDate||''))?ai.dueDate:localToday(),value=Number(ai.value||0);
  const duplicate=d.accountPayments.find(p=>String(p.accountId)===String(master.id)&&p.due===due&&Math.abs((+p.value||0)-value)<.01);
  if(!duplicate)d.accountPayments.push({id:newId(),accountId:master.id,value,due,status:'A vencer',barcode:ai.paymentCode||'',competence:ai.competence||monthOf(due),source:'IA • Conta enviada',file:{name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()}});
  return {master,created,duplicate:!!duplicate};
}
function decorateBillsModal(backdrop){
  if(!backdrop||backdrop.dataset.finBillsReady==='1')return;
  if(!/Leitura de boletos por IA/i.test(q('.modal-head, h3',backdrop)?.textContent||backdrop.textContent||''))return;
  const input=q('input[type="file"]',backdrop),foot=q('.modal-foot',backdrop);if(!input||!foot)return;
  backdrop.dataset.finBillsReady='1';
  const drop=input.closest('.dropzone')||input.parentElement;
  const list=document.createElement('div');list.className='muted fin-inc-files';list.textContent='Nenhum arquivo selecionado.';drop.appendChild(list);
  const status=document.createElement('div');status.className='muted fin-inc-status';foot.insertBefore(status,foot.firstChild);
  const send=document.createElement('button');send.type='button';send.className='btn';send.textContent='Enviar para análise da IA';send.disabled=true;foot.appendChild(send);
  input.addEventListener('change',()=>{const files=[...(input.files||[])];send.disabled=!files.length;list.innerHTML=files.length?files.map(f=>`• ${E(f.name)}`).join('<br>'):'Nenhum arquivo selecionado.';status.textContent=files.length?`${files.length} arquivo(s) pronto(s) para envio.`:''});
  send.addEventListener('click',async()=>{
    const files=[...(input.files||[])];if(!files.length)return;
    send.disabled=true;let done=0,newAccounts=0,newPayments=0;const failed=[];
    for(let i=0;i<files.length;i++){
      const file=files[i];status.textContent=`Analisando ${i+1} de ${files.length}: ${file.name}`;
      try{const ai=await analyzeAccount(file),r=applyAnalyzedAccount(ai,file);done++;if(r.created)newAccounts++;if(!r.duplicate)newPayments++}
      catch(e){console.error('Leitura de conta pela IA:',file.name,e);failed.push(`${file.name}: ${e.message||e}`)}
    }
    if(done)persist();
    try{await window.IntegralFinanceCloudStorage?.syncNow?.()}catch{}
    status.innerHTML=`<b>${done}</b> arquivo(s) analisado(s): <b>${newAccounts}</b> conta(s) nova(s) e <b>${newPayments}</b> pagamento(s) incluído(s).${failed.length?`<br>Não foi possível ler: ${failed.map(E).join('; ')}`:''}`;
    send.disabled=false;
    if(done){try{if(currentView()==='accounts'&&typeof accounts==='function')accounts()}catch{}}
  });
}

/* ======================================================================
   2. Contas — matrícula e recorrência nos cards (V10)
   ====================================================================== */
function decorateAccountCards(){
  if(currentView()!=='accounts')return;
  const d=data();if(!d)return;
  qa('#content .account-master-card').forEach(card=>{
    if(card.querySelector('.fin-inc-account-meta'))return;
    const id=card.dataset.v2master||card.dataset.v4master||card.dataset.v10Account;if(id==null)return;
    const a=(d.accountMasters||[]).find(x=>String(x.id)===String(id));if(!a||(!a.registration&&!a.recurrence))return;
    const box=document.createElement('small');box.className='fin-inc-account-meta';
    box.innerHTML=[a.registration?`Matrícula / cadastro: <b>${E(a.registration)}</b>`:'',a.recurrence?`Recorrência: <b>${E(a.recurrence)}</b>`:''].filter(Boolean).join('<br>');
    card.appendChild(box);
  });
}

/* ======================================================================
   3. Visão Geral — painel de acompanhamento (V11)
   Acrescentado abaixo do painel atual. Só lê os dados; não dispara sincronização com o ERP.
   ====================================================================== */
function acompanhamentoHtml(){
  const d=data()||{};
  const accName=p=>(d.accountMasters||[]).find(a=>String(a.id)===String(p.accountId))?.name||'Conta';
  const accountsDue=(d.accountPayments||[]).filter(p=>!['Paga','Cancelada'].includes(p.status)&&p.due).map(p=>({...p,days:daysFromToday(p.due)})).filter(p=>p.days!==null&&p.days>=0).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,8);
  const erp=(d.erpPlannedRevenues||[]).filter(r=>Number(r.remaining||0)>0&&r.dueDate).map(r=>({...r,days:daysFromToday(r.dueDate)})).filter(r=>r.days===null||r.days>=0).sort((a,b)=>String(a.dueDate).localeCompare(String(b.dueDate))).slice(0,8);
  const contracts=(d.hrPeople||[]).filter(p=>p.end).map(p=>({...p,days:daysFromToday(p.end)})).filter(p=>p.days!==null&&p.days>=0&&p.days<=60).sort((a,b)=>String(a.end).localeCompare(String(b.end)));
  const budgets=(d.budgetRecords||[]).filter(b=>b.active!==false).map(b=>{const spent=(d.budgetExpenses||[]).filter(e=>String(e.budgetId)===String(b.id)).reduce((s,e)=>s+(+e.value||0),0);return {...b,spent,open:Math.max(0,(+b.limit||0)-spent)}}).filter(b=>b.open>0).sort((a,b)=>b.open-a.open);
  const closed=['concluida','finalizada','cancelada','encerrada'];
  const trips=(d.trips||[]).filter(t=>!closed.includes(norm(t.status))).map(t=>({...t,spent:(d.tripExpenses||[]).filter(e=>String(e.tripId)===String(t.id)).reduce((s,e)=>s+Number(e.value??e.proven??e.declared??0),0)}));
  const docs=[...(d.docs||[])].sort((a,b)=>String(b.uploadedAt||b.addedAt||b.date||'').localeCompare(String(a.uploadedAt||a.addedAt||a.date||''))).slice(0,8);
  const empty=t=>`<tr><td colspan="3"><div class="empty">${E(t)}</div></td></tr>`;
  const table=(t,h,rows)=>`<section class="card dashboard-section"><div class="section-head"><h3>${E(t)}</h3></div><div class="table-wrap"><table class="table compact-dashboard-table"><thead><tr>${h.map(x=>`<th>${E(x)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
  const dueTag=n=>n===0?' <span class="badge warn">hoje</span>':(n<=7?` <span class="badge warn">${n} dia(s)</span>`:'');
  return `<h3 class="section-title">Acompanhamento</h3>
  <div class="dashboard-grid">
    ${table('Contas a vencer',['Conta','Vencimento','Valor'],accountsDue.map(p=>`<tr><td><b>${E(accName(p))}</b></td><td>${D(p.due)}${dueTag(p.days)}</td><td>${M(p.value)}</td></tr>`).join('')||empty('Nenhuma conta futura em aberto.'))}
    ${table('Próximas entradas do ERP',['Projeto / etapa','Vencimento','Saldo previsto'],erp.map(r=>`<tr><td><b>${E(r.project)}</b><small>${E(r.origin||'')}</small></td><td>${D(r.dueDate)}</td><td>${M(r.remaining)}</td></tr>`).join('')||empty('Nenhuma entrada futura sincronizada do ERP.'))}
    ${table('Contratos que vencem em 60 dias',['Colaborador','Fim do contrato','Valor mensal'],contracts.map(p=>`<tr><td><b>${E(p.name||p.nome||'Colaborador')}</b></td><td>${D(p.end)}${dueTag(p.days)}</td><td>${M(p.currentValue??p.value)}</td></tr>`).join('')||empty('Nenhum contrato vence nos próximos 60 dias.'))}
    ${table('Orçamentos abertos',['Orçamento','Setor','Disponível'],budgets.slice(0,8).map(b=>`<tr><td><b>${E(b.name)}</b></td><td>${E(b.sector||'—')}</td><td>${M(b.open)}</td></tr>`).join('')||empty('Nenhum orçamento com saldo disponível.'))}
    ${table('Viagens ativas',['Destino / projeto','Status','Gasto lançado'],trips.slice(0,8).map(t=>`<tr><td><b>${E(t.city||'Viagem')}</b><small>${E(t.project||'')}</small></td><td>${E(t.status||'Ativa')}</td><td>${M(t.spent)}</td></tr>`).join('')||empty('Nenhuma viagem ativa.'))}
    ${table('Últimos documentos fiscais',['Documento','Data','Valor'],docs.map(x=>`<tr><td><b>${E(x.name||'Documento')}</b><small>${E(x.supplier||'')}</small></td><td>${D(x.date)}</td><td>${M(x.value)}</td></tr>`).join('')||empty('Nenhum documento fiscal enviado.'))}
  </div>
  <div class="dashboard-footer-summary card"><div><span>Viagens ativas</span><b>${trips.length}</b></div><div><span>Gasto nas viagens ativas</span><b>${M(trips.reduce((s,t)=>s+t.spent,0))}</b></div><div><span>Contratos vencendo em 60 dias</span><b>${contracts.length}</b></div><div><span>Orçamentos com saldo</span><b>${budgets.length}</b></div></div>`;
}
function decorateDashboard(){
  if(currentView()!=='dashboard'||titleText()!=='Visão Geral'||!isAdmin())return;
  const content=q('#content');if(!content||!content.children.length||q('#finIncAcompanhamento',content))return;
  if(content.querySelector('.notice.danger')&&content.children.length===1)return;
  const box=document.createElement('section');box.id='finIncAcompanhamento';box.className='fin-inc-acompanhamento';box.innerHTML=acompanhamentoHtml();
  content.appendChild(box);
}

/* ======================================================================
   4. Planejamento — entradas do ERP por projeto (V12/V16)
   A lista atual continua sendo a visão padrão; "Por projeto" é uma visão adicional.
   ====================================================================== */
let erpGrouped=false;try{erpGrouped=sessionStorage.getItem('finIncErpGrouped')==='1'}catch{}
function erpGroups(){
  const map=new Map();
  (data()?.erpPlannedRevenues||[]).filter(r=>Number(r.remaining||0)>0).forEach(r=>{const key=String(r.projectId||r.project||'erp');if(!map.has(key))map.set(key,{source:r.project||'Projeto ERP',rows:[],total:0});const g=map.get(key);g.rows.push(r);g.total+=Number(r.remaining||0)});
  return [...map.values()].sort((a,b)=>a.source.localeCompare(b.source,'pt-BR'));
}
function erpGroupDetail(g){
  const rows=[...g.rows].sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')));
  modal(`Entradas previstas • ${g.source}`,`<div class="card metric mini erp-source-total"><h3>Total em aberto</h3><b>${M(g.total)}</b><small>${rows.length} parcela(s)/etapa(s)</small></div><div class="table-wrap"><table class="table"><thead><tr><th>Parcela / etapa</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Saldo a entrar</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${E(r.origin||'Recebimento')}</b></td><td>${D(r.dueDate)}</td><td>${M(r.total)}</td><td>${M(r.received)}</td><td><b>${M(r.remaining)}</b></td></tr>`).join('')}</tbody></table></div>`);
}
function decoratePlanning(){
  if(currentView()!=='planning')return;
  const card=qa('#content section.planning-source-card').find(s=>q('.section-head h3',s)?.textContent.trim()==='Entradas programadas do ERP');if(!card)return;
  const head=q('.section-head',card),list=q('.pc-list',card);if(!head||!list)return;
  let seg=q('.fin-inc-erp-toggle',head);
  if(!seg){
    seg=document.createElement('div');seg.className='segmented fin-inc-erp-toggle';seg.innerHTML='<button type="button" data-mode="list">Lista</button><button type="button" data-mode="group">Por projeto</button>';
    head.appendChild(seg);qa('button',seg).forEach(b=>b.onclick=()=>{erpGrouped=b.dataset.mode==='group';try{sessionStorage.setItem('finIncErpGrouped',erpGrouped?'1':'0')}catch{}decoratePlanning()});
  }
  qa('button',seg).forEach(b=>b.classList.toggle('active',(b.dataset.mode==='group')===erpGrouped));
  let grouped=q('.fin-inc-erp-groups',card);
  if(erpGrouped){
    const groups=erpGroups(),sig=JSON.stringify(groups.map(g=>[g.source,g.total,g.rows.length]));
    if(!grouped){grouped=document.createElement('div');grouped.className='erp-source-list fin-inc-erp-groups';card.appendChild(grouped)}
    if(grouped.dataset.sig!==sig){grouped.dataset.sig=sig;grouped.innerHTML=groups.map((g,i)=>`<button type="button" class="erp-source-row" data-group="${i}"><span><b>${E(g.source)}</b><small>${g.rows.length} parcela(s) em aberto</small></span><strong>${M(g.total)}</strong><span class="erp-source-chevron">›</span></button>`).join('')||'<div class="empty">Nenhuma entrada futura sincronizada do ERP.</div>';qa('[data-group]',grouped).forEach(b=>b.onclick=()=>erpGroupDetail(groups[+b.dataset.group]))}
    list.hidden=true;grouped.hidden=false;
  }else{list.hidden=false;if(grouped)grouped.hidden=true}
}

/* ======================================================================
   5. Fluxo de Caixa — exportar CSV e PDF (V14)
   Usa as mesmas linhas que o editor mostra na tela, inclusive os ajustes manuais.
   ====================================================================== */
function cashMonth(){return q('#cashEditMonth')?.value||localToday().slice(0,7)}
function cashRowsOf(month){
  let rows=[];try{rows=window.IntegralFinanceCashflowEditor?.allRows?.()||[]}catch{}
  return rows.filter(r=>monthOf(r.date)===month).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
}
function exportCashCsv(month){
  const rows=cashRowsOf(month);
  const lines=[['Data','Descrição','Natureza','Origem','Tipo','Valor'].map(csvCell).join(';'),...rows.map(r=>[D(r.date),r.description,r.kind||'',r.source||'',r.direction||'',Number(r.value||0).toFixed(2).replace('.',',')].map(csvCell).join(';'))];
  downloadBlob(new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),`fluxo-caixa-${month}.csv`);
}
function exportCashPdf(month){
  if(!window.jspdf?.jsPDF){alert('A biblioteca de PDF não carregou. Recarregue a página e tente novamente.');return}
  const rows=cashRowsOf(month),ins=rows.filter(r=>r.direction==='Entrada').reduce((s,r)=>s+Number(r.value||0),0),outs=rows.filter(r=>r.direction==='Saída').reduce((s,r)=>s+Number(r.value||0),0);
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFontSize(16);doc.text(`Fluxo de Caixa — ${monthLabel(month)}`,14,16);doc.setFontSize(10);doc.text(`Entradas: ${M(ins)}   Saídas: ${M(outs)}   Saldo: ${M(ins-outs)}`,14,23);
  const body=rows.map(r=>[D(r.date),r.description||'',r.kind||'',r.source||'',r.direction||'',M(r.value)]);
  if(typeof doc.autoTable==='function')doc.autoTable({startY:28,head:[['Data','Descrição','Natureza','Origem','Tipo','Valor']],body,styles:{fontSize:8},headStyles:{fillColor:[17,94,89]},columnStyles:{5:{halign:'right'}}});
  else{let y=31;body.forEach(r=>{if(y>195){doc.addPage();y=16}doc.text(r.join(' | ').slice(0,180),14,y);y+=6})}
  doc.save(`fluxo-caixa-${month}.pdf`);
}
function decorateCashflow(){
  if(titleText()!=='Fluxo de Caixa'||!isAdmin())return;
  const monthInput=q('#cashEditMonth');const toolbar=monthInput?.closest('.toolbar');if(!toolbar||q('#finIncCashExport',toolbar))return;
  const box=document.createElement('div');box.id='finIncCashExport';box.className='right export-actions';
  box.innerHTML='<button type="button" class="btn ghost" data-csv>Exportar CSV</button><button type="button" class="btn ghost" data-pdf>Exportar PDF</button>';
  toolbar.appendChild(box);q('[data-csv]',box).onclick=()=>exportCashCsv(cashMonth());q('[data-pdf]',box).onclick=()=>exportCashPdf(cashMonth());
}

/* ======================================================================
   6. Viagens — relatório (V17/V18)
   Mostra só as viagens que o usuário já pode ver na tela de Viagens.
   ====================================================================== */
function visibleTrips(){
  const d=data();const all=d?.trips||[];if(isAdmin())return all;
  const sector=window.IntegralFinanceSectorAccess;
  if(sector?.isFinance?.())return all.filter(t=>sector.directlyAssigned(t));
  return all.filter(t=>typeof window.IntegralTripVisible==='function'&&window.IntegralTripVisible(t));
}
function tripMonth(t){return monthOf(t.start||t.month||t.end||'')}
function tripReport(){
  const d=data()||{},trips=visibleTrips();
  const months=[...new Set(trips.map(tripMonth).filter(Boolean))].sort().reverse();
  const el=modal('Relatório de viagens',`<div class="toolbar"><div class="left"><label class="muted" for="finIncTripMonth">Período</label><select id="finIncTripMonth"><option value="">Todas as viagens</option>${months.map(m=>`<option value="${m}">${E(monthLabel(m))}</option>`).join('')}</select></div></div><div id="finIncTripBody"></div>`,'<button type="button" class="btn ghost" data-csv>Exportar CSV</button>');
  el.querySelector('.modal').style.width='min(1100px,96vw)';
  const spentOf=t=>(d.tripExpenses||[]).filter(e=>String(e.tripId)===String(t.id)).reduce((s,e)=>s+Number(e.value??e.proven??e.declared??0),0);
  const rowsFor=m=>trips.filter(t=>!m||tripMonth(t)===m).map(t=>({t,spent:spentOf(t),count:(d.tripExpenses||[]).filter(e=>String(e.tripId)===String(t.id)).length})).sort((a,b)=>String(b.t.start||'').localeCompare(String(a.t.start||'')));
  const draw=()=>{
    const m=q('#finIncTripMonth',el).value,rows=rowsFor(m),total=rows.reduce((s,r)=>s+r.spent,0),planned=rows.reduce((s,r)=>s+Number(r.t.plannedAmount||0),0),review=(d.tripExpenses||[]).filter(e=>rows.some(r=>String(r.t.id)===String(e.tripId))&&/revisar|diverg/i.test(e.status||'')).length;
    q('#finIncTripBody',el).innerHTML=`<div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Viagens</h3><b>${rows.length}</b></div><div class="card metric mini"><h3>Gasto lançado</h3><b>${M(total)}</b></div><div class="card metric mini"><h3>Valor previsto</h3><b>${M(planned)}</b></div><div class="card metric mini"><h3>Gastos a revisar</h3><b>${review}</b></div></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Projeto</th><th>Setor</th><th>Gastos</th><th>Total lançado</th><th>Status</th></tr></thead><tbody>${rows.map(({t,spent,count})=>`<tr><td><b>${E(t.city||'—')}</b></td><td>${E(t.period||(t.start?`${D(t.start)} a ${D(t.end||t.start)}`:'—'))}</td><td>${E(t.employee||'—')}</td><td>${E(t.project||'—')}</td><td>${E(t.sector||'—')}</td><td>${count}</td><td>${M(spent)}</td><td>${E(t.status||'—')}</td></tr>`).join('')||'<tr><td colspan="8"><div class="empty">Nenhuma viagem neste período.</div></td></tr>'}</tbody></table></div>`;
    el._rows=rows;el._month=m;
  };
  q('#finIncTripMonth',el).onchange=draw;draw();
  q('[data-csv]',el).onclick=()=>{const rows=el._rows||[];const lines=[['Destino','Início','Fim','Equipe','Projeto','Setor','Gastos','Total lançado','Status'].map(csvCell).join(';'),...rows.map(({t,spent,count})=>[t.city,D(t.start),D(t.end||t.start),t.employee,t.project,t.sector,count,spent.toFixed(2).replace('.',','),t.status].map(csvCell).join(';'))];downloadBlob(new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),`relatorio-viagens-${el._month||'todas'}.csv`)};
}
function decorateTrips(){
  if(titleText()!=='Viagens')return;
  const content=q('#content');const toolbar=content&&q('.toolbar',content);if(!toolbar||q('#finIncTripReport',content))return;
  const b=document.createElement('button');b.type='button';b.id='finIncTripReport';b.className='btn ghost';b.textContent='Relatório de viagens';b.onclick=tripReport;
  const newBtn=q('#trip26New, #trip31New',toolbar);if(newBtn)newBtn.parentElement.insertBefore(b,newBtn);else toolbar.appendChild(b);
}

/* ======================================================================
   7. Contas — espelho nas tabelas financeiro_contas / financeiro_pagamentos (V19)
   Somente envio (upsert) do que está no sistema para as tabelas dos lembretes automáticos.
   Nunca lê dessas tabelas para dentro do sistema e nunca apaga linhas (as exclusões já são tratadas
   pelos módulos de Contas). Roda apenas para administradores, depois que os dados da nuvem carregaram.
   ====================================================================== */
const mirror={ready:false,timer:null,running:false,again:false,last:{},disabled:false};
const txt=v=>String(v??'');
const clean=o=>{const x={};for(const[k,v]of Object.entries(o||{})){if(k==='file'&&v&&typeof v==='object'){x.file={name:v.name,type:v.type,size:v.size,addedAt:v.addedAt};continue}if(k==='dataUrl'||k==='fileData')continue;x[k]=v}return x};
function mapAccount(a){return {id:txt(a.id),nome:a.name||a.supplier||'Conta',fornecedor:a.supplier||'',categoria:a.category||'',setor:a.sector||'',matricula_cadastro:a.registration||'',recorrencia:a.recurrence||'',ativo:a.active!==false,dados:clean(a),updated_at:new Date().toISOString()}}
function mapPayment(p){return {id:txt(p.id),conta_id:txt(p.accountId),vencimento:/^\d{4}-\d{2}-\d{2}$/.test(txt(p.due))?p.due:localToday(),valor:Number(p.value||0),status:p.status||'A vencer',forma_pagamento:p.method||p.paymentMethod||'',codigo_pagamento:p.barcode||p.paymentCode||'',pago_em:p.paidAt||null,dados:clean(p),updated_at:new Date().toISOString()}}
async function upsertEach(sb,table,rows){
  let failed=0;
  for(let i=0;i<rows.length;i+=50){
    const chunk=rows.slice(i,i+50),r=await sb.from(table).upsert(chunk,{onConflict:'id'});
    if(!r.error)continue;
    if(/does not exist|schema cache|relation/i.test(r.error.message||'')){mirror.disabled=true;console.warn(`Incrementos: tabela ${table} indisponível; espelho de Contas desativado.`);return -1}
    for(const row of chunk){const one=await sb.from(table).upsert(row,{onConflict:'id'});if(one.error){failed++;console.warn(`Incrementos: não foi possível espelhar ${table} ${row.id}:`,one.error.message)}}
  }
  return failed;
}
async function runMirror(){
  if(mirror.disabled||!mirror.ready||!isAdmin())return;
  if(mirror.running){mirror.again=true;return}
  const sb=window.IntegralERP?.sb,d=data();if(!sb||!d)return;
  try{const {data:s}=await sb.auth.getSession();if(!s?.session)return}catch{return}
  mirror.running=true;
  try{
    const accounts=(d.accountMasters||[]).map(mapAccount),ids=new Set(accounts.map(a=>a.id));
    const payments=(d.accountPayments||[]).filter(p=>ids.has(txt(p.accountId))).map(mapPayment);
    const changedAcc=accounts.filter(a=>mirror.last['a:'+a.id]!==JSON.stringify({...a,updated_at:0}));
    const changedPay=payments.filter(p=>mirror.last['p:'+p.id]!==JSON.stringify({...p,updated_at:0}));
    if(changedAcc.length){const f=await upsertEach(sb,'financeiro_contas',changedAcc);if(f<0)return;changedAcc.forEach(a=>mirror.last['a:'+a.id]=JSON.stringify({...a,updated_at:0}))}
    if(changedPay.length){const f=await upsertEach(sb,'financeiro_pagamentos',changedPay);if(f<0)return;changedPay.forEach(p=>mirror.last['p:'+p.id]=JSON.stringify({...p,updated_at:0}))}
  }catch(e){console.warn('Incrementos: espelho de Contas pendente',e)}
  finally{mirror.running=false;if(mirror.again){mirror.again=false;scheduleMirror()}}
}
function scheduleMirror(){clearTimeout(mirror.timer);mirror.timer=setTimeout(runMirror,1500)}
function installMirror(){
  const original=typeof save==='function'?save:window.save;
  if(typeof original!=='function'||original.__finIncMirror)return false;
  const wrapped=function(){const r=original.apply(this,arguments);if(mirror.ready)scheduleMirror();return r};
  wrapped.__finIncMirror=true;try{save=wrapped}catch{}window.save=wrapped;return true;
}
document.addEventListener('integral-finance-cloud-ready',()=>{mirror.ready=true;scheduleMirror()});

/* ---------- ligação com as telas ---------- */
function decorateAll(){
  try{qa('.modal-backdrop').forEach(decorateBillsModal)}catch(e){console.error(e)}
  try{decorateAccountCards()}catch(e){console.error(e)}
  try{decorateDashboard()}catch(e){console.error(e)}
  try{decoratePlanning()}catch(e){console.error(e)}
  try{decorateCashflow()}catch(e){console.error(e)}
  try{decorateTrips()}catch(e){console.error(e)}
}
let queued=false;
const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;decorateAll()})};
function boot(){
  installMirror();
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  decorateAll();
  if(window.IntegralFinanceCloudStorage&&typeof window.IntegralFinanceCloudStorage.initialize==='function'){window.IntegralFinanceCloudStorage.initialize().then(ok=>{if(ok){mirror.ready=true;scheduleMirror()}}).catch(()=>{})}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.IntegralFinanceIncrementos={exportCashCsv,exportCashPdf,tripReport,runMirror};
})();
