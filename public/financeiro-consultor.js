/* Integral Financeiro — Consultor Financeiro (somente ADM).
   Abre com os indicadores do período e uma leitura feita a partir deles;
   a conversa chega em tempo real (streaming), com gráficos dos dados reais
   e relatórios em PDF. Nenhum dado é alterado pelo agente. */
(function(){
'use strict';
const adm=()=>typeof user!=='undefined'&&user?.role==='Administrador',q=s=>document.querySelector(s);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>v==null||!isFinite(v)?'—':`${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const prompts=[
 ['Diagnóstico do período','Faça um diagnóstico financeiro do período: o que está bem, o que preocupa e o que eu deveria fazer primeiro.'],
 ['Onde estamos gastando mais?','Para onde está indo o nosso dinheiro? Quais saídas mais pesam e onde dá para economizar?'],
 ['Projeção de caixa','Com o que está planejado, como fica o caixa nos próximos meses? Onde estão os riscos?'],
 ['Inadimplência','Como está a inadimplência dos boletos e o que fazer para recuperar esse dinheiro?'],
 ['Retiradas dos sócios','As retiradas dos sócios estão compatíveis com a geração de caixa da empresa?'],
 ['Plano de 90 dias','Monte um plano de ação de 90 dias para melhorar o resultado, com prioridades e metas em R$.'],
 ['Meta de faturamento','Quanto precisamos faturar por mês para fechar no azul com folga? Mostre a conta.']
];
const WAIT=['Abrindo o fluxo de caixa…','Cruzando com os recebimentos…','Olhando a DRE e as margens…','Comparando com os meses anteriores…','Organizando as recomendações…'];
const state={messages:[],busy:false,report:null,owner:null,controller:null,loadingBase:false,baseKey:''};
const robot='<svg viewBox="0 0 64 64" width="40" height="40" aria-hidden="true"><path d="M10 16 Q32 5 54 16 L43 53 Q32 62 21 53 Z" fill="#22c55e" stroke="#064e3b" stroke-width="3"/><path d="M32 12V4" stroke="#22c55e" stroke-width="3"/><circle cx="24" cy="28" r="5" fill="#052e16"/><circle cx="40" cy="28" r="5" fill="#052e16"/><path d="M25 43h14" stroke="#052e16" stroke-width="3"/></svg>';
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const firstName=()=>{try{return String(user?.name||'').trim().split(/\s+/)[0]||''}catch{return ''}};
const greet=()=>{const h=+new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo',hour:'numeric',hour12:false});return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite'};
const dateBR=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'';

/* Markdown leve e seguro: escapa tudo antes de formatar. */
function md(src){
 const inline=s=>E(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<em>$2</em>');
 const lines=String(src||'').replace(/\r/g,'').split('\n'),out=[];let i=0;
 while(i<lines.length){
  const l=lines[i];
  if(!l.trim()){i++;continue}
  const h=l.match(/^#{1,6}\s+(.*)/);if(h){out.push(`<h4>${inline(h[1])}</h4>`);i++;continue}
  if(/^\s*\|.*\|\s*$/.test(l)&&/^\s*\|?\s*:?-{2,}/.test(lines[i+1]||'')){
   const cells=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
   const head=cells(l);i+=2;const rows=[];while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){rows.push(cells(lines[i]));i++}
   out.push(`<div class="fin-agent-table"><table><thead><tr>${head.map(c=>`<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue}
  if(/^\s*([-*•]|\d+[.)])\s+/.test(l)){
   const ordered=/^\s*\d+[.)]/.test(l),items=[];
   while(i<lines.length&&/^\s*([-*•]|\d+[.)])\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/,''));i++}
   out.push(`<${ordered?'ol':'ul'}>${items.map(x=>`<li>${inline(x)}</li>`).join('')}</${ordered?'ol':'ul'}>`);continue}
  /* Sempre consome a linha atual (ex.: cabeçalho de tabela ainda incompleto no streaming). */
  const para=[inline(lines[i++])];while(i<lines.length&&lines[i].trim()&&!/^#{1,6}\s|^\s*([-*•]|\d+[.)])\s+|^\s*\|/.test(lines[i])){para.push(inline(lines[i]));i++}
  out.push(`<p>${para.join('<br>')}</p>`);
 }
 return out.join('');
}
const stripCharts=t=>String(t||'').replace(/\n?\[\[\s*graficos?\s*:[^\]]*\]\]\s*$/i,'').trimEnd();

/* Saudação humana a partir dos indicadores — sem IA, instantânea. */
function briefing(b){
 const f=b.observado?.fluxo_caixa||{},r=b.observado?.recebimentos||{},top=(b.composicao?.saidas_por_natureza||[])[0],p=b.periodo||{};
 const nome=firstName(),parts=[`${greet()}${nome?`, ${nome}`:''}! Dei uma olhada nos números de **${dateBR(p.start)} a ${dateBR(p.end)}**.`];
 if(f.registros){
  parts.push(`Entraram **${brl(f.entradas)}** e saíram **${brl(f.saidas)}**, um resultado de caixa de **${brl(f.resultado)}**${b.indicadores?.margem_caixa_pct!=null?` (${pct(b.indicadores.margem_caixa_pct)} das entradas)`:''}.`);
  if(top&&f.saidas)parts.push(`O que mais pesou nas saídas foi **${top.nome}**, com ${brl(top.valor)} (${pct(top.valor/f.saidas*100)}).`);
 }else parts.push('Ainda não há lançamentos no fluxo de caixa para esse período.');
 if(r.saldo_em_atraso>0)parts.push(`Nos boletos, há **${brl(r.saldo_em_atraso)}** em atraso (${r.em_atraso_ate_fim_periodo} parcelas) que merecem atenção.`);
 parts.push('\nPor onde quer começar? Posso fazer um diagnóstico, aprofundar algum ponto ou montar um **relatório em PDF** com gráficos.');
 return parts.join(' ');
}

function kpiHtml(b){
 if(!b)return `<div class="fin-agent-kpis is-loading">${'<div class="fin-agent-kpi"><small>&nbsp;</small><b>&nbsp;</b></div>'.repeat(4)}</div>`;
 const f=b.observado?.fluxo_caixa||{},r=b.observado?.recebimentos||{},ind=b.indicadores||{};
 const delta=v=>v==null?'':`<em class="${v>=0?'up':'down'}">${v>=0?'▲':'▼'} ${pct(Math.abs(v))} vs período anterior</em>`;
 return `<div class="fin-agent-kpis">
 <div class="fin-agent-kpi"><small>Entradas</small><b>${brl(f.entradas)}</b>${delta(ind.variacao_entradas_vs_periodo_anterior_pct)}</div>
 <div class="fin-agent-kpi"><small>Saídas</small><b>${brl(f.saidas)}</b>${ind.variacao_saidas_vs_periodo_anterior_pct==null?'':`<em class="${ind.variacao_saidas_vs_periodo_anterior_pct<=0?'up':'down'}">${ind.variacao_saidas_vs_periodo_anterior_pct>=0?'▲':'▼'} ${pct(Math.abs(ind.variacao_saidas_vs_periodo_anterior_pct))} vs período anterior</em>`}</div>
 <div class="fin-agent-kpi"><small>Resultado de caixa</small><b class="${f.resultado<0?'neg':''}">${brl(f.resultado)}</b><em>Margem ${pct(ind.margem_caixa_pct)}</em></div>
 <div class="fin-agent-kpi"><small>Boletos em atraso</small><b class="${r.saldo_em_atraso>0?'neg':''}">${brl(r.saldo_em_atraso)}</b><em>${r.em_atraso_ate_fim_periodo||0} parcelas</em></div></div>`;
}

function markup(){
 /* Nos primeiros dias do mês, o mês anterior fechado diz mais que 1–5 dias. */
 const t=today(),[y,mo,dd]=t.split('-').map(Number),early=dd<=5,py=mo===1?y-1:y,pm=mo===1?12:mo-1,pad=n=>String(n).padStart(2,'0');
 const start=early?`${py}-${pad(pm)}-01`:`${t.slice(0,7)}-01`,end=early?`${py}-${pad(pm)}-${new Date(py,pm,0).getDate()}`:t;
 return `<div class="fin-agent-chat">
 <div class="fin-agent-head"><div class="fin-agent-id"><span class="fin-agent-avatar" data-fin-icon="bot" aria-hidden="true"></span><div><b>Consultor Financeiro</b><small>Especialista em gestão financeira · dados do sistema</small></div></div>
 <div class="fin-agent-actions"><button type="button" class="btn" data-agent-report>Relatório PDF</button><button type="button" class="btn ghost" data-agent-reset>Nova conversa</button></div></div>
 <div class="fin-agent-period"><label>De<input type="date" data-agent-start value="${start}" required></label><label>Até<input type="date" data-agent-end value="${end}" required></label><label>Objetivo em R$ (opcional)<input data-agent-target type="number" min="0" step="0.01" placeholder="Ex.: 150000"></label>
 <div class="fin-agent-ranges" role="group" aria-label="Períodos rápidos"><button type="button" class="btn small ghost" data-agent-range="mes">Este mês</button><button type="button" class="btn small ghost" data-agent-range="anterior">Mês passado</button><button type="button" class="btn small ghost" data-agent-range="tri">Últimos 3 meses</button><button type="button" class="btn small ghost" data-agent-range="ano">Ano</button></div></div>
 <div data-agent-kpis></div>
 <div class="fin-agent-messages" role="log" aria-live="polite"></div>
 <div class="fin-agent-prompts">${prompts.map(([l,p])=>`<button type="button" class="btn small ghost" data-agent-prompt="${E(p)}">${E(l)}</button>`).join('')}</div>
 <form class="fin-agent-form"><label class="sr-only" for="finAgentQ">Pergunte ao consultor</label><textarea id="finAgentQ" maxlength="2000" rows="2" placeholder="Pergunte como faria a um diretor financeiro… (Enter envia, Shift+Enter quebra linha)"></textarea><button class="btn" type="submit">Enviar</button><span role="status"></span></form>
 <details><summary>Base e indicadores consultados</summary><pre class="fin-agent-base"></pre></details></div>`;
}

function messageHtml(m,idx){
 if(m.role==='user')return `<article class="fin-agent-user"><div>${E(m.content)}</div></article>`;
 const C=window.IntegralAgentCharts;
 const charts=m.base&&m.graficos?.length&&C?m.graficos.map(id=>C.svg(id,m.base)).join(''):'';
 const body=m.pending&&!m.content?`<div class="fin-agent-typing"><i></i><i></i><i></i><span>${E(m.wait||WAIT[0])}</span></div>`:md(stripCharts(m.content));
 const tools=!m.pending&&m.content&&!m.intro?`<div class="fin-agent-msg-tools"><button type="button" class="btn small ghost" data-agent-pdf="${idx}">Baixar PDF desta análise</button><button type="button" class="btn small ghost" data-agent-copy="${idx}">Copiar</button></div>`:'';
 return `<article class="fin-agent-assistant${m.error?' is-error':''}"><span class="fin-agent-avatar sm" data-fin-icon="bot" aria-hidden="true"></span><div class="fin-agent-bubble"><div class="fin-agent-md">${body}</div>${charts}${tools}</div></article>`;
}
function paint(root){
 const log=root.querySelector('.fin-agent-messages');if(!log)return;
 const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<80;
 log.innerHTML=state.messages.map(messageHtml).join('');
 if(nearBottom||state.busy)log.scrollTop=log.scrollHeight;
 root.querySelector('[data-agent-kpis]').innerHTML=kpiHtml(state.report);
 root.querySelector('.fin-agent-base').textContent=state.report?JSON.stringify(state.report,null,2):'Carregando indicadores…';
 root.querySelectorAll('[data-agent-prompt],[data-agent-report],[data-agent-reset],.fin-agent-form button,[data-agent-pdf]').forEach(b=>b.disabled=state.busy);
 root.querySelectorAll('[data-agent-pdf]').forEach(b=>b.onclick=()=>pdfFor(+b.dataset.agentPdf,root));
 root.querySelectorAll('[data-agent-copy]').forEach(b=>b.onclick=()=>{const m=state.messages[+b.dataset.agentCopy];navigator.clipboard?.writeText(stripCharts(m.content)).then(()=>{b.textContent='Copiado';setTimeout(()=>b.textContent='Copiar',1500)}).catch(()=>{})});
}
const paintAll=()=>document.querySelectorAll('.fin-agent-chat').forEach(paint);
const setStatus=(root,t)=>{const s=root.querySelector('.fin-agent-form [role=status]');if(s)s.textContent=t||''};
function params(root){const target=root.querySelector('[data-agent-target]').value;return {start:root.querySelector('[data-agent-start]').value,end:root.querySelector('[data-agent-end]').value,...(target!==''?{target:Number(target)}:{})}}
async function token(){const {data,error}=await window.IntegralERP.sb.auth.getSession();if(error||!data.session)throw Error('Entre novamente para consultar o agente.');return data.session.access_token}
async function call(body,signal){return fetch('/api/agente-financeiro',{method:'POST',signal,headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify(body)})}

/* Indicadores do período (rápido, sem IA) + saudação. */
async function loadBase(root,{silent}={}){
 const p=params(root),key=JSON.stringify(p);if(state.loadingBase||(state.report&&state.baseKey===key&&silent))return;
 state.loadingBase=true;const owner=state.owner;
 try{const r=await call({mode:'indicadores',...p});const res=await r.json();if(!r.ok)throw Error(res.erro||'Indicadores indisponíveis.');if(state.owner!==owner)return;
  state.report=res.base;state.baseKey=key;
  const intro=state.messages.findIndex(m=>m.intro);const msg={role:'assistant',intro:true,content:briefing(res.base),base:res.base,graficos:['fluxo_mensal']};
  if(intro>=0)state.messages[intro]=msg;else if(!state.messages.length)state.messages.push(msg);
 }catch(e){if(state.owner===owner)setStatus(root,e.message)}finally{state.loadingBase=false;paintAll()}
}

async function ask(root,question){
 if(!adm()||state.busy)return;
 if(question.length<3){setStatus(root,'Escreva pelo menos 3 caracteres.');return}
 const history=state.messages.filter(m=>!m.pending&&!m.error).slice(-10).map(m=>({role:m.role,content:stripCharts(m.content)}));
 state.busy=true;setStatus(root,'');state.messages.push({role:'user',content:question});
 const reply={role:'assistant',content:'',pending:true,wait:WAIT[0],pergunta:question};state.messages.push(reply);paintAll();
 let w=0;const ticker=setInterval(()=>{if(!reply.content){reply.wait=WAIT[++w%WAIT.length];paintAll()}},1800);
 const controller=new AbortController();state.controller=controller;const owner=state.owner;
 try{
  const r=await call({question,history,stream:true,...params(root)},controller.signal);
  const type=r.headers?.get?.('content-type')||'';
  if(!type.includes('ndjson')){const res=await r.json();if(!r.ok)throw Error(res.erro||'Consulta indisponível.');if(state.owner!==owner)return;Object.assign(reply,{content:res.resposta,graficos:res.graficos||[],base:res.base});state.report=res.base;if(res.modo!=='ia')setStatus(root,'Indicadores consultados; a IA ainda não está configurada no servidor.');return}
  const reader=r.body.getReader(),dec=new TextDecoder();let buf='',last=0;
  for(;;){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let i;
   while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(!line)continue;let ev;try{ev=JSON.parse(line)}catch{continue}
    if(state.owner!==owner)return;
    if(ev.type==='meta'){reply.base=ev.base;state.report=ev.base}
    else if(ev.type==='delta'){reply.content+=ev.text;if(Date.now()-last>60){last=Date.now();paintAll()}}
    else if(ev.type==='done'){reply.graficos=ev.graficos||[]}
    else if(ev.type==='error')throw Error(ev.erro)}}
  if(!reply.content)throw Error('A análise não foi concluída. Tente novamente.');
 }catch(error){if(error.name==='AbortError'||state.owner!==owner)return;reply.error=true;reply.content=reply.content?reply.content+`\n\n_${error.message}_`:`Não consegui concluir agora: ${error.message}`}
 finally{clearInterval(ticker);reply.pending=false;if(state.controller===controller){state.busy=false;state.controller=null}paintAll();root.querySelector('textarea')?.focus()}
}

async function report(root){
 if(!adm()||state.busy)return;
 const lastQ=[...state.messages].reverse().find(m=>m.role==='user')?.content||'';
 state.busy=true;const reply={role:'assistant',content:'',pending:true,wait:'Montando o relatório executivo…'};state.messages.push({role:'user',content:'Gerar relatório em PDF do período'});state.messages.push(reply);paintAll();
 const steps=['Montando o relatório executivo…','Escrevendo o diagnóstico…','Priorizando as recomendações…','Desenhando os gráficos…'];let w=0;const ticker=setInterval(()=>{reply.wait=steps[++w%steps.length];paintAll()},2200);
 const owner=state.owner;
 try{
  const r=await call({mode:'relatorio',question:lastQ.slice(0,500),history:state.messages.filter(m=>!m.pending&&!m.error&&!m.intro).slice(-6).map(m=>({role:m.role,content:stripCharts(m.content)})),...params(root)});
  const res=await r.json();if(!r.ok)throw Error(res.erro||'Relatório indisponível.');if(state.owner!==owner)return;
  state.report=res.base;
  const name=await window.IntegralAgentPDF.build({base:res.base,relatorio:res.relatorio||null,usuario:user?.name||''});
  const rel=res.relatorio;
  reply.content=rel?`Pronto! Baixei o relatório **${name}**.\n\n**Mensagem principal:** ${rel.mensagem_chave}\n\n${(rel.recomendacoes||[]).slice(0,3).map((x,i)=>`${i+1}. **${x.acao}** — ${x.impacto_estimado} (${x.prazo})`).join('\n')}`:`Baixei o relatório **${name}** com os indicadores, gráficos e a DRE do período. A análise escrita por IA não está disponível no servidor agora, então o diagnóstico foi feito a partir dos próprios números.`;
  reply.base=res.base;reply.graficos=(rel?.graficos||[]).slice(0,2);reply.report=rel;
 }catch(e){if(state.owner!==owner)return;reply.error=true;reply.content=`Não consegui montar o relatório agora: ${e.message}`}
 finally{clearInterval(ticker);reply.pending=false;state.busy=false;paintAll()}
}
async function pdfFor(idx,root){
 const m=state.messages[idx];if(!m?.base)return;
 const q=m.pergunta||[...state.messages.slice(0,idx)].reverse().find(x=>x.role==='user')?.content||'';
 try{await window.IntegralAgentPDF.build(m.report?{base:m.base,relatorio:m.report,usuario:user?.name||''}:{base:m.base,analise:{pergunta:q,texto:stripCharts(m.content),graficos:m.graficos||[]},usuario:user?.name||''})}catch(e){setStatus(root,e.message)}
}
function setRange(root,kind){
 const t=today(),[y,mo]=t.split('-').map(Number),pad=n=>String(n).padStart(2,'0'),last=(yy,mm)=>new Date(yy,mm,0).getDate();
 let s,e=t;
 if(kind==='mes')s=`${y}-${pad(mo)}-01`;
 else if(kind==='anterior'){const py=mo===1?y-1:y,pm=mo===1?12:mo-1;s=`${py}-${pad(pm)}-01`;e=`${py}-${pad(pm)}-${last(py,pm)}`}
 else if(kind==='tri'){const d=new Date(y,mo-3,1);s=`${d.getFullYear()}-${pad(d.getMonth()+1)}-01`}
 else s=`${y}-01-01`;
 root.querySelector('[data-agent-start]').value=s;root.querySelector('[data-agent-end]').value=e;loadBase(root);
}
function bind(root){
 paint(root);const form=root.querySelector('form'),area=form.querySelector('textarea');
 root.querySelectorAll('[data-agent-prompt]').forEach(b=>b.onclick=()=>{area.value=b.dataset.agentPrompt;form.requestSubmit()});
 root.querySelectorAll('[data-agent-range]').forEach(b=>b.onclick=()=>setRange(root,b.dataset.agentRange));
 root.querySelectorAll('[data-agent-start],[data-agent-end]').forEach(i=>i.onchange=()=>loadBase(root));
 root.querySelector('[data-agent-report]').onclick=()=>report(root);
 root.querySelector('[data-agent-reset]').onclick=()=>{if(state.busy)return;state.messages=[];state.baseKey='';loadBase(root)};
 area.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit()}};
 form.onsubmit=e=>{e.preventDefault();const question=area.value.trim();if(question.length>=3)area.value='';ask(root,question)};
 loadBase(root,{silent:true});
}
let lastFocus=null;
function close(){q('#finAgentPanel')?.remove();q('#finAgentFloat')?.setAttribute('aria-expanded','false');lastFocus?.focus()}
function open(){if(!adm())return;if(q('#finAgentPanel'))return close();lastFocus=document.activeElement;const panel=document.createElement('aside');panel.id='finAgentPanel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Agente Financeiro');panel.innerHTML='<header><h2>Agente Financeiro</h2><button class="btn ghost" id="finAgentClose" aria-label="Fechar painel">Fechar</button></header>'+markup();document.body.append(panel);q('#finAgentFloat')?.setAttribute('aria-expanded','true');q('#finAgentClose').onclick=close;bind(panel);panel.querySelector('textarea').focus()}
function page(){if(!adm())return;close();title('Agente Financeiro');q('#content').innerHTML=markup();bind(q('#content'))}
function reconcile(){
 const owner=adm()?String(user.erpId||user.email||user.name):null;if(owner!==state.owner){state.controller?.abort();state.owner=owner;state.messages=[];state.report=null;state.baseKey='';state.busy=false;close()}
 if(!adm()){q('#finAgentFloat')?.remove();document.querySelectorAll('[data-view="financialAgent"]').forEach(b=>b.remove());q('#content .fin-agent-chat')?.remove();return}
 const nav=q('.sidebar > .nav')||q('.nav'),boletos=nav?.querySelector('[data-view="boletos"]');
 if(nav&&!nav.querySelector('[data-view="financialAgent"]')){const b=document.createElement('button');b.dataset.view='financialAgent';b.dataset.finIcon='bot';b.textContent='Agente Financeiro';boletos?boletos.after(b):nav.append(b)}
 if(!q('#finAgentFloat')){const b=document.createElement('button');b.id='finAgentFloat';b.type='button';b.title='Agente Financeiro';b.setAttribute('aria-label','Abrir Agente Financeiro');b.setAttribute('aria-controls','finAgentPanel');b.setAttribute('aria-expanded','false');b.innerHTML=robot;b.onclick=open;document.body.append(b)}
}
const baseRender=render;render=function(){if(typeof view!=='undefined'&&view==='financialAgent'){if(adm())return page();return documents()}return baseRender.apply(this,arguments)};window.render=render;
document.addEventListener('click',e=>{if(!e.target.closest?.('[data-view="financialAgent"]'))return;e.preventDefault();e.stopImmediatePropagation();if(!adm())return;view='financialAgent';document.querySelectorAll('.nav [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='financialAgent'));page()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('#finAgentPanel'))close()});
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;reconcile()})}).observe(document.documentElement,{childList:true,subtree:true});reconcile();
window.IntegralFinancialAgent={open,close,page,reconcile,md,briefing};
})();
