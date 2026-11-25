/* Solicitações internas de compra e investimento. */
(function(){
'use strict';
const VIEW='invoices';
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const E=v=>typeof esc==='function'?esc(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const M=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const D=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'Não informada';
const uid=()=>crypto.randomUUID();
const admin=()=>user?.role==='Administrador';
const userKey=()=>String(user?.erpId??user?.id??user?.email??user?.name??'');
const sessionKey=()=>user?JSON.stringify([userKey(),user.role]):'';
const unauthorized=error=>error?.code==='42501'||error?.status===401||error?.code==='PGRST301';
const currentView=()=>{try{return view}catch{return window.view||''}};
const categoryLabel={trip:'Viagem',budget:'Orçamento / investimento',purchase:'Compra avulsa'};
const vehicleLabel={gol:'Gol',hb20:'HB20'};
const vehicleOptions=()=>'<option value="">Selecione o veículo</option>'+Object.entries(vehicleLabel).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
const statusClass=s=>s==='Aprovada'?'ok':['Rejeitada','Cancelada'].includes(s)?'danger':'warn';
const formatTime=value=>{
  const date=new Date(value||'');
  return Number.isNaN(+date)?'Não informada':date.toLocaleString('pt-BR');
};
const storageDrafts=new Map();
const tabsByActor=new Map();
const draftKey=(kind,id='new')=>'integral_fin_solicitacao:'+JSON.stringify([userKey(),kind,String(id)]);
function readDraft(key){
  if(storageDrafts.has(key))return storageDrafts.get(key);
  try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}
}
function writeDraft(key,value){
  if(value)storageDrafts.set(key,value);
  else storageDrafts.delete(key);
  try{
    if(value)sessionStorage.setItem(key,JSON.stringify(value));
    else sessionStorage.removeItem(key);
  }catch{}
}
const snapshot=()=>({search:'',status:'',type:'',category:'',sector:'',requester:'',assignee:'',priority:'',from:'',to:'',sort:'created',scope:'active',page:1});
function filters(){
  const actor=userKey();
  if(!tabsByActor.has(actor))tabsByActor.set(actor,snapshot());
  return tabsByActor.get(actor);
}
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const localDate=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value));
const datePart=value=>{
  if(/^\d{4}-\d{2}-\d{2}$/.test(value||''))return value;
  return value&&!Number.isNaN(+new Date(value))?localDate(value):'';
};
const reviewDrafts=new Map();
const reviewKey=(actor,id)=>'integral_fin_revisao_solicitacao:'+JSON.stringify([actor,String(id)]);
function readReview(key){
  if(reviewDrafts.has(key))return reviewDrafts.get(key);
  try{return JSON.parse(sessionStorage.getItem(key)||'null')}catch{return null}
}
function storeReview(key,draft){
  if(draft)reviewDrafts.set(key,draft);
  else reviewDrafts.delete(key);
  try{
    if(draft)sessionStorage.setItem(key,JSON.stringify(draft));
    else sessionStorage.removeItem(key);
  }catch{}
}
const richTags=new Set(['B','STRONG','I','EM','UL','OL','LI','P','DIV','BR','SPAN','FONT']);
const richUnsafe=new Set(['TEMPLATE','SVG','MATH','IFRAME','STYLE','SCRIPT','NOSCRIPT','OBJECT','EMBED','LINK','META']);
function safeRich(value){
  // Parsing stays in inert template content, including for legacy records.
  const template=document.createElement('template');
  template.innerHTML=String(value||'');
  for(const node of [...template.content.querySelectorAll('*')]){
    const tag=node.tagName.toUpperCase();
    if(richUnsafe.has(tag)){node.remove();continue}
    if(!richTags.has(tag)||node.namespaceURI!=='http://www.w3.org/1999/xhtml'){
      node.replaceWith(...node.childNodes);
      continue;
    }
    for(const attr of [...node.attributes]){
      if(attr.name==='style')continue;
      if(attr.name==='size'&&tag==='FONT'&&/^[2-5]$/.test(attr.value))continue;
      node.removeAttribute(attr.name);
    }
    if(!node.hasAttribute('style'))continue;
    const clean=[];
    if(['left','center','right','justify'].includes(node.style.textAlign))clean.push('text-align:'+node.style.textAlign);
    if(node.style.fontWeight==='bold'||Number(node.style.fontWeight)>=600)clean.push('font-weight:bold');
    if(node.style.fontStyle==='italic')clean.push('font-style:italic');
    if(clean.length)node.setAttribute('style',clean.join(';'));
    else node.removeAttribute('style');
  }
  return template.innerHTML;
}
function records(){db.invoiceRequests=db.invoiceRequests||[];return db.invoiceRequests}
function visible(){return records().filter(r=>admin()||String(r.requesterId)===userKey()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
function installNav(){
  for(const nav of [typeof adminNav==='undefined'?null:adminNav,typeof staffNav==='undefined'?null:staffNav]){
    if(!nav||nav.some(x=>x[0]===VIEW))continue;const at=nav.findIndex(x=>x[0]==='trips');nav.splice(at<0?nav.length:at+1,0,[VIEW,'Solicitações']);
  }
}
let dialogSequence=0;
function modal(titleText,html){
  const el=document.createElement('div'),previous=document.activeElement,id='invoice-dialog-'+(++dialogSequence);
  el.className='modal-backdrop';
  el.setAttribute?.('data-invoice-modal','true');
  el.innerHTML=`<section class="modal invoice-modal" role="dialog" aria-modal="true" aria-labelledby="${id}"><div class="modal-head"><h3 id="${id}">${E(titleText)}</h3><button class="btn ghost small" data-invoice-close type="button">Fechar</button></div>${html}</section>`;
  document.body.append(el);
  const close=q('[data-invoice-close]',el);
  function dismiss(restoreFocus=true){
    el.remove();
    if(restoreFocus&&previous?.isConnected)previous.focus();
  }
  el.dismiss=dismiss;
  close.onclick=()=>dismiss();
  el.onkeydown=event=>{
    if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();dismiss();return}
    if(event.key!=='Tab')return;
    const focusable=qa('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[href],[contenteditable="true"],[tabindex="0"]',el)
      .filter(node=>node.getClientRects().length>0);
    if(!focusable.length){event.preventDefault();return}
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  };
  close.focus?.();
  return el;
}
async function persistRequest(request,expected=null){
  const sb=window.IntegralERP?.sb;
  if(!sb)throw new Error('Conexão com Supabase indisponível.');
  const actor=userKey();
  const {data:auth,error:authError}=await sb.auth.getUser();
  const authenticated=auth?.user;
  if(authError||!authenticated||!user||userKey()!==actor||(user.erpId&&user.erpId!==authenticated.id)){
    throw Object.assign(Error('Entre novamente para enviar a solicitação.'),{code:'42501'});
  }
  if(!expected)request.requesterId=authenticated.id;
  const {data,error}=await sb.rpc('financeiro_save_invoice_request',{p_request:request,p_expected:expected});
  if(error)throw error;
  if(!user||userKey()!==actor)throw Error('A sessão mudou. Abra Solicitações para consultar o registro.');
  return applyRequestList(data,request.id);
}
function createModal(item=null, mode='new'){
  if(!user)return;
  if(!item?.request)item=null; // click events do botão de criação usam o mesmo handler
  const actor=userKey(),req=item?.request,id=req?.id,editing=['edit','resubmit','request_change'].includes(mode);
  const key=draftKey(mode,id),stored=readDraft(key),copied=mode==='duplicate',isProposal=mode==='request_change';
  const seed=stored?.fields??(editing?req:copied?{category:req.category,title:('Cópia de '+(req.title||'solicitação')).slice(0,120)}:{});
  const titles={new:'Nova solicitação',duplicate:'Duplicar como nova solicitação',edit:'Editar solicitação',resubmit:'Corrigir e reenviar',request_change:'Pedir alteração'};
  const submitText={new:'Enviar solicitação',duplicate:'Enviar nova solicitação',edit:'Salvar alterações',resubmit:'Reenviar para análise',request_change:'Enviar pedido de alteração'};
  const el=modal(titles[mode],`<form id="invoiceCreate" class="invoice-compose"><div class="modal-body"><div class="invoice-compose-note"><span>${isProposal?'O pedido será analisado separadamente. A aprovação atual e os registros vinculados continuam válidos até avaliação.':mode==='resubmit'?'Após o reenvio, a solicitação volta para análise.':copied?'Confira os dados para enviar uma nova solicitação.':mode==='edit'?'As alterações serão registradas no histórico.':'A solicitação será enviada ao administrador para análise.'}</span></div><div class="form-grid invoice-compose-grid"><div class="field"><label for="invoice-type">Tipo</label><select id="invoice-type" name="category" required><option value="trip">Viagem</option><option value="budget">Orçamento / investimento</option><option value="purchase">Compra avulsa</option></select></div><div class="field"><label for="invoice-date">Data necessária</label><input id="invoice-date" name="neededAt" type="date"></div><div class="field"><label for="invoice-estimate">Valor estimado</label><input id="invoice-estimate" name="estimatedValue" type="number" min="0" step="0.01" placeholder="R$ 0,00"></div><div class="field"><label for="invoice-project">Projeto / centro de custo</label><input id="invoice-project" name="project" placeholder="Opcional"></div><div class="field invoice-vehicle"><label for="invoice-vehicle">Veículo da viagem</label><select id="invoice-vehicle" name="vehicleId">${vehicleOptions()}</select><small>A retirada será liberada somente na data da viagem, após aprovação.</small></div><div class="field full invoice-destination"><label for="invoice-dest">Destino da viagem</label><input id="invoice-dest" name="destination" placeholder="Cidade / UF"></div><div class="field full invoice-subject"><label for="invoice-subject">Assunto</label><input id="invoice-subject" name="title" maxlength="120" required placeholder="Ex.: Compra de passagens para vistoria"></div><div class="field full invoice-message"><label>Mensagem</label><div class="invoice-editor"><div class="invoice-editor-toolbar" role="toolbar" aria-label="Formatação do texto"><select data-editor-size aria-label="Tamanho da fonte"><option value="3">Normal</option><option value="2">Pequena</option><option value="4">Grande</option><option value="5">Muito grande</option></select><button type="button" data-editor-command="bold" title="Negrito"><b>B</b></button><button type="button" data-editor-command="italic" title="Itálico"><i>I</i></button><button type="button" data-editor-command="insertUnorderedList" title="Tópicos">• Lista</button><button type="button" data-editor-command="insertOrderedList" title="Lista numerada">1. Lista</button><span class="invoice-toolbar-separator"></span><button type="button" data-editor-command="justifyLeft" title="Alinhar à esquerda">Esquerda</button><button type="button" data-editor-command="justifyCenter" title="Centralizar">Centro</button><button type="button" data-editor-command="justifyRight" title="Alinhar à direita">Direita</button><button type="button" data-editor-command="justifyFull" title="Justificar">Justificar</button></div><div id="invoiceDescriptionEditor" aria-label="Mensagem" class="invoice-editor-area" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Escreva aqui os detalhes da solicitação, objetivos, itens, quantidades e demais orientações..."></div></div></div></div>${isProposal?'<label class="field">Motivo do pedido<textarea name="reason" rows="3" maxlength="2000" required></textarea></label>':''}<p class="invoice-form-status" role="status"></p></div><div class="modal-foot invoice-compose-foot"><small>O rascunho fica nesta aba até a confirmação do servidor.</small><button class="btn" type="submit">${submitText[mode]}</button></div></form>`);
  const form=q('#invoiceCreate',el),category=form.elements.category,editor=q('#invoiceDescriptionEditor',form);
  const status=q('.invoice-form-status',form),submit=q('[type="submit"]',form);
  const editable=['title','estimatedValue','neededAt','project','destination','vehicleId','reason'];
  for(const field of editable)if(form.elements[field]&&seed[field]!=null){
    form.elements[field].value=seed[field];
  }
  category.value=categoryLabel[seed.category]?seed.category:'trip';
  category.disabled=editing;
  function setType(){
    const trip=category.value==='trip';
    q('label[for="invoice-estimate"]',form).textContent=trip?'Orçamento estimado da viagem':'Valor estimado';
    const note=q('.invoice-trip-scope',form);
    note.hidden=!trip;
    q('.invoice-destination',form).hidden=!trip;
    q('.invoice-vehicle',form).hidden=!trip;
    form.elements.vehicleId.required=trip;
    form.elements.vehicleId.disabled=!trip;
    form.elements.neededAt.required=trip;
  }
  const tripScope=document.createElement('p');
  tripScope.className='notice invoice-trip-scope';
  tripScope.textContent='Informe o veículo e o orçamento no mesmo pedido de viagem.';
  q('.invoice-compose-grid',form).before(tripScope);
  category.addEventListener('change',setType);
  setType();
  if(seed.descriptionHtml)editor.innerHTML=safeRich(seed.descriptionHtml);
  else editor.textContent=seed.description||'';
  editor.addEventListener('paste',event=>{
    event.preventDefault();
    const text=event.clipboardData?.getData('text/plain');
    if(text)document.execCommand('insertText',false,text);
    retainDraft();
  });
  editor.addEventListener('drop',event=>event.preventDefault());
  qa('[data-editor-command]',form).forEach(button=>button.onclick=()=>{
    editor.focus();
    document.execCommand(button.dataset.editorCommand,false,null);
    retainDraft();
  });
  q('[data-editor-size]',form).onchange=event=>{
    editor.focus();
    document.execCommand('fontSize',false,event.target.value);
    retainDraft();
  };
  function fields(){
    const payload={category:category.value,description:editor.innerText.trim(),descriptionHtml:safeRich(editor.innerHTML)};
    for(const field of editable)if(form.elements[field])payload[field]=form.elements[field].value;
    return payload;
  }
  let attempt=stored?.attempt??null;
  let stale=Boolean(!attempt&&stored?.base&&item&&(JSON.stringify(stored.base)!==JSON.stringify(req)||stored.revision!==item.revision));
  function retainDraft(){
    if(userKey()!==actor)return;
    writeDraft(key,{fields:fields(),attempt,base:req??null,revision:item?.revision});
  }
  function syncControls(){
    const uncertain=Boolean(attempt);
    editor.contentEditable=uncertain?'false':'true';
    qa('[data-editor-command],[data-editor-size]',form).forEach(node=>node.disabled=uncertain);
    for(const name of editable)if(form.elements[name])form.elements[name].disabled=uncertain||(name==='vehicleId'&&category.value!=='trip');
    category.disabled=editing||uncertain;
    submit.disabled=stale;
    submit.textContent=uncertain?'Confirmar envio anterior':submitText[mode];
  }
  if(attempt)status.textContent='O envio anterior aguarda confirmação. Use o mesmo botão para consultar a gravação.';
  if(stale){
    const useLatest=document.createElement('button');
    useLatest.className='btn ghost small';
    useLatest.type='button';
    useLatest.textContent='Conferi a versão atual e quero revisar o rascunho';
    status.textContent='A solicitação mudou em outra sessão. Compare o rascunho com a versão atual antes de salvar. ';
    const compare=document.createElement('details');
    const summary=document.createElement('summary');
    summary.textContent='Ver versão atual do servidor';
    const text=document.createElement('p');
    text.textContent=[req.title,req.description,req.estimatedValue!=null?M(req.estimatedValue):'',req.neededAt,req.project,req.destination,vehicleLabel[req.vehicleId]].filter(Boolean).join(' · ');
    compare.append(summary,text);
    status.append(compare,useLatest);
    useLatest.onclick=()=>{
      stale=false;
      attempt=null;
      status.textContent='Rascunho disponível para revisão.';
      retainDraft();
      syncControls();
    };
  }
  syncControls();
  form.addEventListener('input',retainDraft);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(stale||userKey()!==actor)return;
    const current=fields();
    if(!attempt&&(!current.title.trim()||!current.description)){
      editor.focus();
      status.textContent='Informe o assunto e descreva a solicitação.';
      return;
    }
    if(!attempt&&current.category==='trip'&&(!vehicleLabel[current.vehicleId]||!current.neededAt)){
      status.textContent='Selecione o veículo e a data da viagem.';
      return;
    }
    if(!attempt){
      const payload={
        title:current.title.trim(),description:current.description,descriptionHtml:current.descriptionHtml,
        estimatedValue:Number(current.estimatedValue||0),neededAt:current.neededAt||'',project:current.project.trim(),
        destination:current.category==='trip'?current.destination.trim():''
      };
      if(current.category==='trip')payload.vehicleId=current.vehicleId;
      if(editing){
        attempt={operation:uid(),data:isProposal?{reason:current.reason.trim(),changes:payload}:payload,item:{request:req,revision:item.revision}};
      }else{
        const now=new Date().toISOString();
        attempt={request:{...payload,id:uid(),category:current.category,status:'Pendente',requesterId:actor,
          requesterName:user?.name||user?.email||'Usuário',requesterSector:user?.sector||'',createdAt:now,updatedAt:now,
          response:'',history:[{at:now,action:'Solicitação enviada',by:user?.name||'Usuário'}]}};
      }
      retainDraft();
    }
    syncControls();
    submit.disabled=true;
    status.textContent='Aguardando confirmação do servidor…';
    try{
      const saved=editing?await sendAction(attempt.item??item,mode,attempt.data,attempt.operation):await persistRequest(attempt.request);
      writeDraft(key,null);
      el.dismiss(false);
      announce('Solicitação confirmada pelo servidor.');
      renderInvoices();
      if(editing)detailModal(saved.request,saved);
      else void loadCentral();
    }catch(error){
      const conflict=editing&&['40001','PT409'].includes(error?.code);
      const sameId=!editing&&attempt?.request&&error?.code==='P0001'&&/identificador/i.test(error.message||'');
      if(sameId&&centralEnabled()){
        const previous=await currentDetail(attempt.request.id).catch(()=>null);
        if(previous?.request.requesterId===actor){
          writeDraft(key,null);
          el.dismiss(false);
          announce('Solicitação anterior confirmada pelo servidor.');
          renderInvoices();
          detailModal(previous.request,previous);
          return;
        }
      }
      if(!sameId&&(conflict||definitive(error))){
        attempt=null;
        retainDraft();
      }
      if(conflict){
        stale=true;
        void loadCentral().catch(()=>{});
        status.textContent='A solicitação mudou. Feche esta janela e reabra o pedido para revisar o rascunho.';
      }else{
        status.textContent='Não foi possível confirmar: '+(error.message||'erro de conexão');
      }
      if(!editing)alert('Não foi possível enviar: '+error.message);
    }finally{syncControls()}
  };
  q('[name="title"]',form).focus();
}
function applyRequestList(data,id,confirms=()=>true){
  const matches=Array.isArray(data)?data.filter(item=>String(item?.id)===String(id)):[];
  if(matches.length!==1||!confirms(matches[0])){
    throw Error('O servidor ainda não confirmou esta solicitação.');
  }
  requestRevision++;
  db.invoiceRequests=data;
  return matches[0];
}
async function reviewDeadline(operation,milliseconds,message,onTimeout){
  let timer;
  const expired=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
      reject(Object.assign(Error(message),{code:'FIN_REVIEW_TIMEOUT'}));
      onTimeout?.();
    },milliseconds);
  });
  try{return await Promise.race([operation(),expired])}
  finally{clearTimeout(timer)}
}
async function reviewRequest(attempt,actor){
  const sb=window.IntegralERP?.sb;
  if(!sb)throw Error('Conexão com Supabase indisponível.');
  const {data:auth,error:authError}=await reviewDeadline(()=>sb.auth.getUser(),10000,
    'A validação da sessão não respondeu. Sua decisão foi preservada. Se continuar, reabra o sistema.');
  if(authError||!auth?.user?.id||user?.erpId!==actor||auth.user.id!==actor||!admin()){
    throw Error('A sessão mudou. Abra Solicitações para consultar a decisão.');
  }
  invalidateCentralRead();
  const controller=new AbortController();
  const {data,error}=await reviewDeadline(()=>{
    const request=sb.rpc('financeiro_revisar_solicitacao',attempt);
    return typeof request?.abortSignal==='function'?request.abortSignal(controller.signal):request;
  },20000,'Não recebemos a confirmação no tempo esperado. Sua decisão foi preservada.',()=>controller.abort());
  if(error)throw error;
  if(userKey()!==actor||!admin())throw Error('A sessão mudou. Abra Solicitações para consultar a decisão.');
  invalidateCentralRead();
  const {p_id:id,p_aprovar:approved,p_resposta:response}=attempt;
  return applyRequestList(data,id,item=>item.status===(approved?'Aprovada':'Rejeitada')
    &&item.response===response&&item.reviewedAt&&String(item.reviewedById)===actor
    &&(!approved||item.convertedId!=null));
}
function detailModal(req,item=detailFor(req)){
  if(!req)return;
  const {state,legacy}=item;
  const active=!state.deletedAt&&!state.archivedAt;
  const canComplete=active&&!reviewedElsewhere(item)&&['Pendente','Aprovada'].includes(state.status)&&req.category==='trip'&&!req.vehicleId&&['Pendente','Aprovada'].includes(req.status)&&(admin()||String(req.requesterId)===userKey());
  const actor=userKey(),key=reviewKey(actor,req.id);
  let draft=admin()?readReview(key):null;
  const canReview=active&&admin()&&(mayReview(item)||Boolean(draft?.attempt));
  const formatted=req.descriptionHtml?safeRich(req.descriptionHtml):E(req.description).replace(/\n/g,'<br>');const el=modal('Detalhes da solicitação',`<div class="modal-body"><div class="invoice-detail-head"><span class="badge ${statusClass(state.status)}">${E(state.status)}</span><small>Enviada em ${E(formatTime(req.createdAt))}</small></div><h2>${E(req.title)}</h2><div class="invoice-detail-grid"><div><span>Tipo</span><b>${E(categoryLabel[req.category]||req.category)}</b></div><div><span>Solicitante</span><b>${E(req.requesterName)}</b></div><div><span>Valor estimado</span><b>${M(req.estimatedValue)}</b></div><div><span>Data necessária</span><b>${D(req.neededAt)}</b></div>${req.category==='trip'?`<div><span>Veículo</span><b>${E(vehicleLabel[req.vehicleId]||'Ainda não escolhido')}</b></div>`:''}</div>${canComplete?`<div class="field"><label>Completar veículo desta solicitação</label><select id="invoiceLegacyVehicle">${vehicleOptions()}</select><button class="btn" type="button" id="invoiceSetVehicle">Salvar veículo</button><small>Preserva a data, os valores e a decisão existente. Depois de escolhido, o veículo só pode ser alterado pelo administrador antes da retirada.</small><p role="status" id="invoiceVehicleStatus"></p></div>`:''}<section class="invoice-description"><span>Descrição</span><div>${formatted}</div></section>${req.response?`<section class="invoice-response"><span>Resposta do administrador</span><p>${E(req.response).replace(/\n/g,'<br>')}</p></section>`:''}${extraDetail(item)}${canReview?`<div class="field invoice-review"><label for="invoiceResponse">Resposta ao solicitante</label><textarea id="invoiceResponse" rows="4" placeholder="Informe a decisão, orientações ou ajustes necessários."></textarea><p id="invoiceReviewStatus" role="status"></p></div>`:''}</div><div class="modal-foot">${canReview?'<button class="btn danger ghost" id="invoiceReject">Rejeitar</button><button class="btn" id="invoiceApprove">Aprovar e converter</button>':'<button class="btn secondary" data-invoice-close-bottom>Fechar</button>'}</div>`);
  q('[data-invoice-close-bottom]',el)?.addEventListener('click',()=>el.dismiss());
  q('[data-invoice-open-linked]',el)?.addEventListener('click',()=>openRelated(el,req));
  qa('[data-invoice-detail-action]',el).forEach(button=>{
    button.onclick=()=>runAction(item,button.dataset.invoiceDetailAction,el);
  });
  if(!legacy&&central.attachmentsEnabled&&!state.deletedAt){
    window.IntegralFinanceRequestAttachments?.mount(el,req,item.actions.includes('attach'),async()=>{
      const updated=await currentDetail(req.id);
      if(!updated||!el.isConnected)return;
      const node=q('[data-invoice-timeline]',el);
      if(node)node.outerHTML=timeline(updated);
    });
  }
  if(canComplete)q('#invoiceSetVehicle',el).onclick=async()=>{const vehicleId=q('#invoiceLegacyVehicle',el).value,button=q('#invoiceSetVehicle',el),status=q('#invoiceVehicleStatus',el);if(!vehicleLabel[vehicleId]){status.textContent='Selecione o veículo.';return}button.disabled=true;try{const draft={...structuredClone(req),vehicleId};const saved=await persistRequest(draft,structuredClone(req));el.dismiss(false);renderInvoices();const latest=await currentDetail(saved.id);detailModal(saved,latest??detailFor(saved))}catch(error){status.textContent=error.message}finally{button.disabled=false}};
  if(canReview){
    const input=q('#invoiceResponse',el),status=q('#invoiceReviewStatus',el);
    const approve=q('#invoiceApprove',el),reject=q('#invoiceReject',el);
    let busy=false,stale=false,related=null,reviewError='';
    function controls(){
      const attempt=draft?.attempt;
      input.value=draft?.response||'';
      input.readOnly=busy||stale||Boolean(attempt);
      approve.disabled=busy||stale||attempt?.p_aprovar===false;
      reject.disabled=busy||stale||attempt?.p_aprovar===true;
      approve.textContent=busy&&attempt?.p_aprovar?'Confirmando decisão…':attempt?.p_aprovar?'Confirmar decisão anterior':related?'Aprovar como viagem distinta':'Aprovar e converter';
      reject.textContent=busy&&attempt?.p_aprovar===false?'Confirmando decisão…':attempt?.p_aprovar===false?'Confirmar decisão anterior':'Rejeitar';
      status.textContent=busy?'Confirmando a decisão. Aguarde a resposta do servidor.':reviewError||(attempt?'A decisão anterior aguarda confirmação.':'');
      if(related&&!attempt){
        status.textContent='Já existe viagem aprovada para este solicitante, destino e data. Confira o pedido existente antes de criar outra viagem.';
        for(const request of related.pedidos){
          const link=document.createElement('button');
          link.type='button';
          link.className='btn ghost small';
          link.textContent='Ver pedido: '+(request.title||request.id);
          link.onclick=async()=>{
            link.disabled=true;
            try{
              const existing=await currentDetail(request.id);
              if(userKey()!==actor||!el.isConnected)return;
              if(!existing)throw Error('Não foi possível abrir o pedido relacionado.');
              el.dismiss(false);
              detailModal(existing.request,existing);
            }catch(error){
              if(el.isConnected)link.after(document.createTextNode(error.message));
            }finally{link.disabled=false;}
          };
          status.append(' ',link);
        }
      }
    }
    controls();
    input.oninput=()=>{
      if(busy||draft?.attempt||userKey()!==actor||!admin())return;
      draft={response:input.value};
      storeReview(key,draft);
    };
    const decide=async approved=>{
      if(busy||stale)return;
      if(userKey()!==actor||!admin())return alert('A sessão mudou. Abra Solicitações para consultar a decisão.');
      let attempt=draft?.attempt;
      if(attempt&&attempt.p_aprovar!==approved)return;
      if(!attempt){
        const response=input.value.trim();
        if(!response)return alert('Escreva uma resposta para o solicitante.');
        const approvalMessage=related?'Você conferiu os pedidos existentes e confirmou que esta é outra viagem?':
          `Aprovar e criar ${categoryLabel[req.category]||'o registro financeiro'}?`;
        if(approved&&!confirm(approvalMessage))return;
        attempt={p_id:String(req.id),p_esperado:structuredClone(req),p_aprovar:approved,p_resposta:response};
        if(approved&&related)attempt.p_viagens_conferidas=related.conferencia;
        draft={response,attempt};
        storeReview(key,draft);
      }
      busy=true;
      reviewError='';
      controls();
      try{
        await reviewRequest(attempt,actor);
        draft=null;
        storeReview(key,null);
        el.dismiss(false);
        announce('Decisão confirmada pelo servidor.');
        await loadCentral();
        renderInvoices();
        // A atualização do armazenamento usa a mescla de revisões e preserva edições de outros módulos.
        void window.IntegralFinanceCloudStorage?.refresh?.();
      }catch(error){
        if(error?.code==='PT409'&&attempt.p_aprovar&&req.category==='trip'){
          try{
            const details=JSON.parse(error.details);
            if(typeof details.conferencia==='string'&&Array.isArray(details.pedidos)&&details.pedidos.length){
              related=details;
              draft={response:attempt.p_resposta};
              storeReview(key,draft);
              return;
            }
          }catch{}
        }
        if(['40001','PT409','22023','42501','P0001'].includes(error?.code)){
          draft={response:attempt.p_resposta};
          storeReview(key,draft);
          stale=true;
          void refreshRequests();
          void loadCentral();
        }
        const next=stale?' Reabra a solicitação para conferir.':' Use o mesmo botão para confirmar a decisão.';
        reviewError=error.message+next;
        alert('Não foi possível confirmar a decisão: '+error.message+next);
      }finally{
        busy=false;
        controls();
      }
    };
    approve.onclick=()=>decide(true);
    reject.onclick=()=>decide(false);
  }
}
let loadingRequests=null,requestRevision=0;
async function refreshRequests(){
  const sb=window.IntegralERP?.sb;
  if(!user||!sb)return false;
  const actor=sessionKey(),revision=requestRevision;
  if(loadingRequests?.actor===actor)return loadingRequests.promise;
  const flight={actor,promise:null};
  flight.promise=(async()=>{
    const {data,error}=await sb.rpc('financeiro_listar_solicitacoes');
    if(sessionKey()!==actor||requestRevision!==revision)return false;
    if(unauthorized(error)){
      requestRevision++;
      db.invoiceRequests=[];
      central=workflowBundle();
      centralLoaded=false;
      previousList='';
      qa('[data-invoice-modal]').forEach(el=>el.dismiss(false));
      if(currentView()===VIEW)renderInvoices();
      return false;
    }
    if(error||!Array.isArray(data))return false;
    const changed=JSON.stringify(db.invoiceRequests)!==JSON.stringify(data);
    db.invoiceRequests=data;
    if(changed&&currentView()===VIEW)renderInvoices();
    return changed;
  })().catch(()=>false).finally(()=>{if(loadingRequests===flight)loadingRequests=null});
  loadingRequests=flight;
  return flight.promise;
}
function ownsApprovedTrip(trip){
  const actor=user?.erpId;
  return Boolean(actor&&trip?.invoiceRequestId&&records().some(request=>
    request.requesterId===actor&&request.category==='trip'&&request.status==='Aprovada'&&request.reviewedAt
    &&String(request.id)===String(trip.invoiceRequestId)&&String(request.convertedId)===String(trip.id)));
}
window.IntegralFinanceRequests={refresh:refreshRequests,ownsApprovedTrip};
const centralEnabled=()=>document.documentElement?.dataset?.invoiceCentral==='true';
const workflowBundle=()=>({items:[],categories:[],assignees:[],notifications:[],attachmentsEnabled:false});
let central=workflowBundle(),centralActor='',centralLoaded=false,centralError='',centralPending=null,centralEpoch=0;
let pageMessage='',openMenu=null,requestedLink='',deferRender=false,previousList='';
const pageSize=15;
const priorityLabels={Baixa:'Baixa',Normal:'Normal',Alta:'Alta',Urgente:'Urgente'};
const actionLabels={
  open:'Visualizar',edit:'Editar',resubmit:'Corrigir e reenviar',duplicate:'Duplicar como nova solicitação',
  comment:'Comentar',internal_comment:'Comentário interno',return:'Devolver para ajustes',
  review:'Aprovar ou rejeitar',organize:'Categorizar e atribuir',archive:'Arquivar',unarchive:'Desarquivar',
  cancel:'Cancelar solicitação',delete:'Apagar',restore:'Recuperar',request_change:'Pedir alteração',
  request_cancel:'Solicitar cancelamento',decide_review:'Analisar pedido de revisão',start_review:'Iniciar análise',release_review:'Liberar análise'
};
const eventLabels={
  edit:'Solicitação editada',resubmit:'Reenviada para análise',return:'Devolvida para ajustes',
  cancel:'Solicitação cancelada',delete:'Removida da lista',restore:'Solicitação recuperada',
  organize:'Organização atualizada',archive:'Arquivada',unarchive:'Desarquivada',comment:'Comentário',
  internal_comment:'Comentário interno',request_change:'Pedido de alteração enviado',
  request_cancel:'Pedido de cancelamento enviado',decide_review:'Pedido de revisão analisado',
  create:'Solicitação enviada',submit:'Solicitação enviada',attach:'Anexo enviado',approve:'Solicitação aprovada',approve_distinct_trip:'Viagem distinta conferida',reject:'Solicitação rejeitada',
  created:'Solicitação enviada',approved:'Solicitação aprovada',rejected:'Solicitação rejeitada',
  start_review:'Análise iniciada',release_review:'Análise liberada'
};
const labels={
  title:'Assunto',description:'Mensagem',descriptionHtml:'Formatação da mensagem',estimatedValue:'Valor estimado',
  neededAt:'Data necessária',project:'Projeto / centro de custo',destination:'Destino',vehicleId:'Veículo',
  categoryId:'Categoria',assigneeId:'Responsável',deadline:'Prazo de análise',priority:'Prioridade',
  status:'Status',archivedAt:'Arquivamento',deletedAt:'Remoção'
};
const definitive=error=>['40001','PT409','22023','42501','P0001','23505','23514'].includes(error?.code);
function announce(message){
  pageMessage=message;
  const node=q('#invoiceStatus');
  if(node)node.textContent=message;
}
function resetCentralActor(){
  const actor=sessionKey();
  if(centralActor===actor)return;
  if(centralActor&&centralEnabled()){
    requestRevision++;
    db.invoiceRequests=[];
  }
  centralActor=actor;
  central=workflowBundle();
  centralLoaded=false;
  centralError='';
  centralPending=null;
  centralEpoch++;
  previousList='';
  requestedLink='';
  pageMessage='';
  closeActionMenu(false);
  qa('[data-invoice-modal]').forEach(el=>el.dismiss(false));
}
function dataBundle(data){
  const bundle=data?.items;
  if(!Array.isArray(bundle))throw Error('O servidor não confirmou a lista de solicitações.');
  return {
    items:bundle,categories:data.categories??[],assignees:data.assignees??[],
    notifications:data.notifications??[],attachmentsEnabled:data.attachmentsEnabled===true
  };
}
function canonicalUpdate(item){
  const found=records().findIndex(req=>String(req.id)===String(item.request.id));
  if(found>=0&&JSON.stringify(db.invoiceRequests[found])!==JSON.stringify(item.request)){
    requestRevision++;
    db.invoiceRequests[found]=item.request;
  }
}
function mergeDetail(raw,id){
  const incoming=dataBundle(raw);
  const item=incoming.items.find(entry=>String(entry.request?.id)===String(id));
  if(!item)throw Error('O servidor não confirmou o estado desta solicitação.');
  const same=entry=>String(entry.request.id)===String(id);
  const previous=central.items.find(same);
  if(previous&&previous.revision>item.revision)return previous;
  central={...incoming,items:[...central.items.filter(entry=>!same(entry)),item]};
  canonicalUpdate(item);
  return item;
}
function detailFor(req){
  return (centralActor===sessionKey()?central.items.find(item=>String(item.request.id)===String(req.id)):null)
    ??{request:req,revision:0,state:{status:req.status},actions:[],events:[],legacy:true};
}
async function loadCentral(){
  if(!centralEnabled()||!user)return;
  resetCentralActor();
  if(centralPending)return centralPending;
  const actor=sessionKey(),version=centralEpoch;
  const sb=window.IntegralERP?.sb;
  if(!sb)return;
  centralPending=(async()=>{
    try{
      const {data,error}=await sb.rpc('financeiro_central_solicitacoes',{p_id:null});
      if(error)throw error;
      if(sessionKey()!==actor||version!==centralEpoch)return;
      const key=JSON.stringify(data);
      const changed=key!==previousList||Boolean(centralError)||!centralLoaded;
      previousList=key;
      if(changed)central=dataBundle(data);
      centralLoaded=true;
      centralError='';
      if(currentView()===VIEW){
        if(changed)renderInvoices();
        void consumeDeepLink();
      }
    }catch(error){
      if(sessionKey()!==actor||version!==centralEpoch)return;
      if(unauthorized(error)){
        requestRevision++;
        db.invoiceRequests=[];
        central=workflowBundle();
        centralLoaded=false;
        previousList='';
        qa('[data-invoice-modal]').forEach(el=>el.dismiss(false));
      }
      centralError=error.message||'Conexão indisponível.';
      if(currentView()===VIEW)renderInvoices();
    }finally{
      if(sessionKey()===actor&&version===centralEpoch)centralPending=null;
    }
  })();
  return centralPending;
}
function invalidateCentralRead(){
  centralEpoch++;
  centralPending=null;
  previousList='';
}
async function sendAction(item,action,data,operation){
  const sb=window.IntegralERP?.sb,actor=userKey(),session=sessionKey();
  if(!sb)throw Error('Conexão com Supabase indisponível.');
  const {data:auth,error:authError}=await sb.auth.getUser();
  if(authError||auth?.user?.id!==actor||sessionKey()!==session)throw Object.assign(Error('Entre novamente para usar esta ação.'),{code:'42501'});
  invalidateCentralRead();
  const {data:result,error}=await sb.rpc('financeiro_acao_solicitacao',{
    p_id:String(item.request.id),p_revisao:item.revision,p_acao:action,p_dados:data,
    p_operacao:operation,p_esperado:structuredClone(item.request)
  });
  if(error)throw error;
  if(sessionKey()!==session)throw Error('A sessão mudou. Consulte a solicitação na sua conta.');
  invalidateCentralRead();
  let saved=null;
  if(action==='delete'&&!admin()&&Array.isArray(result?.items)&&!result.items.length){
    central.items=central.items.filter(entry=>String(entry.request.id)!==String(item.request.id));
  }else saved=mergeDetail(result,item.request.id);
  announce('Alteração confirmada pelo servidor.');
  return saved;
}
async function currentDetail(id){
  const sb=window.IntegralERP?.sb,actor=sessionKey();
  if(!centralEnabled()||!sb)return null;
  const {data,error}=await sb.rpc('financeiro_central_solicitacoes',{p_id:String(id)});
  if(error||sessionKey()!==actor)return null;
  try{return mergeDetail(data,id)}catch{return null}
}
function renderButton(label,value,current){
  return `<option value="${E(value)}"${String(value)===String(current)?' selected':''}>${E(label)}</option>`;
}
function selectedValue(source,id){return source.find(row=>String(row.id)===String(id))?.name??''}
function optionsFrom(values){
  return [...new Map(values.filter(([,id])=>id!=null&&id!=='').map(([label,id])=>[String(id),label])).entries()]
    .map(([id,label])=>[label,id]).sort(([a],[b])=>String(a).localeCompare(String(b),'pt-BR'));
}
function filterControl(label,key,values,selected){
  return `<label>${label}<select name="${key}">${renderButton('Todos','',selected)}${values.map(([name,id])=>renderButton(name,id,selected)).join('')}</select></label>`;
}
function projectRecords(){
  if(centralEnabled())return central.items;
  return visible().map(detailFor);
}
function foundRows(items,f){
  const term=normalized(f.search);
  return items.filter(({request:r,state:s})=>{
    const created=datePart(r.createdAt);
    return (!f.status||s.status===f.status)&&(!f.type||r.category===f.type)&&(!f.category||String(s.categoryId)===f.category)
      &&(!f.sector||r.requesterSector===f.sector)&&(!f.requester||String(r.requesterId)===f.requester)
      &&(!f.assignee||(f.assignee==='unassigned'?!s.assigneeId:String(s.assigneeId)===f.assignee))
      &&(!f.priority||String(s.priority||'Normal')===f.priority)&&(!f.from||created>=f.from)&&(!f.to||created<=f.to)
      &&(!term||[r.id,r.title,r.description,r.project,r.destination,r.requesterName].some(value=>normalized(value).includes(term)));
  });
}
function sortItems(items,sort){
  const order={Urgente:4,Alta:3,Normal:2,Baixa:1};
  return items.sort((a,b)=>{
    const newest=String(b.request.createdAt||'').localeCompare(String(a.request.createdAt||''));
    if(sort==='updated')return String(b.state.updatedAt||b.request.updatedAt||'').localeCompare(String(a.state.updatedAt||a.request.updatedAt||''))||newest;
    if(sort==='deadline')return String(a.state.deadline||'9999-12-31').localeCompare(String(b.state.deadline||'9999-12-31'))||newest;
    if(sort==='priority')return (order[b.state.priority||'Normal']??0)-(order[a.state.priority||'Normal']??0)||newest;
    return newest;
  });
}
function scopeIncludes(state,scope){
  if(scope==='deleted')return Boolean(state.deletedAt);
  if(state.deletedAt)return false;
  return scope==='archive'?Boolean(state.archivedAt):!state.archivedAt;
}
function late(item,today){
  return !item.state.archivedAt&&!item.state.deletedAt&&Boolean(item.state.deadline)&&item.state.deadline<today
    &&(['Pendente','Devolvida'].includes(item.state.status)||item.state.review?.status==='pending');
}
function scopeButtons(f){
  const scopes=[['active','Ativas'],['archive','Arquivadas'],...(admin()?[['deleted','Removidas']]:[])];
  return `<div class="invoice-scopes" role="group" aria-label="Visualização das solicitações">${scopes.map(([value,label])=>`
    <button class="btn small ghost" type="button" data-invoice-scope="${value}" aria-pressed="${f.scope===value}">${label}</button>`).join('')}</div>`;
}
function card(item,today){
  const {request:r,state:s}=item;
  const category=selectedValue(central.categories,s.categoryId),assignee=selectedValue(central.assignees,s.assigneeId)||s.assigneeName;
  return `<article class="invoice-row" data-invoice-row="${E(r.id)}">
    <button type="button" class="card invoice-card" data-invoice-id="${E(r.id)}">
      <span class="invoice-category">${E(categoryLabel[r.category]||r.category)}</span>
      <span class="badge ${statusClass(s.status)}">${E(s.status)}</span>
      <strong>${E(r.title)}</strong><p>${E(r.description)}</p>
      <div><span>${E(r.requesterName)}</span><span>${M(r.estimatedValue)}</span><span>Enviada em ${D(datePart(r.createdAt))}</span></div>
      <div class="invoice-card-meta">${category?`<span>${E(category)}</span>`:''}${assignee?`<span>Responsável ${E(assignee)}</span>`:''}${s.priority&&s.priority!=='Normal'?`<span>Prioridade ${E(priorityLabels[s.priority]||s.priority)}</span>`:''}${late(item,today)?'<span class="badge danger">Atrasada</span>':''}</div>
      ${s.review?.status==='pending'?'<small class="invoice-has-response">Pedido de revisão aguardando análise</small>':r.response?'<small class="invoice-has-response">Resposta disponível</small>':''}
    </button>
    <button type="button" class="btn ghost small invoice-menu-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Ações da solicitação ${E(r.title)}" data-invoice-menu-trigger="${E(r.id)}">⋯</button>
  </article>`;
}
function reviewedElsewhere(item){
  const {reviewingBy,reviewingUntil}=item.state;
  return Boolean(reviewingBy&&String(reviewingBy)!==userKey()&&new Date(reviewingUntil)>new Date());
}
function mayReview(item){
  if(item.legacy)return item.state.status==='Pendente';
  return item.actions.includes('approve')||item.actions.includes('reject');
}
function actionCodes(item){
  const allowed=Array.isArray(item.actions)?item.actions:[];
  const review=admin()&&mayReview(item);
  return ['open',...(item.legacy?['duplicate']:[]),...(review?['review']:[]),...allowed.filter(a=>Object.hasOwn(actionLabels,a))];
}
function closeActionMenu(restoreFocus=true){
  if(!openMenu)return;
  const {menu,trigger,returnTo}=openMenu;
  openMenu=null;
  menu.remove();
  trigger.setAttribute('aria-expanded','false');
  if(restoreFocus&&returnTo?.isConnected)returnTo.focus({preventScroll:true});
  if(deferRender){deferRender=false;queueMicrotask(renderInvoices)}
}
function showActionMenu(item,trigger,position,returnTo=trigger){
  closeActionMenu(false);
  const menu=document.createElement('div');
  menu.className='invoice-action-menu';
  menu.setAttribute('role','menu');
  menu.setAttribute('aria-label','Ações da solicitação');
  menu.innerHTML=actionCodes(item).map(action=>`<button role="menuitem" type="button" data-invoice-action="${action}">${actionLabels[action]}</button>`).join('');
  document.body.append(menu);
  trigger.setAttribute('aria-expanded','true');
  openMenu={menu,trigger,returnTo,position};
  placeMenu();
  const items=qa('[role="menuitem"]',menu);
  items.forEach(node=>node.onclick=()=>{
    closeActionMenu(false);
    if(returnTo?.isConnected)returnTo.focus({preventScroll:true});
    runAction(item,node.dataset.invoiceAction);
  });
  menu.onkeydown=event=>{
    const here=items.indexOf(document.activeElement);
    const offset=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;
    if(event.key==='Escape'||event.key==='Tab'){
      event.preventDefault();
      closeActionMenu();
    }else if(offset||event.key==='Home'||event.key==='End'){
      event.preventDefault();
      const next=offset?(here+offset+items.length)%items.length:event.key==='Home'?0:items.length-1;
      items[next]?.focus({preventScroll:true});
    }
  };
  items[0]?.focus({preventScroll:true});
}
function placeMenu(){
  if(!openMenu)return;
  const {menu,trigger,position}=openMenu;
  const anchor=trigger.getBoundingClientRect(),size=menu.getBoundingClientRect();
  const left=Math.min(Math.max(8,position?.x??anchor.right-size.width),Math.max(8,window.innerWidth-size.width-8));
  const top=Math.min(Math.max(8,position?.y??anchor.bottom+5),Math.max(8,window.innerHeight-size.height-8));
  menu.style.left=left+'px';
  menu.style.top=top+'px';
}
function drawResults(items,f){
  const region=q('#invoiceResults');
  if(!region)return;
  closeActionMenu(false);
  const today=localDate(Date.now()),filtered=foundRows(items,f);
  const scope=sortItems(filtered.filter(item=>scopeIncludes(item.state,f.scope)),f.sort);
  const totalPages=Math.max(1,Math.ceil(scope.length/pageSize));
  f.page=Math.min(totalPages,Math.max(1,f.page));
  const counts=[
    ['Pendentes',filtered.filter(x=>scopeIncludes(x.state,'active')&&x.state.status==='Pendente').length],
    ['Devolvidas',filtered.filter(x=>scopeIncludes(x.state,'active')&&x.state.status==='Devolvida').length],
    ['Aprovadas',filtered.filter(x=>!x.state.deletedAt&&x.state.status==='Aprovada').length],
    ['Rejeitadas',filtered.filter(x=>!x.state.deletedAt&&x.state.status==='Rejeitada').length],
    ['Arquivadas',filtered.filter(x=>scopeIncludes(x.state,'archive')).length],
    ['Atrasadas',filtered.filter(x=>late(x,today)).length]
  ];
  const pageItems=scope.slice((f.page-1)*pageSize,f.page*pageSize);
  const period=f.from||f.to?`Período de envio: ${f.from?D(f.from):'início'} a ${f.to?D(f.to):'hoje'}`:'Período de envio: todos os dias';
  const empty=centralEnabled()&&!centralLoaded&&!items.length&&centralPending?'Carregando solicitações…':'Nenhuma solicitação encontrada.';
  region.innerHTML=`<p class="muted invoice-count-context">${E(period)} · Indicadores calculados com os filtros atuais</p>
    <div class="invoice-metrics">${counts.map(([label,n])=>`<div class="card metric"><h3>${label}</h3><b>${n}</b></div>`).join('')}</div>
    <div class="invoice-summary" role="status">${scope.length} solicitação(ões) nesta lista</div>
    <div class="invoice-list">${pageItems.map(item=>card(item,today)).join('')||`<div class="card empty invoice-empty"><b>${empty}</b></div>`}</div>
    ${totalPages>1?`<nav class="invoice-pagination" aria-label="Páginas das solicitações"><button type="button" class="btn ghost small" data-invoice-page="prev"${f.page===1?' disabled':''}>Anterior</button><span>Página ${f.page} de ${totalPages}</span><button type="button" class="btn ghost small" data-invoice-page="next"${f.page===totalPages?' disabled':''}>Próxima</button></nav>`:''}`;
  for(const [index,row] of qa('[data-invoice-row]',region).entries()){
    const item=pageItems[index],summary=q('[data-invoice-id]',row),trigger=q('[data-invoice-menu-trigger]',row);
    summary.onclick=()=>void openItem(item);
    trigger.onclick=()=>{if(openMenu?.trigger===trigger)closeActionMenu();else showActionMenu(item,trigger)};
    row.oncontextmenu=event=>{
      event.preventDefault();
      showActionMenu(item,trigger,event.clientX||event.clientY?{x:event.clientX,y:event.clientY}:null,summary);
    };
    row.onkeydown=event=>{
      if(event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey)){
        event.preventDefault();
        showActionMenu(item,trigger,null,event.target);
      }
    };
  }
  for(const button of qa('[data-invoice-page]',region))button.onclick=()=>{
    f.page+=button.dataset.invoicePage==='next'?1:-1;
    drawResults(items,f);
    const target=q(`[data-invoice-page="${button.dataset.invoicePage}"]:not(:disabled)`,region)??q('[data-invoice-id]',region);
    target?.focus();
  };
}

