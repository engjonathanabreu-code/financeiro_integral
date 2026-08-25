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

function fileDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Não foi possível ler o arquivo.'));r.readAsDataURL(file);});}
function normalizeText(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();}
function makeId(){return Date.now()+Math.floor(Math.random()*100000);}

function openActiveBillsAiModal(){
  const d=D();
  const modal=document.createElement('div');modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal"><div class="modal-head"><h3>Leitura de boletos por IA</h3><button class="btn ghost small" type="button" data-ai-close>Fechar</button></div><form id="activeAiBillsForm"><div class="modal-body"><div class="dropzone"><h3>Envie todos os boletos da conta</h3><p>A IA irá identificar vencimento, valor, código e competência e separar cada pagamento no mês correto.</p><input id="activeAiBillsFiles" type="file" multiple accept=".pdf,image/*" required><div style="margin-top:14px"><button class="btn" id="activeAiBillsSend" type="submit" disabled>Enviar para análise da IA</button></div></div><div id="activeAiBillsStatus" class="notice">Selecione um ou mais boletos para habilitar o envio.</div></div></form></div>`;
  document.body.appendChild(modal);
  const input=modal.querySelector('#activeAiBillsFiles'),send=modal.querySelector('#activeAiBillsSend'),status=modal.querySelector('#activeAiBillsStatus');
  const close=()=>modal.remove();modal.querySelector('[data-ai-close]').onclick=close;modal.onclick=ev=>{if(ev.target===modal)close();};
  input.onchange=()=>{const n=input.files.length;send.disabled=!n;status.textContent=n?`${n} arquivo(s) selecionado(s). Clique em Enviar para análise da IA.`:'Selecione um ou mais boletos para habilitar o envio.';};
  modal.querySelector('#activeAiBillsForm').onsubmit=async ev=>{
    ev.preventDefault();const files=[...input.files];if(!files.length)return;send.disabled=true;send.textContent='Enviando para IA...';
    d.accountMasters=d.accountMasters||[];d.accountPayments=d.accountPayments||[];let done=0,newMasters=0,newPayments=0,duplicates=0;
    try{
      for(const file of files){
        status.textContent=`Analisando ${done+1} de ${files.length}: ${file.name}`;
        const image=await fileDataUrl(file);
        const existing=d.accountMasters.map(a=>({id:a.id,name:a.name||'',supplier:a.supplier||'',registration:a.registration||'',category:a.category||'',sector:a.sector||''}));
        const response=await fetch('/api/ai-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,fileName:file.name,accounts:existing})});
        const ai=await response.json();if(!response.ok||!ai.ok)throw new Error(ai.details||ai.error||'Falha na análise da IA.');
        let master=d.accountMasters.find(a=>String(a.id)===String(ai.matchedAccountId));
        if(!master&&ai.registration)master=d.accountMasters.find(a=>normalizeText(a.registration)===normalizeText(ai.registration)&&normalizeText(a.supplier)===normalizeText(ai.supplier));
        if(!master){master={id:makeId(),name:ai.name||ai.supplier||'Conta',supplier:ai.supplier||'',registration:ai.registration||'',recurrence:ai.recurrence||'Não identificada',category:ai.category||'Outros',sector:ai.sector||'Administrativo',method:ai.paymentMethod||'Boleto',active:true,createdByAI:true};d.accountMasters.push(master);newMasters++;}
        else{if(ai.registration&&!master.registration)master.registration=ai.registration;if(ai.recurrence)master.recurrence=ai.recurrence;if(ai.paymentMethod)master.method=ai.paymentMethod;}
        const due=ai.dueDate||new Date().toISOString().slice(0,10),value=Number(ai.value||0);
        const duplicate=d.accountPayments.find(p=>String(p.accountId)===String(master.id)&&p.due===due&&Math.abs(Number(p.value||0)-value)<0.01);
        if(duplicate)duplicates++;else{d.accountPayments.push({id:makeId(),accountId:master.id,value,due,status:'A vencer',barcode:ai.paymentCode||'',competence:ai.competence||String(due).slice(0,7),source:'IA • Conta enviada',file:{name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()}});newPayments++;}
        done++;
      }
      if(typeof save==='function')save();close();if(typeof accounts==='function')accounts();alert(`${done} arquivo(s) analisado(s). ${newMasters} nova(s) conta(s), ${newPayments} pagamento(s) incluído(s)${duplicates?` e ${duplicates} duplicado(s) ignorado(s)`:''}.`);
    }catch(err){status.textContent=err?.message||String(err);send.disabled=false;send.textContent='Enviar para análise da IA';}
  };
}

window.renderFinanceDashboardFinal=renderDashboardFinal;
try{dashboard=renderDashboardFinal;window.dashboard=renderDashboardFinal}catch{window.dashboard=renderDashboardFinal}

// Intercepta o botao legado de IA em Contas antes do onclick antigo sem envio.
document.addEventListener('click',ev=>{const btn=ev.target.closest?.('#v2AiBills');if(!btn)return;ev.preventDefault();ev.stopImmediatePropagation();openActiveBillsAiModal();},true);

// Se algum patch antigo limpar a tela depois do boot, restaura somente quando a view atual for dashboard.
setTimeout(()=>{try{if((typeof view!=='undefined'?view:window.view)==='dashboard')renderDashboardFinal()}catch(e){console.error('Dashboard final:',e)}},900);
window.addEventListener('integral:erp-planning-synced',()=>{try{if((typeof view!=='undefined'?view:window.view)==='dashboard')renderDashboardFinal()}catch{}});
})();
