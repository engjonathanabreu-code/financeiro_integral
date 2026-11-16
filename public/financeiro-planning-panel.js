/* Painel do Planejamento. As ações deste painel consultam fontes autorizadas
   e guardam preferências e cenários no navegador, por administrador. */
(function(){
  'use strict';

  const engine=window.IntegralPlanningAnalysis;
  const shared=window.IntegralDREShared;
  if(!engine||!shared)return;
  const q=(selector,root=document)=>root.querySelector(selector);
  const escape=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const amount=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
  const money=value=>value==null?'—':amount.format(value/100);
  const formatDate=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC'});
  const formatMonth=new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'});
  const dateLabel=value=>!value?'—':value.length===4?value:value.length===7?formatMonth.format(new Date(value+'-01T00:00:00Z')):formatDate.format(new Date(value+'T00:00:00Z'));
  const profile=()=>typeof user!=='undefined'?user:window.user;
  const database=()=>typeof db!=='undefined'?db:window.db||{};
  const admin=()=>profile()?.role==='Administrador';
  const actorId=()=>profile()?.erpId;
  const onPlanning=()=>typeof view!=='undefined'?view==='planning':window.view==='planning';
  const phaseLabels={expected:'Previsto no vencimento',actual:'Realizado registrado',open:'Saldo em aberto',overdue:'Vencido sem baixa integral',cancelled:'Cancelado'};
  const dimensions={
    category:'Categoria',subcategory:'Subcategoria',account:'Conta financeira',center:'Centro de custo',sector:'Setor',
    project:'Projeto',city:'Município',customer:'Cliente',supplier:'Fornecedor',person:'Responsável',method:'Forma de pagamento',source:'Fonte'
  };
  const shortcuts={today:'Hoje',week:'Semana',month:'Mês',next:'Próximo mês',quarter:'Trimestre',semester:'Semestre',year:'Ano','30':'30 dias','60':'60 dias','90':'90 dias','365':'12 meses'};
  const views={summary:'Visão geral',entries:'Lançamentos',calendar:'Calendário',scenarios:'Cenários'};
  const scenarioDefaults={incoming:0,outgoing:0,incomingDelay:0,outgoingDelay:0,extraAmount:0,extraDate:'',extraMonths:1,extraDirection:'Saída'};
  const presets=[
    {id:'base',name:'Base',...scenarioDefaults},
    {id:'conservative',name:'Conservador',...scenarioDefaults,incoming:-10,outgoing:10,incomingDelay:15},
    {id:'optimistic',name:'Otimista',...scenarioDefaults,incoming:10,outgoing:-5,outgoingDelay:7}
  ];
  let state;
  let unsubscribe;

  function prefKey(actor){return 'integral.planejamento.v1.'+actor;}
  function readPrefs(actor){
    if(!actor)return {};
    try{return JSON.parse(localStorage.getItem(prefKey(actor)))||{};}catch{return {};}
  }
  function writePrefs(){
    if(!state.actor||actorId()!==state.actor)return false;
    try{
      localStorage.setItem(prefKey(state.actor),JSON.stringify({favorite:state.favorite,scenarios:state.scenarios}));
      return true;
    }catch{return false;}
  }
  function current(){
    const actor=actorId();
    if(state?.actor===actor&&state?.profile===profile())return state;
    unsubscribe?.();
    const today=shared.todayISO();
    const stored=readPrefs(actor);
    const criteria={scope:'operational',dateBasis:'event',direction:'',status:'',search:'',...engine.period('month',today)};
    state={actor,profile:profile(),today,criteria,mode:'month',phase:'expected',page:0,tab:'summary',memo:null,
      expanded:false,chart:true,group:'',calendarMonth:today.slice(0,7),picked:'',sort:'date',favorite:stored.favorite,
      scenarios:Array.isArray(stored.scenarios)?stored.scenarios:[],activeScenario:'base',openEditor:false,notice:'',
      response:null,error:'',loading:false,loadedAt:0};
    const captured=state;
    const client=window.IntegralERP?.sb;
    const listener=client?.auth.onAuthStateChange?.((_event,session)=>{
      if(state!==captured||session?.user?.id===captured.actor)return;
      captured.response=null;
      if(onPlanning())q('[data-planning-panel]')?.replaceChildren();
      q('[data-planning-detail]')?.remove();
    })?.data?.subscription;
    unsubscribe=()=>listener?.unsubscribe();
    return state;
  }

  async function fetchReceivables(active){
    if(active.loading)return;
    const client=window.IntegralERP?.sb;
    if(!active.actor||!client){active.error='Abra a sessão do ERP para consultar Recebimentos.';return;}
    active.loading=true;
    active.error='';
    const verify=async()=>{
      const {data,error}=await client.auth.getSession();
      if(error)throw error;
      if(state!==active||!admin()||actorId()!==active.actor||data?.session?.user?.id!==active.actor){
        throw Error('A sessão mudou. Abra Planejamento novamente.');
      }
    };
    try{
      await verify();
      const [parcels,clients,cities]=await Promise.all([
        shared.allPages(client,'fin_receb_parcelas','id,cliente_id,vencimento,pago_em,status,valor_previsto,valor_liquidado,juros,multa,origem_baixa,ativo'),
        shared.allPages(client,'fin_receb_clientes','id,nome,municipio_id,ativo'),
        shared.allPages(client,'fin_receb_municipios','id,nome,ativo')
      ]);
      await verify();
      active.response={parcels,clients,cities};
      active.loadedAt=Date.now();
      active.memo=null;
    }catch(error){
      if(state===active&&actorId()===active.actor)active.error=error.message||'Não foi possível consultar Recebimentos.';
    }finally{
      active.loading=false;
      if(state===active&&onPlanning()&&admin()&&q('[data-planning-panel]'))renderBody();
    }
  }

  const option=(value,label,chosen)=>`<option value="${escape(value)}"${value===chosen?' selected':''}>${escape(label)}</option>`;
  const optionSet=(options,chosen)=>Object.entries(options).map(([value,label])=>option(value,label,chosen)).join('');
  const select=(name,label,options,chosen)=>`<label>${escape(label)}<select name="${name}">${optionSet(options,chosen)}</select></label>`;
  const notice=message=>`<p class="pp-notice" role="status">${escape(message)}</p>`;
  const unavailable=message=>`<p class="pp-empty">${escape(message)}</p>`;
  const quantities=rows=>[...new Set(rows.filter(row=>row.phase==='actual').map(row=>row.status))].filter(Boolean).join(', ');
  const appliedPhase=phase=>phase==='overdue'?'open':phase;
  const canBeOverdue=row=>['operational','erp'].includes(row.scope)&&row.due&&row.due<state.today;

  function model(){
    const active=current();
    const criteria=active.criteria;
    const memo=active.memo;
    if(memo&&memo.start===criteria.start&&memo.end===criteria.end)return memo.value;
    const start=engine.validRange(criteria)?engine.previousPeriod(criteria).start:active.today;
    const end=engine.validRange(criteria)?criteria.end:active.today;
    const value=engine.createModel(database(),active.response,{today:active.today,start,end});
    active.memo={start:criteria.start,end:criteria.end,value};
    return value;
  }
  function filterInfo(){
    const {criteria}=state;
    const other=['direction','status',...engine.attributes].filter(key=>criteria[key]).map(key=>[dimensions[key]||({direction:'Direção',status:'Status'})[key],criteria[key]]);
    if(criteria.search)other.push(['Pesquisa',criteria.search]);
    return [['Origem',engine.scopes[criteria.scope]],['Data',engine.dates[criteria.dateBasis]],['Período',dateLabel(criteria.start)+' a '+dateLabel(criteria.end)],...other];
  }
  function filters(rows){
    const {criteria}=state;
    const fieldOptions=(key,rows)=>{
      const values=[...new Set(rows.map(row=>row[key]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'pt-BR'));
      if(!values.length&&!criteria[key])return '';
      const selected=criteria[key]||'';
      if(selected&&!values.includes(selected))values.push(selected);
      return select(key,dimensions[key],Object.fromEntries([['','Todos'],...values.map(value=>[value,value])]),selected);
    };
    const status=[...new Set(rows.map(row=>row.status))].sort();
    return `<form id="pp-filters" class="pp-filter card">
      <div class="pp-filter-grid">
        ${select('scope','Fonte',engine.scopes,criteria.scope)}
        ${select('dateBasis','Tipo de data',engine.dates,criteria.dateBasis)}
        <label>De<input type="date" required name="start" value="${escape(criteria.start)}"></label>
        <label>Até<input type="date" required name="end" value="${escape(criteria.end)}"></label>
        <label class="pp-search">Buscar por descrição ou ID<input type="search" name="search" value="${escape(criteria.search)}"></label>
        ${select('direction','Direção',{'':'Entradas e saídas',Entrada:'Entradas','Saída':'Saídas'},criteria.direction)}
        ${select('status','Status',Object.fromEntries([['','Todos'],...status.map(value=>[value,value])]),criteria.status)}
      </div>
      <div class="pp-shortcuts" aria-label="Atalhos do período">${Object.entries(shortcuts).map(([key,label])=>`<button type="button" class="btn ghost small" data-pp-period="${key}">${label}</button>`).join('')}</div>
      <details${state.expanded?' open':''}><summary>Mais filtros</summary><div class="pp-filter-grid">${engine.attributes.map(key=>fieldOptions(key,rows)).join('')||'<p>Os campos adicionais aparecem quando a fonte tem dados.</p>'}</div></details>
      <div class="pp-filter-foot"><button class="btn" type="submit">Aplicar filtros</button><button type="button" class="btn ghost" data-pp-action="clear">Limpar filtros</button>
      <button type="button" class="btn ghost" data-pp-action="save-favorite">Salvar visão favorita</button>
      ${state.favorite?'<button type="button" class="btn ghost" data-pp-action="load-favorite">Usar favorita</button>':''}</div>
    </form>
    <ul class="pp-chips" aria-label="Filtros ativos">${filterInfo().map(([label,value])=>`<li><b>${escape(label)}</b> ${escape(value)}</li>`).join('')}</ul>`;
  }

  function phaseSelector(){
    return select('phase','Indicador',phaseLabels[state.phase]?phaseLabels:{expected:phaseLabels.expected},state.phase);
  }
  function basisDescription(viewModel){
    const notices=[];
    if(state.criteria.scope==='operational'){
      if(state.loading)notices.push('Consultando as parcelas de Recebimentos.');
      if(state.error)notices.push('Recebimentos indisponível. '+state.error);
      if(!viewModel.operationalComplete)notices.push('Os indicadores de entrada de Recebimentos aguardam a leitura completa da fonte.');
      else if(state.loadedAt)notices.push('Recebimentos consultado às '+new Date(state.loadedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}));
      if(state.error&&viewModel.operationalComplete)notices.push('A tela mostra os dados da última leitura concluída nesta sessão.');
    }
    if(state.criteria.scope==='erp')notices.push('O ERP fornece um retrato das parcelas de contratos abertas. Última sincronização registrada '+(database().lastErpFinancialSync?dateLabel(String(database().lastErpFinancialSync).slice(0,10)):'indisponível')+'.');
    if(state.criteria.scope==='manual')notices.push('As parcelas seguem o dia de vencimento informado, com ajuste ao último dia em meses mais curtos.');
    if(state.criteria.scope==='payroll')notices.push('A folha projetada usa o valor contratual vigente no mês. O primeiro dia é uma referência mensal, sem data de pagamento confirmada.');
    if(state.criteria.scope==='cash')notices.push('Esta visão usa extratos e lançamentos próprios do Fluxo de Caixa. Baixas de Contas e despesas derivadas de Orçamentos têm registros de origem próprios.');
    if(state.criteria.dateBasis==='competence')notices.push('Competências mensais são incluídas quando o período toca o mês indicado. A competência indisponível fica fora do filtro.');
    return notices.map(notice).join('');
  }

  function metricAvailability(direction,phase,summary){
    const scope=state.criteria.scope;
    if(scope==='operational'&&direction==='Entrada'&&!state.response)return null;
    if(scope==='cash'&&phase!=='actual'||['manual','payroll'].includes(scope)&&phase==='overdue')return null;
    if(['erp','manual','payroll'].includes(scope)&&phase==='actual')return null;
    if(direction==='Saída'&&scope==='erp'||direction==='Entrada'&&scope==='payroll')return null;
    return direction==='Entrada'?summary.incoming:summary.outgoing;
  }
  function overview(rows,previous){
    const kpis=[['expected','Entrada','Entradas previstas'],['expected','Saída','Saídas previstas'],
      ['actual','Entrada','Recebimentos registrados'],['actual','Saída','Pagamentos registrados'],
      ['overdue','Entrada','Recebimentos vencidos'],['overdue','Saída','Contas vencidas']];
    const available=kpis.map(([phase,direction,label])=>{
      if(state.criteria.direction&&state.criteria.direction!==direction)return '';
      const shown=phase==='overdue'?rows.filter(canBeOverdue):rows;
      const summary=engine.totals(shown,appliedPhase(phase));
      const value=metricAvailability(direction,phase,summary);
      const source=phase==='expected'?'Títulos e previsões no vencimento, incluindo os quitados':phase==='actual'?'Data do evento registrado e limitada a hoje':'Saldo atual dentro do período, com vencimento anterior a hoje';
      return `<button type="button" class="card pp-kpi" data-pp-kpi="${phase}" data-direction="${direction}"${value===null?' disabled':''}><span>${label}</span><strong>${money(value)}</strong><small>${value===null?'Fonte indisponível para este indicador':source}</small></button>`;
    }).join('');
    const expected=engine.totals(rows,'expected'),actual=engine.totals(rows,'actual'),prior=engine.totals(previous,'actual');
    const net=(phase,total)=>{
      if(state.criteria.direction||metricAvailability('Entrada',phase,total)==null||metricAvailability('Saída',phase,total)==null)return null;
      return total.net;
    };
    const realizedNet=net('actual',actual),priorNet=net('actual',prior);
    const samePeriod=engine.previousPeriod(state.criteria);
    const comp=priorNet==null||realizedNet==null||!prior.count?'Comparação anterior indisponível':money(realizedNet-priorNet)+' de variação na movimentação líquida';
    const payroll=rows.filter(row=>row.phase==='open'&&row.recurring);
    const openDates=engine.grouped(rows.filter(row=>row.due).map(row=>({...row,displayDate:row.due})),'day','open').sort((a,b)=>b.outgoing-a.outgoing);
    const peak=openDates[0];
    const projections=engine.totals(rows.filter(row=>row.date>=state.today),'open');
    const forecast=net('open',projections);
    return `<div class="pp-kpis">${available}</div>
    <section class="card pp-summary-lines"><div><span>Diferença prevista</span><strong>${money(net('expected',expected))}</strong><small>Entradas menos saídas previstas no período</small></div>
    <div><span>Movimentação líquida registrada</span><strong>${money(realizedNet)}</strong><small>${comp} · ${dateLabel(samePeriod.start)} a ${dateLabel(samePeriod.end)}</small></div>
    <div><span>Compromissos recorrentes em aberto</span><strong>${money(payroll.filter(row=>row.direction==='Saída').reduce((sum,row)=>sum+row.amount,0))}</strong><small>Recorrências identificadas na fonte selecionada</small></div></section>
    <section class="card pp-comparison"><h3>Previsto e registrado no período</h3><div class="pp-table"><table><thead><tr><th>Direção</th><th>Previsto</th><th>Registrado</th></tr></thead><tbody>${['Entrada','Saída'].filter(direction=>!state.criteria.direction||state.criteria.direction===direction).map(direction=>`<tr><td>${direction}</td><td>${money(metricAvailability(direction,'expected',expected))}</td><td>${money(metricAvailability(direction,'actual',actual))}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted">A comparação usa as datas indicadas nos filtros. Baixas posteriores podem alterar o período histórico. Não há saldo de abertura conciliado nesta visão.</p></section>
    <section class="card pp-alerts"><h3>Concentração e projeção</h3><p>${peak?.outgoing?`Maior concentração de saídas em aberto em <button type="button" class="btn ghost small" data-pp-day="${peak.key}">${dateLabel(peak.key)}</button> · <strong>${money(peak.outgoing)}</strong>`:'Sem concentração de saídas em aberto no recorte.'}</p>
    <p>Movimentação líquida futura dos itens em aberto <strong>${money(forecast)}</strong>${forecast<0?' · saídas superam entradas nos itens selecionados.':''}</p></section>
    ${chartSection(rows)}`;
  }

  function chartSection(rows){
    const phase=appliedPhase(state.phase);
    const grouped=engine.grouped(state.phase==='overdue'?rows.filter(canBeOverdue):rows,state.mode,phase);
    const maximum=Math.max(1,...grouped.flatMap(row=>[row.incoming,row.outgoing]));
    return `<section class="card pp-chart-box"><div class="pp-head"><h3>Evolução de entradas e saídas</h3><div>${phaseSelector()}
      ${select('mode','Agrupar por',{day:'Dia',week:'Semana',month:'Mês',year:'Ano'},state.mode)}
      <button type="button" class="btn ghost small" aria-pressed="${!state.chart}" data-pp-action="chart">${state.chart?'Ver tabela':'Ver gráfico'}</button></div></div>
      <p>Valores em reais · pico de ${money(maximum===1&&!grouped.length?0:maximum)} · ${grouped.length} períodos com itens</p>
      ${!grouped.length?unavailable('Nenhum item no indicador selecionado.'):state.chart?`<ul class="pp-chart" aria-label="Entradas e saídas por período">${grouped.map(group=>`<li><b>${dateLabel(group.key)}</b><div><span>Entrada</span><i class="pp-bar pp-in" style="--pp-value:${group.incoming/maximum*100}%"></i><strong>${money(group.incoming)}</strong></div><div><span>Saída</span><i class="pp-bar pp-out" style="--pp-value:${group.outgoing/maximum*100}%"></i><strong>${money(group.outgoing)}</strong></div></li>`).join('')}</ul>`:
        `<div class="pp-table"><table><thead><tr><th>Período</th><th>Entradas</th><th>Saídas</th><th>Diferença</th></tr></thead><tbody>${grouped.map(group=>`<tr><td>${dateLabel(group.key)}</td><td>${money(group.incoming)}</td><td>${money(group.outgoing)}</td><td>${money(group.net)}</td></tr>`).join('')}</tbody></table></div>`}
    </section>`;
  }

  function visiblePhase(rows){
    const phase=appliedPhase(state.phase);
    return rows.filter(row=>row.phase===phase&&(state.phase!=='overdue'||canBeOverdue(row)));
  }
  function sortRows(rows){
    return [...rows].sort((a,b)=>{
      if(state.sort==='amount')return b.amount-a.amount;
      if(state.sort==='name')return a.description.localeCompare(b.description,'pt-BR');
      return a.displayDate.localeCompare(b.displayDate)||a.id.localeCompare(b.id);
    });
  }
  function rowsTable(rows){
    return `<div class="pp-table"><table><thead><tr><th>Data</th><th>Lançamento</th><th>Categoria e local</th><th>Origem</th><th>Estado</th><th>Valor</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${dateLabel(row.displayDate)}</td>
      <td><button type="button" class="btn ghost small pp-row-link" data-pp-row="${escape(row.key)}">${escape(row.description)}</button><small>${escape(row.id)}</small></td>
      <td>${escape([row.category,row.center,row.project,row.city].filter(Boolean).join(' · ')||'—')}<small>${escape(row.person||'')}</small></td><td>${escape(row.source)}</td>
      <td>${escape(row.status)}</td><td>${money(row.amount)}<small>${escape(row.direction)}</small></td></tr>`).join('')}</tbody></table></div>`;
  }
  function entries(rows){
    const filtered=sortRows(visiblePhase(rows));
    const grouping=state.group;
    const compositions=new Map();
    if(grouping)for(const row of filtered){
      const label=row[grouping]||'Sem informação';
      if(!compositions.has(label))compositions.set(label,[]);
      compositions.get(label).push(row);
    }
    const list=grouping?[...compositions].sort((a,b)=>b[1].reduce((s,x)=>s+x.amount,0)-a[1].reduce((s,x)=>s+x.amount,0)):filtered;
    const limit=grouping?10:25;
    const count=Math.max(1,Math.ceil(list.length/limit));
    state.page=Math.min(state.page,count-1);
    const page=list.slice(state.page*limit,state.page*limit+limit);
    const groups=Object.fromEntries([['','Sem agrupamento'],...Object.entries(dimensions).filter(([key])=>rows.some(row=>row[key]))]);
    const summary=engine.totals(filtered,appliedPhase(state.phase));
    return `<section class="card pp-entries"><div class="pp-head"><h3>Lançamentos</h3><div>${phaseSelector()}${select('sort','Ordenação',{date:'Data',amount:'Maior valor',name:'Descrição'},state.sort)}${select('group','Composição',groups,state.group)}</div></div>
    <p>${filtered.length} itens · Entradas ${money(summary.incoming)} · Saídas ${money(summary.outgoing)}${state.phase==='actual'&&quantities(filtered)?' · '+escape(quantities(filtered)):''}</p>
    ${!list.length?unavailable('Nenhum lançamento no recorte.'):grouping?page.map(([label,items])=>{
      const t=engine.totals(items,appliedPhase(state.phase));
      return `<details class="pp-composition"><summary><b>${escape(label)}</b><span>${items.length} itens · E ${money(t.incoming)} · S ${money(t.outgoing)}</span></summary>${rowsTable(items.slice(0,25))}
        ${items.length>25?`<button type="button" class="btn ghost small" data-pp-group="${escape(label)}">Ver todos no filtro</button>`:''}</details>`;
    }).join(''):rowsTable(page)}
    ${count>1?`<div class="pp-page"><button type="button" class="btn ghost" data-pp-page="-1"${state.page===0?' disabled':''}>Anterior</button><span>Página ${state.page+1} de ${count}</span><button type="button" class="btn ghost" data-pp-page="1"${state.page+1===count?' disabled':''}>Próxima</button></div>`:''}
    </section>`;
  }

  function calendar(rows){
    const cursor=state.calendarMonth+'-01';
    const last=Number(engine.lastMonthDay(cursor).slice(-2));
    const offset=(new Date(cursor+'T00:00:00Z').getUTCDay()+6)%7;
    const visible=visiblePhase(rows).filter(row=>row.displayDate.length===10);
    const cells=engine.grouped(visible,'day',appliedPhase(state.phase));
    const dayMap=new Map(cells.map(row=>[row.key,row]));
    const picked=dayMap.get(state.picked);
    return `<section class="card pp-calendar"><div class="pp-head"><div><button class="btn ghost small" data-pp-month="-1" aria-label="Mês anterior">‹</button> <h3>${dateLabel(state.calendarMonth)}</h3> <button class="btn ghost small" data-pp-month="1" aria-label="Próximo mês">›</button></div>${phaseSelector()}</div>
    <div class="pp-calendar-grid">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(day=>`<b>${day}</b>`).join('')}${'<span></span>'.repeat(offset)}
    ${Array.from({length:last},(_,index)=>{
      const day=state.calendarMonth+'-'+String(index+1).padStart(2,'0');
      const counts=dayMap.get(day);
      return `<button type="button" data-pp-day="${day}" aria-label="${dateLabel(day)}${counts?', entradas '+money(counts.incoming)+', saídas '+money(counts.outgoing):''}" aria-pressed="${state.picked===day}"><b>${index+1}</b>${counts?`<small>E ${money(counts.incoming)}</small><small>S ${money(counts.outgoing)}</small>`:''}</button>`;
    }).join('')}</div>
    ${state.criteria.dateBasis==='competence'?notice('Competências com informação apenas mensal ficam disponíveis na tabela.'):''}
    ${state.picked?`<h4>${dateLabel(state.picked)}</h4>${picked?rowsTable(picked.items):unavailable('Sem lançamentos para este dia no recorte.')}`:unavailable('Selecione uma data para ver os lançamentos.')}
    </section>`;
  }

  function scenarioEditor(scenario){
    return `<form id="pp-scenario-form" class="pp-filter-grid">
      <label>Nome do cenário<input name="name" maxlength="60" required value="${escape(scenario.name||'')}"></label>
      <label>Variação de entrada (%)<input name="incoming" type="number" min="-100" max="500" required value="${scenario.incoming}"></label>
      <label>Variação de saída (%)<input name="outgoing" type="number" min="-100" max="500" required value="${scenario.outgoing}"></label>
      <label>Ajuste de entrada (dias)<input name="incomingDelay" type="number" min="-365" max="365" required value="${scenario.incomingDelay}"></label>
      <label>Ajuste de saída (dias)<input name="outgoingDelay" type="number" min="-365" max="365" required value="${scenario.outgoingDelay}"></label>
      <label>Valor hipotético por ocorrência (R$)<input name="extraAmount" type="number" min="0" max="1000000000" step=".01" value="${scenario.extraAmount/100}"></label>
      ${select('extraDirection','Direção da ocorrência',{Entrada:'Entrada','Saída':'Saída'},scenario.extraDirection)}
      <label>Primeira ocorrência<input name="extraDate" type="date" value="${escape(scenario.extraDate)}"></label>
      <label>Número de ocorrências mensais<input name="extraMonths" type="number" min="1" max="36" required value="${scenario.extraMonths}"></label>
      <button class="btn" type="submit">Salvar cenário</button>
    </form>`;
  }
  function scenarioProjection(input,scenario){
    const {criteria}=state;
    const allowsHypotheses=!criteria.status&&!criteria.search&&engine.attributes.every(key=>!criteria[key]);
    return engine.projection(input,scenario,state.today).filter(row=>row.date>=criteria.start&&row.date<=criteria.end
      &&(row.source!=='Simulação'||allowsHypotheses&&(!criteria.direction||criteria.direction===row.direction)));
  }
  function scenarios(allRows){
    const {criteria}=state;
    const input=engine.selectRows(allRows,{...criteria,dateBasis:'due'},true);
    const active=[...presets,...state.scenarios.filter(item=>!item.archived)];
    const selected=active.find(item=>item.id===state.activeScenario)||presets[0];
    const compare=scenario=>scenarioProjection(input,scenario);
    const base=engine.totals(compare(presets[0]),'open');
    const projected=compare(selected);
    return `<section class="card pp-scenarios">
      <div class="pp-head"><h3>Comparar cenários</h3><button type="button" class="btn ghost" data-pp-action="new-scenario">Novo cenário</button></div>
      <p>Simulações no navegador. O ponto de partida é o saldo em aberto dos vencimentos de hoje em diante, na fonte e nos filtros selecionados. Variações alteram valor e data só nesta visão.</p>
      <div class="pp-table"><table><thead><tr><th>Cenário</th><th>Entradas futuras</th><th>Saídas futuras</th><th>Movimentação líquida</th><th>Diferença para base</th></tr></thead><tbody>
      ${active.map(item=>{
        const sum=engine.totals(compare(item),'open');
        return `<tr><td><button type="button" class="btn ghost small" data-pp-scenario="${escape(item.id)}" aria-pressed="${item.id===selected.id}">${escape(item.name)}</button></td><td>${money(sum.incoming)}</td><td>${money(sum.outgoing)}</td><td>${money(sum.net)}</td><td>${money(sum.net-base.net)}</td></tr>`;
      }).join('')}</tbody></table></div>
      <h4>${escape(selected.name)}</h4><p>Entradas ${selected.incoming}% e ajuste de ${selected.incomingDelay} dias. Saídas ${selected.outgoing}% e ajuste de ${selected.outgoingDelay} dias.${selected.extraAmount?` Inclui ${selected.extraMonths} ocorrência(s) hipotética(s) de ${money(selected.extraAmount)}.`:''}</p>
      <p>Eventos no recorte ${projected.length}. ${engine.totals(projected,'open').net<0?'O cenário tem movimentação líquida negativa no período.':'A projeção mostra a movimentação líquida do recorte.'}</p>
      ${state.scenarios.some(item=>item.id===selected.id)?`<button class="btn ghost small" data-pp-action="edit-scenario">Editar</button> <button class="btn ghost small" data-pp-action="archive-scenario">Arquivar</button>`:''}
      <div class="pp-export"><button type="button" class="btn ghost small" data-pp-sim-export="csv">Exportar cenário em CSV</button>
      <button type="button" class="btn ghost small" data-pp-sim-export="xlsx">Exportar cenário em Excel</button></div>
      ${state.openEditor?scenarioEditor(state.openEditor):''}
      ${state.scenarios.some(item=>item.archived)?`<details><summary>Cenários arquivados</summary>${state.scenarios.filter(item=>item.archived).map(item=>`<p>${escape(item.name)} <button type="button" class="btn ghost small" data-pp-restore="${escape(item.id)}">Recuperar</button></p>`).join('')}</details>`:''}
    </section>`;
  }

  function originalTarget(row){
    if(row.scope==='cash')return 'cashflow';
    if(row.source==='Contas')return 'accounts';
    if(row.source==='Recebimentos')return 'recebimentos';
    return '';
  }
  function detail(row){
    if(!row||!admin())return;
    q('[data-planning-detail]')?.remove();
    const modal=document.createElement('dialog');
    modal.dataset.planningDetail='true';
    const target=originalTarget(row);
    const attributes=[['Identificação',row.id],['Origem',row.source],['Valor',money(row.amount)],['Situação',row.status],
      ['Data do evento',dateLabel(row.date)],['Vencimento',dateLabel(row.due)],['Competência',dateLabel(row.competence)],
      ['Vínculo identificado',row.reference],...Object.entries(dimensions).filter(([key])=>key!=='source').map(([key,label])=>[label,row[key]])];
    modal.innerHTML=`<div class="pp-modal-body"><h3>${escape(row.description)}</h3><dl>${attributes.filter(([,value])=>value).map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
      <div><button type="button" class="btn" data-close>Fechar</button>
      ${target?`<button type="button" class="btn ghost" data-original>Abrir aba de origem</button>`:''}</div></div>`;
    modal.addEventListener('close',()=>modal.remove(),{once:true});
    q('[data-close]',modal).onclick=()=>modal.close();
    const go=q('[data-original]',modal);
    if(go)go.onclick=()=>{
      if(!admin())return;
      const nav=q(`[data-view="${target}"]`);
      if(nav){modal.close();nav.click();}
      else go.disabled=true;
    };
    document.body.append(modal);
    modal.showModal();
  }

  function exportRows(data,format,scenario){
    const rows=sortRows(scenario?data:visiblePhase(data));
    if(!rows.length)throw Error('Selecione lançamentos para exportar.');
    const metadata=[['Planejamento financeiro'],['Gerado em',new Date().toLocaleString('pt-BR')],...filterInfo().map(row=>scenario&&row[0]==='Data'?['Data','Vencimento simulado']:row),
      ['Indicador',scenario?'Simulação - '+scenario.name:phaseLabels[state.phase]],
      ...(scenario?[['Premissas',JSON.stringify({entradas_pct:scenario.incoming,saidas_pct:scenario.outgoing,entradas_dias:scenario.incomingDelay,saidas_dias:scenario.outgoingDelay,valor_hipotetico:scenario.extraAmount/100,primeira_ocorrencia:scenario.extraDate,ocorrencias:scenario.extraMonths})]]:[]),['Fonte',Array.from(new Set(rows.map(row=>row.source))).join(', ')]];
    const headers=['Data selecionada','Vencimento','Competência','Pagamento','Recebimento','ID','Descrição','Direção','Valor (R$)','Status','Evidência',
      'Origem',...Object.values(dimensions).filter(label=>label!=='Fonte')];
    const items=rows.map(row=>[row.displayDate,row.due||'',row.competence||'',row.paid||'',row.received||'',row.id,row.description,
      row.direction,row.amount/100,row.status,row.evidence||'',row.source,...Object.keys(dimensions).filter(key=>key!=='source').map(key=>row[key]||'')]);
    const filename='planejamento-'+state.criteria.start+'-'+state.criteria.end;
    if(format==='csv'){
      const contents=engine.csv([...metadata,[],headers,...items.map(row=>row.map((value,index)=>index===8?value.toFixed(2).replace('.',','):value))]);
      const url=URL.createObjectURL(new Blob([contents],{type:'text/csv;charset=utf-8'}));
      const link=document.createElement('a');
      link.href=url;link.download=filename+'.csv';document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      return;
    }
    if(format==='xlsx'){
      const xlsx=window.XLSX;
      if(!xlsx)throw Error('Exportação Excel indisponível. Use a versão CSV.');
      const book=xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet(metadata),'Filtros');
      xlsx.utils.book_append_sheet(book,xlsx.utils.aoa_to_sheet([headers,...items]),'Lançamentos');
      xlsx.writeFile(book,filename+'.xlsx');
      return;
    }
    if(rows.length>1500)throw Error('Para mais de 1.500 itens, use CSV ou Excel.');
    const PDF=window.jspdf?.jsPDF;
    if(!PDF)throw Error('Exportação PDF indisponível.');
    const pdf=new PDF({orientation:'landscape',format:'a4'});
    // O AutoTable 3.5.4 usa a API antiga do jsPDF. Adapte apenas este documento.
    if(typeof pdf.setFontStyle!=='function')pdf.setFontStyle=style=>pdf.setFont(pdf.getFont().fontName,style);
    const selectedColumns=[0,5,6,7,8,9,11];
    pdf.setFontSize(14);
    pdf.text('Planejamento financeiro',14,18);
    pdf.setFontSize(9);
    const context=pdf.splitTextToSize(metadata.slice(1).map(row=>row.join(' — ')).join(' · '),265);
    pdf.text(context,14,26);
    const table={startY:30+4*context.length,head:[selectedColumns.map(index=>headers[index])],
      body:items.map(row=>selectedColumns.map(index=>index===8?amount.format(row[index]):row[index])),styles:{fontSize:8}};
    if(typeof pdf.autoTable==='function')pdf.autoTable(table);
    else if(typeof window.__createTable==='function'&&typeof window.__drawTable==='function'){
      window.__drawTable(pdf,window.__createTable(pdf,table));
    }else throw Error('Exportação PDF indisponível.');
    pdf.save(filename+'.pdf');
  }

  function scenarioValues(form){
    const values=new FormData(form);
    const range=(name,min,max)=>Math.max(min,Math.min(max,Math.trunc(Number(values.get(name))||0)));
    const name=String(values.get('name')||'').trim();
    if(!name)throw Error('Informe o nome do cenário.');
    const extraAmount=shared.cents(values.get('extraAmount'));
    const extraDate=shared.dateKey(values.get('extraDate'));
    if(extraAmount>0&&!extraDate)throw Error('Informe a primeira data da ocorrência hipotética.');
    return {name,id:state.openEditor.id||crypto.randomUUID(),
      incoming:range('incoming',-100,500),outgoing:range('outgoing',-100,500),
      incomingDelay:range('incomingDelay',-365,365),outgoingDelay:range('outgoingDelay',-365,365),
      extraMonths:range('extraMonths',1,36),extraAmount,extraDate,extraDirection:values.get('extraDirection')};
  }
  function producer(name){
    if(name==='clear'){
      state.criteria={scope:'operational',dateBasis:'event',direction:'',status:'',search:'',...engine.period('month',state.today)};
      state.phase='expected';state.page=0;state.group='';
    }else if(name==='save-favorite'){
      state.favorite={...state.criteria};
      state.notice=writePrefs()?'Visão favorita salva neste navegador.':'O navegador não conseguiu guardar a visão favorita.';
    }else if(name==='load-favorite'){
      state.criteria={...state.favorite};state.page=0;
    }else if(name==='chart')state.chart=!state.chart;
    else if(name==='projection'){
      window.planningCanonical();
      return;
    }else if(name==='manual'){
      window.IntegralPlanningManual?.render();
      return;
    }else if(name==='reload'){
      state.memo=null;
      fetchReceivables(state);
    }else if(name==='new-scenario')state.openEditor={...scenarioDefaults};
    else if(name==='edit-scenario')state.openEditor={...state.scenarios.find(item=>item.id===state.activeScenario)};
    else if(name==='archive-scenario'){
      const scenario=state.scenarios.find(item=>item.id===state.activeScenario);
      if(scenario)scenario.archived=true;
      state.activeScenario='base';state.openEditor=false;
      state.notice=writePrefs()?'Cenário arquivado.':'O navegador não conseguiu guardar o arquivamento.';
    }
    renderBody();
  }
  function renderBody(){
    const host=q('[data-planning-panel]');
    if(!host||!admin()||actorId()!==state.actor)return;
    const data=model();
    const criteria=state.criteria;
    const valid=engine.validRange(criteria);
    const rows=valid?engine.selectRows(data.rows,criteria):[];
    const prior=valid?engine.selectRows(data.rows,{...criteria,...engine.previousPeriod(criteria)}):[];
    const scopeRows=data.rows.filter(row=>row.scope===criteria.scope);
    const knownScope=criteria.scope==='operational'?Boolean(state.response||scopeRows.length):Boolean(scopeRows.length);
    const dispositions={summary:()=>overview(rows,prior),entries:()=>entries(rows),calendar:()=>calendar(rows),scenarios:()=>scenarios(data.rows)};
    host.innerHTML=`<div class="pp-toolbar"><p>Compare vencimentos, registros e projeções das fontes autorizadas.</p><div>
      <button class="btn ghost" data-pp-action="projection">← Projeção mensal</button>
      <button class="btn ghost" data-pp-action="manual">Gerenciar previsões</button>
      <button class="btn ghost" data-pp-action="reload"${state.loading?' disabled':''}>Atualizar dados</button>
    </div></div>
    ${filters(scopeRows)}
    ${state.notice?notice(state.notice):''}
    ${basisDescription(data)}
    ${data.excluded.transfers||data.excluded.missingDates||data.excluded.divergent||data.excluded.missingFields?
      `<details class="pp-quality"><summary>Qualidade dos dados analisados</summary><p>Ocorrências nas fontes consultadas, antes dos filtros. ${data.excluded.transfers} transferências internas identificadas e retiradas, ${data.excluded.missingDates} eventos sem data, ${data.excluded.divergent} registros de Caixa com divergência de conciliação e ${data.excluded.missingFields} valores ausentes.</p></details>`:''}
    <div class="pp-tabs" aria-label="Visões do Planejamento">${Object.entries(views).map(([key,label])=>`<button type="button" class="btn ghost" data-pp-tab="${key}" aria-pressed="${state.tab===key}">${label}</button>`).join('')}</div>
    ${!valid?unavailable('Informe um período válido de até 366 dias.'):!knownScope?unavailable('A fonte selecionada está sem dados disponíveis.'):dispositions[state.tab]()}
    ${valid&&state.tab==='entries'?`<div class="pp-export"><button type="button" class="btn ghost small" data-pp-export="csv">Exportar CSV</button>
      <button type="button" class="btn ghost small" data-pp-export="xlsx">Exportar Excel</button><button type="button" class="btn ghost small" data-pp-export="pdf">Exportar PDF</button></div>`:''}`;
    const filterForm=q('#pp-filters',host);
    filterForm.onsubmit=event=>{
      event.preventDefault();
      const selected=Object.fromEntries(new FormData(filterForm));
      state.expanded=Boolean(q('details',filterForm)?.open);
      const scopeChanged=state.criteria.scope!==selected.scope;
      state.criteria=scopeChanged?{...selected,...Object.fromEntries(engine.attributes.map(key=>[key,''])),status:''}:selected;
      if(scopeChanged)state.phase=selected.scope==='cash'?'actual':'expected';
      if(selected.dateBasis==='competence'&&['day','week'].includes(state.mode))state.mode='month';
      state.page=0;state.picked='';
      if(shared.dateKey(selected.start))state.calendarMonth=selected.start.slice(0,7);
      renderBody();
    };
    const details=q('details',filterForm);
    details.ontoggle=()=>{state.expanded=details.open;};
    function buttonHandler(event){
      const button=event.target.closest('button');
      if(!button||!host.contains(button)||!admin()||actorId()!==state.actor)return;
      const action=button.dataset;
      if(action.ppAction)return producer(action.ppAction);
      if(action.ppPeriod){
        const other=Object.fromEntries(new FormData(filterForm));
        Object.assign(state.criteria,other,engine.period(action.ppPeriod,state.today));
        if(state.criteria.scope==='cash')state.phase='actual';
        state.calendarMonth=state.criteria.start.slice(0,7);state.picked='';state.page=0;
      }else if(action.ppTab){
        state.tab=action.ppTab;state.page=0;
        if(state.tab==='calendar'&&!state.picked)state.calendarMonth=state.criteria.start.slice(0,7);
      }else if(action.ppKpi){
        state.phase=action.ppKpi;state.criteria.direction=action.direction;state.tab='entries';state.page=0;
      }else if(action.ppPage)state.page+=Number(action.ppPage);
      else if(action.ppDay){
        if(state.tab==='summary'){state.phase='open';state.tab='calendar';}
        state.calendarMonth=action.ppDay.slice(0,7);state.picked=action.ppDay;
      }else if(action.ppMonth){
        const month=engine.shiftMonths(state.calendarMonth+'-01',Number(action.ppMonth));
        state.calendarMonth=month.slice(0,7);
        state.picked='';
      }else if(action.ppScenario){state.activeScenario=action.ppScenario;state.openEditor=false;}
      else if(action.ppRestore){
        const scenario=state.scenarios.find(item=>item.id===action.ppRestore);
        if(scenario)scenario.archived=false;
        state.notice=writePrefs()?'Cenário recuperado.':'O navegador não conseguiu guardar a recuperação.';
      }else if(action.ppGroup){
        if(action.ppGroup==='Sem informação'){
          state.notice='A composição inclui itens sem este campo. Use a tabela para abrir cada lançamento.';
          state.group='';
        }else{state.criteria[state.group]=action.ppGroup;state.group='';}
        state.page=0;
      }else if(action.ppRow){return detail(rows.find(row=>row.key===action.ppRow));}
      else if(action.ppSimExport){
        const scenario=[...presets,...state.scenarios].find(item=>!item.archived&&item.id===state.activeScenario)||presets[0];
        const input=engine.selectRows(data.rows,{...criteria,dateBasis:'due'},true);
        try{exportRows(scenarioProjection(input,scenario),action.ppSimExport,scenario);}
        catch(error){state.notice=error.message;renderBody();}
        return;
      }else if(action.ppExport){
        try{exportRows(rows,action.ppExport);}
        catch(error){state.notice=error.message;renderBody();}
        return;
      }else return;
      renderBody();
    }
    host.onclick=buttonHandler;
    host.onchange=event=>{
      const field=event.target;
      if(filterForm.contains(field))return;
      if(['mode','phase','sort','group'].includes(field.name)&&!field.form){
        state[field.name]=field.value;state.page=0;renderBody();
      }
    };
    const scenarioForm=q('#pp-scenario-form',host);
    if(scenarioForm)scenarioForm.onsubmit=event=>{
      event.preventDefault();
      try{
        const scenario=scenarioValues(scenarioForm);
        state.scenarios=[...state.scenarios.filter(item=>item.id!==scenario.id),scenario];
        state.activeScenario=scenario.id;state.openEditor=false;
        state.notice=writePrefs()?'Cenário salvo neste navegador.':'O navegador não conseguiu guardar o cenário. Ele está disponível nesta sessão.';
      }catch(error){state.notice=error.message;}
      renderBody();
    };
  }

  window.IntegralPlanningPanel={
    render(){
      if(!admin())return false;
      const host=q('#content');
      if(!host)return false;
      if(typeof title==='function')title('Planejamento');
      const active=current();
      active.memo=null;
      host.innerHTML='<div class="pp-panel" data-planning-panel></div>';
      if(!active.loadedAt||Date.now()-active.loadedAt>120000)void fetchReceivables(active);
      renderBody();
      return true;
    }
  };
})();