function displayValue(value,field){
  if(value==null||value==='')return '—';
  if(field==='categoryId')return selectedValue(central.categories,value)||'Categoria';
  if(field==='assigneeId')return selectedValue(central.assignees,value)||'Responsável';
  if(field==='estimatedValue')return M(value);
  if(field==='vehicleId')return vehicleLabel[value]||String(value);
  if(field==='descriptionHtml')return 'Formatação atualizada';
  return typeof value==='object'?JSON.stringify(value):String(value);
}
function displayChanges(changes){
  if(!changes||typeof changes!=='object')return '';
  const list=Object.entries(changes).filter(([name])=>name in labels&&name!=='descriptionHtml');
  if(!list.length)return '';
  return `<dl class="invoice-event-changes">${list.map(([name,value])=>{
    const pair=Boolean(value&&typeof value==='object'&&['from','to','old','new','before','after'].some(key=>key in value));
    const from=pair?value.from??value.old??value.before:null,to=pair?value.to??value.new??value.after:value;
    return `<div><dt>${E(labels[name])}</dt><dd>${pair?`${E(displayValue(from,name))} → `:''}${E(displayValue(to,name))}</dd></div>`;
  }).join('')}</dl>`;
}
function timeline(item){
  const legacy=Array.isArray(item.request.history)?item.request.history:[];
  const sidecar=Array.isArray(item.events)?item.events:[];
  const equivalents={submit:/^solicitacao enviada$/,approve:/^solicitacao aprovada(?: e convertida)?$/,reject:/^solicitacao rejeitada$/};
  const historic=legacy.filter(event=>!sidecar.some(other=>{
    const sameEvent=equivalents[other.action]?.test(normalized(event.action));
    const closeTime=Math.abs(+new Date(event.at)-+new Date(other.at))<10000;
    return sameEvent&&closeTime;
  }));
  const events=[...historic,...sidecar].sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  return `<section class="invoice-timeline" data-invoice-timeline aria-label="Linha do tempo">
    <h3>Linha do tempo</h3>${events.length?`<ol>${events.map(event=>`<li>
      <div><strong>${E(eventLabels[event.action]||event.action||'Evento registrado')}</strong>${event.internal?'<span class="badge warn">Somente ADM</span>':''}</div>
      <small>${E(event.by?.name||event.by||'Sistema')} · ${E(formatTime(event.at))}</small>
      ${event.reason||event.message?`<p>${E(event.reason||event.message)}</p>`:''}
      ${displayChanges(event.changes)}
    </li>`).join('')}</ol>`:'<p class="muted">Nenhum evento registrado.</p>'}
  </section>`;
}
function explanation(item){
  const {request:req,state}=item;
  if(state.deletedAt)return 'Esta solicitação foi removida da lista ativa e pode ser recuperada por um administrador.';
  if(state.archivedAt)return 'Esta solicitação está arquivada. O status e os vínculos foram preservados.';
  if(state.review?.status==='pending')return 'Aguardando análise do pedido de revisão. A decisão anterior continua visível.';
  if(state.status==='Devolvida')return state.returnReason?'Ajuste solicitado: '+state.returnReason:'Aguardando ajustes e reenvio pelo solicitante.';
  if(reviewedElsewhere(item))return 'A solicitação está sendo analisada. As ações de edição e cancelamento serão disponibilizadas após a análise ser liberada.';
  if(state.status==='Pendente')return state.reviewingBy&&new Date(state.reviewingUntil)>new Date()
    ?'Análise reservada até '+formatTime(state.reviewingUntil)+'.':'Aguardando análise administrativa.';
  if(req.convertedId!=null||state.hasEffect)return 'A aprovação e os registros relacionados foram preservados. Use um pedido de revisão para solicitar alterações.';
  if(state.status==='Cancelada')return 'Cancelamento registrado no histórico.';
  return '';
}
function reviewPanel(item){
  const review=item.state.review;
  if(!review)return '';
  const title=review.kind==='cancel'?'Pedido de cancelamento':'Pedido de alteração';
  const status={pending:'Aguardando análise',approved:'Pedido aprovado',rejected:'Pedido rejeitado'};
  return `<section class="invoice-workflow-panel">
    <h3>${title}</h3>
    <p><span class="badge ${review.status==='approved'?'ok':review.status==='rejected'?'danger':'warn'}">${E(status[review.status]||review.status)}</span> ${E(formatTime(review.requestedAt))}</p>
    ${review.reason?`<p>${E(review.reason)}</p>`:''}${displayChanges(review.changes)}
    ${review.decisionReason?`<p><b>Resposta da análise</b> ${E(review.decisionReason)}</p>`:''}
    <p class="muted">A decisão da solicitação original e seus vínculos ficam no histórico. Qualquer ajuste em registros relacionados segue o fluxo administrativo do módulo.</p>
  </section>`;
}
function linkedAccess(req){
  const trip=(db.trips||[]).find(row=>String(row.id)===String(req.convertedId)&&String(row.invoiceRequestId)===String(req.id));
  const budget=(db.budgetRecords||[]).find(row=>String(row.id)===String(req.convertedId)&&String(row.invoiceRequestId)===String(req.id));
  if(req.category==='trip'&&trip&&(admin()||ownsApprovedTrip(trip))&&window.IntegralFinanceTripsAI?.detail){
    return {view:'trips',open:()=>window.IntegralFinanceTripsAI.detail(trip.id)};
  }
  if(req.category==='budget'&&budget&&(admin()||window.IntegralFinanceScope?.canAccessBudget(budget))&&window.IntegralFinanceV9?.budgetDetail){
    return {view:'budgets',open:()=>window.IntegralFinanceV9.budgetDetail(budget.id)};
  }
  if(req.category==='purchase'&&req.convertedId!=null&&
    (admin()||window.IntegralFinanceSectorAccess?.canOperateAccounts?.())&&typeof v2PaymentModal==='function'){
    const payments=(db.accountPayments||[]).filter(row=>row.id!=null&&
      String(row.accountId)===String(req.convertedId)&&String(row.invoiceRequestId)===String(req.id)&&
      (req.convertedPaymentId==null||String(row.id)===String(req.convertedPaymentId)));
    if(payments.length===1){
      const [payment]=payments;
      return {open:()=>v2PaymentModal(payment.id,payment.accountId)};
    }
  }
  return null;
}
function related(req,hasEffect=false){
  if(req.convertedId==null&&req.convertedPaymentId==null&&!hasEffect)return '';
  const type=categoryLabel[req.category]||'Registro';
  return `<section class="invoice-workflow-panel"><h3>Registros vinculados</h3>
    <p>${E(type)}${req.convertedId!=null?' · ID '+E(req.convertedId):''}${req.convertedPaymentId!=null?' · Parcela '+E(req.convertedPaymentId):''}</p>
    ${linkedAccess(req)?'<button type="button" class="btn ghost small" data-invoice-open-linked>Abrir registro vinculado</button>':'<p class="muted">O registro vinculado está indisponível nesta sessão.</p>'}
  </section>`;
}
function openRelated(el,req){
  const access=linkedAccess(req);
  if(!access)return;
  el.dismiss(false);
  if(access.view)q('.nav [data-view="'+access.view+'"]')?.click();
  access.open();
}
function extraDetail(item){
  if(item.legacy)return related(item.request);
  const {request:req,state:s}=item;
  const description=explanation(item);
  const category=selectedValue(central.categories,s.categoryId)||s.categoryName;
  const assignee=selectedValue(central.assignees,s.assigneeId)||s.assigneeName;
  const actions=actionCodes(item).filter(action=>!['open','review'].includes(action));
  return `<section class="invoice-workflow-panel">
    <div class="invoice-detail-grid">
      <div><span>Última atualização</span><b>${E(formatTime(s.updatedAt||req.updatedAt))}</b></div>
      <div><span>Responsável pela análise</span><b>${E(assignee||'Não atribuído')}</b></div>
      <div><span>Categoria</span><b>${E(category||'Sem categoria')}</b></div>
      <div><span>Prazo de análise</span><b>${E(D(s.deadline))}</b></div>
      <div><span>Prioridade</span><b>${E(s.priority||'Normal')}</b></div>
    </div>
    ${description?`<p>${E(description)}</p>`:''}
    ${actions.length?`<div class="invoice-detail-actions">${actions.map(action=>`<button type="button" class="btn ghost small" data-invoice-detail-action="${action}">${actionLabels[action]}</button>`).join('')}</div>`:''}
  </section>${related(req,s.hasEffect)}${reviewPanel(item)}${timeline(item)}`;
}
function requireValue(payload,key,message){
  if(!payload[key])throw Error(message);
  return payload;
}
const actionDescriptions={
  return:'O solicitante verá o motivo e poderá reenviar após os ajustes.',
  comment:'O comentário ficará visível para o solicitante e os administradores autorizados.',
  internal_comment:'Somente administradores autorizados poderão ler este comentário.',
  cancel:'O cancelamento fica no histórico com a autoria, a data e o motivo.',
  delete:'A solicitação sairá da lista. Um administrador poderá recuperá-la com seus vínculos, anexos e histórico.',
  restore:'A solicitação e seus dados voltarão à lista autorizada.',
  archive:'A solicitação sairá da lista ativa e manterá sua decisão, histórico e vínculos.',
  start_review:'A solicitação ficará reservada para sua análise por até 15 minutos.',
  release_review:'A solicitação ficará disponível para análise e edição, conforme as permissões do perfil.',
  unarchive:'A solicitação voltará à lista ativa com a mesma decisão e vínculos.',
  request_cancel:'A análise do pedido será registrada separadamente. Os registros financeiros e a decisão anterior serão preservados.',
  decide_review:'Registre a decisão sobre este pedido. As informações aprovadas e os registros relacionados continuam em vigor até que sejam tratados no fluxo adequado.'
};
function actionFields(item,action,seed){
  if(action==='organize'){
    return `<div class="form-grid invoice-organize">
      <label class="field">Categoria<select name="categoryId">${renderButton('Sem categoria','',seed.categoryId)}${central.categories.map(row=>renderButton(row.name,row.id,seed.categoryId)).join('')}</select></label>
      <label class="field">Responsável pela análise<select name="assigneeId">${renderButton('Sem responsável','',seed.assigneeId)}${central.assignees.map(row=>renderButton(row.name,row.id,seed.assigneeId)).join('')}</select></label>
      <label class="field">Prioridade<select name="priority">${['Baixa','Normal','Alta','Urgente'].map(name=>renderButton(name,name,seed.priority)).join('')}</select></label>
      <label class="field">Prazo de análise<input name="deadline" type="date" value="${E(seed.deadline)}"></label>
    </div>`;
  }
  if(action==='comment'||action==='internal_comment'){
    return `<label class="field">${action==='comment'?'Comentário':'Comentário interno'}<textarea name="message" maxlength="4000" rows="4" required>${E(seed.message)}</textarea></label>`;
  }
  if(['return','cancel','delete','request_cancel','decide_review'].includes(action)){
    const decision=action==='decide_review'?`<label class="field">Decisão<select name="approve" required>
      ${renderButton('Selecione','',seed.approve)}${renderButton('Aprovar pedido','yes',seed.approve)}${renderButton('Rejeitar pedido','no',seed.approve)}</select></label>`:'';
    return decision+`<label class="field">Motivo<textarea name="reason" maxlength="2000" rows="4"${action==='cancel'?'':' required'}>${E(seed.reason)}</textarea></label>`;
  }
  return '';
}
function runAction(item,action,origin=null){
  if(action==='open'||action==='review'){void openItem(item);return}
  if(['duplicate','edit','resubmit','request_change'].includes(action)){
    origin?.dismiss(false);
    createModal(item,action);
    return;
  }
  origin?.dismiss(false);
  const {request:req,state}=item,actor=userKey(),key=draftKey(action,req.id);
  const stored=readDraft(key);
  const seed=stored?.fields??{categoryId:state.categoryId,assigneeId:state.assigneeId,priority:state.priority||'Normal',deadline:state.deadline};
  const el=modal(actionLabels[action],`<form data-invoice-operation="${E(action)}">
    <div class="modal-body"><p class="invoice-action-title"><b>${E(req.title)}</b></p>
      ${actionDescriptions[action]?`<p class="muted">${E(actionDescriptions[action])}</p>`:''}
      ${actionFields(item,action,seed)}
      <p class="invoice-form-status" role="status"></p>
    </div><div class="modal-foot"><button class="btn ghost" type="button" data-invoice-action-back>Voltar</button><button class="btn ${['delete','cancel'].includes(action)?'danger':''}" type="submit">Confirmar</button></div>
  </form>`);
  const form=q('form',el),submit=q('[type="submit"]',form),status=q('[role="status"]',form);
  let attempt=stored?.attempt??null,stale=Boolean(stored?.base&&stored.base.revision!==item.revision&&!attempt);
  function fields(){
    return Object.fromEntries(qa('input[name],textarea[name],select[name]',form).map(input=>[input.name,input.value.trim()]));
  }
  function retain(){
    if(userKey()===actor)writeDraft(key,{fields:fields(),base:{revision:item.revision},attempt});
  }
  function controls(){
    form.querySelectorAll('input,textarea,select').forEach(input=>{
      if(input.tagName==='SELECT')input.disabled=Boolean(attempt);
      else input.readOnly=Boolean(attempt);
    });
    submit.disabled=stale;
    submit.textContent=attempt?'Confirmar envio anterior':'Confirmar';
  }
  if(attempt)status.textContent='O envio anterior aguarda confirmação.';
  if(stale){
    const button=document.createElement('button');
    button.type='button';
    button.className='btn ghost small';
    button.textContent='Conferi a versão atual';
    status.textContent='A solicitação mudou em outra sessão. Confira seu conteúdo antes de tentar novamente. ';
    status.append(button);
    button.onclick=()=>{stale=false;retain();controls();status.textContent='Rascunho disponível para revisão.'};
  }
  controls();
  q('[data-invoice-action-back]',form).onclick=()=>{el.dismiss(false);void openItem(item)};
  form.addEventListener('input',retain);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(stale||userKey()!==actor)return;
    try{
      if(!attempt){
        let payload=fields();
        if(action==='organize')payload={
          categoryId:payload.categoryId||null,assigneeId:payload.assigneeId||null,
          priority:payload.priority,deadline:payload.deadline||null
        };
        if(action==='decide_review')payload={
          approve:requireValue(payload,'approve','Selecione a decisão.').approve==='yes',
          reason:requireValue(payload,'reason','Informe o motivo.').reason
        };
        if(['comment','internal_comment'].includes(action))requireValue(payload,'message','Escreva o comentário.');
        if(['return','delete','request_cancel'].includes(action))requireValue(payload,'reason','Informe o motivo.');
        attempt={operation:uid(),data:payload,item:{request:req,revision:item.revision}};
        retain();
      }
      controls();
      submit.disabled=true;
      status.textContent='Aguardando confirmação do servidor…';
      const saved=await sendAction(attempt.item??item,action,attempt.data,attempt.operation);
      writeDraft(key,null);
      el.dismiss(false);
      if(action==='archive')filters().scope='archive';
      if(action==='unarchive'||action==='restore')filters().scope='active';
      if(action==='delete'&&admin())filters().scope='deleted';
      renderInvoices();
      if(saved&&(action!=='delete'||admin()))detailModal(saved.request,saved);
      void loadCentral();
    }catch(error){
      if(definitive(error)){
        attempt=null;
        retain();
      }
      if(['40001','PT409'].includes(error?.code)){
        stale=true;
        void loadCentral();
        status.textContent='A solicitação mudou. Reabra o pedido para conferir. Seu rascunho foi preservado.';
      }else status.textContent=error?.message||'Falha ao confirmar a ação.';
    }finally{controls()}
  };
  q('textarea,select,[type="submit"]',form)?.focus();
}
async function openItem(item){
  if(item.legacy){
    detailModal(item.request,item);
    return;
  }
  const actor=userKey();
  const loading=modal('Detalhes da solicitação','<div class="modal-body"><p role="status">Consultando a versão mais recente…</p></div>');
  const latest=await currentDetail(item.request.id).catch(()=>null);
  if(!loading.isConnected||userKey()!==actor)return;
  if(!latest){
    q('[role="status"]',loading).textContent='Não foi possível abrir a solicitação. Confira a sessão e tente novamente.';
    return;
  }
  loading.dismiss();
  detailModal(latest.request,latest);
}
async function consumeDeepLink(){
  if(!centralEnabled()||!centralLoaded||currentView()!==VIEW)return;
  const params=new URLSearchParams(location.hash.slice(1));
  const target=params.get('solicitacao');
  if(!target||target===requestedLink)return;
  requestedLink=target;
  const detail=central.items.find(item=>String(item.request.id)===target);
  if(detail&&currentView()===VIEW)await openItem(detail);
  else announce('Esta solicitação não está disponível para a sessão atual.');
}
function openNotification(notification){
  const sb=window.IntegralERP?.sb,actor=userKey();
  const data=central.items.find(item=>String(item.request.id)===String(notification.requestId));
  if(!data){announce('Esta solicitação não está disponível para a sessão atual.');return}
  requestedLink=String(notification.requestId);
  history.replaceState(history.state,'','#'+new URLSearchParams({solicitacao:requestedLink}));
  void openItem(data);
  if(!notification.readAt)void(async()=>{
    const {error}=await sb.rpc('financeiro_ler_notificacao_solicitacao',{p_id:notification.id});
    if(error||userKey()!==actor)return;
    notification.readAt=new Date().toISOString();
    drawNotifications();
  })().catch(()=>{});
}
function drawNotifications(){
  const node=q('#invoiceUpdates');
  if(!node)return;
  const notifications=central.notifications||[],unread=notifications.filter(item=>!item.readAt).length;
  node.hidden=!notifications.length;
  if(!notifications.length){node.textContent='';return}
  const items=new Map(central.items.map(item=>[String(item.request.id),item]));
  const isOpen=q('details',node)?.open??false;
  node.innerHTML=`<details ${isOpen?'open':''}>
    <summary>Atualizações ${unread?`<b class="badge warn">${unread} não lida(s)</b>`:''}</summary>
    <ol>${notifications.map((entry,index)=>`<li>
      <button type="button" class="btn ghost small" data-invoice-notice="${index}">${E(eventLabels[entry.action]||entry.action||'Alteração registrada')} · ${E(items.get(String(entry.requestId))?.request.title||'Solicitação')}</button>
      <small>${E(formatTime(entry.at))}</small>
    </li>`).join('')}</ol>
  </details>`;
  for(const button of qa('[data-invoice-notice]',node))button.onclick=()=>openNotification(notifications[Number(button.dataset.invoiceNotice)]);
}
function categoriesModal(){
  const actor=userKey();
  const el=modal('Categorias de solicitações',`<form><div class="modal-body">
    <ul class="invoice-categories">${central.categories.map(row=>`<li>${E(row.name)}</li>`).join('')||'<li>Nenhuma categoria cadastrada.</li>'}</ul>
    <label class="field">Nova categoria<input name="category" maxlength="80" required></label>
    <p role="status" class="invoice-form-status"></p></div><div class="modal-foot"><button type="submit" class="btn">Criar categoria</button></div></form>`);
  const form=q('form',el),button=q('[type="submit"]',form),status=q('[role="status"]',form);
  form.onsubmit=async event=>{
    event.preventDefault();
    if(userKey()!==actor||!admin())return;
    button.disabled=true;
    try{
      const {data,error}=await window.IntegralERP.sb.rpc('financeiro_categoria_solicitacao',{p_nome:form.elements.category.value.trim()});
      if(error)throw error;
      if(userKey()!==actor||!data?.id)throw Error('O servidor ainda não confirmou a categoria.');
      if(!central.categories.some(row=>String(row.id)===String(data.id)))central.categories=[...central.categories,data];
      el.dismiss();
      announce('Categoria confirmada pelo servidor.');
      renderInvoices();
    }catch(error){status.textContent=error.message||'Categoria não confirmada.'}
    finally{button.disabled=false}
  };
  q('input',form).focus();
}

