(function(){
'use strict';
const adm=()=>typeof user!=='undefined'&&user?.role==='Administrador',q=s=>document.querySelector(s);
const prompts=['Resumo financeiro','Meta de vendas','Projeção de caixa','Inadimplência','Orçamentos','Comparar períodos','O que exige atenção?'];
const state={messages:[],busy:false,report:null,owner:null,controller:null};
const robot='<svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true"><path d="M10 16 Q32 5 54 16 L43 53 Q32 62 21 53 Z" fill="#22c55e" stroke="#064e3b" stroke-width="3"/><path d="M32 12V4" stroke="#22c55e" stroke-width="3"/><circle cx="24" cy="28" r="5" fill="#052e16"/><circle cx="40" cy="28" r="5" fill="#052e16"/><path d="M25 43h14" stroke="#052e16" stroke-width="3"/></svg>';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function markup(){const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});return `<div class="fin-agent-chat"><p>Consultor Financeiro · Dados autorizados, estratégias e relatórios</p><div class="fin-agent-period"><label>De<input type="date" data-agent-start value="${today.slice(0,7)}-01" required></label><label>Até<input type="date" data-agent-end value="${today}" required></label><label>Objetivo em R$ (opcional)<input data-agent-target type="number" min="0" step="0.01"></label></div><div class="fin-agent-prompts">${prompts.map(p=>`<button type="button" class="btn small ghost" data-agent-prompt="${p}">${p}</button>`).join('')}</div><div class="fin-agent-messages" role="log" aria-live="polite"></div><details><summary>Base e indicadores consultados</summary><pre class="fin-agent-base"></pre></details><form class="fin-agent-form"><label>Pergunte ao consultor<textarea required maxlength="2000" placeholder="Quais decisões podem melhorar nosso resultado?"></textarea></label><button class="btn" type="submit">Enviar</button><span role="status"></span></form></div>`}
function paint(root){const log=root.querySelector('.fin-agent-messages');log.innerHTML=state.messages.map(m=>`<article class="fin-agent-${m.role}"><b>${m.role==='user'?'Você':'Consultor Financeiro'}</b><div>${E(m.content)}</div></article>`).join('');log.scrollTop=log.scrollHeight;root.querySelector('.fin-agent-base').textContent=state.report?JSON.stringify(state.report,null,2):'Uma consulta ao agente exibirá aqui o período, as fontes e os indicadores.';root.querySelectorAll('button').forEach(b=>b.disabled=state.busy)}
function bind(root){paint(root);const form=root.querySelector('form'),area=form.querySelector('textarea');
 root.querySelectorAll('[data-agent-prompt]').forEach(b=>b.onclick=()=>{area.value=b.dataset.agentPrompt;area.focus()});
 form.onsubmit=async e=>{e.preventDefault();if(!adm()||state.busy)return;const question=area.value.trim();if(question.length<3){form.querySelector('[role=status]').textContent='Escreva pelo menos 3 caracteres.';return}
 const status=form.querySelector('[role=status]');state.busy=true;status.textContent='Consultando a base autorizada…';const history=state.messages.slice(-8);state.messages.push({role:'user',content:question});paint(root);
 const controller=new AbortController();state.controller=controller;const owner=state.owner;
 try{const {data,error}=await window.IntegralERP.sb.auth.getSession();if(error||!data.session)throw Error('Entre novamente para consultar o agente.');
 const target=root.querySelector('[data-agent-target]').value;
 const r=await fetch('/api/agente-financeiro',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({question,history,start:root.querySelector('[data-agent-start]').value,end:root.querySelector('[data-agent-end]').value,...(target!==''?{target:Number(target)}:{})})});const result=await r.json();if(!r.ok)throw Error(result.erro||'Consulta indisponível.');if(!adm()||state.owner!==owner)return;state.messages.push({role:'assistant',content:result.resposta});state.report=result.base;area.value='';status.textContent=result.modo==='ia'?'Análise concluída.':'Indicadores consultados; IA ainda não configurada.';
 }catch(error){if(error.name!=='AbortError'&&state.owner===owner)status.textContent=error.message}finally{if(state.controller===controller){state.busy=false;state.controller=null;document.querySelectorAll('.fin-agent-chat').forEach(paint)}}
 };
}
let lastFocus=null;
function close(){q('#finAgentPanel')?.remove();q('#finAgentFloat')?.setAttribute('aria-expanded','false');lastFocus?.focus()}
function open(){if(!adm())return;if(q('#finAgentPanel'))return close();lastFocus=document.activeElement;const panel=document.createElement('aside');panel.id='finAgentPanel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Agente Financeiro');panel.innerHTML='<header><h2>Agente Financeiro</h2><button class="btn ghost" id="finAgentClose" aria-label="Fechar painel">Fechar</button></header>'+markup();document.body.append(panel);q('#finAgentFloat')?.setAttribute('aria-expanded','true');q('#finAgentClose').onclick=close;bind(panel);panel.querySelector('textarea').focus()}
function page(){if(!adm())return;close();title('Agente Financeiro');q('#content').innerHTML=markup();bind(q('#content'))}
function reconcile(){
 const owner=adm()?String(user.erpId||user.email||user.name):null;if(owner!==state.owner){state.controller?.abort();state.owner=owner;state.messages=[];state.report=null;state.busy=false;close()}
 if(!adm()){q('#finAgentFloat')?.remove();document.querySelectorAll('[data-view="financialAgent"]').forEach(b=>b.remove());q('#content .fin-agent-chat')?.remove();return}
 const nav=q('.sidebar > .nav')||q('.nav'),boletos=nav?.querySelector('[data-view="boletos"]');
 if(nav&&!nav.querySelector('[data-view="financialAgent"]')){const b=document.createElement('button');b.dataset.view='financialAgent';b.textContent='Agente Financeiro';boletos?boletos.after(b):nav.append(b)}
 if(!q('#finAgentFloat')){const b=document.createElement('button');b.id='finAgentFloat';b.type='button';b.title='Agente Financeiro';b.setAttribute('aria-label','Abrir Agente Financeiro');b.setAttribute('aria-controls','finAgentPanel');b.setAttribute('aria-expanded','false');b.innerHTML=robot;b.onclick=open;document.body.append(b)}
}
const baseRender=render;render=function(){if(typeof view!=='undefined'&&view==='financialAgent'){if(adm())return page();return documents()}return baseRender.apply(this,arguments)};window.render=render;
document.addEventListener('click',e=>{if(!e.target.closest?.('[data-view="financialAgent"]'))return;e.preventDefault();e.stopImmediatePropagation();if(!adm())return;view='financialAgent';document.querySelectorAll('.nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='financialAgent'));page()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('#finAgentPanel'))close()});
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;reconcile()})}).observe(document.documentElement,{childList:true,subtree:true});reconcile();
window.IntegralFinancialAgent={open,close,page,reconcile};
})();
