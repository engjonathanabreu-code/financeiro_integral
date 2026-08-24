/* Integral Financeiro V9 - limpeza, restauração de Orçamentos/Viagens e detalhe do Planejamento */
(function(){
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const isAdm=()=>user?.role==='Administrador';
  const uid=()=>typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
  const monthOf=d=>String(d||'').slice(0,7);
  const nowMonth=()=>new Date().toISOString().slice(0,7);
  const monthLabel=m=>{if(!m)return'';const[y,n]=m.split('-');return new Date(+y,+n-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
  const currentLocalUser=()=> (db.usersMvp||[]).find(u=>u.erpId===user?.erpId||norm(u.email)===norm(user?.email)||u.name===user?.name);
  const sameSector=(a,b)=>!!norm(a)&&norm(a)===norm(b);
  const sectors=()=> (db.sectors||[]).filter(s=>s.active!==false).map(s=>s.name);
  const activeUsers=()=> (db.usersMvp||[]).filter(u=>u.active!==false);
  const fmeta=f=>f?{name:f.name,type:f.type,size:f.size,addedAt:new Date().toISOString()}:null;
  const opt=(arr,selected='')=>arr.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(v)}</option>`).join('');
  const moneySafe=v=>money(Number(v||0));

  function cleanDemoDataOnce(){
    const key='integral_fin_real_data_reset_v1';
    if(localStorage.getItem(key))return;
    const preserve={
      usersMvp:db.usersMvp||[],sectors:db.sectors||[],natures:db.natures||[],categories:db.categories||[],suppliers:[],
      erpProjects:db.erpProjects||[],erpPlans:db.erpPlans||[]
    };
    db.accounts=[]; db.accountMasters=[]; db.accountPayments=[]; db.docs=[]; db.cashflow=[];
    db.budgets=[]; db.budgetRecords=[]; db.budgetExpenses=[];
    db.trips=[]; db.tripExpenses=[]; db.tripDocuments=[];
    db.revenues=[]; db.planRevenues=[]; db.planExpenses=[]; db.futureExpenses=[]; db.plans=[];
    db.hrPeople=[]; db.hrPayments=[];
    Object.assign(db,preserve);
    save(); localStorage.setItem(key,'1');
  }
  cleanDemoDataOnce();

  function budgetVisible(b){
    if(isAdm())return true;
    const u=currentLocalUser();
    const direct=(b.assignedDirect||b.assigned||[]).includes(u?.id);
    return direct||sameSector(b.sector,user?.sector);
  }
  function tripVisible(t){
    if(isAdm())return true;
    const u=currentLocalUser();
    return (t.assigned||[]).includes(u?.id)||sameSector(t.sector,user?.sector);
  }

  function budgetForm(id){
    if(!isAdm())return;
    const b=(db.budgetRecords||[]).find(x=>String(x.id)===String(id));
    const selectedUsers=b?.assignedDirect||b?.assigned||[];
    const x=v2modal(b?'Editar orçamento':'Criar orçamento',`<form id="v9BudgetForm"><div class="modal-body"><div class="form-grid">
      <div class="field full"><label>Nome do orçamento</label><input name="name" value="${esc(b?.name||'')}" required></div>
      <div class="field"><label>Setor responsável</label><select name="sector"><option value="">Selecione</option>${opt(sectors(),b?.sector||'')}</select></div>
      <div class="field"><label>Valor / limite do orçamento</label><input name="limit" type="number" min="0" step="0.01" value="${b?.limit||''}" required></div>
      <div class="field full"><label>Plano de Trabalho do ERP (opcional)</label><select name="erp"><option value="">Sem associação</option>${(db.erpPlans||[]).map(p=>`<option value="${esc(p.title)}" ${p.title===b?.erpPlan?'selected':''}>${esc(p.title)}</option>`).join('')}</select></div>
      <div class="field full"><label>Usuários com acesso individual</label><div class="assignment-grid">${activeUsers().map(u=>`<label class="check-line"><input type="checkbox" name="assigned" value="${u.id}" ${selectedUsers.includes(u.id)?'checked':''}><span><b>${esc(u.name)}</b><small>${esc(u.sector||'')}</small></span></label>`).join('')||'<span class="muted">Nenhum usuário sincronizado.</span>'}</div></div>
      <div class="notice full">Além dos usuários selecionados, todos os usuários do setor responsável poderão visualizar este orçamento.</div>
    </div></div><div class="modal-foot">${b?'<button type="button" class="btn danger" id="v9DeleteBudget">Excluir</button>':''}<button class="btn">Salvar</button></div></form>`);
    x.querySelector('#v9BudgetForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const title=f.get('erp')||'',plan=(db.erpPlans||[]).find(p=>p.title===title);const o={id:b?.id||uid(),name:f.get('name').trim(),sector:f.get('sector')||'',limit:+f.get('limit')||0,erpPlan:title,erpPlanId:plan?.id||'',erpProjectId:plan?.projectId||'',assignedDirect:f.getAll('assigned').map(Number),assigned:f.getAll('assigned').map(Number),active:true,history:b?.history||[]};o.history.push({at:new Date().toISOString(),action:b?'Orçamento editado':'Orçamento criado',by:user.name});b?Object.assign(b,o):(db.budgetRecords=db.budgetRecords||[],db.budgetRecords.push(o));save();x.remove();budgets()};
    if(b&&x.querySelector('#v9DeleteBudget'))x.querySelector('#v9DeleteBudget').onclick=()=>{if(!confirm('Excluir este orçamento?'))return;b.active=false;b.history=b.history||[];b.history.push({at:new Date().toISOString(),action:'Orçamento excluído',by:user.name});save();x.remove();budgets()};
  }

  async function analyzeReceipt(file,budget){
    const image=await new Promise((ok,no)=>{const r=new FileReader;r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});
    const candidates=[...(db.accountPayments||[]).filter(p=>p.status==='Paga').map(p=>({id:p.id,date:p.paidAt||p.due,description:(db.accountMasters||[]).find(a=>a.id===p.accountId)?.name||'Conta paga',value:+p.value||0,source:'Conta paga'})),...(db.budgetExpenses||[]).map(e=>({id:e.id,date:e.date,description:e.description,value:+e.value||0,source:'Orçamento'}))];
    const r=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,fileName:file.name,sector:budget?.sector,candidates})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.details||d.error||'Falha na leitura do comprovante.');return d;
  }

  function expenseForm(bid,eid){
    const b=(db.budgetRecords||[]).find(x=>String(x.id)===String(bid));if(!b||!budgetVisible(b))return budgets();
    const e=(db.budgetExpenses||[]).find(x=>String(x.id)===String(eid));
    const x=v2modal(e?'Editar gasto':'Adicionar gasto',`<form id="v9ExpenseForm"><div class="modal-body"><div class="form-grid">
      <div class="field"><label>Data</label><input name="date" type="date" value="${e?.date||new Date().toISOString().slice(0,10)}" required></div>
      <div class="field"><label>Valor</label><input name="value" type="number" step="0.01" value="${e?.value||''}" required></div>
      <div class="field"><label>Descrição do gasto</label><input name="description" value="${esc(e?.description||'')}" required></div>
      <div class="field"><label>Origem / fornecedor</label><input name="origin" value="${esc(e?.origin||'')}"></div>
      <div class="field full"><label>Comprovante</label><input id="v9Receipt" type="file" accept="image/*,.pdf"><small>${e?.file?`Atual: ${esc(e.file.name)}`:'Você pode registrar o gasto e anexar o comprovante.'}</small></div>
      <div id="v9ReceiptStatus" class="notice full">A IA verificará valor, origem e possível duplicidade ao anexar um comprovante.</div>
    </div></div><div class="modal-foot"><button class="btn">Salvar gasto</button></div></form>`);
    let ai=e?.aiData||null;const fi=x.querySelector('#v9Receipt'),st=x.querySelector('#v9ReceiptStatus'),form=x.querySelector('#v9ExpenseForm');
    fi.onchange=async()=>{if(!fi.files[0])return;st.textContent='Analisando comprovante...';try{ai=await analyzeReceipt(fi.files[0],b);st.innerHTML=`${ai.duplicate?'<b>Possível duplicidade encontrada.</b>':'<b>Sem duplicidade aparente.</b>'} ${ai.value?`Valor identificado: ${moneySafe(ai.value)}.`:''} ${ai.origin?`Origem: ${esc(ai.origin)}.`:''}`;if(ai.value)form.elements.value.value=ai.value;if(ai.origin)form.elements.origin.value=ai.origin;}catch(err){st.textContent=err.message}};
    form.onsubmit=v=>{v.preventDefault();const f=new FormData(form),o={id:e?.id||uid(),budgetId:b.id,date:f.get('date'),value:+f.get('value')||0,description:f.get('description').trim(),origin:f.get('origin').trim(),file:fi.files[0]?fmeta(fi.files[0]):e?.file||null,ai:!!ai,aiData:ai,duplicate:!!ai?.duplicate,history:e?.history||[]};o.history.push({at:new Date().toISOString(),action:e?'Gasto editado':'Gasto adicionado',by:user.name});e?Object.assign(e,o):(db.budgetExpenses=db.budgetExpenses||[],db.budgetExpenses.push(o));save();x.remove();budgetDetail(b.id)};
  }

  function budgetDetail(id){
    const b=(db.budgetRecords||[]).find(x=>String(x.id)===String(id));if(!b||!budgetVisible(b))return budgets();
    const exp=(db.budgetExpenses||[]).filter(e=>String(e.budgetId)===String(b.id)).sort((a,z)=>(z.date||'').localeCompare(a.date||''));
    const spent=exp.reduce((s,e)=>s+(+e.value||0),0),available=(+b.limit||0)-spent,pct=b.limit?Math.min(100,spent/b.limit*100):0;
    title(b.name);
    $('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="v9BudgetBack">← Orçamentos</button><div class="right">${isAdm()?'<button class="btn ghost" id="v9BudgetEdit">Editar orçamento</button>':''}<button class="btn" id="v9AddExpense">+ Adicionar gasto</button></div></div>
      <div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Orçamento</h3><b>${moneySafe(b.limit)}</b></div><div class="card metric mini"><h3>Gasto</h3><b>${moneySafe(spent)}</b></div><div class="card metric mini"><h3>Disponível</h3><b>${moneySafe(available)}</b></div><div class="card metric mini"><h3>Utilização</h3><b>${pct.toFixed(1)}%</b></div></div>
      <div class="card budget-summary"><div><span class="badge">${esc(b.sector||'Sem setor')}</span><h3>${esc(b.name)}</h3><p>${b.erpPlan?`Plano de Trabalho: <b>${esc(b.erpPlan)}</b>`:'Sem Plano de Trabalho associado'}</p></div><div><small>Acesso individual</small><b>${(b.assignedDirect||b.assigned||[]).length} usuário(s)</b></div></div>
      <h3 class="section-title">Gastos registrados</h3><div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Data</th><th>Descrição</th><th>Origem</th><th>Comprovante</th><th>IA</th><th class="num">Valor</th><th></th></tr></thead><tbody>${exp.map(e=>`<tr><td>${e.date?fmt(e.date):'—'}</td><td><b>${esc(e.description)}</b></td><td>${esc(e.origin||'—')}</td><td>${esc(e.file?.name||'—')}</td><td>${e.ai?badgeStatus(e.duplicate?'Revisar IA':'Confirmado'):'—'}</td><td class="num">${moneySafe(e.value)}</td><td>${isAdm()?`<button class="icon-btn" data-v9-exp-edit="${e.id}">✎</button><button class="icon-btn danger-text" data-v9-exp-del="${e.id}">×</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">Nenhum gasto registrado.</div></td></tr>'}</tbody></table></div>
      <h3 class="section-title">Histórico do orçamento</h3><div class="card history-list">${[...(b.history||[]),...exp.flatMap(e=>e.history||[])].sort((a,z)=>String(z.at).localeCompare(String(a.at))).map(h=>`<div><b>${new Date(h.at).toLocaleString('pt-BR')}</b><span>${esc(h.action)}${h.by?` • ${esc(h.by)}`:''}</span></div>`).join('')||'<div class="muted">Sem histórico.</div>'}</div>`;
    $('#v9BudgetBack').onclick=budgets;if($('#v9BudgetEdit'))$('#v9BudgetEdit').onclick=()=>budgetForm(b.id);$('#v9AddExpense').onclick=()=>expenseForm(b.id);
    $$('[data-v9-exp-edit]').forEach(z=>z.onclick=()=>expenseForm(b.id,z.dataset.v9ExpEdit));$$('[data-v9-exp-del]').forEach(z=>z.onclick=()=>{const e=(db.budgetExpenses||[]).find(q=>String(q.id)===String(z.dataset.v9ExpDel));if(!e||!confirm('Excluir este gasto?'))return;b.history=b.history||[];b.history.push({at:new Date().toISOString(),action:`Gasto excluído: ${e.description}`,by:user.name});db.budgetExpenses=db.budgetExpenses.filter(q=>String(q.id)!==String(e.id));save();budgetDetail(b.id)});
  }

  budgets=function(){
    title('Orçamentos');const list=(db.budgetRecords||[]).filter(b=>b.active!==false&&budgetVisible(b));
    $('#content').innerHTML=`<div class="toolbar"><div><b>${list.length}</b> orçamento(s) visível(is)</div>${isAdm()?'<button class="btn" id="v9NewBudget">+ Criar orçamento</button>':''}</div><div class="grid cols-2 responsive-cards">${list.map(b=>{const exp=(db.budgetExpenses||[]).filter(e=>String(e.budgetId)===String(b.id)),spent=exp.reduce((s,e)=>s+(+e.value||0),0),pct=b.limit?Math.min(100,spent/b.limit*100):0;return`<button class="card v6-budget-card restored-budget-card" data-v9-budget="${b.id}"><div class="card-head-row"><span class="badge">${esc(b.sector||'Sem setor')}</span><span>${pct.toFixed(0)}%</span></div><h3>${esc(b.name)}</h3><p><b>${moneySafe(spent)}</b> gastos de ${moneySafe(b.limit)}</p><div class="progress"><i style="width:${pct}%"></i></div><small>${esc(b.erpPlan||'Sem Plano de Trabalho ERP')}</small></button>`}).join('')||'<div class="empty card">Nenhum orçamento cadastrado ou atribuído.</div>'}</div>`;
    if($('#v9NewBudget'))$('#v9NewBudget').onclick=()=>budgetForm();$$('[data-v9-budget]').forEach(x=>x.onclick=()=>budgetDetail(x.dataset.v9Budget));
  };

  function tripForm(id){
    if(!isAdm())return;
    const t=(db.trips||[]).find(x=>String(x.id)===String(id));const selected=t?.assigned||[];
    const x=v2modal(t?'Editar viagem':'Nova viagem',`<form id="v9TripForm"><div class="modal-body"><div class="form-grid">
      <div class="field"><label>Destino / cidade</label><input name="city" value="${esc(t?.city||'')}" required></div>
      <div class="field"><label>Projeto / atividade</label><input name="project" value="${esc(t?.project||'')}"></div>
      <div class="field"><label>Data inicial</label><input name="start" type="date" value="${t?.start||''}" required></div>
      <div class="field"><label>Data final</label><input name="end" type="date" value="${t?.end||''}" required></div>
      <div class="field full"><label>Equipe / viajantes</label><input name="employee" value="${esc(t?.employee||'')}" required></div>
      <div class="field"><label>Setor</label><select name="sector"><option value="">Selecione</option>${opt(sectors(),t?.sector||'')}</select></div>
      <div class="field"><label>Status</label><select name="status">${opt(['Planejada','Em andamento','Aguardando prestação','Aprovada','Divergência','Concluída'],t?.status||'Planejada')}</select></div>
      <div class="field full"><label>Objetivo da viagem</label><textarea name="objective">${esc(t?.objective||'')}</textarea></div>
      <div class="field full"><label>Relatório / observações</label><textarea name="report">${esc(t?.report||'')}</textarea></div>
      <div class="field full"><label>Usuários com acesso individual</label><div class="assignment-grid">${activeUsers().map(u=>`<label class="check-line"><input type="checkbox" name="assigned" value="${u.id}" ${selected.includes(u.id)?'checked':''}><span><b>${esc(u.name)}</b><small>${esc(u.sector||'')}</small></span></label>`).join('')}</div></div>
    </div></div><div class="modal-foot">${t?'<button type="button" class="btn danger" id="v9TripDelete">Excluir</button>':''}<button class="btn">Salvar</button></div></form>`);
    x.querySelector('#v9TripForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),start=f.get('start'),end=f.get('end'),o={id:t?.id||uid(),city:f.get('city').trim(),project:f.get('project').trim(),start,end,period:start&&end?`${fmt(start)} a ${fmt(end)}`:'',month:monthOf(start),employee:f.get('employee').trim(),sector:f.get('sector')||'',status:f.get('status'),objective:f.get('objective').trim(),report:f.get('report').trim(),assigned:f.getAll('assigned').map(Number),declared:t?.declared||0,proven:t?.proven||0,aiScore:t?.aiScore??null,issues:t?.issues||[]};t?Object.assign(t,o):(db.trips=db.trips||[],db.trips.push(o));save();x.remove();trips()};
    if(t&&x.querySelector('#v9TripDelete'))x.querySelector('#v9TripDelete').onclick=()=>{if(!confirm('Excluir esta viagem?'))return;db.trips=db.trips.filter(q=>String(q.id)!==String(t.id));db.tripExpenses=(db.tripExpenses||[]).filter(q=>String(q.tripId)!==String(t.id));db.tripDocuments=(db.tripDocuments||[]).filter(q=>String(q.tripId)!==String(t.id));save();x.remove();trips()};
  }

  function tripExpenseForm(tid){
    const t=(db.trips||[]).find(x=>String(x.id)===String(tid));if(!t||!tripVisible(t))return;
    const x=v2modal('Adicionar despesa da viagem',`<form id="v9TripExpense"><div class="modal-body"><div class="form-grid"><div class="field"><label>Tipo</label><select name="type">${opt(['Hospedagem','Combustível','Alimentação','Pedágio','Passagem','Estacionamento','Outros'])}</select></div><div class="field"><label>Data</label><input name="date" type="date" value="${new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Valor declarado</label><input name="declared" type="number" step="0.01" required></div><div class="field"><label>Valor comprovado</label><input name="proven" type="number" step="0.01"></div><div class="field full"><label>Documento / comprovante</label><input name="file" type="file" accept="image/*,.pdf"></div></div></div><div class="modal-foot"><button class="btn">Salvar despesa</button></div></form>`);
    x.querySelector('#v9TripExpense').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),file=e.target.file.files[0],declared=+f.get('declared')||0,proven=f.get('proven')===''?declared:+f.get('proven')||0;db.tripExpenses=db.tripExpenses||[];db.tripExpenses.push({id:uid(),tripId:t.id,type:f.get('type'),date:f.get('date'),declared,proven,doc:file?.name||'',file:fmeta(file),status:Math.abs(declared-proven)>.01?'Divergência':'OK'});save();x.remove();tripDetail(t.id)};
  }

  function uploadTripDocument(tid){
    const t=(db.trips||[]).find(x=>String(x.id)===String(tid));if(!t||!tripVisible(t))return;
    const x=v2modal('Enviar documento',`<form id="v9TripDoc"><div class="modal-body"><div class="field"><label>Arquivo</label><input name="file" type="file" required></div><div class="field"><label>Observação</label><input name="note" placeholder="Ex.: comprovante do hotel, pedágio, relatório..."></div><div class="notice">Você pode voltar depois e enviar outros arquivos individualmente.</div></div><div class="modal-foot"><button class="btn">Enviar</button></div></form>`);
    x.querySelector('#v9TripDoc').onsubmit=e=>{e.preventDefault();const f=e.target.file.files[0];db.tripDocuments=db.tripDocuments||[];db.tripDocuments.push({id:uid(),tripId:t.id,file:fmeta(f),note:e.target.note.value,addedAt:new Date().toISOString(),by:user.name});save();x.remove();tripDetail(t.id)};
  }

  function tripDetail(id){
    const t=(db.trips||[]).find(x=>String(x.id)===String(id));if(!t||!tripVisible(t))return trips();
    const expenses=(db.tripExpenses||[]).filter(x=>String(x.tripId)===String(t.id)).sort((a,b)=>(a.date||'').localeCompare(b.date||''));const docs=(db.tripDocuments||[]).filter(x=>String(x.tripId)===String(t.id)).sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt)));
    const declared=expenses.reduce((s,e)=>s+(+e.declared||0),0),proven=expenses.reduce((s,e)=>s+(+e.proven||0),0),diff=declared-proven,issues=[...(t.issues||[]),...expenses.filter(e=>e.status==='Divergência').map(e=>`${e.type}: diferença de ${moneySafe((+e.declared||0)-(+e.proven||0))}`)];
    title(`Viagem • ${t.city}`);
    $('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="v9TripsBack">← Viagens</button><div class="right">${isAdm()?'<button class="btn ghost" id="v9TripEdit">Editar viagem</button>':''}<button class="btn ghost" id="v9TripExpenseAdd">+ Despesa</button><button class="btn" id="v9TripDocAdd">Enviar documento</button></div></div>
      <div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Declarado</h3><b>${moneySafe(declared)}</b></div><div class="card metric mini"><h3>Comprovado</h3><b>${moneySafe(proven)}</b></div><div class="card metric mini"><h3>Diferença</h3><b>${moneySafe(diff)}</b></div><div class="card metric mini"><h3>Status</h3><b class="metric-status">${esc(t.status||'—')}</b></div></div>
      <div class="grid cols-2 trip-info-grid"><div class="card"><h3>Informações da viagem</h3><div class="detail-list"><div><span>Destino</span><b>${esc(t.city||'—')}</b></div><div><span>Período</span><b>${esc(t.period||((t.start&&t.end)?`${fmt(t.start)} a ${fmt(t.end)}`:'—'))}</b></div><div><span>Equipe</span><b>${esc(t.employee||'—')}</b></div><div><span>Setor</span><b>${esc(t.sector||'—')}</b></div><div><span>Projeto</span><b>${esc(t.project||'—')}</b></div></div></div><div class="card"><h3>Objetivo e relatório</h3><p><b>Objetivo:</b> ${esc(t.objective||'Não informado.')}</p><p><b>Relatório:</b> ${esc(t.report||'Não informado.')}</p>${t.aiScore!=null?`<p><b>Score IA:</b> ${esc(t.aiScore)}%</p>`:''}</div></div>
      ${issues.length?`<div class="notice warn"><b>Pontos para revisar</b><ul>${issues.map(i=>`<li>${esc(i)}</li>`).join('')}</ul></div>`:''}
      <h3 class="section-title">Despesas da viagem</h3><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th>Declarado</th><th>Comprovado</th><th>Documento</th><th>Status</th></tr></thead><tbody>${expenses.map(e=>`<tr><td>${e.date?fmt(e.date):'—'}</td><td>${esc(e.type||'')}</td><td>${moneySafe(e.declared)}</td><td>${moneySafe(e.proven)}</td><td>${esc(e.file?.name||e.doc||'—')}</td><td>${badgeStatus(e.status||'OK')}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Nenhuma despesa registrada.</div></td></tr>'}</tbody></table></div>
      <h3 class="section-title">Documentos enviados</h3><div class="card">${docs.map(d=>`<div class="file-row"><div><b>${esc(d.file?.name||'Arquivo')}</b><small>${esc(d.note||'')}</small></div><span>${d.addedAt?new Date(d.addedAt).toLocaleString('pt-BR'):'—'}</span></div>`).join('')||'<div class="empty">Nenhum documento adicional enviado.</div>'}</div>`;
    $('#v9TripsBack').onclick=trips;if($('#v9TripEdit'))$('#v9TripEdit').onclick=()=>tripForm(t.id);$('#v9TripExpenseAdd').onclick=()=>tripExpenseForm(t.id);$('#v9TripDocAdd').onclick=()=>uploadTripDocument(t.id);
  }

  trips=function(){
    title('Viagens');const list=(db.trips||[]).filter(tripVisible).sort((a,b)=>(b.start||'').localeCompare(a.start||''));
    $('#content').innerHTML=`<div class="toolbar"><div><b>${list.length}</b> viagem(ns) visível(is)</div>${isAdm()?'<button class="btn" id="v9NewTrip">+ Nova viagem</button>':''}</div><div class="table-wrap"><table class="table responsive-table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Setor</th><th>Projeto</th><th>Declarado</th><th>Comprovado</th><th>Status</th><th></th></tr></thead><tbody>${list.map(t=>{const ex=(db.tripExpenses||[]).filter(e=>String(e.tripId)===String(t.id)),decl=ex.reduce((s,e)=>s+(+e.declared||0),0),prov=ex.reduce((s,e)=>s+(+e.proven||0),0);return`<tr><td data-label="Destino"><b>${esc(t.city||'')}</b></td><td data-label="Período">${esc(t.period||((t.start&&t.end)?`${fmt(t.start)} a ${fmt(t.end)}`:'—'))}</td><td data-label="Equipe">${esc(t.employee||'—')}</td><td data-label="Setor">${esc(t.sector||'—')}</td><td data-label="Projeto">${esc(t.project||'—')}</td><td data-label="Declarado">${moneySafe(decl)}</td><td data-label="Comprovado">${moneySafe(prov)}</td><td data-label="Status">${badgeStatus(t.status||'Planejada')}</td><td><button class="btn small" data-v9-trip="${t.id}">Abrir</button></td></tr>`}).join('')||'<tr><td colspan="9"><div class="empty">Nenhuma viagem cadastrada ou atribuída.</div></td></tr>'}</tbody></table></div>`;
    if($('#v9NewTrip'))$('#v9NewTrip').onclick=()=>tripForm();$$('[data-v9-trip]').forEach(x=>x.onclick=()=>tripDetail(x.dataset.v9Trip));
  };

  function projectedSchedule(item,type){
    const n=Math.max(1,+item.installments||1),start=item.start||new Date().toISOString().slice(0,10),cad=item.cadence||item.recurrence||'Mensal',interval=cad==='Trimestral'?3:cad==='Personalizado'?Math.max(1,+item.interval||1):1,total=+item.total||(+item.value||0)*n,value=total/n;
    return Array.from({length:n},(_,i)=>{const d=new Date(start+'T12:00:00');d.setMonth(d.getMonth()+i*interval);return{month:d.toISOString().slice(0,7),date:d.toISOString().slice(0,10),value,type,item}});
  }
  function planningMonthDetail(m){
    const incomes=(db.planRevenues||[]).flatMap(x=>projectedSchedule(x,'Entrada')).filter(x=>x.month===m),outs=(db.planExpenses||[]).flatMap(x=>projectedSchedule(x,'Saída')).filter(x=>x.month===m);const realRows=typeof real==='function'?real().filter(r=>monthOf(r.date)===m):[];
    const inV=incomes.reduce((s,x)=>s+x.value,0),outV=outs.reduce((s,x)=>s+x.value,0),realIn=realRows.filter(r=>r.direction==='Entrada').reduce((s,r)=>s+(+r.value||0),0),realOut=realRows.filter(r=>r.direction==='Saída').reduce((s,r)=>s+(+r.value||0),0);
    const x=v2modal(`Planejamento • ${monthLabel(m)}`,`<div class="modal-body"><div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Entradas previstas</h3><b>${moneySafe(inV)}</b></div><div class="card metric mini"><h3>Saídas previstas</h3><b>${moneySafe(outV)}</b></div><div class="card metric mini"><h3>Entradas reais</h3><b>${moneySafe(realIn)}</b></div><div class="card metric mini"><h3>Saídas reais</h3><b>${moneySafe(realOut)}</b></div></div><h3 class="section-title">Entradas previstas</h3><div class="table-wrap"><table class="table"><thead><tr><th>Origem</th><th>Parcela</th><th>Valor</th></tr></thead><tbody>${incomes.map((r,i)=>`<tr><td>${esc(r.item.origin||r.item.name||'Receita')}</td><td>${i+1}</td><td>${moneySafe(r.value)}</td></tr>`).join('')||'<tr><td colspan="3">Sem entradas previstas.</td></tr>'}</tbody></table></div><h3 class="section-title">Saídas previstas</h3><div class="table-wrap"><table class="table"><thead><tr><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${outs.map(r=>`<tr><td>${esc(r.item.name||r.item.description||'Despesa')}</td><td>${esc(r.item.category||r.item.cadence||'')}</td><td>${moneySafe(r.value)}</td></tr>`).join('')||'<tr><td colspan="3">Sem saídas previstas.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);
  }

  const oldPlanning=planning;
  planning=function(){
    oldPlanning();
    setTimeout(()=>{
      const cards=[...document.querySelectorAll('#content .card, #content [data-month], #content .month-folder')];
      cards.forEach(card=>{
        if(card.dataset.v9PlanningBound)return;
        let m=card.dataset.month||card.dataset.planMonth||'';
        if(!m){const txt=card.textContent||'',months=[...(db.planRevenues||[]).flatMap(x=>projectedSchedule(x,'Entrada').map(y=>y.month)),...(db.planExpenses||[]).flatMap(x=>projectedSchedule(x,'Saída').map(y=>y.month))];m=months.find(mm=>txt.toLowerCase().includes(monthLabel(mm).split(' ')[0].toLowerCase()))||'';}
        if(m){card.dataset.v9PlanningBound='1';card.classList.add('clickable-month');card.addEventListener('click',e=>{if(e.target.closest('button,input,select,textarea'))return;planningMonthDetail(m)});}
      });
      const host=$('#content');if(host&&!host.querySelector('#v9PlanMonths')){
        const months=[...new Set([...(db.planRevenues||[]).flatMap(x=>projectedSchedule(x,'Entrada').map(y=>y.month)),...(db.planExpenses||[]).flatMap(x=>projectedSchedule(x,'Saída').map(y=>y.month))])].sort();
        if(months.length){const sec=document.createElement('section');sec.id='v9PlanMonths';sec.innerHTML=`<h3 class="section-title">Detalhamento mensal</h3><div class="month-detail-grid">${months.map(m=>`<button class="card month-detail-card" data-v9-plan-month="${m}"><b>${monthLabel(m)}</b><small>Clique para visualizar entradas e saídas</small></button>`).join('')}</div>`;host.appendChild(sec);$$('[data-v9-plan-month]').forEach(b=>b.onclick=()=>planningMonthDetail(b.dataset.v9PlanMonth));}
      }
    },0);
  };

  window.IntegralFinanceV9={budgetDetail,tripDetail,planningMonthDetail,cleanDemoDataOnce};
})();