function renderInvoices(){
  if(!user||currentView()!==VIEW)return;
  resetCentralActor();
  if(openMenu){deferRender=true;return}
  const content=q('#content');
  if(!content)return;
  title('Solicitações');
  const items=projectRecords();
  const f=filters();
  const prev=document.activeElement,prevName=prev?.closest('#invoiceFilters')?prev.name:'';
  const selection=prevName==='search'?[prev.selectionStart,prev.selectionEnd]:null;
  if(!admin()&&f.scope==='deleted')f.scope='active';
  const types=optionsFrom(Object.entries(categoryLabel).map(([id,label])=>[label,id]));
  const statuses=optionsFrom([...new Set(items.map(({state})=>state.status))].map(status=>[status,status]));
  const categories=central.categories.map(row=>[row.name,row.id]);
  const existingCategoryIds=new Set(categories.map(([,id])=>String(id)));
  for(const {state:s} of items)if(s.categoryId&&!existingCategoryIds.has(String(s.categoryId))){
    categories.push([s.categoryName||'Categoria',s.categoryId]);
    existingCategoryIds.add(String(s.categoryId));
  }
  const sectors=optionsFrom(items.map(({request:r})=>[r.requesterSector,r.requesterSector]));
  const owners=optionsFrom(items.map(({request:r})=>[r.requesterName,r.requesterId]));
  const assignees=optionsFrom([...central.assignees.map(row=>[row.name,row.id]),...items.map(({state:s})=>[s.assigneeName,s.assigneeId]).filter(([name])=>name)]);
  const priorities=Object.entries(priorityLabels).map(([id,label])=>[label,id]);
  const sorts=[['Envio mais recente','created'],['Última atualização','updated'],['Prazo mais próximo','deadline'],['Maior prioridade','priority']];
  const detailsOpen=q('#invoiceAdvanced',content)?.open??false;
  const updatesOpen=q('#invoiceUpdates details',content)?.open??false;
  content.innerHTML=`<div class="invoice-hero"><div><p>${admin()?'Organize pedidos, atribua responsáveis e acompanhe as decisões.':'Envie pedidos e acompanhe cada etapa da análise.'}</p></div>
    <div class="invoice-hero-actions">${admin()&&centralLoaded?'<button type="button" class="btn ghost" id="invoiceCategories">Categorias</button>':''}<button type="button" class="btn" id="invoiceNew">+ Nova solicitação</button></div></div>
    <p id="invoiceStatus" class="invoice-status" role="status">${E(pageMessage)}</p>
    ${centralError?`<div class="notice warn invoice-load-error">Não foi possível atualizar as solicitações. ${E(centralError)} <button type="button" class="btn ghost small" id="invoiceRetry">Tentar novamente</button></div>`:''}
    <section id="invoiceUpdates" class="invoice-updates" hidden>${updatesOpen?'<details open></details>':''}</section>
    ${scopeButtons(f)}
    <form id="invoiceFilters" class="card invoice-filters" aria-label="Filtros das solicitações">
      <div class="invoice-filter-main">
        <label class="invoice-search">Pesquisar solicitações<input type="search" name="search" maxlength="300" value="${E(f.search)}" placeholder="Assunto, identificação ou texto"></label>
        ${filterControl('Status','status',statuses,f.status)}
        <label>Ordenar por<select name="sort">${sorts.map(([label,value])=>renderButton(label,value,f.sort)).join('')}</select></label>
        <button class="btn ghost small" type="button" id="invoiceClear">Limpar filtros</button>
      </div>
      <details id="invoiceAdvanced" ${detailsOpen?'open':''}><summary>Mais filtros</summary>
        <div class="invoice-filter-more">
          ${filterControl('Tipo','type',types,f.type)}
          ${filterControl('Categoria','category',categories,f.category)}
          ${admin()?filterControl('Setor','sector',sectors,f.sector)+filterControl('Solicitante','requester',owners,f.requester)+
            filterControl('Responsável','assignee',[['Sem responsável','unassigned'],...assignees],f.assignee)+filterControl('Prioridade','priority',priorities,f.priority):''}
          <label>Enviada de<input type="date" name="from" value="${E(f.from)}"></label>
          <label>Enviada até<input type="date" name="to" value="${E(f.to)}"></label>
        </div>
      </details>
    </form><section id="invoiceResults" aria-label="Resultado das solicitações"></section>`;
  q('#invoiceNew',content).onclick=()=>createModal();
  q('#invoiceCategories',content)?.addEventListener('click',categoriesModal);
  q('#invoiceRetry',content)?.addEventListener('click',()=>{
    q('#invoiceRetry',content).disabled=true;
    void refreshRequests();
    void loadCentral();
  });
  q('#invoiceClear',content).onclick=()=>{
    Object.assign(f,snapshot(),{scope:f.scope});
    renderInvoices();
    q('#invoiceClear',content)?.focus();
  };
  for(const button of qa('[data-invoice-scope]',content))button.onclick=()=>{
    f.scope=button.dataset.invoiceScope;
    f.page=1;
    for(const tab of qa('[data-invoice-scope]',content))tab.setAttribute('aria-pressed',String(tab===button));
    drawResults(items,f);
  };
  const form=q('#invoiceFilters',content);
  function applyFilters(event){
    const name=event.target?.name;
    if(!name||!Object.hasOwn(f,name)||f[name]===event.target.value)return;
    f[name]=event.target.value;
    f.page=1;
    drawResults(items,f);
  }
  form.addEventListener('input',applyFilters);
  form.addEventListener('change',applyFilters);
  form.onsubmit=event=>event.preventDefault();
  drawNotifications();
  drawResults(items,f);
  if(prevName){
    const input=form.elements[prevName];
    input?.focus();
    if(selection&&typeof input?.setSelectionRange==='function')input.setSelectionRange(...selection);
  }
}
function install(){
  if(window.__financeiroInvoices)return;
  window.__financeiroInvoices=true;
  installNav();
  records();
  const baseRender=render;
  render=function(){
    resetCentralActor();
    if(currentView()!==VIEW){
      closeActionMenu(false);
      return baseRender();
    }
    void loadCentral();
    renderInvoices();
    void refreshRequests();
  };
  const baseApp=app;
  app=function(){
    installNav();
    resetCentralActor();
    const result=baseApp();
    if(user&&centralEnabled()&&new URLSearchParams(location.hash.slice(1)).has('solicitacao')){
      queueMicrotask(openDeepLinkView);
    }
    return result;
  };
  function openDeepLinkView(){
    if(!user||!centralEnabled()||!new URLSearchParams(location.hash.slice(1)).has('solicitacao'))return;
    if(currentView()!==VIEW)q('.nav [data-view="invoices"]')?.click();
    void consumeDeepLink();
  }
  window.addEventListener('hashchange',()=>{
    requestedLink='';
    openDeepLinkView();
  });
  document.addEventListener('pointerdown',event=>{
    if(!openMenu||openMenu.menu.contains(event.target)||openMenu.trigger.contains(event.target))return;
    closeActionMenu(false);
  });
  document.addEventListener('scroll',placeMenu,true);
  window.addEventListener('resize',placeMenu);
  function refreshForeground(){
    resetCentralActor();
    if(user&&centralEnabled()&&currentView()===VIEW&&!document.hidden&&!q('[data-invoice-modal]'))void loadCentral();
  }
  window.addEventListener('focus',refreshForeground);
  window.addEventListener('online',refreshForeground);
  if(centralEnabled()){
    window.setInterval(refreshForeground,60000);
    const shell=q('#app');
    if(shell)new MutationObserver(()=>resetCentralActor()).observe(shell,{childList:true});
  }
  document.addEventListener('integral-finance-cloud-ready',()=>{
    if(!user)return;
    if(currentView()===VIEW){
      void loadCentral();
      renderInvoices();
    }
    void refreshRequests();
  });
  // Inclui a aba quando o menu já foi montado durante a inicialização do legado.
  try{
    if(typeof user!=='undefined'&&user&&q('.shell .nav')&&!q('.nav [data-view="'+VIEW+'"]'))app();
  }catch(error){console.warn('Solicitações: não foi possível atualizar o menu',error)}
}
function boot(){if(typeof render!=='function'||typeof app!=='function'||typeof adminNav==='undefined'||typeof staffNav==='undefined'||typeof db==='undefined'){setTimeout(boot,30);return}install()}
boot();
})();
