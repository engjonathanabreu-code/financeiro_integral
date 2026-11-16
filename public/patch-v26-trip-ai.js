/* Integral Financeiro V26 — IA para documentos de viagens e despesas detalhadas */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const same=(a,b)=>String(a)===String(b);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const M=v=>typeof money==='function'?money(Number(v||0)):Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const F=d=>{if(!d)return'—';try{return typeof fmt==='function'?fmt(d):new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')}catch{return d}};
const isAdm=()=>{try{return user?.role==='Administrador'}catch{return false}};
const userId=()=>user?.erpId||null;
const cloud=()=>window.IntegralFinanceCloudStorage;
const files=window.IntegralTripDocuments;
const tripId=t=>t?.id==null?'':String(t.id);
const tripsWithId=id=>(db.trips||[]).filter(t=>tripId(t)===String(id));
const repeatedTripId=id=>tripsWithId(id).length>1;
function tripSignature(trip){
  return JSON.stringify(trip,(key,value)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return value;
    return Object.fromEntries(Object.keys(value).sort().map(field=>[field,value[field]]));
  });
}
function tripById(id){
  if(id==null||String(id)==='')return;
  const matches=tripsWithId(id);
  if(matches.length<2)return matches[0];
  const signature=tripSignature(matches[0]);
  if(matches.every(t=>tripSignature(t)===signature))return matches[0];
}
function similarTripKey(trip){
  const fields=[trip.city,trip.project,trip.start,trip.end,trip.sector].map(value=>
    String(value??'').trim().replace(/\s+/g,' ').normalize('NFC').toLowerCase());
  const assigned=Array.isArray(trip.assigned)?[...new Set(trip.assigned.map(String))].sort():[];
  return fields.every(Boolean)?JSON.stringify([...fields,assigned]):'';
}
function visibleTripRows(){
  const byId=new Map(),rows=[];
  for(const trip of db.trips||[]){
    if(!trip||typeof trip!=='object')continue;
    const id=tripId(trip);
    if(!id){if(tripVisible(trip))rows.push({trip,id});continue}
    const signature=tripSignature(trip);
    if(!byId.has(id))byId.set(id,new Map());
    byId.get(id).set(signature,trip);
  }
  for(const [id,versions] of byId){
    for(const trip of versions.values()){
      if(tripVisible(trip))rows.push({trip,id,conflict:versions.size>1});
    }
  }
  const requestIds=new Map(),similarIds=new Map();
  function addId(groups,key,id){
    if(!key||!id)return;
    if(!groups.has(key))groups.set(key,new Set());
    groups.get(key).add(id);
  }
  for(const row of rows){
    row.request=String(row.trip.invoiceRequestId??'').trim();
    row.similar=similarTripKey(row.trip);
    addId(requestIds,row.request,row.id);
    addId(similarIds,row.similar,row.id);
  }
  for(const row of rows){
    if(!row.id)row.notice='Sem ID de viagem';
    else if(row.conflict)row.notice='ID de viagem em conflito';
    else if(requestIds.get(row.request)?.size>1)row.notice='Outra viagem vinculada à mesma solicitação';
    else if(similarIds.get(row.similar)?.size>1)row.notice='Viagem semelhante com outro ID';
  }
  return rows.sort((a,b)=>String(b.trip.start||'').localeCompare(String(a.trip.start||'')));
}
const expenses=id=>(db.tripExpenses||[]).filter(e=>same(e.tripId,id));
const documents=id=>(db.tripDocuments||[]).filter(d=>same(d.tripId,id));
function tripDeletionBlocked(trip){
  return Boolean(trip.invoiceRequestId) || (db.invoiceRequests||[]).some(request=>
    request.category==='trip' && request.status==='Aprovada' && same(request.convertedId,trip.id))
    || expenses(trip.id).length>0 || documents(trip.id).length>0;
}
// A rota pertence ao módulo, não ao HTML: atualizações de dados preservam o detalhe aberto.
let selectedTripId=null,tripFormOpening=false;
function persist(){if(typeof save==='function')save();}
function statusBadge(e){const s=e.status||'';if(/revisar|duplic/i.test(s))return `<span class="badge warn">${E(s)}</span>`;if(/confirm|ok/i.test(s))return `<span class="badge ok">${E(s)}</span>`;return `<span class="badge">${E(s||'Registrado')}</span>`}
function tripVisible(t){try{if(isAdm()||window.IntegralFinanceRequests?.ownsApprovedTrip(t))return true;const fa=window.IntegralFinanceSectorAccess;if(fa?.isFinance?.())return !!fa.directlyAssigned(t);const lu=(db.usersMvp||[]).find(u=>u.erpId===user?.erpId||String(u.email||'').toLowerCase()===String(user?.email||'').toLowerCase()||u.name===user?.name);return (Array.isArray(t.assigned)?t.assigned:[]).map(String).includes(String(lu?.id))||(!!t.sector&&String(t.sector).toLowerCase()===String(user?.sector||'').toLowerCase())}catch{return false}}
window.IntegralTripVisible=tripVisible;

async function tripForm(id){
  const actor=userId(),current=tripById(id);
  if(tripFormOpening||q('#trip26Form')||!actor||(id!=null&&(!current||!tripVisible(current)||repeatedTripId(id))))return;
  tripFormOpening=true;
  let draft;
  try{draft=await cloud()?.tripFormDraft?.(actor,id)}finally{tripFormOpening=false}
  if(userId()!==actor)return;
  const existing=draft?.p_esperado||current;
  const t=draft?{...existing,...draft.p_campos}:existing;
  const me=(db.usersMvp||[]).find(u=>u.erpId===actor);
  const sectors=(db.sectors||[]).filter(s=>s.active!==false).map(s=>s.name);
  const currentSector=t?.sector||user?.sector||me?.sector||'';
  if(currentSector&&!sectors.includes(currentSector))sectors.push(currentSector);
  const users=(db.usersMvp||[]).filter(u=>u.active!==false),selected=t?.assigned||[];
  const operation=draft?.p_operacao||crypto.randomUUID();
  const identifier=draft?.p_id||String(existing?.id??operation);
  let pending=draft;
  const assignments=isAdm()?`<div class="field full"><label>Usuários com acesso individual</label><div class="assignment-grid">${users.map(u=>`<label class="check-line"><input type="checkbox" name="assigned" value="${E(u.id)}" ${selected.map(String).includes(String(u.id))?'checked':''}>${E(u.name)}</label>`).join('')}</div></div>`:'';
  const options=['Planejada','Em andamento','Aguardando prestação','Aprovada','Divergência','Concluída'];
  const x=v2modal(id==null?'Nova viagem':'Editar viagem',`<form id="trip26Form"><div class="modal-body"><div class="form-grid"><div class="field"><label>Destino / cidade</label><input name="city" value="${E(t?.city||'')}" required></div><div class="field"><label>Projeto / atividade</label><input name="project" value="${E(t?.project||'')}"></div><div class="field"><label>Data inicial</label><input name="start" type="date" value="${E(t?.start||'')}" required></div><div class="field"><label>Data final</label><input name="end" type="date" value="${E(t?.end||'')}" required></div><div class="field full"><label>Equipe / viajantes</label><input name="employee" value="${E(t?.employee||user?.name||'')}" required></div><div class="field"><label>Setor</label><select name="sector" ${isAdm()?'':'disabled'}><option value="">Selecione</option>${sectors.map(s=>`<option ${s===currentSector?'selected':''}>${E(s)}</option>`).join('')}</select></div><div class="field"><label>Status</label><select name="status">${options.filter(s=>s!=='Aprovada'||isAdm()||t?.status==='Aprovada').map(s=>`<option ${s===(t?.status||'Planejada')?'selected':''}>${s}</option>`).join('')}</select></div><div class="field full"><label>Objetivo da viagem</label><textarea name="objective">${E(t?.objective||'')}</textarea></div><div class="field full"><label>Relatório / observações</label><textarea name="report">${E(t?.report||'')}</textarea></div>${assignments}</div><p id="trip26SaveStatus" role="status" aria-live="polite"></p></div><div class="modal-foot"><button class="btn" type="submit">Salvar</button></div></form>`);
  const form=q('#trip26Form',x),button=q('button[type="submit"]',form),status=q('#trip26SaveStatus',x);
  const lockFields=()=>qa('input,select,textarea',form).forEach(field=>{field.disabled=true});
  if(pending){
    lockFields();
    status.textContent='Há um envio pendente. Tente novamente para obter a confirmação.';
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    if(button.disabled||userId()!==actor)return;
    if(!pending){
      const f=new FormData(form),start=f.get('start'),end=f.get('end');
      if(end<start){status.textContent='A data final deve ser igual ou posterior à inicial.';return}
      const assigned=isAdm()?f.getAll('assigned').map(Number):[...(existing?.assigned||[])];
      if(!isAdm()&&me?.id!=null&&!assigned.map(String).includes(String(me.id)))assigned.push(me.id);
      pending={p_operacao:operation,p_id:identifier,p_esperado:existing||null,p_campos:{
        city:String(f.get('city')||'').trim(),project:String(f.get('project')||'').trim(),start,end,
        period:`${F(start)} a ${F(end)}`,month:String(start).slice(0,7),
        employee:String(f.get('employee')||'').trim(),sector:f.get('sector')||currentSector,
        status:f.get('status'),objective:String(f.get('objective')||'').trim(),
        report:String(f.get('report')||'').trim(),assigned}};
    }
    button.disabled=true;lockFields();
    status.textContent='Aguardando confirmação do servidor…';
    try{
      if(!await cloud()?.tripFormDraft(actor,id,pending)){
        status.textContent='Rascunho temporário. Mantenha esta aba aberta até a confirmação.';
      }
      const sb=window.IntegralERP?.sb;
      if(!sb)throw Error('Conexão indisponível.');
      const {data:auth}=await sb.auth.getSession();
      if(userId()!==actor||auth?.session?.user?.id!==actor)throw Error('A sessão mudou. Entre novamente para salvar.');
      const {data,error}=await sb.rpc('financeiro_salvar_viagem',pending);
      if(userId()!==actor)return;
      if(error)throw error;
      if(data?.status==='conflito'){
        button.textContent='Revisar versão atual';
        button.type='button';
        button.onclick=async()=>{
          // Preserva a tentativa conflitante separadamente antes de liberar edição.
          const preserved=await cloud()?.tripFormDraft(actor,'conflito-'+operation,pending);
          if(!preserved){status.textContent='Não foi possível guardar sua versão. Mantenha esta aba aberta.';return}
          await cloud().tripFormDraft(actor,id,null);
          x.remove();
          await cloud().refresh();
          await tripForm(id);
        };
        status.textContent='A viagem mudou antes do envio. Revise a versão atual antes de salvar.';
        return;
      }
      if(data?.status!=='salvo')throw Error('A resposta do servidor não confirmou a viagem.');
      await cloud().tripFormDraft(actor,id,null);
      x.remove();
      if(userId()!==actor)return;
      await cloud().refresh();
      renderTrips();
    }catch(error){
      if(userId()!==actor)return;
      status.textContent=`Envio sem confirmação. ${error.message||''} Tente novamente neste formulário.`;
      button.textContent='Tentar novamente';
    }finally{button.disabled=false}
  };
}

async function persistExpenseRecords(changes,actor){
  const storage=cloud();
  if(!storage||!await storage.initialize()||userId()!==actor)throw Error('A sessão ou a conexão mudou.');
  for(const {module,record,before} of changes){
    const current=(db[module]||[]).find(row=>same(row.id,record.id));
    if(current&&tripSignature(current)===tripSignature(record))continue;
    if(tripSignature(current)!==tripSignature(before))throw Error('A despesa ou o anexo mudou. Confira a versão atual.');
  }
  for(const {module,record} of changes){
    const rows=db[module]||=[];
    const at=rows.findIndex(row=>same(row.id,record.id));
    if(at<0)rows.push(record);
    else rows[at]=record;
  }
  await storage.syncNow();
  if(userId()!==actor||!changes.every(({module,record})=>storage.tripRecordConfirmed(module,record.id,record))){
    throw Error('Aguardando confirmação da despesa e de seus anexos. Tente novamente.');
  }
}
async function mountExpenseForm(x,selector,actor,key,tid,build){
  const form=q(selector,x),button=q('button[type="submit"]',form),status=q('[role="status"]',form);
  let draft=await cloud()?.tripUploadDraft(actor,key);
  if(userId()!==actor){x.remove();return}
  const lockFields=()=>qa('input,select,textarea',form).forEach(field=>{field.disabled=true});
  const saveDraft=async()=>{
    if(!await cloud()?.tripUploadDraft(actor,key,{...draft})){
      status.textContent='Rascunho temporário. Mantenha esta aba aberta até a confirmação.';
    }
  };
  if(draft){
    for(const [name,value] of Object.entries(draft.fields||{}))if(form.elements[name])form.elements[name].value=value;
    lockFields();
    status.textContent=draft.file?'Rascunho retomado com '+draft.file.name+'.':'Há uma despesa pendente de confirmação.';
    button.textContent='Retomar envio';
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    if(button.disabled||userId()!==actor)return;
    if(!draft){
      const fields=Object.fromEntries([...new FormData(form)].filter(([name])=>name!=='file'));
      const file=form.elements.file?.files[0]||null;
      if(form.elements.file?.required&&!file)return;
      draft={token:crypto.randomUUID(),expenseId:crypto.randomUUID(),documentId:crypto.randomUUID(),fields,file};
    }
    button.disabled=true;lockFields();
    status.textContent='Aguardando confirmação do servidor…';
    try{
      await saveDraft();
      if(userId()!==actor)return;
      if(!draft.records){
        if(draft.file&&!draft.stored){
          draft.stored=await files.store(draft.file);
          await saveDraft();
        }
        if(userId()!==actor)return;
        draft.records=await build(draft);
        await saveDraft();
      }
      await persistExpenseRecords(draft.records,actor);
      await cloud().tripUploadDraft(actor,key,null);
      x.remove();
      tripDetail(tid);
    }catch(error){
      if(userId()!==actor)return;
      status.textContent='Envio sem confirmação. '+(error.message||'Confira sua conexão.');
      button.textContent='Tentar novamente';
    }finally{button.disabled=false}
  };
}
function manualExpense(tid,eid){
  const t=tripById(tid),existing=expenses(tid).find(x=>same(x.id,eid)),actor=userId();
  if(q('#trip26Expense,#trip26AI')||!actor||!t||!tripVisible(t)||repeatedTripId(tid))return;
  const x=v2modal(existing?'Editar despesa':'Adicionar despesa da viagem',`<form id="trip26Expense"><div class="modal-body"><div class="form-grid"><div class="field"><label>Data</label><input name="date" type="date" value="${E(existing?.date||new Date().toISOString().slice(0,10))}" required></div><div class="field"><label>Tipo</label><select name="type">${['Hospedagem','Combustível','Alimentação','Pedágio','Passagem','Estacionamento','Transporte','Material','Outros'].map(v=>`<option ${v===(existing?.type||'Outros')?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Fornecedor / origem</label><input name="origin" value="${E(existing?.origin||'')}"></div><div class="field"><label>Valor</label><input name="value" type="number" min="0" step="0.01" value="${E(existing?.value??existing?.proven??existing?.declared??'')}" required></div><div class="field full"><label>Descrição</label><input name="description" value="${E(existing?.description||'')}"></div><div class="field full"><label>Documento / comprovante</label><input name="file" type="file" accept="image/*,.pdf"></div></div><p role="status" aria-live="polite"></p></div><div class="modal-foot"><button class="btn" type="submit">Salvar despesa</button></div></form>`);
  const before=existing&&JSON.parse(JSON.stringify(existing));
  const linked=existing?documents(t.id).filter(d=>same(d.expenseId,existing.id)).map(d=>JSON.parse(JSON.stringify(d))):[];
  void mountExpenseForm(x,'#trip26Expense',actor,'manual:'+tid+':'+(eid??'nova'),t.id,draft=>{
    const f=draft.fields,val=Number(f.value),stored=draft.stored;
    if(!Number.isFinite(val)||val<0)throw Error('Informe um valor válido.');
    const record={...before,id:before?.id??draft.expenseId,tripId:t.id,date:f.date,type:f.type,
      origin:f.origin.trim(),description:f.description.trim(),value:val,declared:val,proven:val,
      file:stored||before?.file||null,doc:draft.file?.name||before?.doc||'',
      status:before?.status||'Registrado',ai:before?.ai||false,confidence:before?.confidence??null,notes:before?.notes||''};
    return [{module:'tripExpenses',record,before},...(stored?linked.map(original=>({
      module:'tripDocuments',record:{...original,file:stored},before:original
    })):[])];
  });
}

function candidatesForTrip(tid){
  return expenses(tid).map(e=>({id:`trip-${e.id}`,date:e.date||'',description:[e.type,e.origin,e.description].filter(Boolean).join(' • '),value:Number(e.value??e.proven??e.declared??0),source:'Viagem'}));
}
function uploadWithAI(tid){
  const t=tripById(tid),actor=userId();
  if(q('#trip26Expense,#trip26AI')||!actor||!t||!tripVisible(t)||repeatedTripId(tid))return;
  const x=v2modal('Enviar documento • Agente IA',`<form id="trip26AI"><div class="modal-body"><div class="dropzone"><span class="badge ok">Agente IA</span><h3>Envie o documento da despesa</h3><p>NF, cupom, recibo ou comprovante. A IA identificará tipo, fornecedor, data, descrição e valor e registrará a despesa nesta viagem.</p><input id="trip26File" name="file" type="file" accept="image/*,.pdf" required></div><div class="notice" role="status" aria-live="polite">Aguardando documento.</div></div><div class="modal-foot"><button class="btn" id="trip26Analyze" type="submit">Analisar e registrar despesa</button></div></form>`);
  void mountExpenseForm(x,'#trip26AI',actor,'ia:'+tid,t.id,async draft=>{
    const stored=draft.stored;
    const ai=await files.analyze({file:stored},t,candidatesForTrip(t.id));
    if(userId()!==actor)throw Error('A sessão mudou durante a análise.');
    const val=Number(ai.value||0);
    if(!Number.isFinite(val)||val<0)throw Error('Confira o valor identificado no comprovante.');
    const expense={id:draft.expenseId,tripId:t.id,date:ai.date||new Date().toISOString().slice(0,10),
      type:ai.expense_type||ai.type||'Outros',origin:ai.origin||'',description:ai.description||'',
      value:val,declared:val,proven:val,file:stored,doc:stored.name,
      status:ai.duplicate?'Revisar duplicidade':(Number(ai.confidence||0)<75?'Revisar IA':'Confirmado pela IA'),
      ai:true,confidence:Number(ai.confidence||0),duplicate:ai.duplicate||null,notes:ai.notes||'',aiModel:ai.model||''};
    return [{module:'tripExpenses',record:expense},
      {module:'tripDocuments',record:{id:draft.documentId,tripId:t.id,file:stored,
        note:`Documento analisado pela IA • ${expense.type} • ${M(val)}`,
        addedAt:stored.addedAt,by:user?.name||'',expenseId:expense.id,ai:true}}];
  });
}

function linkedDocument(tid,eid){return documents(tid).find(d=>same(d.expenseId,eid))}
async function downloadExpense(tid,eid,button){
  const t=tripById(tid),e=expenses(tid).find(e=>same(e.id,eid));if(!t||!tripVisible(t)||!e)return;
  button.disabled=true;try{await files.download(e,linkedDocument(tid,eid))}catch(err){alert(err.message)}finally{button.disabled=false}
}
function reviewExpense(tid,eid){
  const t=tripById(tid),e=expenses(tid).find(e=>same(e.id,eid));if(!t||!tripVisible(t)||!e)return;
  const linked=linkedDocument(tid,eid),available=!!files.source(e,linked),snapshot=JSON.stringify(e);
  const x=v2modal('Revisar IA • Comprovante',`<div class="modal-body trip-review"><b class="trip-filename">${E(e.file?.name||e.doc||'Sem comprovante')}</b><div class="trip-review-actions">${available?'<button type="button" class="btn ghost" id="tripDownloadOriginal">Baixar original</button>':''}<button type="button" class="btn ghost" id="tripEditOriginal">${available?'Editar despesa':'Anexar comprovante'}</button></div>${!available?'<p class="notice warn">O arquivo original não foi preservado neste registro antigo. Anexe novamente o comprovante em Editar despesa.</p>':''}<div class="detail-list"><div><span>Fornecedor</span><b>${E(e.origin||'—')}</b></div><div><span>Data</span><b>${F(e.date)}</b></div><div><span>Valor registrado</span><b>${M(e.value??e.proven??e.declared)}</b></div></div><div id="tripReviewStatus" role="status" aria-live="polite"></div><div id="tripReviewResult"></div></div><div class="modal-foot">${available?'<button type="button" class="btn" id="tripAnalyzeAgain">Analisar novamente</button>':''}<button type="button" class="btn" id="tripApplyReview" hidden>Aplicar revisão</button></div>`);
  q('#tripEditOriginal',x).onclick=()=>{x.remove();manualExpense(tid,eid)};
  if(!available)return;
  q('#tripDownloadOriginal',x).onclick=ev=>downloadExpense(tid,eid,ev.currentTarget);
  const button=q('#tripAnalyzeAgain',x),apply=q('#tripApplyReview',x),status=q('#tripReviewStatus',x);let result=null;
  button.onclick=async()=>{
    button.disabled=true;apply.hidden=true;result=null;status.className='notice';status.textContent='Analisando comprovante...';q('#tripReviewResult',x).textContent='';
    try{
      const ai=await files.analyze(e,t,candidatesForTrip(tid).filter(c=>c.id!==`trip-${e.id}`),linked);
      if(!x.isConnected)return;
      result=ai;status.textContent=`Confiança: ${Math.round(Number(ai.confidence||0))}%${ai.duplicate?' • Possível duplicidade':''}`;
      status.className=ai.duplicate||Number(ai.confidence||0)<75?'notice warn':'notice';
      q('#tripReviewResult',x).innerHTML=`<h4>Dados sugeridos</h4><dl class="trip-suggestions"><dt>Tipo</dt><dd>${E(ai.expense_type||e.type)}</dd><dt>Fornecedor</dt><dd>${E(ai.origin||e.origin)}</dd><dt>Data</dt><dd>${F(ai.date||e.date)}</dd><dt>Valor</dt><dd>${M(ai.value)}</dd><dt>Descrição</dt><dd>${E(ai.description||e.description)}</dd></dl><p>${E(ai.notes||'')}</p>${ai.duplicate?`<p class="notice warn">${E(ai.duplicate.reason||'Confira se esta despesa já foi registrada.')}</p>`:''}`;
      apply.hidden=false;
    }catch(err){status.className='notice danger';status.textContent=err.message}finally{button.disabled=false}
  };
  apply.onclick=()=>{
    if(!result)return;
    const current=expenses(tid).find(x=>same(x.id,eid));
    if(!tripVisible(t)||!current||JSON.stringify(current)!==snapshot){status.className='notice warn';status.textContent='A despesa mudou durante a revisão. Feche e abra novamente para conferir os dados atuais.';apply.hidden=true;return}
    const value=Number(result.value);if(!Number.isFinite(value)||value<0)return;
    Object.assign(current,{type:result.expense_type||current.type,origin:result.origin||current.origin,description:result.description||current.description,date:/^\d{4}-\d{2}-\d{2}$/.test(result.date)?result.date:current.date,value,declared:value,proven:value,ai:true,confidence:Number(result.confidence||0),duplicate:result.duplicate||null,notes:result.notes||'',aiModel:result.model||'',aiReviewedAt:new Date().toISOString(),status:result.duplicate?'Revisar duplicidade':(Number(result.confidence||0)<75?'Revisar IA':'Confirmado pela IA')});
    persist();x.remove();tripDetail(tid);
  };
}
function deleteExpense(tid,eid){const e=(db.tripExpenses||[]).find(x=>same(x.id,eid));if(!e||!confirm('Excluir esta despesa da viagem?'))return;db.tripExpenses=(db.tripExpenses||[]).filter(x=>!same(x.id,eid));db.tripDocuments=(db.tripDocuments||[]).filter(d=>!same(d.expenseId,eid));persist();tripDetail(tid)}

function tripDetail(id){
  const t=tripById(id);if(!t||!tripVisible(t))return renderTrips();const es=expenses(t.id).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))),docs=documents(t.id).sort((a,b)=>String(b.addedAt||'').localeCompare(String(a.addedAt||'')));const total=es.reduce((s,e)=>s+Number(e.value??e.proven??e.declared??0),0),review=es.filter(e=>/revisar/i.test(e.status||'')).length;
  const readOnly=repeatedTripId(t.id),protectedTrip=tripDeletionBlocked(t);
  selectedTripId=t.id;window.IntegralSelectedTripId=t.id;
  if(typeof title==='function')title(`Viagem • ${t.city||''}`);q('#content').innerHTML=`<div class="toolbar" ${readOnly?'data-trip26-readonly':''}><button class="btn ghost" id="trip26Back">← Viagens</button><div class="right">${!readOnly?'<button class="btn ghost" id="trip26Edit">Editar viagem</button>':''}${isAdm()&&!readOnly&&!protectedTrip?'<button class="btn danger" id="trip26Delete">Excluir viagem</button>':''}${readOnly?'':'<button class="btn ghost" id="trip26Manual">+ Despesa manual</button><button class="btn" id="trip26Upload">Enviar documento com IA</button>'}</div></div>${readOnly?'<p class="notice">Há cópias com o mesmo ID. Esta viagem está disponível para consulta.</p>':''}${isAdm()&&protectedTrip?'<p class="notice">A exclusão desta viagem está indisponível porque há uma solicitação, despesa ou documento vinculado.</p>':''}<div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Total de despesas</h3><b>${M(total)}</b></div><div class="card metric mini"><h3>Documentos analisados</h3><b>${docs.filter(d=>d.ai).length}</b></div><div class="card metric mini"><h3>Itens para revisar</h3><b>${review}</b></div><div class="card metric mini"><h3>Status</h3><b class="metric-status">${E(t.status||'—')}</b></div></div><div class="grid cols-2 trip-info-grid"><div class="card"><h3>Informações da viagem</h3><div class="detail-list"><div><span>Destino</span><b>${E(t.city||'—')}</b></div><div><span>Período</span><b>${E(t.period||((t.start&&t.end)?`${F(t.start)} a ${F(t.end)}`:'—'))}</b></div><div><span>Equipe</span><b>${E(t.employee||'—')}</b></div><div><span>Setor</span><b>${E(t.sector||'—')}</b></div><div><span>Projeto</span><b>${E(t.project||'—')}</b></div></div></div><div class="card"><h3>Objetivo e relatório</h3><p><b>Objetivo:</b> ${E(t.objective||'Não informado.')}</p><p><b>Relatório:</b> ${E(t.report||'Não informado.')}</p></div></div><h3 class="section-title">Despesas da viagem</h3><div class="table-wrap trip-expenses"><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th>Fornecedor / origem</th><th>Descrição</th><th>Valor</th><th>Documento</th><th>IA</th><th>Status</th><th></th></tr></thead><tbody>${es.map(e=>`<tr><td>${F(e.date)}</td><td><b>${E(e.type||'Outros')}</b></td><td>${E(e.origin||'—')}</td><td>${E(e.description||'—')}</td><td><b>${M(e.value??e.proven??e.declared)}</b></td><td>${e.file?.name||e.doc?`<button class="trip-document-link" data-trip26-download="${E(e.id)}">${E(e.file?.name||e.doc)}</button>`:'—'}</td><td>${e.ai?`${Math.round(Number(e.confidence||0))}%`:'Manual'}</td><td>${statusBadge(e)}</td><td class="actions">${readOnly?'':`<button class="btn small ghost" data-trip26-review="${E(e.id)}">Revisar IA</button><button class="btn small ghost" data-trip26-edit-exp="${e.id}">Editar</button>${isAdm()?`<button class="btn small ghost" data-trip26-del-exp="${e.id}">Excluir</button>`:''}`}</td></tr>`).join('')||'<tr><td colspan="9"><div class="empty">Nenhuma despesa registrada.</div></td></tr>'}</tbody></table></div><h3 class="section-title">Documentos enviados</h3><div class="card">${docs.map(d=>`<div class="file-row"><div><button class="trip-document-link" data-trip26-download-doc="${E(d.id)}">${E(d.file?.name||'Arquivo')}</button><small>${E(d.note||'')}</small></div><span>${d.addedAt?new Date(d.addedAt).toLocaleString('pt-BR'):'—'}</span></div>`).join('')||'<div class="empty">Nenhum documento enviado.</div>'}</div>`;
  qa('[data-trip26-review]').forEach(b=>b.onclick=()=>reviewExpense(t.id,b.dataset.trip26Review));qa('[data-trip26-download]').forEach(b=>b.onclick=()=>downloadExpense(t.id,b.dataset.trip26Download,b));qa('[data-trip26-download-doc]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await files.download(docs.find(d=>same(d.id,b.dataset.trip26DownloadDoc)))}catch(err){alert(err.message)}finally{b.disabled=false}});q('#trip26Back').onclick=renderTrips;if(q('#trip26Edit'))q('#trip26Edit').onclick=()=>tripForm(t.id);if(q('#trip26Delete'))q('#trip26Delete').onclick=()=>{const current=tripById(t.id);if(!isAdm()||!current||repeatedTripId(current.id)||tripDeletionBlocked(current))return;if(!confirm(`Excluir a viagem para ${t.city||'destino não informado'}?`))return;db.trips=(db.trips||[]).filter(x=>!same(x.id,t.id));persist();renderTrips()};if(!readOnly){q('#trip26Manual').onclick=()=>manualExpense(t.id);q('#trip26Upload').onclick=()=>uploadWithAI(t.id)}qa('[data-trip26-edit-exp]').forEach(b=>b.onclick=()=>manualExpense(t.id,b.dataset.trip26EditExp));qa('[data-trip26-del-exp]').forEach(b=>b.onclick=()=>deleteExpense(t.id,b.dataset.trip26DelExp));
}

function renderTrips(){
  selectedTripId=null;
  window.IntegralSelectedTripId=null;
  if(typeof title==='function')title('Viagens');
  const visible=visibleTripRows(),active=[],history=[];
  for(const row of visible){
    const status=String(row.trip.status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    (['concluida','finalizada'].includes(status)?history:active).push(row);
  }
  const tableRows=items=>items.map(({trip:t,id,notice,conflict})=>{
    const es=id?expenses(id):[],total=es.reduce((sum,e)=>sum+Number(e.value??e.proven??e.declared??0),0);
    const identifier=notice?`<small class="muted"><br>${E(notice)}${id?` · ID ${E(id)}`:''}</small>`:'';
    const action=id&&!conflict?`<button class="btn small" data-trip26-open="${E(id)}">Abrir</button>`:'';
    return `<tr><td><b>${E(t.city||'')}</b>${identifier}</td><td>${E(t.period||((t.start&&t.end)?`${F(t.start)} a ${F(t.end)}`:'—'))}</td><td>${E(t.employee||'—')}</td><td>${E(t.sector||'—')}</td><td>${E(t.project||'—')}</td><td>${conflict?'—':es.length}</td><td><b>${conflict?'—':M(total)}</b></td><td>${typeof badgeStatus==='function'?badgeStatus(t.status||'Planejada'):E(t.status||'Planejada')}</td><td>${action}</td></tr>`;
  }).join('')||'<tr><td colspan="9"><div class="empty">Nenhuma viagem cadastrada ou atribuída.</div></td></tr>';
  const table=rows=>`<div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Setor</th><th>Projeto</th><th>Despesas</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${tableRows(rows)}</tbody></table></div>`;
  q('#content').innerHTML=`<div class="toolbar"><div><b>${active.length}</b> viagem(ns) visível(is)<div class="muted">Documentos enviados dentro da viagem podem ser analisados automaticamente pela IA e convertidos em despesas.</div></div><button class="btn" id="trip26New">+ Nova viagem</button></div>${table(active)}<section id="finCompletedTrips"><h3 class="section-title">Viagens concluídas</h3>${table(history)}</section>`;
  if(q('#trip26New'))q('#trip26New').onclick=()=>tripForm();qa('[data-trip26-open]').forEach(b=>b.onclick=()=>tripDetail(b.dataset.trip26Open));
}

function renderCurrentView(){
  const selected=selectedTripId;
  const result=selected===null?renderTrips():tripDetail(selected);
  window.IntegralFinanceRequests?.refresh().then(changed=>{
    if(!changed||view!=='trips'||selectedTripId!==selected)return;
    if(selected===null)renderTrips();else tripDetail(selected);
  });
  return result;
}
try{trips=renderCurrentView}catch{}window.trips=renderCurrentView;window.IntegralFinanceTripsAI={render:renderCurrentView,list:renderTrips,detail:tripDetail,upload:uploadWithAI};
window.IntegralFinanceTripCollaborators={open:tripForm};
})();
