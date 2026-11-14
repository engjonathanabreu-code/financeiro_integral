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
const currentView=()=>{try{return view}catch{return window.view||''}};
const categoryLabel={trip:'Viagem',budget:'Orçamento / investimento',purchase:'Compra avulsa'};
const vehicleLabel={gol:'Gol',hb20:'HB20'};
const vehicleOptions=()=>'<option value="">Selecione o veículo</option>'+Object.entries(vehicleLabel).map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
const statusClass=s=>s==='Aprovada'?'ok':s==='Rejeitada'?'danger':'warn';
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
function safeRich(value){const box=document.createElement('div');box.innerHTML=String(value||'');const allowed=new Set(['B','STRONG','I','EM','UL','OL','LI','P','DIV','BR','SPAN','FONT']);for(const el of [...box.querySelectorAll('*')]){if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);continue}for(const a of [...el.attributes])if(!['style','size'].includes(a.name))el.removeAttribute(a.name);if(el.hasAttribute('style')){const style=el.style,keep=[];if(['left','center','right','justify'].includes(style.textAlign))keep.push(`text-align:${style.textAlign}`);if(style.fontWeight==='bold'||Number(style.fontWeight)>=600)keep.push('font-weight:bold');if(style.fontStyle==='italic')keep.push('font-style:italic');el.setAttribute('style',keep.join(';'));if(!keep.length)el.removeAttribute('style')}}return box.innerHTML}
function records(){db.invoiceRequests=db.invoiceRequests||[];return db.invoiceRequests}
function visible(){return records().filter(r=>admin()||String(r.requesterId)===userKey()).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))}
function installNav(){
  for(const nav of [typeof adminNav==='undefined'?null:adminNav,typeof staffNav==='undefined'?null:staffNav]){
    if(!nav||nav.some(x=>x[0]===VIEW))continue;const at=nav.findIndex(x=>x[0]==='trips');nav.splice(at<0?nav.length:at+1,0,[VIEW,'Solicitações']);
  }
}
function modal(titleText,html){const el=document.createElement('div');el.className='modal-backdrop';el.innerHTML=`<section class="modal invoice-modal"><div class="modal-head"><h3>${E(titleText)}</h3><button class="btn ghost small" data-invoice-close>Fechar</button></div>${html}</section>`;document.body.append(el);q('[data-invoice-close]',el).onclick=()=>el.remove();return el}
async function persistRequest(request,expected=null){
  const sb=window.IntegralERP?.sb;
  if(!sb)throw new Error('Conexão com Supabase indisponível.');
  const actor=userKey();
  const {data:auth,error:authError}=await sb.auth.getUser();
  const authenticated=auth?.user;
  if(authError||!authenticated||!user||userKey()!==actor||(user.erpId&&user.erpId!==authenticated.id)){
    throw Error('Entre novamente para enviar a solicitação.');
  }
  if(!expected)request.requesterId=authenticated.id;
  const {data,error}=await sb.rpc('financeiro_save_invoice_request',{p_request:request,p_expected:expected});
  if(error)throw error;
  if(!user||userKey()!==actor)throw Error('A sessão mudou. Abra Solicitações para consultar o registro.');
  return applyRequestList(data,request.id);
}
function createModal(){
  if(!user)return;
  const el=modal('Nova solicitação',`<form id="invoiceCreate" class="invoice-compose"><div class="modal-body"><div class="invoice-compose-note"><span>A solicitação será enviada ao administrador para análise.</span></div><div class="form-grid invoice-compose-grid"><div class="field"><label>Categoria</label><select name="category" required><option value="trip">Viagem</option><option value="budget">Orçamento / investimento</option><option value="purchase">Compra avulsa</option></select></div><div class="field"><label>Data necessária</label><input name="neededAt" type="date"></div><div class="field"><label>Valor estimado</label><input name="estimatedValue" type="number" min="0" step="0.01" placeholder="R$ 0,00"></div><div class="field"><label>Projeto / centro de custo</label><input name="project" placeholder="Opcional"></div><div class="field invoice-vehicle"><label>Veículo da viagem</label><select name="vehicleId">${vehicleOptions()}</select><small>A retirada será liberada somente na data da viagem, após aprovação.</small></div><div class="field full invoice-destination"><label>Destino da viagem</label><input name="destination" placeholder="Cidade / UF"></div><div class="field full invoice-subject"><label>Assunto</label><input name="title" maxlength="120" required placeholder="Ex.: Compra de passagens para vistoria"></div><div class="field full invoice-message"><label>Mensagem</label><div class="invoice-editor"><div class="invoice-editor-toolbar" role="toolbar" aria-label="Formatação do texto"><select data-editor-size aria-label="Tamanho da fonte"><option value="3">Normal</option><option value="2">Pequena</option><option value="4">Grande</option><option value="5">Muito grande</option></select><button type="button" data-editor-command="bold" title="Negrito"><b>B</b></button><button type="button" data-editor-command="italic" title="Itálico"><i>I</i></button><button type="button" data-editor-command="insertUnorderedList" title="Tópicos">• Lista</button><button type="button" data-editor-command="insertOrderedList" title="Lista numerada">1. Lista</button><span class="invoice-toolbar-separator"></span><button type="button" data-editor-command="justifyLeft" title="Alinhar à esquerda">Esquerda</button><button type="button" data-editor-command="justifyCenter" title="Centralizar">Centro</button><button type="button" data-editor-command="justifyRight" title="Alinhar à direita">Direita</button><button type="button" data-editor-command="justifyFull" title="Justificar">Justificar</button></div><div id="invoiceDescriptionEditor" class="invoice-editor-area" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="Escreva aqui os detalhes da solicitação, objetivos, itens, quantidades e demais orientações..."></div></div></div></div></div><div class="modal-foot invoice-compose-foot"><small>Revise as informações antes de enviar.</small><button class="btn" type="submit">Enviar solicitação</button></div></form>`);
  const form=q('#invoiceCreate',el),category=q('[name="category"]',form),dest=q('.invoice-destination',form);category.onchange=()=>{const trip=category.value==='trip';dest.hidden=!trip;q('.invoice-vehicle',form).hidden=!trip;form.elements.vehicleId.required=trip;form.elements.vehicleId.disabled=!trip;form.elements.neededAt.required=trip};category.onchange();
  const editor=q('#invoiceDescriptionEditor',form);qa('[data-editor-command]',form).forEach(b=>b.onclick=()=>{editor.focus();document.execCommand(b.dataset.editorCommand,false,null)});q('[data-editor-size]',form).onchange=e=>{editor.focus();document.execCommand('fontSize',false,e.target.value)};
  form.onsubmit=async e=>{e.preventDefault();const f=new FormData(form),description=editor.innerText.trim();if(!description){editor.focus();return alert('Descreva os pontos da solicitação.')}const now=new Date().toISOString();const request={id:uid(),category:f.get('category'),title:String(f.get('title')).trim(),description,descriptionHtml:safeRich(editor.innerHTML),estimatedValue:Number(f.get('estimatedValue')||0),neededAt:f.get('neededAt')||'',project:String(f.get('project')||'').trim(),destination:f.get('category')==='trip'?String(f.get('destination')||'').trim():'',status:'Pendente',requesterId:userKey(),requesterName:user?.name||user?.email||'Usuário',requesterSector:user?.sector||'',createdAt:now,updatedAt:now,response:'',history:[{at:now,action:'Solicitação enviada',by:user?.name||'Usuário'}]};const submit=q('[type="submit"]',form);submit.disabled=true;try{if(request.category==='trip'){request.vehicleId=f.get('vehicleId');if(!vehicleLabel[request.vehicleId]||!request.neededAt)throw Error('Selecione o veículo e a data da viagem.')}await persistRequest(request);el.remove();renderInvoices()}catch(error){alert('Não foi possível enviar: '+error.message)}finally{submit.disabled=false}};q('[name="title"]',form).focus();
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
async function reviewRequest(attempt,actor){
  const sb=window.IntegralERP?.sb;
  if(!sb)throw Error('Conexão com Supabase indisponível.');
  const {data:auth,error:authError}=await sb.auth.getUser();
  if(authError||!auth?.user?.id||user?.erpId!==actor||auth.user.id!==actor||!admin()){
    throw Error('A sessão mudou. Abra Solicitações para consultar a decisão.');
  }
  const {data,error}=await sb.rpc('financeiro_revisar_solicitacao',attempt);
  if(error)throw error;
  if(userKey()!==actor||!admin())throw Error('A sessão mudou. Abra Solicitações para consultar a decisão.');
  const {p_id:id,p_aprovar:approved,p_resposta:response}=attempt;
  return applyRequestList(data,id,item=>item.status===(approved?'Aprovada':'Rejeitada')
    &&item.response===response&&item.reviewedAt&&String(item.reviewedById)===actor
    &&(!approved||item.convertedId!=null));
}
function detailModal(req){
  const canComplete=req.category==='trip'&&!req.vehicleId&&['Pendente','Aprovada'].includes(req.status)&&(admin()||String(req.requesterId)===userKey());
  const actor=userKey(),key=reviewKey(actor,req.id);
  let draft=admin()?readReview(key):null;
  const canReview=admin()&&(req.status==='Pendente'||Boolean(draft?.attempt));
  const formatted=req.descriptionHtml?safeRich(req.descriptionHtml):E(req.description).replace(/\n/g,'<br>');const el=modal('Detalhes da solicitação',`<div class="modal-body"><div class="invoice-detail-head"><span class="badge ${statusClass(req.status)}">${E(req.status)}</span><small>Enviada em ${new Date(req.createdAt).toLocaleString('pt-BR')}</small></div><h2>${E(req.title)}</h2><div class="invoice-detail-grid"><div><span>Categoria</span><b>${E(categoryLabel[req.category]||req.category)}</b></div><div><span>Solicitante</span><b>${E(req.requesterName)}</b></div><div><span>Valor estimado</span><b>${M(req.estimatedValue)}</b></div><div><span>Data necessária</span><b>${D(req.neededAt)}</b></div>${req.category==='trip'?`<div><span>Veículo</span><b>${E(vehicleLabel[req.vehicleId]||'Ainda não escolhido')}</b></div>`:''}</div>${canComplete?`<div class="field"><label>Completar veículo desta solicitação</label><select id="invoiceLegacyVehicle">${vehicleOptions()}</select><button class="btn" type="button" id="invoiceSetVehicle">Salvar veículo</button><small>Preserva a data, os valores e a decisão existente. Depois de escolhido, o veículo só pode ser alterado pelo administrador antes da retirada.</small><p role="status" id="invoiceVehicleStatus"></p></div>`:''}<section class="invoice-description"><span>Descrição</span><div>${formatted}</div></section>${req.response?`<section class="invoice-response"><span>Resposta do administrador</span><p>${E(req.response).replace(/\n/g,'<br>')}</p></section>`:''}${canReview?`<div class="field invoice-review"><label>Resposta ao solicitante</label><textarea id="invoiceResponse" rows="4" placeholder="Informe a decisão, orientações ou ajustes necessários."></textarea><p id="invoiceReviewStatus" role="status"></p></div>`:''}</div><div class="modal-foot">${canReview?'<button class="btn danger ghost" id="invoiceReject">Rejeitar</button><button class="btn" id="invoiceApprove">Aprovar e converter</button>':'<button class="btn secondary" data-invoice-close-bottom>Fechar</button>'}</div>`);
  q('[data-invoice-close-bottom]',el)?.addEventListener('click',()=>el.remove());
  if(canComplete)q('#invoiceSetVehicle',el).onclick=async()=>{const vehicleId=q('#invoiceLegacyVehicle',el).value,button=q('#invoiceSetVehicle',el),status=q('#invoiceVehicleStatus',el);if(!vehicleLabel[vehicleId]){status.textContent='Selecione o veículo.';return}button.disabled=true;try{const draft={...structuredClone(req),vehicleId};const saved=await persistRequest(draft,structuredClone(req));el.remove();renderInvoices();detailModal(saved)}catch(error){status.textContent=error.message}finally{button.disabled=false}};
  if(canReview){
    const input=q('#invoiceResponse',el),status=q('#invoiceReviewStatus',el);
    const approve=q('#invoiceApprove',el),reject=q('#invoiceReject',el);
    let busy=false,stale=false;
    function controls(){
      const attempt=draft?.attempt;
      input.value=draft?.response||'';
      input.readOnly=busy||stale||Boolean(attempt);
      approve.disabled=busy||stale||attempt?.p_aprovar===false;
      reject.disabled=busy||stale||attempt?.p_aprovar===true;
      approve.textContent=attempt?.p_aprovar?'Confirmar decisão anterior':'Aprovar e converter';
      reject.textContent=attempt?.p_aprovar===false?'Confirmar decisão anterior':'Rejeitar';
      status.textContent=attempt?'A decisão anterior aguarda confirmação.':'';
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
        if(approved&&!confirm(`Aprovar e criar ${categoryLabel[req.category]||'o registro financeiro'}?`))return;
        attempt={p_id:String(req.id),p_esperado:structuredClone(req),p_aprovar:approved,p_resposta:response};
        draft={response,attempt};
        storeReview(key,draft);
      }
      busy=true;
      controls();
      try{
        await reviewRequest(attempt,actor);
        draft=null;
        storeReview(key,null);
        el.remove();
        renderInvoices();
        // A atualização do armazenamento usa a mescla de revisões e preserva edições de outros módulos.
        void window.IntegralFinanceCloudStorage?.refresh?.();
      }catch(error){
        if(['40001','22023','42501','P0001'].includes(error?.code)){
          draft={response:attempt.p_resposta};
          storeReview(key,draft);
          stale=true;
          void refreshRequests();
        }
        const next=stale?' Reabra a solicitação para conferir.':' Use o mesmo botão para confirmar a decisão.';
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
  if(loadingRequests)return loadingRequests;
  const actor=userKey(),revision=requestRevision;
  loadingRequests=(async()=>{
    const {data,error}=await sb.rpc('financeiro_listar_solicitacoes');
    if(error||!Array.isArray(data)||userKey()!==actor||requestRevision!==revision)return false;
    const changed=JSON.stringify(db.invoiceRequests)!==JSON.stringify(data);
    db.invoiceRequests=data;
    if(changed&&currentView()===VIEW)renderInvoices();
    return changed;
  })().catch(()=>false).finally(()=>{loadingRequests=null});
  return loadingRequests;
}
function ownsApprovedTrip(trip){
  const actor=user?.erpId;
  return Boolean(actor&&trip?.invoiceRequestId&&records().some(request=>
    request.requesterId===actor&&request.category==='trip'&&request.status==='Aprovada'&&request.reviewedAt
    &&String(request.id)===String(trip.invoiceRequestId)&&String(request.convertedId)===String(trip.id)));
}
window.IntegralFinanceRequests={refresh:refreshRequests,ownsApprovedTrip};
function renderInvoices(){
  if(!user||currentView()!==VIEW)return;title('Solicitações');const list=visible(),pending=list.filter(x=>x.status==='Pendente').length,approved=list.filter(x=>x.status==='Aprovada').length;
  q('#content').innerHTML=`<div class="invoice-hero"><div><span class="invoice-eyebrow">Requisições de compra e investimento</span><h2>Solicitações</h2><p>Envie pedidos para análise e acompanhe a resposta do administrador.</p></div><button class="btn" id="invoiceNew">+ Nova solicitação</button></div><div class="invoice-metrics"><div class="card metric"><h3>Total</h3><b>${list.length}</b><small>solicitações visíveis</small></div><div class="card metric"><h3>Aguardando análise</h3><b>${pending}</b><small>pendentes</small></div><div class="card metric"><h3>Aprovadas</h3><b>${approved}</b><small>convertidas no financeiro</small></div></div>${admin()?'<div class="notice invoice-admin-note">Como administrador, você visualiza e analisa as solicitações de todos os usuários.</div>':''}<div class="invoice-list">${list.map(r=>`<button class="card invoice-card" data-invoice-id="${E(r.id)}"><span class="invoice-category">${E(categoryLabel[r.category]||r.category)}</span><span class="badge ${statusClass(r.status)}">${E(r.status)}</span><strong>${E(r.title)}</strong><p>${E(r.description)}</p><div><span>${E(r.requesterName)}</span><span>${M(r.estimatedValue)}</span><span>${D(r.neededAt)}</span></div>${r.response?'<small class="invoice-has-response">Resposta disponível</small>':''}</button>`).join('')||'<div class="card empty invoice-empty"><b>Nenhuma solicitação ainda.</b><span>Use “Nova solicitação” para enviar o primeiro pedido.</span></div>'}</div>`;
  q('#invoiceNew').onclick=createModal;qa('[data-invoice-id]').forEach(b=>b.onclick=()=>detailModal(records().find(r=>String(r.id)===b.dataset.invoiceId)));
}
function install(){if(window.__financeiroInvoices)return;window.__financeiroInvoices=true;installNav();records();const baseRender=render;render=function(){if(currentView()===VIEW){renderInvoices();refreshRequests();return}return baseRender()};const baseApp=app;app=function(){installNav();return baseApp()};document.addEventListener('integral-finance-cloud-ready',()=>{if(currentView()===VIEW)renderInvoices();refreshRequests()});
/* Se o menu já foi montado antes deste módulo carregar, remonta uma vez para incluir Solicitações. */
try{if(typeof user!=='undefined'&&user&&document.querySelector('.shell .nav')&&!document.querySelector('.nav [data-view="'+VIEW+'"]'))app()}catch(e){console.warn('Solicitações: não foi possível atualizar o menu',e)}}
function boot(){if(typeof render!=='function'||typeof app!=='function'||typeof adminNav==='undefined'||typeof staffNav==='undefined'||typeof db==='undefined'){setTimeout(boot,30);return}install()}
boot();
})();
