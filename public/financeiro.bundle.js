/* Integral Financeiro - bundle consolidado. Fontes originais mantidas no repositório para histórico. */window.__INTEGRAL_FINANCEIRO_BUNDLE_VERSION__='2026.08.24-v1';
/* ===== SOURCE: app.js ===== */
const $=(q)=>document.querySelector(q), $$=(q)=>[...document.querySelectorAll(q)], money=(n)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}), fmt=(d)=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR'), esc=(s='')=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const seed={accounts:[{id:1,desc:'INSS - Agosto',cat:'Impostos',supplier:'Receita Federal',value:18450,due:'2026-08-21',method:'Boleto',sector:'Administrativo',status:'Vence hoje',barcode:'85800000000123456789012345678901234567890123'},{id:2,desc:'Aluguel escritório',cat:'Custos fixos',supplier:'Imobiliária Central',value:6800,due:'2026-08-25',method:'PIX',sector:'Administrativo',status:'A vencer'},{id:3,desc:'Seguro veículos',cat:'Seguros',supplier:'Seguradora Sul',value:3220,due:'2026-08-18',method:'Boleto',sector:'Topografia',status:'Vencida',barcode:'34191790010104351004791020150008291070026000'},{id:4,desc:'Licenças de software',cat:'Software',supplier:'Fornecedores SaaS',value:4490,due:'2026-08-10',method:'Cartão',sector:'Projetos',status:'Paga'}],docs:[{id:1,name:'NF-20882.pdf',type:'Nota Fiscal',supplier:'Auto Posto Vale',date:'2026-08-18',cat:'Combustível',sector:'Topografia',value:412.80,status:'Confirmado'},{id:2,name:'cupom-restaurante.jpg',type:'Cupom',supplier:'Restaurante Central',date:'2026-08-18',cat:'Alimentação',sector:'Topografia',value:84.50,status:'Confirmado'},{id:3,name:'pix-hotel.pdf',type:'Comprovante',supplier:'Hotel Serra Azul',date:'2026-08-19',cat:'Hospedagem',sector:'Topografia',value:740,status:'Revisar IA'}],budgets:[{sector:'Projetos',limit:30000,spent:21400},{sector:'Topografia',limit:45000,spent:39500},{sector:'Comercial',limit:20000,spent:9300},{sector:'Administrativo',limit:25000,spent:18000}],trips:[{id:1,city:'Itaiópolis/SC',period:'12–14 ago',employee:'Lucas + Carlos',sector:'Topografia',project:'REURB Cohab I',declared:1824.60,proven:1824.60,status:'Aprovada'},{id:2,city:'Taió/SC',period:'18 ago',employee:'João',sector:'Projetos',project:'Plano Diretor',declared:482.30,proven:459.42,status:'Divergência'}],plans:[{month:'Set/26',income:310000,out:220000},{month:'Out/26',income:260000,out:240000},{month:'Nov/26',income:180000,out:270000},{month:'Dez/26',income:420000,out:310000},{month:'Jan/27',income:335000,out:252000},{month:'Fev/27',income:300000,out:245000}],revenues:[{id:1,name:'Carnê - Núcleo Jardim América',total:120000,kind:'Carnê',installments:24,start:'2026-09-10',monthly:5000},{id:2,name:'Prefeitura de Município X',total:360000,kind:'Contrato público',installments:4,start:'2026-09-20',monthly:90000}],users:[{name:'Administrador Integral',email:'admin@integral.local',role:'Administrador',active:true},{name:'Funcionário Demo',email:'funcionario@integral.local',role:'Funcionário',active:true}]};
let db=JSON.parse(localStorage.getItem('integral_fin_v1')||'null')||structuredClone(seed), user=null, view='dashboard';
function save(){localStorage.setItem('integral_fin_v1',JSON.stringify(db))}
function matrix(on=true){document.body.classList.toggle('login-mode',on);const c=$('#matrix');if(!on||!c)return;const x=c.getContext('2d');let drops=[];function resize(){c.width=innerWidth;c.height=innerHeight;drops=Array(Math.ceil(innerWidth/18)).fill(0).map(()=>Math.random()*40)}resize();const chars='01INTEGRALFINANCEIRO<>[]{}R$'.split('');function draw(){x.fillStyle='rgba(255,255,255,.12)';x.fillRect(0,0,c.width,c.height);x.fillStyle='rgba(15,122,116,.38)';x.font='14px monospace';drops.forEach((y,i)=>{x.fillText(chars[Math.floor(Math.random()*chars.length)],i*18,y*18);if(y*18>c.height&&Math.random()>.975)drops[i]=0;drops[i]+=.45});if(document.body.classList.contains('login-mode'))requestAnimationFrame(draw)}draw()}
function login(){user=null;$('#app').innerHTML=`<main class="login-wrap"><section class="login-card"><img class="login-logo" src="logo-integral.png"><h1>Integral Financeiro</h1><div class="sub">Gestão financeira, orçamentária e documental</div><form id="login"><div class="field"><label>E-mail</label><input id="email" type="email" required></div><div class="field"><label>Senha</label><input id="pass" type="password" required></div><button class="btn wide">Entrar</button><div id="err" class="login-error"></div></form><div class="demo-row"><button class="btn ghost" data-demo="admin">Testar Administrador</button><button class="btn ghost" data-demo="func">Testar Funcionário</button></div></section></main>`;matrix(true);$$('[data-demo]').forEach(b=>b.onclick=()=>{if(b.dataset.demo==='admin'){$('#email').value='admin@integral.local'}else $('#email').value='funcionario@integral.local';$('#pass').value='integral2026'});$('#login').onsubmit=e=>{e.preventDefault();const email=$('#email').value.trim().toLowerCase(),pass=$('#pass').value;if(pass!=='integral2026'||!['admin@integral.local','funcionario@integral.local'].includes(email)){return $('#err').textContent='E-mail ou senha inválidos.'}user=email.startsWith('admin')?{name:'Administrador Integral',role:'Administrador'}:{name:'Funcionário Demo',role:'Funcionário'};view=user.role==='Administrador'?'dashboard':'documents';matrix(false);app()}}
const adminNav=[['dashboard','Visão Geral'],['accounts','Contas'],['documents','Documentos Fiscais'],['cashflow','Fluxo de Caixa'],['budgets','Orçamentos'],['trips','Viagens'],['planning','Planejamento'],['reports','Relatórios'],['sep',''],['registers','Cadastros'],['users','Usuários']], staffNav=[['documents','Documentos Fiscais'],['budgets','Meu Orçamento'],['trips','Viagens']];
function app(){const nav=user.role==='Administrador'?adminNav:staffNav;$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><img src="logo-integral.png"></div><nav class="nav">${nav.map(([id,l])=>id==='sep'?'<div class="sep"></div>':`<button class="${view===id?'active':''}" data-view="${id}">${l}</button>`).join('')}</nav><div class="sidebar-foot"><div class="user-mini"><strong>${user.name}</strong>${user.role}</div><button class="btn secondary wide" id="logout">Sair</button></div></aside><section class="main"><header class="topbar"><h2 id="title"></h2><span class="badge">${user.role}</span></header><div class="content" id="content"></div></section></div>`;$$('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;app()});$('#logout').onclick=login;render()}
function title(t){$('#title').textContent=t}function badgeStatus(s){const c=/Paga|Aprovada|Confirmado/.test(s)?'ok':/Vencida|Diverg/.test(s)?'danger':/hoje|Revisar/.test(s)?'warn':'';return `<span class="badge ${c}">${s}</span>`}
function render(){({dashboard,accounts,documents,cashflow,budgets,trips,planning,reports,registers,users}[view]||documents)()}
function dashboard(){title('Visão Geral');const paid=db.accounts.filter(a=>a.status==='Paga').reduce((s,a)=>s+a.value,0)+db.docs.reduce((s,d)=>s+d.value,0),open=db.accounts.filter(a=>a.status!=='Paga').reduce((s,a)=>s+a.value,0),income=247850,result=income-paid;$('#content').innerHTML=`<div class="grid cols-4"><div class="card metric"><h3>Entradas no mês</h3><b>${money(income)}</b><small>realizadas</small></div><div class="card metric"><h3>Saídas no mês</h3><b>${money(paid)}</b><small>documentadas</small></div><div class="card metric"><h3>Resultado mensal</h3><b class="${result>=0?'kpi-positive':'kpi-negative'}">${money(result)}</b><small>até agora</small></div><div class="card metric"><h3>Contas a vencer</h3><b>${money(open)}</b><small>${db.accounts.filter(a=>a.status!=='Paga').length} lançamentos</small></div></div><h3 class="section-title">Alertas</h3><div class="grid cols-3"><div class="notice warn">${db.accounts.filter(a=>a.status==='Vence hoje').length} conta(s) vencem hoje.</div><div class="notice danger">${db.trips.filter(t=>t.status==='Divergência').length} viagem(ns) com divergência.</div><div class="notice">Topografia consumiu ${Math.round(db.budgets.find(b=>b.sector==='Topografia').spent/db.budgets.find(b=>b.sector==='Topografia').limit*100)}% do orçamento.</div></div><h3 class="section-title">Projeção financeira</h3><div class="card"><div class="legend"><span>Entradas</span><span>Saídas</span></div><div class="chart">${db.plans.map(p=>{const max=Math.max(...db.plans.flatMap(x=>[x.income,x.out]));return `<div class="bar-col"><div class="bar-stack"><i class="bar" style="height:${p.income/max*150}px"></i><i class="bar out" style="height:${p.out/max*150}px"></i></div><b>${money(p.income-p.out)}</b><span class="bar-label">${p.month}</span></div>`}).join('')}</div></div>`}
function accounts(){if(user.role!=='Administrador')return documents();title('Contas');$('#content').innerHTML=`<div class="toolbar"><div class="left"><div class="notice">O disparo de WhatsApp é administrativo e não fica disponível para funcionários.</div></div><div class="right"><button class="btn" id="newAccount">+ Nova conta</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Conta</th><th>Categoria</th><th>Vencimento</th><th>Forma</th><th>Setor</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${db.accounts.map(a=>`<tr><td><b>${a.desc}</b><div class="muted">${a.supplier}</div></td><td>${a.cat}</td><td>${fmt(a.due)}</td><td>${a.method}</td><td>${a.sector}</td><td><b>${money(a.value)}</b></td><td>${badgeStatus(a.status)}</td><td class="actions"><button class="btn small ghost" data-account="${a.id}">Detalhes</button></td></tr>`).join('')}</tbody></table></div>`;$('#newAccount').onclick=()=>accountModal();$$('[data-account]').forEach(b=>b.onclick=()=>accountModal(Number(b.dataset.account)))}
function accountModal(id){const a=db.accounts.find(x=>x.id===id);const backdrop=document.createElement('div');backdrop.className='modal-backdrop';backdrop.innerHTML=`<div class="modal"><div class="modal-head"><h3>${a?'Conta':'Nova conta'}</h3><button class="btn ghost small" data-close>Fechar</button></div><form id="accountForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Descrição</label><input name="desc" value="${esc(a?.desc||'') }" required></div><div class="field"><label>Fornecedor</label><input name="supplier" value="${esc(a?.supplier||'')}"></div><div class="field"><label>Categoria</label><select name="cat"><option>Impostos</option><option>Custos fixos</option><option>Combustível</option><option>Seguros</option><option>Software</option><option>Outros</option></select></div><div class="field"><label>Setor</label><select name="sector"><option>Administrativo</option><option>Projetos</option><option>Topografia</option><option>Comercial</option></select></div><div class="field"><label>Valor</label><input name="value" type="number" step="0.01" value="${a?.value||''}" required></div><div class="field"><label>Vencimento</label><input name="due" type="date" value="${a?.due||''}" required></div><div class="field"><label>Forma de pagamento</label><select name="method"><option>PIX</option><option>Boleto</option><option>Débito</option><option>Transferência</option><option>Cartão</option></select></div><div class="field"><label>Status</label><select name="status"><option>A vencer</option><option>Vence hoje</option><option>Vencida</option><option>Paga</option></select></div><div class="field full"><label>Linha digitável / código</label><input name="barcode" value="${esc(a?.barcode||'')}"></div><div class="full notice warn">WhatsApp: o funcionário não escolhe destinatário e não dispara mensagens. Na versão integrada, o backend enviará automaticamente apenas aos números autorizados.</div></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form></div>`;document.body.append(backdrop);backdrop.querySelector('[data-close]').onclick=()=>backdrop.remove();const f=backdrop.querySelector('#accountForm');if(a){f.cat.value=a.cat;f.sector.value=a.sector;f.method.value=a.method;f.status.value=a.status}f.onsubmit=e=>{e.preventDefault();const o=Object.fromEntries(new FormData(f));o.value=Number(o.value);o.id=a?.id||Date.now();if(a)Object.assign(a,o);else db.accounts.unshift(o);save();backdrop.remove();accounts()}}
function documents(){title('Documentos Fiscais');$('#content').innerHTML=`<div class="dropzone"><h3>Enviar documentos</h3><div class="muted">PDF, JPG ou PNG • leitura por IA simulada nesta V1</div><button class="btn" id="uploadDemo" style="margin-top:12px">Simular envio</button></div><h3 class="section-title">Agosto / 2026</h3><div class="folder-grid"><div class="folder"><b>Notas Fiscais</b><span>${db.docs.filter(d=>d.type==='Nota Fiscal').length} documento(s)</span></div><div class="folder"><b>Cupons</b><span>${db.docs.filter(d=>d.type==='Cupom').length} documento(s)</span></div><div class="folder"><b>Comprovantes</b><span>${db.docs.filter(d=>d.type==='Comprovante').length} documento(s)</span></div><div class="folder"><b>Outros</b><span>0 documento(s)</span></div></div><h3 class="section-title">Documentos processados</h3><div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Fornecedor</th><th>Data</th><th>Categoria</th><th>Setor</th><th>Valor</th><th>IA</th></tr></thead><tbody>${db.docs.map(d=>`<tr><td><b>${d.name}</b><div class="muted">${d.type}</div></td><td>${d.supplier}</td><td>${fmt(d.date)}</td><td>${d.cat}</td><td>${d.sector}</td><td>${money(d.value)}</td><td>${badgeStatus(d.status)}</td></tr>`).join('')}</tbody></table></div>`;$('#uploadDemo').onclick=()=>{db.docs.unshift({id:Date.now(),name:'novo-documento-demo.pdf',type:'Nota Fiscal',supplier:'Fornecedor identificado pela IA',date:'2026-08-21',cat:'Outros',sector:'Administrativo',value:328.90,status:'Revisar IA'});save();documents()}}
function cashflow(){if(user.role!=='Administrador')return documents();title('Fluxo de Caixa');const rows=[...db.docs.map(d=>({date:d.date,desc:d.supplier,cat:d.cat,type:'Saída',value:-d.value})),{date:'2026-08-05',desc:'Recebimentos de carnês',cat:'Receitas',type:'Entrada',value:125000},{date:'2026-08-15',desc:'Contrato público',cat:'Receitas',type:'Entrada',value:122850}].sort((a,b)=>a.date.localeCompare(b.date));let bal=0;$('#content').innerHTML=`<div class="grid cols-3"><div class="card metric"><h3>Entradas</h3><b>${money(rows.filter(r=>r.value>0).reduce((s,r)=>s+r.value,0))}</b></div><div class="card metric"><h3>Saídas</h3><b>${money(-rows.filter(r=>r.value<0).reduce((s,r)=>s+r.value,0))}</b></div><div class="card metric"><h3>Resultado</h3><b class="kpi-positive">${money(rows.reduce((s,r)=>s+r.value,0))}</b></div></div><h3 class="section-title">Lançamentos</h3><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Saldo</th></tr></thead><tbody>${rows.map(r=>{bal+=r.value;return `<tr><td>${fmt(r.date)}</td><td>${r.desc}</td><td>${r.cat}</td><td>${r.type}</td><td class="${r.value>=0?'kpi-positive':'kpi-negative'}">${money(r.value)}</td><td><b>${money(bal)}</b></td></tr>`}).join('')}</tbody></table></div>`}
function budgets(){title(user.role==='Administrador'?'Orçamentos':'Meu Orçamento');const list=user.role==='Administrador'?db.budgets:db.budgets.filter(b=>b.sector==='Topografia');$('#content').innerHTML=`<div class="grid cols-2">${list.map(b=>{const pct=Math.round(b.spent/b.limit*100),left=b.limit-b.spent;return `<div class="card budget-card"><h3>${b.sector}</h3><div class="budget-line"><span>Orçamento mensal</span><strong>${money(b.limit)}</strong></div><div class="budget-line"><span>Utilizado</span><strong>${money(b.spent)}</strong></div><div class="budget-line"><span>Disponível</span><strong>${money(left)}</strong></div><div class="progress"><i style="width:${Math.min(100,pct)}%"></i></div><div class="budget-line"><span>Consumo</span><strong>${pct}%</strong></div>${user.role==='Administrador'?`<button class="btn ghost small" data-budget="${b.sector}">Ajustar limite</button>`:''}</div>`}).join('')}</div>`;$$('[data-budget]').forEach(b=>b.onclick=()=>{const item=db.budgets.find(x=>x.sector===b.dataset.budget),v=prompt('Novo limite mensal para '+item.sector,item.limit);if(v!==null&&!isNaN(Number(v))){item.limit=Number(v);save();budgets()}})}
function trips(){title('Viagens');$('#content').innerHTML=`<div class="toolbar"><div class="left"><select><option>Agosto / 2026</option></select></div><div class="right"><button class="btn" id="newTrip">+ Nova viagem</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Setor</th><th>Projeto</th><th>Declarado</th><th>Comprovado</th><th>Status</th></tr></thead><tbody>${db.trips.map(t=>`<tr><td><b>${t.city}</b></td><td>${t.period}</td><td>${t.employee}</td><td>${t.sector}</td><td>${t.project}</td><td>${money(t.declared)}</td><td>${money(t.proven)}</td><td>${badgeStatus(t.status)}</td></tr>`).join('')}</tbody></table></div>${db.trips.some(t=>t.status==='Divergência') ? `<h3 class="section-title">Análise da IA</h3>${db.trips.filter(t=>t.status==='Divergência').map(t=>`<div class="notice danger"><b>${t.city}</b>: declarado ${money(t.declared)}, comprovado ${money(t.proven)}. Diferença de ${money(t.declared-t.proven)}. Revisão necessária.</div>`).join('')}` : ''}`;$('#newTrip').onclick=()=>alert('Na próxima iteração abriremos o formulário completo de relatório de viagem e upload dos comprovantes.')}
function planning(){if(user.role!=='Administrador')return budgets();title('Planejamento');const totalIn=db.plans.reduce((s,p)=>s+p.income,0),totalOut=db.plans.reduce((s,p)=>s+p.out,0);$('#content').innerHTML=`<div class="grid cols-3"><div class="card metric"><h3>Entradas projetadas</h3><b>${money(totalIn)}</b><small>próximos 6 meses</small></div><div class="card metric"><h3>Saídas projetadas</h3><b>${money(totalOut)}</b><small>próximos 6 meses</small></div><div class="card metric"><h3>Resultado projetado</h3><b class="${totalIn-totalOut>=0?'kpi-positive':'kpi-negative'}">${money(totalIn-totalOut)}</b></div></div><h3 class="section-title">Balanço mensal projetado</h3><div class="table-wrap"><table class="table"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th></tr></thead><tbody>${db.plans.map(p=>`<tr><td><b>${p.month}</b></td><td>${money(p.income)}</td><td>${money(p.out)}</td><td class="${p.income-p.out>=0?'kpi-positive':'kpi-negative'}"><b>${money(p.income-p.out)}</b></td></tr>`).join('')}</tbody></table></div><h3 class="section-title">Receitas cadastradas</h3><div class="table-wrap"><table class="table"><thead><tr><th>Origem</th><th>Tipo</th><th>Valor total</th><th>Parcelas/Eventos</th><th>Valor médio</th><th>Início</th></tr></thead><tbody>${db.revenues.map(r=>`<tr><td><b>${r.name}</b></td><td>${r.kind}</td><td>${money(r.total)}</td><td>${r.installments}</td><td>${money(r.monthly)}</td><td>${fmt(r.start)}</td></tr>`).join('')}</tbody></table></div>`}
function reports(){title('Relatórios');$('#content').innerHTML=`<div class="grid cols-3"><div class="card"><h3 style="margin-top:0;color:var(--primary)">Financeiro mensal</h3><p class="muted">Entradas, saídas, resultado e contas pendentes.</p><button class="btn ghost small">Gerar relatório</button></div><div class="card"><h3 style="margin-top:0;color:var(--primary)">Orçamento por setor</h3><p class="muted">Limite, realizado e disponibilidade.</p><button class="btn ghost small">Gerar relatório</button></div><div class="card"><h3 style="margin-top:0;color:var(--primary)">Viagens</h3><p class="muted">Prestação de contas e divergências.</p><button class="btn ghost small">Gerar relatório</button></div></div><h3 class="section-title">Fechamento contábil</h3><div class="card"><div class="split"><div><h3 style="margin-top:0;color:var(--primary)">Agosto / 2026</h3><p class="muted">Na versão integrada, este comando reunirá os documentos fiscais do mês e gerará o ZIP para a contabilidade.</p></div><div><button class="btn wide" onclick="alert('ZIP simulado nesta V1. A geração real entra com o Storage.')">Baixar pacote do mês</button></div></div></div>`}
function registers(){title('Cadastros');$('#content').innerHTML=`<div class="grid cols-3"><div class="card"><h3>Setores</h3><p class="muted">Administrativo, Projetos, Topografia, Comercial.</p></div><div class="card"><h3>Categorias</h3><p class="muted">Impostos, custos fixos, combustível, viagens, software e outros.</p></div><div class="card"><h3>Destinatários de alertas</h3><p class="muted">Configuração reservada ao administrador. Funcionários não acessam os disparos.</p><span class="badge ok">Protegido</span></div></div>`}
function users(){title('Usuários');$('#content').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr></thead><tbody>${db.users.map(u=>`<tr><td><b>${u.name}</b></td><td>${u.email}</td><td>${u.role}</td><td>${badgeStatus(u.active?'Confirmado':'Inativo')}</td></tr>`).join('')}</tbody></table></div><h3 class="section-title">Matriz de permissões</h3><div class="table-wrap"><table class="table"><thead><tr><th>Função</th><th>Funcionário</th><th>Administrador</th></tr></thead><tbody><tr><td>Subir documentos</td><td>Sim</td><td>Sim</td></tr><tr><td>Relatórios de viagem</td><td>Sim</td><td>Sim</td></tr><tr><td>Ver financeiro geral</td><td>Não</td><td>Sim</td></tr><tr><td>Cadastrar contas</td><td>Não</td><td>Sim</td></tr><tr><td>Configurar / disparar WhatsApp</td><td><b class="kpi-negative">Não</b></td><td>Somente configuração</td></tr></tbody></table></div>`}
login();

;

/* ===== SOURCE: patch-v2.js ===== */
/* Integral Financeiro V2 - evolução modular sobre a V1 */
const v2Month='2026-08';
const v2state={accountsMonth:v2Month,accountsMode:'month',docsMonth:v2Month,cashMonth:v2Month,budgetSector:null,tripsMonth:v2Month,tripId:null,planningMonth:'2026-09'};
const v2uid=()=>Date.now()+Math.floor(Math.random()*1000);
const v2month=d=>String(d||'').slice(0,7);
const v2monthLabel=k=>{if(!k)return'';const[y,m]=k.split('-');return new Date(+y,+m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
function v2ensure(){
 if(!db.accountMasters){db.accountMasters=(db.accounts||[]).map((a,i)=>({id:i+1,name:a.desc?.replace(/ - Agosto$/,''),category:a.cat,supplier:a.supplier,method:a.method,sector:a.sector,active:true}));db.accountPayments=(db.accounts||[]).map((a,i)=>({id:100+i,accountId:i+1,value:a.value,due:a.due,status:a.status,barcode:a.barcode||'',source:'Migração V1'}));}
 if(!db.cashflow)db.cashflow=[
  {id:1,date:'2026-08-02',description:'Recebimento de carnês REURB',kind:'Receita parcelada de clientes',direction:'Entrada',value:38250,source:'Extrato bancário'},
  {id:2,date:'2026-08-05',description:'Prefeitura - medição contratual',kind:'Receita de contratos públicos',direction:'Entrada',value:60000,source:'Extrato bancário'},
  {id:3,date:'2026-08-08',description:'Contrato privado - recebimento avulso',kind:'Receita avulsa de contratos privados',direction:'Entrada',value:22500,source:'Extrato bancário'},
  {id:4,date:'2026-08-10',description:'Licenças de software',kind:'Despesa fixa',direction:'Saída',value:4490,source:'Conta cadastrada'},
  {id:5,date:'2026-08-12',description:'Combustível equipe de campo',kind:'Despesa variável',direction:'Saída',value:1280.42,source:'Extrato bancário'},
  {id:6,date:'2026-08-15',description:'Folha de pagamento',kind:'Folha e encargos',direction:'Saída',value:68400,source:'Extrato bancário'},
  {id:7,date:'2026-08-16',description:'Distribuição aos sócios',kind:'Retirada e distribuição aos sócios',direction:'Saída',value:18000,source:'Extrato bancário'}];
 if(!db.budgetExpenses)db.budgetExpenses=[{id:1,sector:'Topografia',date:'2026-08-04',description:'Combustível - campo',category:'Combustível',value:1340,status:'Pago',cashflow:true},{id:2,sector:'Topografia',date:'2026-08-08',description:'Manutenção drone',category:'Equipamentos',value:3200,status:'Pago',cashflow:true},{id:3,sector:'Projetos',date:'2026-08-06',description:'Plotagem de projetos',category:'Material técnico',value:1860,status:'Pago',cashflow:true}];
 if(db.budgets?.some(b=>'spent'in b))db.budgets=db.budgets.map(b=>({sector:b.sector,limit:b.limit}));
 if(!db.tripExpenses)db.tripExpenses=[{id:1,tripId:1,type:'Hotel',date:'2026-08-12',declared:780,proven:780,doc:'hotel.pdf',status:'OK'},{id:2,tripId:1,type:'Combustível',date:'2026-08-13',declared:624.32,proven:624.32,doc:'posto.jpg',status:'OK'},{id:3,tripId:2,type:'Alimentação',date:'2026-08-18',declared:182.30,proven:159.42,doc:'cupom.jpg',status:'Divergência'}];
 db.trips=(db.trips||[]).map((t,i)=>({...t,start:t.start||`2026-08-${i?18:12}`,end:t.end||`2026-08-${i?18:14}`,month:t.month||'2026-08',objective:t.objective||'Atividade externa',report:t.report||'Relatório aguardando complementação.',aiScore:t.aiScore??(t.status==='Divergência'?78:96),issues:t.issues|| (t.status==='Divergência'?['Diferença entre o valor declarado e os comprovantes.']:[])}));
 if(!db.futureExpenses)db.futureExpenses=[{id:1,name:'Aluguel escritório',category:'Custos fixos',value:6800,recurrence:'Mensal',start:'2026-08-01'},{id:2,name:'Energia elétrica',category:'Custos variáveis',value:2600,recurrence:'Mensal estimada',start:'2026-08-01'},{id:3,name:'Folha + encargos',category:'Folha de pagamento',value:69000,recurrence:'Mensal',start:'2026-08-01'},{id:4,name:'Distribuição programada',category:'Retirada e distribuição aos sócios',value:18000,recurrence:'Mensal',start:'2026-08-01'}];
 if(db.plans?.[0]?.month?.includes('/'))db.plans=[{month:'2026-09',income:310000,out:220000},{month:'2026-10',income:260000,out:240000},{month:'2026-11',income:180000,out:270000},{month:'2026-12',income:420000,out:310000},{month:'2027-01',income:335000,out:252000},{month:'2027-02',income:300000,out:245000}];
 save();
}
v2ensure();
function v2modal(t,b){const x=document.createElement('div');x.className='modal-backdrop';x.innerHTML=`<div class="modal"><div class="modal-head"><h3>${t}</h3><button class="btn ghost small" data-v2close>Fechar</button></div>${b}</div>`;document.body.appendChild(x);x.onclick=e=>{if(e.target===x||e.target.closest('[data-v2close]'))x.remove()};return x}
function v2picker(v,id){return `<input type="month" id="${id}" value="${v}">`}
function v2master(id){return db.accountMasters.find(a=>a.id===id)}
accounts=function(){if(user.role!=='Administrador')return documents();title('Contas');const payments=(v2state.accountsMode==='month'?db.accountPayments.filter(p=>v2month(p.due)===v2state.accountsMonth):db.accountPayments).map(p=>({...p,master:v2master(p.accountId)}));$('#content').innerHTML=`<div class="toolbar"><div class="left"><div class="segmented"><button id="v2MonthMode" class="${v2state.accountsMode==='month'?'active':''}">Contas do mês</button><button id="v2AllMode" class="${v2state.accountsMode==='all'?'active':''}">Todas as contas cadastradas</button></div>${v2state.accountsMode==='month'?v2picker(v2state.accountsMonth,'v2AccountsMonth'):''}</div><div class="right"><button class="btn ghost" id="v2AiBills">Enviar boletos para IA</button><button class="btn" id="v2NewAccount">+ Cadastrar conta</button></div></div>${v2state.accountsMode==='all'?`<div class="grid cols-3">${db.accountMasters.map(a=>{const ps=db.accountPayments.filter(p=>p.accountId===a.id);return `<button class="card account-master-card" data-v2master="${a.id}"><span class="badge ok">${a.active?'Ativa':'Inativa'}</span><h3>${esc(a.name)}</h3><p>${esc(a.supplier||'')}</p><div class="account-meta"><span>${esc(a.category||'')}</span><span>${esc(a.sector||'')}</span></div><b>${ps.length} pagamento(s) cadastrado(s)</b></button>`}).join('')}</div>`:`<div class="page-intro"><div><h3>${v2monthLabel(v2state.accountsMonth)}</h3><p>Somente pagamentos com vencimento neste mês.</p></div><strong>${payments.length} pagamento(s)</strong></div><div class="table-wrap"><table class="table"><thead><tr><th>Conta</th><th>Vencimento</th><th>Forma</th><th>Setor</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${payments.map(p=>`<tr><td><b>${esc(p.master?.name||'')}</b><div class="muted">${esc(p.master?.supplier||'')}</div></td><td>${fmt(p.due)}</td><td>${esc(p.master?.method||'')}</td><td>${esc(p.master?.sector||'')}</td><td><b>${money(p.value)}</b></td><td>${badgeStatus(p.status)}</td><td><button class="btn small ghost" data-v2payment="${p.id}">Abrir card</button></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">Nenhuma conta neste mês.</div></td></tr>'}</tbody></table></div>`}`;$('#v2MonthMode').onclick=()=>{v2state.accountsMode='month';accounts()};$('#v2AllMode').onclick=()=>{v2state.accountsMode='all';accounts()};if($('#v2AccountsMonth'))$('#v2AccountsMonth').onchange=e=>{v2state.accountsMonth=e.target.value;accounts()};$('#v2AiBills').onclick=()=>v2modal('Leitura de boletos por IA',`<div class="modal-body"><div class="dropzone"><h3>Envie todos os boletos da conta</h3><p>A IA irá identificar vencimento, valor, código e competência e separar cada pagamento no mês correto.</p><input type="file" multiple accept=".pdf,image/*"></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);$('#v2NewAccount').onclick=()=>v2AccountModal();$$('[data-v2master]').forEach(b=>b.onclick=()=>v2AccountModal(+b.dataset.v2master));$$('[data-v2payment]').forEach(b=>b.onclick=()=>v2PaymentModal(+b.dataset.v2payment));}
function v2AccountModal(id){const a=v2master(id),ps=a?db.accountPayments.filter(p=>p.accountId===id).sort((x,y)=>x.due.localeCompare(y.due)):[];const x=v2modal(a?'Conta cadastrada':'Nova conta',`<form id="v2AccountForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" value="${esc(a?.name||'')}" required></div><div class="field"><label>Fornecedor</label><input name="supplier" value="${esc(a?.supplier||'')}"></div><div class="field"><label>Categoria</label><input name="category" value="${esc(a?.category||'')}"></div><div class="field"><label>Forma</label><select name="method">${['Boleto','PIX','Débito automático','Cartão','Transferência','Outro'].map(v=>`<option ${a?.method===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Setor</label><select name="sector">${['Administrativo','Projetos','Topografia','Comercial'].map(v=>`<option ${a?.sector===v?'selected':''}>${v}</option>`).join('')}</select></div></div>${a?`<h3 class="section-title">Pagamentos vinculados</h3>${ps.map(p=>`<button type="button" class="mini-row" data-v2openpay="${p.id}"><span>${fmt(p.due)}</span><strong>${money(p.value)}</strong>${badgeStatus(p.status)}</button>`).join('')||'<div class="empty">Sem pagamentos.</div>'}<button type="button" class="btn ghost" id="v2AddPay">+ Adicionar pagamento</button>`:''}</div><div class="modal-foot"><button class="btn">Salvar conta</button></div></form>`);x.querySelector('#v2AccountForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:a?.id||v2uid(),name:f.get('name'),supplier:f.get('supplier'),category:f.get('category'),method:f.get('method'),sector:f.get('sector'),active:true};a?Object.assign(a,o):db.accountMasters.push(o);save();x.remove();accounts()};x.querySelectorAll('[data-v2openpay]').forEach(b=>b.onclick=()=>{x.remove();v2PaymentModal(+b.dataset.v2openpay)});if(x.querySelector('#v2AddPay'))x.querySelector('#v2AddPay').onclick=()=>{x.remove();v2PaymentModal(null,a.id)}}
function v2PaymentModal(id,accountId){const p=db.accountPayments.find(q=>q.id===id),a=v2master(p?.accountId||accountId);const x=v2modal('Card do pagamento',`<form id="v2PayForm"><div class="modal-body"><h2>${esc(a?.name||'')}</h2><p class="muted">${esc(a?.supplier||'')}</p><div class="form-grid"><div class="field"><label>Vencimento</label><input type="date" name="due" value="${p?.due||''}" required></div><div class="field"><label>Valor</label><input type="number" step="0.01" name="value" value="${p?.value||''}" required></div><div class="field"><label>Status</label><select name="status">${['A vencer','Vence hoje','Vencida','Paga','Cancelada'].map(v=>`<option ${p?.status===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field full"><label>Linha digitável / código</label><textarea name="barcode">${esc(p?.barcode||'')}</textarea></div></div><div class="notice">O WhatsApp será disparado apenas pelo backend para destinatários administrativos autorizados. Funcionários não terão acesso ao envio.</div></div><div class="modal-foot"><button class="btn">Salvar pagamento</button></div></form>`);x.querySelector('#v2PayForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:p?.id||v2uid(),accountId:a.id,due:f.get('due'),value:+f.get('value'),status:f.get('status'),barcode:f.get('barcode'),source:p?.source||'Manual'};p?Object.assign(p,o):db.accountPayments.push(o);save();x.remove();accounts()}}
documents=function(){title('Documentos Fiscais');const docs=db.docs.filter(d=>v2month(d.date)===v2state.docsMonth),months=[...new Set(db.docs.map(d=>v2month(d.date)))].sort().reverse();$('#content').innerHTML=`<div class="toolbar"><div>${v2picker(v2state.docsMonth,'v2DocsMonth')}</div><button class="btn" id="v2UploadDocs">+ Enviar documentos</button></div><div class="month-folders">${months.map(m=>`<button class="month-folder ${m===v2state.docsMonth?'active':''}" data-v2docmonth="${m}"><b>${v2monthLabel(m)}</b><small>${db.docs.filter(d=>v2month(d.date)===m).length} arquivo(s)</small></button>`).join('')}</div><div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Tipo</th><th>Fornecedor</th><th>Data</th><th>Categoria</th><th>Setor</th><th>Valor</th><th>IA</th></tr></thead><tbody>${docs.map(d=>`<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.type)}</td><td>${esc(d.supplier)}</td><td>${fmt(d.date)}</td><td>${esc(d.cat)}</td><td>${esc(d.sector)}</td><td><b>${money(d.value)}</b></td><td>${badgeStatus(d.status)}</td></tr>`).join('')||'<tr><td colspan="8"><div class="empty">Nenhum documento neste mês.</div></td></tr>'}</tbody></table></div>`;$('#v2DocsMonth').onchange=e=>{v2state.docsMonth=e.target.value;documents()};$$('[data-v2docmonth]').forEach(b=>b.onclick=()=>{v2state.docsMonth=b.dataset.v2docmonth;documents()});$('#v2UploadDocs').onclick=()=>v2modal('Upload de documentos',`<div class="modal-body"><div class="dropzone"><h3>Notas, cupons e comprovantes</h3><p>A IA classificará e atribuirá cada documento ao mês correto.</p><input type="file" multiple accept=".pdf,image/*"></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`)}
const v2Kinds=['Despesa fixa','Despesa variável','Folha e encargos','Retirada e distribuição aos sócios','Receita parcelada de clientes','Receita de contratos públicos','Receita avulsa de contratos privados','Outras receitas'];
cashflow=function(){if(user.role!=='Administrador')return documents();title('Fluxo de Caixa');const rs=db.cashflow.filter(r=>v2month(r.date)===v2state.cashMonth),tin=rs.filter(r=>r.direction==='Entrada').reduce((s,r)=>s+r.value,0),tout=rs.filter(r=>r.direction==='Saída').reduce((s,r)=>s+r.value,0);$('#content').innerHTML=`<div class="toolbar"><div>${v2picker(v2state.cashMonth,'v2CashMonth')}</div><div class="right"><button class="btn ghost" id="v2ImportBank">Importar extrato bancário</button><button class="btn" id="v2NewCash">+ Lançamento</button></div></div><div class="grid cols-3"><div class="card metric"><h3>Entradas</h3><b>${money(tin)}</b></div><div class="card metric"><h3>Saídas</h3><b>${money(tout)}</b></div><div class="card metric"><h3>Resultado</h3><b class="${tin-tout>=0?'kpi-positive':'kpi-negative'}">${money(tin-tout)}</b></div></div><h3 class="section-title">Movimentações por natureza</h3><div class="cash-groups">${v2Kinds.map(k=>{const g=rs.filter(r=>r.kind===k);if(!g.length)return'';return `<section class="card cash-group"><div class="cash-group-head"><h3>${k}</h3><strong>${money(g.reduce((s,r)=>s+r.value,0))}</strong></div>${g.map(r=>`<div class="cash-row"><div><b>${fmt(r.date)}</b><span>${esc(r.description)}</span><small>${esc(r.source||'')}</small></div><strong class="${r.direction==='Entrada'?'kpi-positive':'kpi-negative'}">${r.direction==='Entrada'?'+':'−'} ${money(r.value)}</strong><div class="actions"><button class="btn small ghost" data-v2cash="${r.id}">Editar</button><button class="btn small ghost" data-v2cashdel="${r.id}">Excluir</button></div></div>`).join('')}</section>`}).join('')}</div>`;$('#v2CashMonth').onchange=e=>{v2state.cashMonth=e.target.value;cashflow()};$('#v2ImportBank').onclick=()=>v2modal('Importar extrato bancário',`<div class="modal-body"><div class="dropzone"><h3>Enviar XLSX, XLS ou CSV</h3><p>A IA separará entradas e saídas e sugerirá a natureza financeira de cada linha.</p><input type="file" accept=".xlsx,.xls,.csv"></div><div class="notice warn">Após a leitura, cada linha será editável ou excluível. Assim você poderá remover itens já cadastrados em Contas e evitar duplicidade.</div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);$('#v2NewCash').onclick=()=>v2CashModal();$$('[data-v2cash]').forEach(b=>b.onclick=()=>v2CashModal(+b.dataset.v2cash));$$('[data-v2cashdel]').forEach(b=>b.onclick=()=>{db.cashflow=db.cashflow.filter(r=>r.id!==+b.dataset.v2cashdel);save();cashflow()})}
function v2CashModal(id){const r=db.cashflow.find(q=>q.id===id),x=v2modal(r?'Editar movimentação':'Novo lançamento',`<form id="v2CashForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Data</label><input type="date" name="date" value="${r?.date||''}" required></div><div class="field"><label>Descrição</label><input name="description" value="${esc(r?.description||'')}" required></div><div class="field"><label>Natureza</label><select name="kind">${v2Kinds.map(k=>`<option ${r?.kind===k?'selected':''}>${k}</option>`).join('')}</select></div><div class="field"><label>Tipo</label><select name="direction"><option ${r?.direction==='Entrada'?'selected':''}>Entrada</option><option ${r?.direction==='Saída'?'selected':''}>Saída</option></select></div><div class="field"><label>Valor</label><input type="number" step="0.01" name="value" value="${r?.value||''}" required></div></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);x.querySelector('#v2CashForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:r?.id||v2uid(),date:f.get('date'),description:f.get('description'),kind:f.get('kind'),direction:f.get('direction'),value:+f.get('value'),source:r?.source||'Manual'};r?Object.assign(r,o):db.cashflow.push(o);save();x.remove();cashflow()}}
function v2spent(s){return db.budgetExpenses.filter(e=>e.sector===s&&v2month(e.date)===v2Month).reduce((a,e)=>a+e.value,0)}
budgets=function(){title(v2state.budgetSector?`Orçamento · ${v2state.budgetSector}`:'Orçamentos');if(v2state.budgetSector)return v2BudgetDetail(v2state.budgetSector);$('#content').innerHTML=`<div class="page-intro"><div><h3>Orçamentos por setor</h3><p>Clique no setor para gerenciar limite e cadastrar cada gasto.</p></div></div><div class="grid cols-3">${db.budgets.map(b=>{const s=v2spent(b.sector),p=Math.min(100,s/b.limit*100);return `<button class="card budget-card clickable" data-v2sector="${b.sector}"><h3>${b.sector}</h3><div class="budget-line"><span>Limite</span><strong>${money(b.limit)}</strong></div><div class="budget-line"><span>Utilizado</span><strong>${money(s)}</strong></div><div class="budget-line"><span>Disponível</span><strong>${money(b.limit-s)}</strong></div><div class="progress"><i style="width:${p}%"></i></div></button>`}).join('')}</div>`;$$('[data-v2sector]').forEach(b=>b.onclick=()=>{v2state.budgetSector=b.dataset.v2sector;budgets()})}
function v2BudgetDetail(s){const b=db.budgets.find(x=>x.sector===s),rs=db.budgetExpenses.filter(e=>e.sector===s&&v2month(e.date)===v2Month),spent=rs.reduce((a,e)=>a+e.value,0);$('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="v2BackBudget">← Setores</button><div class="right"><button class="btn ghost" id="v2Limit">Ajustar limite</button><button class="btn" id="v2Expense">+ Cadastrar gasto</button></div></div><div class="grid cols-3"><div class="card metric"><h3>Limite</h3><b>${money(b.limit)}</b></div><div class="card metric"><h3>Custos cadastrados</h3><b>${money(spent)}</b></div><div class="card metric"><h3>Disponível</h3><b>${money(b.limit-spent)}</b></div></div><h3 class="section-title">Gastos do setor</h3><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Gasto</th><th>Categoria</th><th>Valor</th><th>Status</th><th>Fluxo</th></tr></thead><tbody>${rs.map(e=>`<tr><td>${fmt(e.date)}</td><td><b>${esc(e.description)}</b></td><td>${esc(e.category)}</td><td>${money(e.value)}</td><td>${badgeStatus(e.status)}</td><td>${e.cashflow?'<span class="badge ok">Vinculado</span>':'<span class="badge">Não lançado</span>'}</td></tr>`).join('')}</tbody></table></div><div class="notice">A IA do extrato bancário poderá sugerir correspondências com estes gastos usando data, valor e descrição.</div>`;$('#v2BackBudget').onclick=()=>{v2state.budgetSector=null;budgets()};$('#v2Limit').onclick=()=>{const x=v2modal('Ajustar limite',`<form id="v2LimitForm"><div class="modal-body"><input type="number" step="0.01" name="limit" value="${b.limit}"></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);x.querySelector('form').onsubmit=e=>{e.preventDefault();b.limit=+new FormData(e.target).get('limit');save();x.remove();budgets()}};$('#v2Expense').onclick=()=>{const x=v2modal('Cadastrar gasto',`<form id="v2ExpenseForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Data</label><input type="date" name="date" value="2026-08-21"></div><div class="field"><label>Descrição</label><input name="description" required></div><div class="field"><label>Categoria</label><input name="category" required></div><div class="field"><label>Valor</label><input type="number" step="0.01" name="value" required></div><div class="field"><label>Status</label><select name="status"><option>Previsto</option><option>Pago</option></select></div><div class="field"><label>Alimentar fluxo de caixa</label><select name="cashflow"><option value="true">Sim</option><option value="false">Não</option></select></div></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);x.querySelector('form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:v2uid(),sector:s,date:f.get('date'),description:f.get('description'),category:f.get('category'),value:+f.get('value'),status:f.get('status'),cashflow:f.get('cashflow')==='true'};db.budgetExpenses.push(o);if(o.cashflow&&o.status==='Pago')db.cashflow.push({id:v2uid(),date:o.date,description:o.description,kind:'Despesa variável',direction:'Saída',value:o.value,source:`Orçamento ${s}`});save();x.remove();budgets()}}}
trips=function(){title(v2state.tripId?'Relatório de Viagem':'Viagens');if(v2state.tripId)return v2TripDetail(v2state.tripId);const rs=db.trips.filter(t=>t.month===v2state.tripsMonth);$('#content').innerHTML=`<div class="toolbar"><div>${v2picker(v2state.tripsMonth,'v2TripsMonth')}</div><button class="btn" id="v2NewTrip">+ Nova viagem</button></div><div class="grid cols-2">${rs.map(t=>`<button class="card trip-card" data-v2trip="${t.id}"><div class="card-topline"><span class="badge">${esc(t.sector)}</span>${badgeStatus(t.status)}</div><h3>${esc(t.city)}</h3><p>${fmt(t.start)} → ${fmt(t.end)}</p><div class="trip-meta"><span><small>Equipe</small><b>${esc(t.employee)}</b></span><span><small>Projeto</small><b>${esc(t.project)}</b></span></div><div class="trip-values"><span>Declarado <b>${money(t.declared)}</b></span><span>Comprovado <b>${money(t.proven)}</b></span></div></button>`).join('')}</div>`;$('#v2TripsMonth').onchange=e=>{v2state.tripsMonth=e.target.value;trips()};$$('[data-v2trip]').forEach(b=>b.onclick=()=>{v2state.tripId=+b.dataset.v2trip;trips()});$('#v2NewTrip').onclick=()=>v2TripModal()}
function v2TripDetail(id){const t=db.trips.find(x=>x.id===id),es=db.tripExpenses.filter(e=>e.tripId===id);$('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="v2BackTrips">← Viagens</button><div class="right"><button class="btn ghost" id="v2EditTrip">Editar relatório</button><button class="btn" id="v2TripDocs">+ Comprovantes</button></div></div><div class="grid cols-3"><div class="card"><span class="eyebrow">Destino</span><h2>${esc(t.city)}</h2><p>${fmt(t.start)} → ${fmt(t.end)}</p></div><div class="card"><span class="eyebrow">Prestação</span><h2>${money(t.proven)}</h2><p>Declarado: ${money(t.declared)}</p></div><div class="card"><span class="eyebrow">Auditoria IA</span><h2>${t.aiScore}%</h2>${badgeStatus(t.status)}</div></div><div class="split section-gap"><div><div class="card"><h3>Relatório do funcionário</h3><p><b>${esc(t.employee)}</b> · ${esc(t.project)}</p><p>${esc(t.objective)}</p><div class="report-text">${esc(t.report)}</div></div><h3 class="section-title">Comprovantes</h3><div class="table-wrap"><table class="table"><thead><tr><th>Tipo</th><th>Data</th><th>Declarado</th><th>Comprovado</th><th>Documento</th><th>Status</th></tr></thead><tbody>${es.map(e=>`<tr><td>${esc(e.type)}</td><td>${fmt(e.date)}</td><td>${money(e.declared)}</td><td>${money(e.proven)}</td><td>${esc(e.doc)}</td><td>${badgeStatus(e.status)}</td></tr>`).join('')}</tbody></table></div></div><aside class="card ai-audit"><h3>Análise de coerência</h3><p>A IA compara datas, valores, destino, período e comprovantes.</p>${t.issues.length?t.issues.map(i=>`<div class="notice danger">${esc(i)}</div>`).join(''):'<div class="notice">Nenhuma divergência relevante.</div>'}<hr><div class="budget-line"><span>Diferença</span><strong>${money(t.declared-t.proven)}</strong></div></aside></div>`;$('#v2BackTrips').onclick=()=>{v2state.tripId=null;trips()};$('#v2EditTrip').onclick=()=>v2TripModal(id);$('#v2TripDocs').onclick=()=>v2modal('Comprovantes da viagem',`<div class="modal-body"><div class="dropzone"><h3>Envie cupons, NFs e comprovantes</h3><p>A IA irá cruzar os documentos com o relatório.</p><input type="file" multiple></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`)}
function v2TripModal(id){const t=db.trips.find(x=>x.id===id),x=v2modal(t?'Editar viagem':'Nova viagem',`<form id="v2TripForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Destino</label><input name="city" value="${esc(t?.city||'')}" required></div><div class="field"><label>Equipe</label><input name="employee" value="${esc(t?.employee||'')}" required></div><div class="field"><label>Início</label><input type="date" name="start" value="${t?.start||''}" required></div><div class="field"><label>Fim</label><input type="date" name="end" value="${t?.end||''}" required></div><div class="field"><label>Setor</label><input name="sector" value="${esc(t?.sector||'')}"></div><div class="field"><label>Projeto</label><input name="project" value="${esc(t?.project||'')}"></div><div class="field full"><label>Objetivo</label><input name="objective" value="${esc(t?.objective||'')}"></div><div class="field full"><label>Relatório</label><textarea name="report">${esc(t?.report||'')}</textarea></div><div class="field"><label>Total declarado</label><input type="number" step="0.01" name="declared" value="${t?.declared||0}"></div></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);x.querySelector('form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:t?.id||v2uid(),city:f.get('city'),employee:f.get('employee'),start:f.get('start'),end:f.get('end'),month:v2month(f.get('start')),sector:f.get('sector'),project:f.get('project'),objective:f.get('objective'),report:f.get('report'),declared:+f.get('declared'),proven:t?.proven||0,status:t?.status||'Em análise',aiScore:t?.aiScore||0,issues:t?.issues||[]};t?Object.assign(t,o):db.trips.push(o);save();x.remove();v2state.tripId=o.id;trips()}}
planning=function(){if(user.role!=='Administrador')return documents();title('Planejamento');const p=db.plans.find(x=>x.month===v2state.planningMonth)||{income:0,out:0};$('#content').innerHTML=`<div class="toolbar"><div>${v2picker(v2state.planningMonth,'v2PlanningMonth')}</div><div class="right"><button class="btn ghost" id="v2Revenue">+ Receita prevista</button><button class="btn" id="v2FutureExpense">+ Despesa prevista</button></div></div><div class="grid cols-3"><div class="card metric"><h3>Entradas projetadas</h3><b>${money(p.income)}</b></div><div class="card metric"><h3>Saídas projetadas</h3><b>${money(p.out)}</b></div><div class="card metric"><h3>Resultado projetado</h3><b class="${p.income-p.out>=0?'kpi-positive':'kpi-negative'}">${money(p.income-p.out)}</b></div></div><h3 class="section-title">Receitas futuras</h3><div class="grid cols-3">${db.revenues.map(r=>`<div class="card"><span class="badge">${esc(r.kind)}</span><h3>${esc(r.name)}</h3><div class="budget-line"><span>Valor total</span><strong>${money(r.total)}</strong></div><div class="budget-line"><span>Parcelas</span><strong>${r.installments}</strong></div><div class="budget-line"><span>Primeiro recebimento</span><strong>${fmt(r.start)}</strong></div><div class="budget-line"><span>Valor mensal/ref.</span><strong>${money(r.monthly)}</strong></div></div>`).join('')}</div><h3 class="section-title">Despesas futuras</h3><div class="table-wrap"><table class="table"><thead><tr><th>Despesa</th><th>Categoria</th><th>Recorrência</th><th>Valor</th><th>Início</th></tr></thead><tbody>${db.futureExpenses.map(e=>`<tr><td><b>${esc(e.name)}</b></td><td>${esc(e.category)}</td><td>${esc(e.recurrence)}</td><td>${money(e.value)}</td><td>${fmt(e.start)}</td></tr>`).join('')}</tbody></table></div><h3 class="section-title">Balanço mensal projetado</h3><div class="table-wrap"><table class="table"><thead><tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Resultado</th></tr></thead><tbody>${db.plans.map(x=>`<tr><td><b>${v2monthLabel(x.month)}</b></td><td>${money(x.income)}</td><td>${money(x.out)}</td><td><b class="${x.income-x.out>=0?'kpi-positive':'kpi-negative'}">${money(x.income-x.out)}</b></td></tr>`).join('')}</tbody></table></div>`;$('#v2PlanningMonth').onchange=e=>{v2state.planningMonth=e.target.value;planning()};$('#v2Revenue').onclick=()=>v2modal('Nova receita prevista',`<div class="modal-body"><div class="notice">Formulário completo será conectado ao gerador de parcelas: carnês criam automaticamente recebimentos mensais; contratos públicos permitem parcelas e datas livres.</div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);$('#v2FutureExpense').onclick=()=>v2modal('Nova despesa prevista',`<div class="modal-body"><div class="notice">Categorias: custos fixos, variáveis, folha, tributos e retirada/distribuição aos sócios.</div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`)}
reports=function(){if(user.role!=='Administrador')return trips();title('Relatórios');const ms=[...new Set(db.trips.map(t=>t.month))].sort().reverse();$('#content').innerHTML=`<div class="grid cols-3"><div class="card metric"><h3>Viagens</h3><b>${db.trips.length}</b></div><div class="card metric"><h3>Total declarado</h3><b>${money(db.trips.reduce((s,t)=>s+t.declared,0))}</b></div><div class="card metric"><h3>Total comprovado</h3><b>${money(db.trips.reduce((s,t)=>s+t.proven,0))}</b></div></div><h3 class="section-title">Relatórios de viagens por mês</h3>${ms.map(m=>`<section class="card report-month"><div class="cash-group-head"><h3>${v2monthLabel(m)}</h3><strong>${money(db.trips.filter(t=>t.month===m).reduce((s,t)=>s+t.proven,0))}</strong></div>${db.trips.filter(t=>t.month===m).map(t=>`<div class="cash-row"><div><b>${esc(t.city)}</b><span>${esc(t.employee)} · ${esc(t.project)}</span></div><strong>${money(t.proven)}</strong>${badgeStatus(t.status)}</div>`).join('')}</section>`).join('')}<h3 class="section-title">Relatórios financeiros</h3><div class="grid cols-3"><div class="card"><h3>Fluxo de caixa mensal</h3><p class="muted">Entradas e saídas por natureza.</p></div><div class="card"><h3>Orçamento por setor</h3><p class="muted">Limite, realizado e disponível.</p></div><div class="card"><h3>Pacote contábil</h3><p class="muted">Documentos organizados por mês para ZIP.</p></div></div>`}
;

/* ===== SOURCE: patch-v3.js ===== */
/* Integral Financeiro V3 - importador real de extrato bancário */
(function(){
  const CASH_KINDS=['Despesa fixa','Despesa variável','Folha e encargos','Retirada e distribuição aos sócios','Tributos e obrigações','Tarifas e serviços bancários','Receita parcelada de clientes','Receita de contratos públicos','Receita avulsa de contratos privados','Outras receitas'];
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
  const brMoney=s=>Number(String(s||'0').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''))||0;
  const isoDate=s=>{const m=String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:''};
  const csvSplit=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++}else q=!q}else if(c===';'&&!q){out.push(cur);cur=''}else cur+=c}out.push(cur);return out.map(v=>v.trim())};
  function classify(desc,credit){const d=normalize(desc);if(credit){if(/MUNICIPIO|PREFEITURA|FUNDO MUNICIPAL|CAMARA MUNICIPAL/.test(d))return['Receita de contratos públicos',94,'Órgão público identificado na descrição'];if(/CRED\.COBR|COBRANCA|BOLETO|BOLEPIX|LIQUIDACAO COBR/.test(d))return['Receita parcelada de clientes',92,'Recebimento de cobrança/boleto identificado'];if(/TED|PIX|CREDITO/.test(d))return['Outras receitas',62,'Entrada bancária sem vínculo contratual confirmado'];return['Outras receitas',50,'Entrada não reconhecida com segurança'];}if(/SIMPLES|DARF|DAS |FGTS|INSS|IMPOST|TRIBUTO|GPS|ISS|IRRF/.test(d))return['Tributos e obrigações',95,'Tributo/obrigação identificado'];if(/TARIFA|LIQ\.COB|LIQ COB|BAIXA BOLETO|INST\. BOLETO|MANUTENCAO CONTA|PACOTE/.test(d))return['Tarifas e serviços bancários',96,'Tarifa ou serviço bancário identificado'];if(/FOLHA|SALARIO|PROLABORE|PRO-LABORE|VALE |BENEFICIO/.test(d))return['Folha e encargos',88,'Despesa relacionada a pessoal'];if(/JONATHAN DAVID|SOCIO|DISTRIBUICAO|RETIRADA/.test(d))return['Retirada e distribuição aos sócios',70,'Possível retirada de sócio; requer revisão'];if(/ALUGUEL|CONTABIL|SOFTWARE|LICENCA|INTERNET|SEGURO|EMPRESTIMO|FINANCIAMENTO/.test(d))return['Despesa fixa',82,'Padrão de despesa recorrente/fixa'];if(/POSTO|COMBUST|LOCALIZA|RENT A CAR|HOTEL|RESTAUR|PEDAGIO|UBER|99APP|MATERIAL|MANUTENCAO|CARTAO DEBITO|SAQUE/.test(d))return['Despesa variável',86,'Despesa operacional variável identificada'];return['Despesa variável',52,'Débito sem categoria específica; revisar'];}
  function similarity(a,b){const A=new Set(normalize(a).split(/\W+/).filter(x=>x.length>3)),B=new Set(normalize(b).split(/\W+/).filter(x=>x.length>3));if(!A.size||!B.size)return 0;let hit=0;A.forEach(x=>{if(B.has(x))hit++});return hit/Math.max(A.size,B.size)}
  function possibleDuplicate(row){const day=new Date(row.date+'T12:00:00').getTime(),candidates=[];(db.accountPayments||[]).forEach(p=>{const diff=Math.abs(new Date(p.due+'T12:00:00').getTime()-day)/86400000;if(Math.abs((+p.value||0)-row.value)<0.01&&diff<=5){const m=(db.accountMasters||[]).find(a=>a.id===p.accountId);candidates.push({type:'Conta cadastrada',label:m?.name||'Conta',id:p.id,score:.92})}});(db.budgetExpenses||[]).forEach(e=>{const diff=Math.abs(new Date(e.date+'T12:00:00').getTime()-day)/86400000;if(Math.abs((+e.value||0)-row.value)<0.01&&diff<=3)candidates.push({type:'Gasto de orçamento',label:e.description,id:e.id,score:.9+similarity(row.description,e.description)*.08})});(db.cashflow||[]).forEach(e=>{if(e.source==='Extrato bancário')return;const diff=Math.abs(new Date(e.date+'T12:00:00').getTime()-day)/86400000;if(Math.abs((+e.value||0)-row.value)<0.01&&diff<=3)candidates.push({type:'Fluxo de caixa',label:e.description,id:e.id,score:.88+similarity(row.description,e.description)*.1})});return candidates.sort((a,b)=>b.score-a.score)[0]||null}
  function parseIntegralCsv(text){const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()),rows=[];for(const line of lines){const c=csvSplit(line);if(c.length<5)continue;const date=isoDate(c[0]);if(!date)continue;const direction=normalize(c[4])==='C'?'Entrada':normalize(c[4])==='D'?'Saída':'';if(!direction)continue;const value=brMoney(c[3]);if(!value)continue;const[kind,confidence,reason]=classify(c[1],direction==='Entrada');const row={id:v2uid(),date,description:c[1],reference:c[2]||'',value,direction,kind,confidence,reason,source:'Extrato bancário',reviewStatus:'Pendente',selected:true};row.duplicate=possibleDuplicate(row);rows.push(row)}return rows}
  function optionKinds(selected){return CASH_KINDS.map(k=>`<option ${k===selected?'selected':''}>${k}</option>`).join('')}
  function reviewModal(rows,fileName){const x=v2modal('Revisar importação do extrato',`<div class="modal-body v3-review"><div class="page-intro"><div><h3>${esc(fileName)}</h3><p>A classificação é automática, mas nada entra no fluxo até você confirmar.</p></div><strong>${rows.length} movimentações</strong></div><div class="v3-summary"><span><b>${rows.filter(r=>r.direction==='Entrada').length}</b> entradas</span><span><b>${rows.filter(r=>r.direction==='Saída').length}</b> saídas</span><span class="warn"><b>${rows.filter(r=>r.duplicate).length}</b> possíveis duplicidades</span></div><div class="v3-review-list">${rows.map((r,i)=>`<div class="v3-review-row ${r.duplicate?'duplicate':''}" data-v3row="${i}"><label class="v3-check"><input type="checkbox" data-v3sel="${i}" checked><span></span></label><div class="v3-main"><div class="v3-title"><b>${fmt(r.date)}</b><strong>${esc(r.description)}</strong><span class="badge ${r.direction==='Entrada'?'ok':'danger'}">${r.direction}</span></div><div class="muted">Ref. ${esc(r.reference||'—')} • IA ${r.confidence}% • ${esc(r.reason)}</div>${r.duplicate?`<div class="notice warn compact">Possível duplicidade: <b>${esc(r.duplicate.type)}</b> — ${esc(r.duplicate.label)}. Desmarque esta linha se já estiver registrada.</div>`:''}</div><div class="v3-edit"><select data-v3kind="${i}">${optionKinds(r.kind)}</select><input data-v3desc="${i}" value="${esc(r.description)}"><b>${money(r.value)}</b></div></div>`).join('')}</div></div><div class="modal-foot"><button class="btn ghost" data-v3cancel>Cancelar</button><button class="btn" data-v3confirm>Adicionar selecionados ao fluxo</button></div>`);x.querySelector('[data-v3cancel]').onclick=()=>x.remove();x.querySelectorAll('[data-v3sel]').forEach(el=>el.onchange=()=>rows[+el.dataset.v3sel].selected=el.checked);x.querySelectorAll('[data-v3kind]').forEach(el=>el.onchange=()=>rows[+el.dataset.v3kind].kind=el.value);x.querySelectorAll('[data-v3desc]').forEach(el=>el.oninput=()=>rows[+el.dataset.v3desc].description=el.value);x.querySelector('[data-v3confirm]').onclick=()=>{const selected=rows.filter(r=>r.selected).map(r=>({id:v2uid(),date:r.date,description:r.description,kind:r.kind,direction:r.direction,value:r.value,source:'Extrato bancário',reference:r.reference,importedAt:new Date().toISOString(),aiConfidence:r.confidence}));db.cashflow.push(...selected);db.bankImports=db.bankImports||[];db.bankImports.push({id:v2uid(),fileName,createdAt:new Date().toISOString(),rows:rows.length,imported:selected.length,duplicates:rows.filter(r=>r.duplicate).length});save();x.remove();cashflow()}}
  function openImporter(){const x=v2modal('Importar extrato bancário',`<div class="modal-body"><div class="dropzone"><h3>Selecione o extrato da conta</h3><p>Formato reconhecido: CSV separado por ponto e vírgula, com data, descrição, referência, valor e C/D.</p><input id="v3BankFile" type="file" accept=".csv,text/csv"></div><div class="notice">O sistema classifica as movimentações, procura possíveis duplicidades em Contas, Orçamentos e Fluxo de Caixa e abre uma revisão antes de lançar qualquer valor.</div></div><div class="modal-foot"><button class="btn ghost" data-v2close>Cancelar</button><button class="btn" id="v3ReadBank" disabled>Analisar extrato</button></div>`);const file=x.querySelector('#v3BankFile'),btn=x.querySelector('#v3ReadBank');let chosen=null;file.onchange=()=>{chosen=file.files?.[0]||null;btn.disabled=!chosen};btn.onclick=()=>{if(!chosen)return;const rd=new FileReader();rd.onload=()=>{const rows=parseIntegralCsv(rd.result);if(!rows.length){alert('Nenhuma movimentação válida foi encontrada nesse arquivo.');return}x.remove();reviewModal(rows,chosen.name)};rd.readAsText(chosen,'UTF-8')}}
  const baseCashflow=cashflow;cashflow=function(){baseCashflow();const c=$('#content');if(!c||$('#v3ImportBank'))return;const bar=document.createElement('div');bar.className='v3-import-card';bar.innerHTML=`<div><span class="badge">Conciliação bancária</span><h3>Importar extrato da conta</h3><p>Classifique entradas e saídas automaticamente, revise possíveis duplicidades e consolide apenas o que for confirmado.</p></div><div><button class="btn" id="v3ImportBank">Importar CSV do banco</button>${(db.bankImports||[]).length?`<small>${db.bankImports.length} importação(ões) registrada(s)</small>`:''}</div>`;c.insertBefore(bar,c.firstChild);$('#v3ImportBank').onclick=openImporter};
  window.IntegralBankImporter={parseIntegralCsv,classify,possibleDuplicate};
})();

;

/* ===== SOURCE: patch-v4.js ===== */
/* Integral Financeiro MVP - fluxo compacto, cadastros, usuários e login limpo */
(function(){
  const naturesDefault=['Despesa fixa','Despesa variável','Folha e encargos','Retirada e distribuição aos sócios','Receita parcelada de clientes','Receita de contratos públicos','Receita avulsa de contratos privados','Outras receitas','Tarifas bancárias','Tributos'];
  function ensureMvp(){
    if(!db.natures) db.natures=naturesDefault.map((name,i)=>({id:i+1,name,active:true}));
    if(!db.sectors) db.sectors=['Administrativo','Projetos','Topografia','Comercial'].map((name,i)=>({id:i+1,name,active:true}));
    if(!db.suppliers) db.suppliers=[];
    if(!db.categories) db.categories=['Impostos','Custos fixos','Combustível','Seguros','Software','Hospedagem','Alimentação','Equipamentos','Material técnico','Outros'].map((name,i)=>({id:i+1,name,active:true}));
    if(!db.usersMvp) db.usersMvp=[{id:1,name:'Administrador Integral',email:'admin@integral.local',role:'Administrador',sector:'Administrativo',active:true},{id:2,name:'Funcionário Demo',email:'funcionario@integral.local',role:'Funcionário',sector:'Topografia',active:true}];
    save();
  }
  ensureMvp();

  const oldLogin=login;
  login=function(){
    user=null;
    $('#app').innerHTML=`<main class="login-wrap"><section class="login-card"><img class="login-logo" src="logo-integral.png"><h1>Integral Financeiro</h1><div class="sub">Gestão financeira, orçamentária e documental</div><form id="login"><div class="field"><label>E-mail</label><input id="email" type="email" required autocomplete="username"></div><div class="field"><label>Senha</label><input id="pass" type="password" required autocomplete="current-password"></div><button class="btn wide">Entrar</button><div id="err" class="login-error"></div></form></section></main>`;
    matrix(true);
    $('#login').onsubmit=e=>{
      e.preventDefault();
      const email=$('#email').value.trim().toLowerCase(), pass=$('#pass').value;
      const found=db.usersMvp.find(u=>u.email.toLowerCase()===email&&u.active);
      if(!found||pass!=='integral2026') return $('#err').textContent='E-mail ou senha inválidos.';
      user={name:found.name,role:found.role,sector:found.sector};
      view=found.role==='Administrador'?'dashboard':'documents';
      matrix(false);app();
    };
  };

  const natureNames=()=>db.natures.filter(n=>n.active).map(n=>n.name);
  const natureOptions=(selected='')=>natureNames().map(v=>`<option ${v===selected?'selected':''}>${esc(v)}</option>`).join('');

  const oldAccounts=accounts;
  accounts=function(){
    if(user.role!=='Administrador') return documents();
    title('Contas');
    const payments=(v2state.accountsMode==='month'?db.accountPayments.filter(p=>v2month(p.due)===v2state.accountsMonth):db.accountPayments).map(p=>({...p,master:v2master(p.accountId)}));
    $('#content').innerHTML=`<div class="toolbar"><div class="left"><div class="segmented"><button id="v2MonthMode" class="${v2state.accountsMode==='month'?'active':''}">Contas do mês</button><button id="v2AllMode" class="${v2state.accountsMode==='all'?'active':''}">Todas as contas cadastradas</button></div>${v2state.accountsMode==='month'?v2picker(v2state.accountsMonth,'v2AccountsMonth'):''}</div><div class="right"><button class="btn ghost" id="v2AiBills">Enviar boletos para IA</button><button class="btn" id="v2NewAccount">+ Cadastrar conta</button></div></div>${v2state.accountsMode==='all'?`<div class="grid cols-3">${db.accountMasters.map(a=>{const ps=db.accountPayments.filter(p=>p.accountId===a.id);return `<button class="card account-master-card" data-v4master="${a.id}"><span class="badge ok">${a.active?'Ativa':'Inativa'}</span><h3>${esc(a.name)}</h3><p>${esc(a.supplier||'')}</p><div class="account-meta"><span>${esc(a.category||'')}</span><span>${esc(a.sector||'')}</span></div><b>${ps.length} pagamento(s) cadastrado(s)</b></button>`}).join('')}</div>`:`<div class="page-intro"><div><h3>${v2monthLabel(v2state.accountsMonth)}</h3><p>Somente pagamentos com vencimento neste mês.</p></div><strong>${payments.length} pagamento(s)</strong></div><div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Conta</th><th>Fornecedor</th><th>Vencimento</th><th>Forma</th><th>Setor</th><th>Valor</th><th>Status</th></tr></thead><tbody>${payments.map(p=>`<tr class="click-row" data-v4master="${p.master?.id||''}"><td><b>${esc(p.master?.name||'')}</b></td><td>${esc(p.master?.supplier||'')}</td><td>${fmt(p.due)}</td><td>${esc(p.master?.method||'')}</td><td>${esc(p.master?.sector||'')}</td><td class="num"><b>${money(p.value)}</b></td><td>${badgeStatus(p.status)}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">Nenhuma conta neste mês.</div></td></tr>'}</tbody></table></div>`}`;
    $('#v2MonthMode').onclick=()=>{v2state.accountsMode='month';accounts()};
    $('#v2AllMode').onclick=()=>{v2state.accountsMode='all';accounts()};
    if($('#v2AccountsMonth')) $('#v2AccountsMonth').onchange=e=>{v2state.accountsMonth=e.target.value;accounts()};
    $('#v2AiBills').onclick=()=>v2modal('Leitura de boletos por IA',`<div class="modal-body"><div class="dropzone"><h3>Envie todos os boletos da conta</h3><p>A IA irá identificar vencimento, valor, código e competência e separar cada pagamento no mês correto.</p><input type="file" multiple accept=".pdf,image/*"></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);
    $('#v2NewAccount').onclick=()=>v2AccountModal();
    $$('[data-v4master]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.v4master);if(id)v2AccountModal(id)});
  };

  cashflow=function(){
    if(user.role!=='Administrador') return documents();
    title('Fluxo de Caixa');
    const rows=(db.cashflow||[]).filter(r=>v2month(r.date)===v2state.cashMonth).sort((a,b)=>a.date.localeCompare(b.date));
    const incoming=rows.filter(r=>r.direction==='Entrada').reduce((s,r)=>s+r.value,0), outgoing=rows.filter(r=>r.direction==='Saída').reduce((s,r)=>s+r.value,0);
    $('#content').innerHTML=`<div class="toolbar compact-toolbar"><div class="left">${v2picker(v2state.cashMonth,'v4CashMonth')}<select id="v4NatureFilter"><option value="">Todas as naturezas</option>${natureNames().map(n=>`<option>${esc(n)}</option>`).join('')}</select></div><div class="right"><button class="btn ghost" id="v4NewNature">+ Natureza</button><button class="btn ghost" id="v3ImportBank">Importar extrato</button><button class="btn" id="v4NewCash">+ Lançamento</button></div></div><div class="grid cols-3 compact-metrics"><div class="card metric mini"><h3>Entradas</h3><b>${money(incoming)}</b></div><div class="card metric mini"><h3>Saídas</h3><b>${money(outgoing)}</b></div><div class="card metric mini"><h3>Resultado</h3><b class="${incoming-outgoing>=0?'kpi-positive':'kpi-negative'}">${money(incoming-outgoing)}</b></div></div><div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Data</th><th>Descrição</th><th>Natureza</th><th>Tipo</th><th>Origem</th><th class="num">Valor</th><th></th></tr></thead><tbody id="v4CashBody">${rows.map(r=>`<tr data-v4row="${r.id}" data-nature="${esc(r.kind||'')}"><td>${fmt(r.date)}</td><td>${esc(r.description)}</td><td><span class="cell-pill">${esc(r.kind||'Sem natureza')}</span></td><td>${r.direction}</td><td>${esc(r.source||'Manual')}</td><td class="num ${r.direction==='Entrada'?'kpi-positive':'kpi-negative'}">${money(r.value)}</td><td><button class="icon-btn" title="Editar" data-v4edit="${r.id}">✎</button><button class="icon-btn danger-text" title="Excluir" data-v4del="${r.id}">×</button></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">Sem movimentações neste mês.</div></td></tr>'}</tbody></table></div>`;
    $('#v4CashMonth').onchange=e=>{v2state.cashMonth=e.target.value;cashflow()};
    $('#v4NatureFilter').onchange=e=>$$('#v4CashBody tr[data-v4row]').forEach(tr=>tr.style.display=!e.target.value||tr.dataset.nature===e.target.value?'':'none');
    $('#v4NewNature').onclick=()=>v4NatureModal();
    $('#v4NewCash').onclick=()=>v4CashModal();
    if($('#v3ImportBank')) $('#v3ImportBank').onclick=()=>typeof v3BankImportModal==='function'?v3BankImportModal():alert('Importador indisponível.');
    $$('[data-v4edit]').forEach(b=>b.onclick=e=>{e.stopPropagation();v4CashModal(Number(b.dataset.v4edit))});
    $$('[data-v4del]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(confirm('Excluir este lançamento?')){db.cashflow=db.cashflow.filter(r=>r.id!==Number(b.dataset.v4del));save();cashflow()}});
  };

  function v4CashModal(id){
    const r=(db.cashflow||[]).find(x=>x.id===id);
    const x=v2modal(r?'Editar lançamento':'Novo lançamento',`<form id="v4CashForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Data</label><input name="date" type="date" value="${r?.date||new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Tipo</label><select name="direction"><option ${r?.direction==='Entrada'?'selected':''}>Entrada</option><option ${r?.direction==='Saída'?'selected':''}>Saída</option></select></div><div class="field full"><label>Descrição</label><input name="description" value="${esc(r?.description||'')}" required></div><div class="field"><label>Natureza</label><select name="kind">${natureOptions(r?.kind||'')}</select></div><div class="field"><label>Valor</label><input name="value" type="number" step="0.01" value="${r?.value||''}" required></div><div class="field full"><label>Origem</label><input name="source" value="${esc(r?.source||'Manual')}"></div></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);
    x.querySelector('#v4CashForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:r?.id||v2uid(),date:f.get('date'),direction:f.get('direction'),description:f.get('description'),kind:f.get('kind'),value:+f.get('value'),source:f.get('source')||'Manual'};r?Object.assign(r,o):db.cashflow.push(o);save();x.remove();cashflow()};
  }
  function v4NatureModal(id){
    const n=db.natures.find(x=>x.id===id);
    const x=v2modal(n?'Editar natureza':'Nova natureza',`<form id="v4NatureForm"><div class="modal-body"><div class="field"><label>Nome da natureza</label><input name="name" value="${esc(n?.name||'')}" required></div><div class="field check"><label><input type="checkbox" name="active" ${n?.active===false?'':'checked'}> Ativa</label></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);
    x.querySelector('#v4NatureForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:n?.id||v2uid(),name:f.get('name').trim(),active:f.get('active')==='on'};n?Object.assign(n,o):db.natures.push(o);save();x.remove();view==='registers'?registers():cashflow()};
  }

  registers=function(){
    if(user.role!=='Administrador') return documents();
    title('Cadastros');
    const sections=[['Naturezas','natures'],['Setores','sectors'],['Categorias','categories'],['Fornecedores','suppliers']];
    $('#content').innerHTML=`<div class="register-tabs">${sections.map(([l,k],i)=>`<button class="${i===0?'active':''}" data-v4regtab="${k}">${l}</button>`).join('')}</div><div id="v4RegisterPanel"></div>`;
    const renderReg=(key)=>{
      $$('.register-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.v4regtab===key));
      const items=db[key]||[];
      $('#v4RegisterPanel').innerHTML=`<div class="toolbar"><div class="left"><div class="muted">${items.length} registro(s)</div></div><button class="btn" id="v4AddReg">+ Novo</button></div><div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead><tbody>${items.map(i=>`<tr><td>${esc(i.name||'')}</td><td>${i.active===false?'<span class="badge">Inativo</span>':'<span class="badge ok">Ativo</span>'}</td><td><button class="btn small ghost" data-v4editreg="${i.id}">Editar</button></td></tr>`).join('')||'<tr><td colspan="3"><div class="empty">Nenhum cadastro.</div></td></tr>'}</tbody></table></div>`;
      $('#v4AddReg').onclick=()=>v4GenericRegisterModal(key);
      $$('[data-v4editreg]').forEach(b=>b.onclick=()=>v4GenericRegisterModal(key,Number(b.dataset.v4editreg)));
    };
    $$('[data-v4regtab]').forEach(b=>b.onclick=()=>renderReg(b.dataset.v4regtab));
    renderReg('natures');
  };
  function v4GenericRegisterModal(key,id){
    if(key==='natures') return v4NatureModal(id);
    const arr=db[key]||[], item=arr.find(x=>x.id===id), labels={sectors:'setor',categories:'categoria',suppliers:'fornecedor'};
    const x=v2modal(item?'Editar cadastro':'Novo cadastro',`<form id="v4RegForm"><div class="modal-body"><div class="field"><label>Nome do ${labels[key]||'item'}</label><input name="name" value="${esc(item?.name||'')}" required></div><div class="field check"><label><input type="checkbox" name="active" ${item?.active===false?'':'checked'}> Ativo</label></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);
    x.querySelector('#v4RegForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:item?.id||v2uid(),name:f.get('name').trim(),active:f.get('active')==='on'};item?Object.assign(item,o):arr.push(o);db[key]=arr;save();x.remove();registers()};
  }

  users=function(){
    if(user.role!=='Administrador') return documents();
    title('Usuários');
    $('#content').innerHTML=`<div class="toolbar"><div class="left"><div class="muted">Gerencie acesso, perfil e setor dos usuários.</div></div><button class="btn" id="v4NewUser">+ Novo usuário</button></div><div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Setor</th><th>Status</th><th></th></tr></thead><tbody>${db.usersMvp.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc(u.sector||'')}</td><td>${u.active?'<span class="badge ok">Ativo</span>':'<span class="badge">Inativo</span>'}</td><td><button class="btn small ghost" data-v4user="${u.id}">Editar</button></td></tr>`).join('')}</tbody></table></div><div class="notice warn" style="margin-top:16px">MVP: os usuários são persistidos localmente no navegador. Na próxima etapa, esta tela será conectada ao Supabase Auth para criação real de acesso e redefinição de senha.</div>`;
    $('#v4NewUser').onclick=()=>v4UserModal();
    $$('[data-v4user]').forEach(b=>b.onclick=()=>v4UserModal(Number(b.dataset.v4user)));
  };
  function v4UserModal(id){
    const u=db.usersMvp.find(x=>x.id===id), sectors=db.sectors.filter(s=>s.active).map(s=>s.name);
    const x=v2modal(u?'Editar usuário':'Novo usuário',`<form id="v4UserForm"><div class="modal-body"><div class="form-grid"><div class="field"><label>Nome</label><input name="name" value="${esc(u?.name||'')}" required></div><div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(u?.email||'')}" required></div><div class="field"><label>Perfil</label><select name="role"><option ${u?.role==='Administrador'?'selected':''}>Administrador</option><option ${u?.role==='Financeiro'?'selected':''}>Financeiro</option><option ${u?.role==='Gestor'?'selected':''}>Gestor</option><option ${u?.role==='Funcionário'?'selected':''}>Funcionário</option></select></div><div class="field"><label>Setor</label><select name="sector">${sectors.map(s=>`<option ${u?.sector===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div><div class="field check full"><label><input name="active" type="checkbox" ${u?.active===false?'':'checked'}> Usuário ativo</label></div></div></div><div class="modal-foot"><button class="btn">Salvar usuário</button></div></form>`);
    x.querySelector('#v4UserForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),email=f.get('email').trim().toLowerCase();if(db.usersMvp.some(v=>v.id!==u?.id&&v.email.toLowerCase()===email))return alert('Já existe um usuário com este e-mail.');const o={id:u?.id||v2uid(),name:f.get('name').trim(),email,role:f.get('role'),sector:f.get('sector'),active:f.get('active')==='on'};u?Object.assign(u,o):db.usersMvp.push(o);save();x.remove();users()};
  }
})();
;

/* ===== SOURCE: patch-v5.js ===== */
/* Integral Financeiro V5 - agente IA conectado ao fluxo de caixa */
(function(){
  const activeNatures=()=>((db.natures||[]).filter(n=>n.active!==false).map(n=>n.name));
  const natureOptions=(selected='')=>activeNatures().map(n=>`<option ${n===selected?'selected':''}>${esc(n)}</option>`).join('');
  async function classifyWithAI(rows){
    const response=await fetch('/api/ai-classify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({natures:activeNatures(),rows:rows.map(r=>({date:r.date,description:r.description,reference:r.reference,value:r.value,direction:r.direction}))})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok) throw new Error(data.details||data.error||'Falha ao consultar o agente IA.');
    const byIndex=new Map((data.classifications||[]).map(c=>[c.index,c]));
    return rows.map((r,i)=>{const c=byIndex.get(i);return c?{...r,kind:c.nature||r.kind,description:c.normalized_description||r.description,confidence:c.confidence??r.confidence,reason:c.reason||r.reason,aiModel:data.model||'',aiReal:true}:r});
  }
  function reviewAiRows(rows,fileName){
    const x=v2modal('Revisar extrato analisado pela IA',`<div class="modal-body v3-review"><div class="page-intro"><div><span class="badge ok">Agente IA conectado</span><h3>${esc(fileName)}</h3><p>Nada entra no fluxo até você confirmar. Linhas identificadas como duplicidade ficam desmarcadas automaticamente.</p></div><strong>${rows.length} movimentações</strong></div><div class="v3-summary"><span><b>${rows.filter(r=>r.direction==='Entrada').length}</b> entradas</span><span><b>${rows.filter(r=>r.direction==='Saída').length}</b> saídas</span><span class="warn"><b>${rows.filter(r=>r.duplicate).length}</b> possíveis duplicidades</span></div><div class="v3-review-list">${rows.map((r,i)=>`<div class="v3-review-row ${r.duplicate?'duplicate':''}" data-airow="${i}"><label class="v3-check"><input type="checkbox" data-aisel="${i}" ${r.selected!==false?'checked':''}><span></span></label><div class="v3-main"><div class="v3-title"><b>${fmt(r.date)}</b><strong>${esc(r.description)}</strong><span class="badge ${r.direction==='Entrada'?'ok':'danger'}">${r.direction}</span></div><div class="muted">IA ${r.confidence||0}% • ${esc(r.reason||'Classificação automática')}</div>${r.duplicate?`<div class="notice warn compact">Possível duplicidade: <b>${esc(r.duplicate.type)}</b> — ${esc(r.duplicate.label)}. Esta linha foi desmarcada automaticamente.</div>`:''}</div><div class="v3-edit"><select data-aikind="${i}">${natureOptions(r.kind)}</select><input data-aidesc="${i}" value="${esc(r.description)}"><b>${money(r.value)}</b></div></div>`).join('')}</div></div><div class="modal-foot"><button class="btn ghost" data-v2close>Cancelar</button><button class="btn" data-aiconfirm>Adicionar selecionados ao fluxo</button></div>`);
    x.querySelectorAll('[data-aisel]').forEach(el=>el.onchange=()=>rows[+el.dataset.aisel].selected=el.checked);
    x.querySelectorAll('[data-aikind]').forEach(el=>el.onchange=()=>rows[+el.dataset.aikind].kind=el.value);
    x.querySelectorAll('[data-aidesc]').forEach(el=>el.oninput=()=>rows[+el.dataset.aidesc].description=el.value);
    x.querySelector('[data-aiconfirm]').onclick=()=>{const selected=rows.filter(r=>r.selected!==false).map(r=>({id:v2uid(),date:r.date,description:r.description,kind:r.kind,direction:r.direction,value:r.value,source:'Extrato bancário + IA',reference:r.reference,importedAt:new Date().toISOString(),aiConfidence:r.confidence,aiModel:r.aiModel||''}));db.cashflow=db.cashflow||[];db.cashflow.push(...selected);db.bankImports=db.bankImports||[];db.bankImports.push({id:v2uid(),fileName,createdAt:new Date().toISOString(),rows:rows.length,imported:selected.length,duplicates:rows.filter(r=>r.duplicate).length,ai:true,model:rows.find(r=>r.aiModel)?.aiModel||''});save();x.remove();cashflow()};
  }
  function openAiImporter(){
    if(!window.IntegralBankImporter){alert('Leitor de extrato indisponível.');return;}
    const x=v2modal('Importar extrato com Agente IA',`<div class="modal-body"><div class="dropzone"><span class="badge ok">OpenAI</span><h3>Selecione o extrato da conta</h3><p>O arquivo será lido no navegador e as movimentações serão enviadas ao agente financeiro para classificação. O arquivo completo não é armazenado pela interface.</p><input id="aiBankFile" type="file" accept=".csv,text/csv"></div><div class="notice">Depois da IA classificar, o sistema compara valor, data e origem com Contas pagas, Orçamentos e lançamentos existentes.</div><div id="aiStatus" class="muted" style="margin-top:12px"></div></div><div class="modal-foot"><button class="btn ghost" data-v2close>Cancelar</button><button class="btn" id="aiAnalyze" disabled>Analisar com IA</button></div>`);
    const file=x.querySelector('#aiBankFile'),btn=x.querySelector('#aiAnalyze'),status=x.querySelector('#aiStatus');let chosen=null;
    file.onchange=()=>{chosen=file.files?.[0]||null;btn.disabled=!chosen};
    btn.onclick=()=>{if(!chosen)return;btn.disabled=true;status.textContent='Lendo extrato...';const rd=new FileReader();rd.onload=async()=>{try{let rows=window.IntegralBankImporter.parseIntegralCsv(rd.result);if(!rows.length)throw new Error('Nenhuma movimentação válida encontrada.');status.textContent=`Agente IA analisando ${rows.length} movimentações...`;rows=await classifyWithAI(rows);rows=rows.map(r=>{const duplicate=window.IntegralBankImporter.possibleDuplicate(r);return {...r,duplicate,selected:!duplicate}});x.remove();reviewAiRows(rows,chosen.name)}catch(err){status.innerHTML=`<span class="kpi-negative">${esc(err.message||String(err))}</span>`;btn.disabled=false}};rd.readAsText(chosen,'UTF-8')};
  }
  const baseCashflow=cashflow;cashflow=function(){baseCashflow();const btn=$('#v3ImportBank');if(btn){btn.textContent='Importar extrato com IA';btn.onclick=openAiImporter}};
  window.IntegralFinanceAI={classifyWithAI,openAiImporter};
})();

;

/* ===== SOURCE: patch-v6.js ===== */
/* Integral Financeiro V6 */
(function(){
const uid=()=>typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999), mo=d=>String(d||'').slice(0,7), nowMo=()=>new Date().toISOString().slice(0,7), isAdm=()=>user?.role==='Administrador', ur=()=>db.usersMvp?.find(x=>x.name===user?.name), sec=()=>db.sectors?.filter(x=>x.active!==false).map(x=>x.name)||[], us=()=>db.usersMvp?.filter(x=>x.active!==false)||[], fmeta=f=>f?{name:f.name,type:f.type,size:f.size,addedAt:new Date().toISOString()}:null;
const ml=m=>{let[y,n]=m.split('-');return new Date(+y,+n-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}, addm=(d,n)=>{let x=new Date(d+'T12:00:00');x.setMonth(x.getMonth()+n);return x.toISOString().slice(0,10)}, opts=(a,s='')=>a.map(v=>`<option ${v===s?'selected':''}>${esc(v)}</option>`).join('');
Object.assign(db,{budgetRecords:db.budgetRecords||[],budgetExpenses:db.budgetExpenses||[],tripDocuments:db.tripDocuments||[],planRevenues:db.planRevenues||[],planExpenses:db.planExpenses||[],hrPeople:db.hrPeople||[],hrPayments:db.hrPayments||[]});
if(!db.budgetRecords.length)db.budgetRecords=(db.budgets||[]).map(b=>({id:uid(),name:`Orçamento ${b.sector}`,sector:b.sector,limit:+b.limit||0,assigned:[],erpPlan:'',active:true,history:[]}));
if(!db.planRevenues.length)db.planRevenues=(db.revenues||[]).map(r=>({id:uid(),origin:r.name,total:+r.total||0,installments:+r.installments||1,start:r.start,cadence:'Mensal',interval:1}));save();
adminNav.splice(0,adminNav.length,['dashboard','Visão Geral'],['accounts','Contas'],['documents','Documentos Fiscais'],['cashflow','Fluxo de Caixa'],['budgets','Orçamentos'],['trips','Viagens'],['planning','Planejamento'],['hr','RH'],['reports','Relatórios'],['sep',''],['registers','Cadastros'],['users','Usuários']);
const oldRender=render;render=function(){return view==='hr'?hr():oldRender()};
const paid=()=> (db.accountPayments||[]).filter(p=>p.status==='Paga').map(p=>{let m=db.accountMasters?.find(a=>a.id===p.accountId);return{id:'a'+p.id,date:p.paidAt?.slice(0,10)||p.due,description:m?.name||'Conta paga',kind:m?.category||'Despesa fixa',direction:'Saída',value:+p.value||0,source:'Conta paga'}}), br=()=>db.budgetExpenses.map(e=>({id:'b'+e.id,date:e.date,description:e.description,kind:'Despesa variável',direction:'Saída',value:+e.value,source:'Orçamento'})), manual=()=> (db.cashflow||[]).filter(r=>!['Conta paga','Orçamento'].includes(r.source)), real=()=>[...manual(),...paid(),...br()];
function dup(r){let c=[...paid(),...br(),...manual()].filter(x=>Math.abs((+x.value)-(+r.value))<.01&&Math.abs(new Date(x.date)-new Date(r.date))/864e5<=5);return c[0]?{type:c[0].source,label:c[0].description}:null} if(window.IntegralBankImporter)window.IntegralBankImporter.possibleDuplicate=dup;
cashflow=function(){if(!isAdm())return documents();title('Fluxo de Caixa');let m=v2state.cashMonth||nowMo(),rs=real().filter(r=>mo(r.date)===m).sort((a,b)=>a.date.localeCompare(b.date)),i=rs.filter(r=>r.direction==='Entrada'),o=rs.filter(r=>r.direction==='Saída'),iv=i.reduce((s,r)=>s+r.value,0),ov=o.reduce((s,r)=>s+r.value,0),bal=iv-ov,prev=real().filter(r=>mo(r.date)<m).reduce((s,r)=>s+(r.direction==='Entrada'?r.value:-r.value),0),pct=iv?bal/iv*100:0;let tab=(a)=>`<div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Data</th><th>Descrição</th><th>Natureza</th><th>Origem</th><th>Valor</th></tr></thead><tbody>${a.map(r=>`<tr><td>${fmt(r.date)}</td><td><b>${esc(r.description)}</b></td><td>${esc(r.kind||'')}</td><td>${esc(r.source||'')}</td><td>${money(r.value)}</td></tr>`).join('')||'<tr><td colspan="5">Sem lançamentos.</td></tr>'}</tbody></table></div>`;$('#content').innerHTML=`<div class="toolbar"><div>${v2picker(m,'v6cm')}</div><button class="btn" id="v3ImportBank">Importar extrato com IA</button></div><div class="grid cols-4"><div class="card metric"><h3>Entradas</h3><b>${money(iv)}</b></div><div class="card metric"><h3>Saídas</h3><b>${money(ov)}</b></div><div class="card metric"><h3>Saldo</h3><b>${money(bal)}</b><small>${pct.toFixed(1)}% de sobra</small></div><div class="card metric"><h3>Acumulado</h3><b>${money(prev+bal)}</b><small>${money(prev)} mês anterior</small></div></div><h3 class="section-title cash-in-title">Entradas</h3>${tab(i)}<h3 class="section-title cash-out-title">Saídas</h3>${tab(o)}`;$('#v6cm').onchange=e=>{v2state.cashMonth=e.target.value;cashflow()};$('#v3ImportBank').onclick=()=>window.IntegralFinanceAI?.openAiImporter?.()};
function bvis(b){return isAdm()||(b.assigned||[]).includes(ur()?.id)}
budgets=function(){title(isAdm()?'Orçamentos':'Meu Orçamento');let a=db.budgetRecords.filter(b=>b.active!==false&&bvis(b));$('#content').innerHTML=`<div class="toolbar"><span>${a.length} orçamento(s)</span>${isAdm()?'<button class="btn" id="nb">+ Criar orçamento</button>':''}</div><div class="grid cols-2">${a.map(b=>{let s=db.budgetExpenses.filter(e=>e.budgetId===b.id&&mo(e.date)===nowMo()).reduce((x,e)=>x+e.value,0);return`<button class="card v6-budget-card" data-b="${b.id}"><span class="badge">${esc(b.sector)}</span><h3>${esc(b.name)}</h3><p>${money(s)} de ${money(b.limit)}</p><small>${esc(b.erpPlan||'Sem plano ERP')}</small></button>`}).join('')}</div>`;if($('#nb'))$('#nb').onclick=()=>bm();$$('[data-b]').forEach(x=>x.onclick=()=>bp(+x.dataset.b))};
function bm(id){if(!isAdm())return;let b=db.budgetRecords.find(x=>x.id===id),x=v2modal(b?'Editar orçamento':'Criar orçamento',`<form id="bf"><div class="modal-body"><div class="field"><label>Nome</label><input name="name" value="${esc(b?.name||'')}" required></div><div class="field"><label>Setor</label><select name="sector">${opts(sec(),b?.sector)}</select></div><div class="field"><label>Limite</label><input name="limit" type="number" step=".01" value="${b?.limit||''}" required></div><div class="field"><label>Plano de Trabalho ERP (opcional)</label><input name="erp" value="${esc(b?.erpPlan||'')}"></div><div class="field"><label>Usuários com acesso</label>${us().map(u=>`<label class="check-line"><input type="checkbox" name="assigned" value="${u.id}" ${(b?.assigned||[]).includes(u.id)?'checked':''}>${esc(u.name)}</label>`).join('')}</div></div><div class="modal-foot">${b?'<button type="button" class="btn danger" id="bd">Excluir</button>':''}<button class="btn">Salvar</button></div></form>`);x.querySelector('#bf').onsubmit=e=>{e.preventDefault();let f=new FormData(e.target),o={id:b?.id||uid(),name:f.get('name'),sector:f.get('sector'),limit:+f.get('limit'),erpPlan:f.get('erp'),assigned:f.getAll('assigned').map(Number),active:true,history:b?.history||[]};o.history.push({at:new Date().toISOString(),action:b?'Editado':'Criado',by:user.name});b?Object.assign(b,o):db.budgetRecords.push(o);save();x.remove();budgets()};if($('#bd'))x.querySelector('#bd').onclick=()=>{b.active=false;b.history.push({at:new Date().toISOString(),action:'Excluído',by:user.name});save();x.remove();budgets()}}
function bp(id){let b=db.budgetRecords.find(x=>x.id===id);if(!b||!bvis(b))return budgets();let a=db.budgetExpenses.filter(e=>e.budgetId===id);title(b.name);$('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="bb">← Voltar</button><div>${isAdm()?'<button class="btn ghost" id="be">Editar orçamento</button>':''}<button class="btn" id="ag">+ Gasto</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Gasto/origem</th><th>Comprovante</th><th>IA</th><th>Valor</th><th></th></tr></thead><tbody>${a.map(e=>`<tr><td>${fmt(e.date)}</td><td><b>${esc(e.description)}</b><small>${esc(e.origin||'')}</small></td><td>${esc(e.file?.name||'')}</td><td>${e.ai?badgeStatus(e.duplicate?'Revisar IA':'Confirmado'):'—'}</td><td>${money(e.value)}</td><td>${isAdm()?`<button class="icon-btn" data-ee="${e.id}">✎</button><button class="icon-btn danger-text" data-ed="${e.id}">×</button>`:''}</td></tr>`).join('')}</tbody></table></div><h3 class="section-title">Histórico</h3><div class="card history-list">${[...(b.history||[]),...a.flatMap(e=>e.history||[])].map(h=>`<div><b>${new Date(h.at).toLocaleString('pt-BR')}</b><span>${esc(h.action)} • ${esc(h.by||'')}</span></div>`).join('')}</div>`;$('#bb').onclick=budgets;if($('#be'))$('#be').onclick=()=>bm(id);$('#ag').onclick=()=>em(id);$$('[data-ee]').forEach(z=>z.onclick=()=>em(id,+z.dataset.ee));$$('[data-ed]').forEach(z=>z.onclick=()=>{let e=db.budgetExpenses.find(q=>q.id===+z.dataset.ed);b.history.push({at:new Date().toISOString(),action:`Gasto excluído: ${e.description}`,by:user.name});db.budgetExpenses=db.budgetExpenses.filter(q=>q.id!==e.id);save();bp(id)})}
async function aiReceipt(f,id){let r=await new Promise((ok,no)=>{let x=new FileReader;x.onload=()=>ok(x.result);x.onerror=no;x.readAsDataURL(f)}),p=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:r,fileName:f.name,sector:db.budgetRecords.find(b=>b.id===id)?.sector,candidates:[...paid(),...br()].map(x=>({id:x.id,date:x.date,description:x.description,value:x.value,source:x.source}))})}),d=await p.json();if(!p.ok||!d.ok)throw Error(d.details||d.error);return d}
function em(bid,eid){let e=db.budgetExpenses.find(x=>x.id===eid),x=v2modal(e?'Editar gasto':'Adicionar gasto',`<form id="ef"><div class="modal-body"><div class="field"><label>Data</label><input name="date" type="date" value="${e?.date||new Date().toISOString().slice(0,10)}" required></div><div class="field"><label>Valor</label><input name="value" type="number" step=".01" value="${e?.value||''}" required></div><div class="field"><label>Descrição</label><input name="description" value="${esc(e?.description||'')}" required></div><div class="field"><label>Origem</label><input name="origin" value="${esc(e?.origin||'')}"></div><div class="field"><label>Comprovante</label><input id="rf" type="file" accept="image/*,.pdf"></div><div id="rs" class="muted"></div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`),f=x.querySelector('#ef'),ai=null,fi=x.querySelector('#rf');fi.onchange=async()=>{if(!fi.files[0])return;x.querySelector('#rs').textContent='IA analisando...';try{ai=await aiReceipt(fi.files[0],bid);x.querySelector('#rs').innerHTML=`${ai.duplicate?'Possível duplicidade':'OK'} • ${money(ai.value)} • ${esc(ai.origin||'')}`;if(ai.value)f.value.value=ai.value;if(ai.origin)f.origin.value=ai.origin}catch(z){x.querySelector('#rs').textContent=z.message}};f.onsubmit=v=>{v.preventDefault();let d=new FormData(f),o={id:e?.id||uid(),budgetId:bid,date:d.get('date'),value:+d.get('value'),description:d.get('description'),origin:d.get('origin'),file:fi.files[0]?fmeta(fi.files[0]):e?.file,ai:!!ai,duplicate:ai?.duplicate||null,history:e?.history||[]};o.history.push({at:new Date().toISOString(),action:e?'Gasto editado':'Gasto adicionado',by:user.name});e?Object.assign(e,o):db.budgetExpenses.push(o);save();x.remove();bp(bid)}}
trips=function(){title('Viagens');$('#content').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Documentos</th><th></th></tr></thead><tbody>${db.trips.map(t=>`<tr><td>${esc(t.city)}</td><td>${esc(t.period)}</td><td>${esc(t.employee)}</td><td>${db.tripDocuments.filter(d=>d.tripId===t.id).length}</td><td><button class="btn small" data-t="${t.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`;$$('[data-t]').forEach(x=>x.onclick=()=>tp(+x.dataset.t))};
function tp(id){let t=db.trips.find(x=>x.id===id),a=db.tripDocuments.filter(x=>x.tripId===id);title(`Viagem • ${t.city}`);$('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="tb">← Viagens</button><button class="btn" id="tu">Enviar documento</button></div><div class="card">${a.map(d=>`<div class="file-row"><b>${esc(d.file.name)}</b><span>${new Date(d.addedAt).toLocaleString('pt-BR')}</span></div>`).join('')||'Sem documentos.'}</div>`;$('#tb').onclick=trips;$('#tu').onclick=()=>{let x=v2modal('Enviar documento',`<form id="tf"><div class="modal-body"><input name="file" type="file" required><input name="note" placeholder="Observação"></div><div class="modal-foot"><button class="btn">Enviar</button></div></form>`);x.querySelector('#tf').onsubmit=e=>{e.preventDefault();let f=e.target.file.files[0];db.tripDocuments.push({id:uid(),tripId:id,file:fmeta(f),note:e.target.note.value,addedAt:new Date().toISOString(),by:user.name});save();x.remove();tp(id)}}}
const sched=(x,type)=>Array.from({length:+x.installments||1},(_,i)=>{let k=x.cadence==='Trimestral'?3:x.cadence==='Personalizado'?+x.interval||1:1;return{month:mo(addm(x.start,i*k)),value:(+x.total||0)/(+x.installments||1),type}});
planning=function(){if(!isAdm())return budgets();title('Planejamento');let ms=Array.from({length:12},(_,i)=>{let d=new Date();d.setDate(1);d.setMonth(d.getMonth()+i);return d.toISOString().slice(0,7)}),r=db.planRevenues.flatMap(x=>sched(x,'Entrada')),e=db.planExpenses.flatMap(x=>sched(x,'Saída')),rr=real();$('#content').innerHTML=`<div class="toolbar"><div class="notice">Planejamento não alimenta o Fluxo de Caixa.</div><div><button class="btn ghost" id="pe">+ Gasto planejado</button><button class="btn" id="pr">+ Receita recorrente</button></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Mês</th><th>Prev. entradas</th><th>Real entradas</th><th>Prev. gastos</th><th>Real gastos</th></tr></thead><tbody>${ms.map(m=>`<tr><td>${ml(m)}</td><td>${money(r.filter(x=>x.month===m).reduce((s,x)=>s+x.value,0))}</td><td>${money(rr.filter(x=>mo(x.date)===m&&x.direction==='Entrada').reduce((s,x)=>s+x.value,0))}</td><td>${money(e.filter(x=>x.month===m).reduce((s,x)=>s+x.value,0))}</td><td>${money(rr.filter(x=>mo(x.date)===m&&x.direction==='Saída').reduce((s,x)=>s+x.value,0))}</td></tr>`).join('')}</tbody></table></div><div class="grid cols-2"><div><h3>Receitas</h3>${pl(db.planRevenues,'r')}</div><div><h3>Despesas</h3>${pl(db.planExpenses,'e')}</div></div>`;$('#pr').onclick=()=>pm('r');$('#pe').onclick=()=>pm('e');$$('[data-p]').forEach(x=>x.onclick=()=>{let[t,id]=x.dataset.p.split(':');pm(t,+id)})};
function pl(a,t){return`<div class="card">${a.map(x=>`<button class="plan-row" data-p="${t}:${x.id}"><span><b>${esc(x.origin)}</b><small>${x.installments} • ${esc(x.cadence)}</small></span><strong>${money(x.total)}</strong></button>`).join('')||'Nenhum item.'}</div>`} function pm(t,id){let a=t==='r'?db.planRevenues:db.planExpenses,it=a.find(x=>x.id===id),x=v2modal(it?'Editar planejamento':'Novo planejamento',`<form id="pf"><div class="modal-body"><input name="origin" placeholder="Origem" value="${esc(it?.origin||'')}" required><input name="total" type="number" step=".01" placeholder="Valor total" value="${it?.total||''}" required><input name="installments" type="number" min="1" value="${it?.installments||1}" required><input name="start" type="date" value="${it?.start||new Date().toISOString().slice(0,10)}" required><select name="cadence"><option>Mensal</option><option>Trimestral</option><option>Personalizado</option></select><input name="interval" type="number" min="1" value="${it?.interval||1}" placeholder="Intervalo em meses"></div><div class="modal-foot">${it?'<button type="button" class="btn danger" id="pd">Excluir</button>':''}<button class="btn">Salvar</button></div></form>`),f=x.querySelector('#pf');f.cadence.value=it?.cadence||'Mensal';f.onsubmit=v=>{v.preventDefault();let d=new FormData(f),o={id:it?.id||uid(),origin:d.get('origin'),total:+d.get('total'),installments:+d.get('installments'),start:d.get('start'),cadence:d.get('cadence'),interval:+d.get('interval')||1};it?Object.assign(it,o):a.push(o);save();x.remove();planning()};if($('#pd'))x.querySelector('#pd').onclick=()=>{a.splice(a.indexOf(it),1);save();x.remove();planning()}}
function hr(){if(!isAdm())return documents();title('RH');let m=nowMo();$('#content').innerHTML=`<div class="toolbar"><span>Contratos e quitação mensal</span><button class="btn" id="hn">+ Colaborador</button></div><h3>${ml(m)} • salários vigentes</h3><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${db.hrPeople.filter(p=>p.start<=m+'-31'&&(!p.end||p.end>=m+'-01')).map(p=>{let q=db.hrPayments.find(x=>x.personId===p.id&&x.month===m);return`<tr><td><button class="linklike" data-h="${p.id}">${esc(p.name)}</button></td><td>${money(p.currentValue)}</td><td>${q?'Pago':'Pendente'}</td><td>${q?'Quitado':`<button class="btn small" data-pay="${p.id}">Marcar pago</button>`}</td></tr>`}).join('')}</tbody></table></div>`;$('#hn').onclick=()=>hm();$$('[data-h]').forEach(x=>x.onclick=()=>hp(+x.dataset.h));$$('[data-pay]').forEach(x=>x.onclick=()=>{let p=db.hrPeople.find(q=>q.id===+x.dataset.pay);db.hrPayments.push({id:uid(),personId:p.id,month:m,value:p.currentValue,paidAt:new Date().toISOString(),by:user.name});save();hr()})}
function hm(id){let p=db.hrPeople.find(x=>x.id===id),x=v2modal(p?'Editar colaborador':'Cadastrar colaborador',`<form id="hf"><div class="modal-body"><input name="name" placeholder="Nome" value="${esc(p?.name||'')}" required><input name="role" placeholder="Função" value="${esc(p?.role||'')}"><input name="value" type="number" step=".01" placeholder="Valor mensal" value="${p?.currentValue||''}" required><input name="start" type="date" value="${p?.start||''}" required><input name="end" type="date" value="${p?.end||''}"><input name="file" type="file" accept=".pdf,image/*"></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);x.querySelector('#hf').onsubmit=e=>{e.preventDefault();let d=new FormData(e.target),v=+d.get('value'),f=e.target.file.files[0],o={id:p?.id||uid(),name:d.get('name'),role:d.get('role'),currentValue:v,start:d.get('start'),end:d.get('end'),files:[...(p?.files||[])],values:[...(p?.values||[])]};if(f)o.files.push(fmeta(f));if(!p||p.currentValue!==v)o.values.push({at:new Date().toISOString(),value:v,by:user.name});p?Object.assign(p,o):db.hrPeople.push(o);save();x.remove();hr()}}
function hp(id){let p=db.hrPeople.find(x=>x.id===id);title(`RH • ${p.name}`);$('#content').innerHTML=`<div class="toolbar"><button class="btn ghost" id="hb">← RH</button><button class="btn" id="he">Editar</button></div><div class="grid cols-3"><div class="card"><b>${money(p.currentValue)}</b><small>Valor atual</small></div><div class="card"><b>${fmt(p.start)}</b><small>Início</small></div><div class="card"><b>${p.end?fmt(p.end):'Indeterminado'}</b><small>Fim</small></div></div><h3>Histórico de valores</h3><div class="card history-list">${p.values.map(v=>`<div><b>${new Date(v.at).toLocaleDateString('pt-BR')}</b><span>${money(v.value)}</span></div>`).join('')}</div><h3>Contratos</h3><div class="card">${p.files.map(f=>`<div class="file-row"><b>${esc(f.name)}</b><span>${new Date(f.addedAt).toLocaleString('pt-BR')}</span></div>`).join('')}</div>`;$('#hb').onclick=hr;$('#he').onclick=()=>hm(id)}
window.IntegralV6={real,dup};
})();

;

/* ===== SOURCE: patch-v6-sync.js ===== */
/* Sincronizações automáticas V6 */
(function(){
  const baseSave=save;
  save=function(){
    db.docs=db.docs||[];
    (db.budgetExpenses||[]).forEach(e=>{
      if(!e.file||e.fiscalDocId||String(e.date||'').slice(0,7)!==new Date().toISOString().slice(0,7)) return;
      const b=(db.budgetRecords||[]).find(x=>x.id===e.budgetId);
      const id=typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
      db.docs.unshift({id,name:e.file.name,type:'Comprovante',supplier:e.origin||'Não identificado',date:e.date,cat:'Gasto de orçamento',sector:b?.sector||'Administrativo',value:+e.value||0,status:e.duplicate?'Revisar IA':'Confirmado',source:'Orçamento'});
      e.fiscalDocId=id;
    });
    return baseSave();
  };
})();

;

/* ===== SOURCE: patch-v7.js ===== */
/* Integral Financeiro V7.2 - autenticação compartilhada com ERP Integral e sincronização manual */
(function(){
  const cfg=window.ERP_SUPABASE||{};
  const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  window.IntegralERP={sb,profiles:[],projects:[],plans:[],steps:[],responsibles:[],loaded:false,error:'',loadedAt:null};

  const hashId=(s)=>{let h=0;for(const c of String(s||''))h=(h*31+c.charCodeAt(0))>>>0;return h||1};
  const roleOf=(tipo)=>tipo==='Administrador'?'Administrador':'Funcionário';
  const norm=(s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  async function profileFor(authUser){
    if(!sb)throw new Error('Não foi possível conectar ao Supabase do ERP.');
    const {data,error}=await sb.from('profiles').select('id,nome,email,tipo,ativo').eq('id',authUser.id).maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('Seu login existe no Supabase, mas não há perfil correspondente no ERP.');
    if(data.ativo===false)throw new Error('Este usuário está inativo no ERP.');
    return data;
  }

  async function loadERP(){
    if(!sb)throw new Error('Conexão com ERP indisponível.');
    try{
      const [pr,pp,pl,st,rp]=await Promise.all([
        sb.from('profiles').select('id,nome,email,tipo,ativo').order('nome'),
        sb.from('projetos').select('id,nome,status,cliente_id').order('nome'),
        sb.from('planos_trabalho').select('id,titulo,projeto_id,status,created_at').order('created_at',{ascending:false}),
        sb.from('etapas_plano').select('id,plano_id,titulo,status'),
        sb.from('etapa_responsaveis').select('etapa_id,usuario_id')
      ]);
      const results=[[pr,'Perfis'],[pp,'Projetos'],[pl,'Planos de trabalho'],[st,'Etapas'],[rp,'Responsáveis']];
      const failures=results.filter(([r])=>r.error).map(([r,n])=>`${n}: ${r.error.message}`);
      const profiles=pr.error?[]:(pr.data||[]), projects=pp.error?[]:(pp.data||[]), plans=pl.error?[]:(pl.data||[]), steps=st.error?[]:(st.data||[]), responsibles=rp.error?[]:(rp.data||[]);
      Object.assign(window.IntegralERP,{profiles,projects,plans,steps,responsibles,loaded:true,error:failures.join(' | '),loadedAt:new Date().toISOString()});
      if(profiles.length){db.usersMvp=profiles.filter(x=>x.ativo!==false).map(x=>({id:hashId(x.id),erpId:x.id,name:x.nome,email:x.email||'',role:roleOf(x.tipo),sector:x.tipo||'Administrativo',active:true,source:'ERP'}));}
      db.erpProjects=projects.map(x=>({id:x.id,name:x.nome,status:x.status}));
      db.erpPlans=plans.map(p=>{const stepIds=steps.filter(s=>s.plano_id===p.id).map(s=>s.id);const userIds=responsibles.filter(r=>stepIds.includes(r.etapa_id)).map(r=>r.usuario_id);const sectors=[...new Set(profiles.filter(u=>userIds.includes(u.id)).map(u=>u.tipo).filter(Boolean))];return {id:p.id,title:p.titulo,projectId:p.projeto_id||'',status:p.status,sectors};});
      save();return {ok:true,failures};
    }catch(e){window.IntegralERP.loaded=true;window.IntegralERP.error=e.message||String(e);console.warn('Integração ERP parcial:',e);throw e;}
  }
  window.IntegralERP.sync=loadERP;

  function setFinanceUser(p,authUser){
    user={name:p.nome,role:roleOf(p.tipo),sector:p.tipo,erpId:p.id,email:p.email||authUser.email};
    const exists=(db.usersMvp||[]).find(x=>x.erpId===p.id||String(x.email||'').toLowerCase()===String(user.email||'').toLowerCase());
    if(!exists){db.usersMvp=db.usersMvp||[];db.usersMvp.push({id:hashId(p.id),erpId:p.id,name:p.nome,email:user.email||'',role:user.role,sector:p.tipo||'',active:true,source:'ERP'});save();}
  }

  function renderERPLogin(error=''){
    user=null;$('#app').innerHTML=`<main class="login-wrap"><section class="login-card"><img class="login-logo" src="logo-integral.png"><h1>Integral Financeiro</h1><div class="sub">Mesmo acesso do ERP Integral</div><form id="erpFinLogin"><div class="field"><label>E-mail</label><input id="erpEmail" type="email" required autocomplete="username"></div><div class="field"><label>Senha</label><input id="erpPass" type="password" required autocomplete="current-password"></div><button class="btn wide" type="submit">Entrar</button><div id="erpErr" class="login-error">${esc(error)}</div></form><div class="muted" style="margin-top:12px">Use exatamente o e-mail e a senha que funcionam no ERP.</div></section></main>`;matrix(true);
    $('#erpFinLogin').onsubmit=async e=>{e.preventDefault();const btn=e.submitter||e.target.querySelector('button[type="submit"]'),err=$('#erpErr');btn.disabled=true;btn.textContent='Entrando...';err.textContent='';try{const email=$('#erpEmail').value.trim().toLowerCase(),password=$('#erpPass').value;const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;const p=await profileFor(data.user);setFinanceUser(p,data.user);view=user.role==='Administrador'?'dashboard':'budgets';matrix(false);app();}catch(x){console.error('Login Financeiro/ERP:',x);try{await sb?.auth.signOut()}catch{}err.textContent=x.message==='Invalid login credentials'?'E-mail ou senha incorretos. Use os mesmos dados do ERP.':(x.message||'Falha ao entrar.');btn.disabled=false;btn.textContent='Entrar';}};
  }

  login=async function(){try{if(user){await sb?.auth.signOut();return renderERPLogin();}if(!sb)return renderERPLogin('Não foi possível carregar a conexão com o ERP.');const {data:{session},error}=await sb.auth.getSession();if(error)throw error;if(!session)return renderERPLogin();const p=await profileFor(session.user);setFinanceUser(p,session.user);view=user.role==='Administrador'?'dashboard':'budgets';matrix(false);app();}catch(e){console.error('Sessão Financeiro/ERP:',e);try{await sb?.auth.signOut()}catch{}renderERPLogin(e.message||'Não foi possível validar sua sessão do ERP.');}};

  function planChoices(sector=''){const plans=db.erpPlans||[];return plans.filter(p=>!sector||!p.sectors?.length||p.sectors.some(s=>norm(s)===norm(sector)));}
  function enhanceBudgetModal(modal){const labels=[...modal.querySelectorAll('label')],planLabel=labels.find(l=>l.textContent.includes('Plano de Trabalho ERP')),sector=modal.querySelector('select[name="sector"]');if(planLabel){const old=planLabel.parentElement.querySelector('input[name="erp"]');if(old){const sel=document.createElement('select');sel.name='erp';const fill=()=>{const current=old.value||sel.value;sel.innerHTML='<option value="">Sem associação</option>'+planChoices(sector?.value||'').map(p=>`<option value="${esc(p.title)}" data-plan-id="${p.id}" ${p.title===current?'selected':''}>${esc(p.title)}${p.status?` • ${esc(p.status)}`:''}</option>`).join('')};fill();old.replaceWith(sel);if(sector)sector.addEventListener('change',fill);}}const form=modal.querySelector('#bf');if(form&&!form.dataset.erpHook){form.dataset.erpHook='1';form.addEventListener('submit',()=>setTimeout(()=>{const title=form.querySelector('[name="erp"]')?.value||'',p=(db.erpPlans||[]).find(x=>x.title===title);if(!p)return;const candidates=(db.budgetRecords||[]).filter(b=>b.erpPlan===title),b=candidates[candidates.length-1];if(b){b.erpPlanId=p.id;b.erpProjectId=p.projectId||'';b.erpSectors=p.sectors||[];save()}},30),true)}}
  const observer=new MutationObserver(()=>document.querySelectorAll('.modal-backdrop .modal').forEach(m=>{if(!m.dataset.erpEnhanced&&m.textContent.includes('Plano de Trabalho ERP')){m.dataset.erpEnhanced='1';enhanceBudgetModal(m)}}));observer.observe(document.documentElement,{childList:true,subtree:true});

  function decorateERP(){const c=$('#content');if(!c)return;c.querySelector('.erp-sync-chip')?.remove();if(!window.IntegralERP.loadedAt)return;const chip=document.createElement('div');chip.className='erp-sync-chip';chip.innerHTML=`<span class="badge ${window.IntegralERP.error?'warn':'ok'}">ERP ${window.IntegralERP.error?'parcial':'sincronizado'}</span><span>${db.usersMvp?.length||0} usuários • ${db.erpPlans?.length||0} planos • ${db.erpProjects?.length||0} projetos</span>`;c.prepend(chip);}
  const oldApp=app;app=function(){oldApp();setTimeout(decorateERP,0)};
  users=function(){if(user?.role!=='Administrador')return budgets();title('Usuários do ERP');$('#content').innerHTML=`<div class="erp-sync-chip"><span class="badge ok">Login integrado</span><span>Usuários e senhas são os mesmos do ERP Integral. Os demais dados são atualizados somente pelo botão Sincronizar com ERP.</span></div><div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil/Setor</th><th>Status</th></tr></thead><tbody>${(db.usersMvp||[]).map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email||'')}</td><td>${esc(u.sector||'')}</td><td><span class="badge ok">Ativo</span></td></tr>`).join('')}</tbody></table></div>`;};
  setTimeout(()=>login(),0);
})();

;

/* ===== SOURCE: patch-v8.js ===== */
/* Integral Financeiro V8.1 - setores ERP e escopo por usuário/setor */
(function(){
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const isAdm=()=>user?.role==='Administrador';
  const currentLocalUser=()=> (db.usersMvp||[]).find(u=>u.erpId===user?.erpId||String(u.email||'').toLowerCase()===String(user?.email||'').toLowerCase()||u.name===user?.name);
  const sameSector=(a,b)=>norm(a)&&norm(a)===norm(b);

  function syncSectorsFromERP(){
    const profiles=window.IntegralERP?.profiles||[];
    const names=[...new Set(profiles.map(p=>p.tipo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if(!names.length)return;
    db.sectors=names.map((name,i)=>({id:i+1,name,active:true,source:'ERP'}));
    normalizeAssignments();
    save();
  }

  function sectorUserIds(sector){
    return (db.usersMvp||[]).filter(u=>u.active!==false&&sameSector(u.sector,sector)).map(u=>u.id);
  }

  function normalizeAssignments(){
    db.trips=(db.trips||[]).map(t=>({...t,assigned:Array.isArray(t.assigned)?t.assigned:[],sector:t.sector||''}));
    db.budgetRecords=(db.budgetRecords||[]).map(b=>{
      const direct=Array.isArray(b.assignedDirect)?b.assignedDirect:(Array.isArray(b.assigned)?b.assigned:[]);
      const effective=[...new Set([...direct,...sectorUserIds(b.sector)])];
      return {...b,assignedDirect:direct,assigned:effective};
    });
  }

  function canAccessBudget(b){
    if(isAdm())return true;
    const u=currentLocalUser();
    return (b.assigned||[]).includes(u?.id)||sameSector(b.sector,user?.sector);
  }

  function canAccessTrip(t){
    if(isAdm())return true;
    const u=currentLocalUser();
    return (t.assigned||[]).includes(u?.id)||sameSector(t.sector,user?.sector);
  }

  function enforceLimitedNav(){
    if(!user||isAdm())return;
    const nav=document.querySelector('.nav');
    if(!nav)return;
    nav.querySelectorAll('button[data-view]').forEach(btn=>{btn.style.display=['budgets','trips'].includes(btn.dataset.view)?'':'none'});
  }

  const baseApp=app;
  app=function(){
    if(user&&!isAdm()&&!['budgets','trips'].includes(view))view='budgets';
    normalizeAssignments();
    baseApp();
    if(window.IntegralERP?.loaded)syncSectorsFromERP();
    setTimeout(enforceLimitedNav,0);
  };

  const baseBudgets=budgets;
  budgets=function(){
    normalizeAssignments();
    return baseBudgets();
  };

  const baseTrips=trips;
  trips=function(){
    normalizeAssignments();
    const all=db.trips;
    if(!isAdm()){
      db.trips=all.filter(canAccessTrip);
      try{return baseTrips();}
      finally{db.trips=all;}
    }
    baseTrips();
    decorateTripAssignments();
  };

  function decorateTripAssignments(){
    if(!isAdm())return;
    const rows=[...document.querySelectorAll('#content tbody tr')];
    rows.forEach((tr,i)=>{
      const t=(db.trips||[])[i];if(!t)return;
      const cell=tr.lastElementChild;if(!cell||cell.querySelector('[data-trip-assign]'))return;
      const b=document.createElement('button');b.className='btn small ghost';b.dataset.tripAssign=t.id;b.textContent='Atribuir';
      b.style.marginLeft='6px';b.onclick=e=>{e.stopPropagation();tripAssignModal(t.id)};cell.appendChild(b);
    });
  }

  function options(items,selected=''){return items.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}
  function tripAssignModal(id){
    if(!isAdm())return;
    const t=(db.trips||[]).find(x=>String(x.id)===String(id));if(!t)return;
    const sectors=(db.sectors||[]).filter(s=>s.active!==false).map(s=>s.name);
    const users=(db.usersMvp||[]).filter(u=>u.active!==false);
    const x=v2modal('Atribuir viagem',`<form id="v8TripAssign"><div class="modal-body"><div class="field"><label>Setor com acesso</label><select name="sector"><option value="">Nenhum setor</option>${options(sectors,t.sector||'')}</select></div><div class="field"><label>Usuários com acesso</label>${users.map(u=>`<label class="check-line"><input type="checkbox" name="assigned" value="${u.id}" ${(t.assigned||[]).includes(u.id)?'checked':''}>${esc(u.name)} <small>${esc(u.sector||'')}</small></label>`).join('')}</div><div class="muted">O acesso é liberado se o usuário estiver atribuído diretamente ou pertencer ao setor selecionado.</div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);
    x.querySelector('#v8TripAssign').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);t.sector=f.get('sector')||'';t.assigned=f.getAll('assigned').map(Number);save();x.remove();trips()};
  }

  function hookBudgetAssignmentForm(form){
    if(form.dataset.v8Hook)return;form.dataset.v8Hook='1';
    form.addEventListener('submit',()=>{
      const fd=new FormData(form),name=String(fd.get('name')||''),sector=String(fd.get('sector')||''),selected=fd.getAll('assigned').map(Number);
      const direct=selected.filter(id=>{const u=(db.usersMvp||[]).find(x=>x.id===id);return !u||!sameSector(u.sector,sector)});
      setTimeout(()=>{
        const matches=(db.budgetRecords||[]).filter(b=>b.name===name&&b.sector===sector),b=matches[matches.length-1];
        if(!b)return;b.assignedDirect=direct;b.assigned=[...new Set([...direct,...sectorUserIds(sector)])];save();
      },50);
    },true);
  }

  const obs=new MutationObserver(()=>{
    if(window.IntegralERP?.loaded)syncSectorsFromERP();
    enforceLimitedNav();
    document.querySelectorAll('#bf').forEach(hookBudgetAssignmentForm);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});

  window.IntegralFinanceScope={syncSectorsFromERP,canAccessBudget,canAccessTrip};
})();

;

/* ===== SOURCE: patch-v9.js ===== */
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

;

/* ===== SOURCE: patch-v10-pre.js ===== */
/* Integral Financeiro - bloqueia apenas os agendamentos automáticos do ERP antes do V10 */
(function(){
'use strict';
const original={
  setTimeout:window.setTimeout.bind(window),
  setInterval:window.setInterval.bind(window),
  addEventListener:Document.prototype.addEventListener
};
window.__IntegralERPManualSyncOriginals=original;
const isERPCallback=fn=>typeof fn==='function'&&String(fn).includes('syncERPReceivables');
window.setTimeout=function(fn,delay,...args){
  if(isERPCallback(fn))return 0;
  return original.setTimeout(fn,delay,...args);
};
window.setInterval=function(fn,delay,...args){
  if(isERPCallback(fn))return 0;
  return original.setInterval(fn,delay,...args);
};
Document.prototype.addEventListener=function(type,listener,options){
  if(type==='visibilitychange'&&isERPCallback(listener))return;
  return original.addEventListener.call(this,type,listener,options);
};
})();

;

/* ===== SOURCE: patch-v10.js ===== */
/* Integral Financeiro V10 - previsões ERP, UX, RH, documentos e contas com IA */
(function(){
'use strict';
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const uid=()=>typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
const monthOf=d=>String(d||'').slice(0,7);
const todayISO=()=>new Date().toISOString().slice(0,10);
const nowMonth=()=>todayISO().slice(0,7);
const monthLabel=m=>{if(!m)return'';const[y,n]=m.split('-');return new Date(+y,+n-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const addMonths=(date,n)=>{const d=new Date((date||todayISO())+'T12:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,10)};
const isAdm=()=>user?.role==='Administrador';
const moneySafe=v=>money(Number(v||0));
const fmeta=f=>f?{name:f.name,type:f.type,size:f.size,addedAt:new Date().toISOString()}:null;
const readDataURL=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)});
const activeUsers=()=> (db.usersMvp||[]).filter(u=>u.active!==false);
const sectorNames=()=> (db.sectors||[]).filter(s=>s.active!==false).map(s=>s.name);
const opt=(arr,selected='')=>arr.map(v=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(v)}</option>`).join('');
Object.assign(db,{erpPlannedRevenues:db.erpPlannedRevenues||[],planRevenues:db.planRevenues||[],planExpenses:db.planExpenses||[],hrPeople:db.hrPeople||[],hrPayments:db.hrPayments||[],docs:db.docs||[],cashflow:db.cashflow||[],accountMasters:db.accountMasters||[],accountPayments:db.accountPayments||[]});

async function syncERPReceivables(){
  const sb=window.IntegralERP?.sb;if(!sb||!user)return;
  try{
    const {data,error}=await sb.from('pagamentos').select('id,projeto_id,nome_etapa,valor_previsto,valor_recebido,vencimento,status,data_pagamento,created_at').order('vencimento');
    if(error)throw error;
    const projects=window.IntegralERP?.projects||[];
    db.erpPlannedRevenues=(data||[]).map(p=>{
      const total=Number(p.valor_previsto||0),received=Number(p.valor_recebido||0),remaining=Math.max(0,total-received),project=projects.find(x=>x.id===p.projeto_id);
      return {id:`erp-${p.id}`,erpPaymentId:p.id,projectId:p.projeto_id||'',project:project?.nome||'Projeto ERP',origin:p.nome_etapa||'Recebimento ERP',total,received,remaining,dueDate:p.vencimento||'',month:monthOf(p.vencimento),status:p.status||'',source:'ERP'};
    }).filter(x=>x.remaining>0&&x.dueDate);
    save();
    window.dispatchEvent(new CustomEvent('integral:erp-planning-synced'));
  }catch(e){console.warn('Previsões do ERP não puderam ser sincronizadas:',e);}
}
window.IntegralFinanceERPPlanning={sync:syncERPReceivables};
setTimeout(syncERPReceivables,2500);setInterval(()=>{if(document.visibilityState==='visible')syncERPReceivables()},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncERPReceivables()});

function revenueSchedule(r){
  const count=Math.max(1,+r.installments||1),total=+r.total||0,cad=r.cadence||'Mensal',interval=cad==='Trimestral'?3:cad==='Semestral'?6:cad==='Anual'?12:cad==='Personalizado'?Math.max(1,+r.interval||1):1;
  return Array.from({length:count},(_,i)=>({month:monthOf(addMonths(r.start||todayISO(),i*interval)),date:addMonths(r.start||todayISO(),i*interval),value:total/count,origin:r.origin||'Receita planejada',source:'Planejamento'}));
}
function expenseSchedule(r){
  const count=Math.max(1,+r.installments||1),total=+r.total||(+r.value||0)*count,cad=r.cadence||'Mensal',interval=cad==='Trimestral'?3:cad==='Semestral'?6:cad==='Anual'?12:cad==='Personalizado'?Math.max(1,+r.interval||1):1;
  return Array.from({length:count},(_,i)=>({month:monthOf(addMonths(r.start||todayISO(),i*interval)),date:addMonths(r.start||todayISO(),i*interval),value:total/count,origin:r.origin||r.name||'Despesa planejada',source:'Planejamento'}));
}
function plannedRows(){
  const manualIn=(db.planRevenues||[]).flatMap(revenueSchedule).map(x=>({...x,direction:'Entrada'}));
  const erpIn=(db.erpPlannedRevenues||[]).map(x=>({month:x.month,date:x.dueDate,value:x.remaining,origin:`${x.project} • ${x.origin}`,direction:'Entrada',source:'ERP'}));
  const out=(db.planExpenses||[]).flatMap(expenseSchedule).map(x=>({...x,direction:'Saída'}));
  return [...manualIn,...erpIn,...out];
}
function realRows(){return (db.cashflow||[]).map(x=>({...x,month:monthOf(x.date)}));}
function planningMonthDetail(m){
  const rows=plannedRows().filter(x=>x.month===m),ins=rows.filter(x=>x.direction==='Entrada'),outs=rows.filter(x=>x.direction==='Saída'),iv=ins.reduce((s,x)=>s+x.value,0),ov=outs.reduce((s,x)=>s+x.value,0),real=realRows().filter(x=>x.month===m),ri=real.filter(x=>x.direction==='Entrada').reduce((s,x)=>s+(+x.value||0),0),ro=real.filter(x=>x.direction==='Saída').reduce((s,x)=>s+(+x.value||0),0);
  const x=v2modal(`Planejamento • ${monthLabel(m)}`,`<div class="modal-body"><div class="grid cols-4 compact-metrics"><div class="card metric mini"><h3>Entradas previstas</h3><b>${moneySafe(iv)}</b></div><div class="card metric mini"><h3>Saídas previstas</h3><b>${moneySafe(ov)}</b></div><div class="card metric mini"><h3>Entradas reais</h3><b>${moneySafe(ri)}</b></div><div class="card metric mini"><h3>Saídas reais</h3><b>${moneySafe(ro)}</b></div></div><h3 class="section-title">O que deve entrar</h3><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Origem</th><th>Fonte</th><th>Valor</th></tr></thead><tbody>${ins.map(r=>`<tr><td>${r.date?fmt(r.date):'—'}</td><td><b>${esc(r.origin)}</b></td><td>${esc(r.source)}</td><td>${moneySafe(r.value)}</td></tr>`).join('')||'<tr><td colspan="4">Sem entradas previstas.</td></tr>'}</tbody></table></div><h3 class="section-title">O que deve sair</h3><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Origem</th><th>Fonte</th><th>Valor</th></tr></thead><tbody>${outs.map(r=>`<tr><td>${r.date?fmt(r.date):'—'}</td><td><b>${esc(r.origin)}</b></td><td>${esc(r.source)}</td><td>${moneySafe(r.value)}</td></tr>`).join('')||'<tr><td colspan="4">Sem saídas previstas.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);return x;
}
function revenueForm(id){
  const r=(db.planRevenues||[]).find(x=>String(x.id)===String(id));
  const x=v2modal(r?'Editar receita planejada':'Nova receita planejada',`<form id="v10Revenue"><div class="modal-body"><div class="form-section"><h4>Identificação da receita</h4><p class="muted">Informe de onde esse dinheiro deve vir.</p><div class="field"><label>Origem da receita</label><input name="origin" value="${esc(r?.origin||'')}" placeholder="Ex.: Contrato Prefeitura de X" required></div></div><div class="form-section"><h4>Valor e parcelamento</h4><p class="muted">O valor total será dividido pelo número de parcelas informado.</p><div class="form-grid"><div class="field"><label>Valor total previsto</label><input name="total" type="number" min="0" step="0.01" value="${r?.total||''}" required></div><div class="field"><label>Número de parcelas</label><input name="installments" type="number" min="1" max="240" value="${r?.installments||1}" required></div></div></div><div class="form-section"><h4>Quando os valores devem entrar</h4><p class="muted">Defina a primeira data e o intervalo entre as parcelas.</p><div class="form-grid"><div class="field"><label>Data da primeira entrada</label><input name="start" type="date" value="${r?.start||todayISO()}" required></div><div class="field"><label>Periodicidade</label><select name="cadence">${opt(['Mensal','Trimestral','Semestral','Anual','Personalizado'],r?.cadence||'Mensal')}</select></div><div class="field"><label>Intervalo personalizado (meses)</label><input name="interval" type="number" min="1" max="60" value="${r?.interval||1}"><small>Usado somente quando a periodicidade for Personalizado.</small></div></div></div></div><div class="modal-foot">${r?'<button type="button" class="btn danger" id="v10DelRevenue">Excluir</button>':''}<button class="btn">Salvar receita</button></div></form>`);
  x.querySelector('#v10Revenue').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:r?.id||uid(),origin:f.get('origin').trim(),total:+f.get('total')||0,installments:+f.get('installments')||1,start:f.get('start'),cadence:f.get('cadence'),interval:+f.get('interval')||1};r?Object.assign(r,o):db.planRevenues.push(o);save();x.remove();planning()};
  if(r)x.querySelector('#v10DelRevenue').onclick=()=>{if(confirm('Excluir esta receita planejada?')){db.planRevenues=db.planRevenues.filter(q=>q.id!==r.id);save();x.remove();planning()}};
}
function expensePlanForm(id){
  const r=(db.planExpenses||[]).find(x=>String(x.id)===String(id));
  const x=v2modal(r?'Editar despesa planejada':'Nova despesa planejada',`<form id="v10PlanExpense"><div class="modal-body"><div class="form-section"><h4>Identificação da despesa</h4><div class="field"><label>Descrição / origem</label><input name="origin" value="${esc(r?.origin||r?.name||'')}" placeholder="Ex.: Aluguel do escritório" required></div></div><div class="form-section"><h4>Valor e recorrência</h4><div class="form-grid"><div class="field"><label>Valor total previsto</label><input name="total" type="number" min="0" step="0.01" value="${r?.total||r?.value||''}" required></div><div class="field"><label>Número de ocorrências</label><input name="installments" type="number" min="1" max="240" value="${r?.installments||1}" required></div><div class="field"><label>Primeira data</label><input name="start" type="date" value="${r?.start||todayISO()}" required></div><div class="field"><label>Periodicidade</label><select name="cadence">${opt(['Mensal','Trimestral','Semestral','Anual','Personalizado'],r?.cadence||'Mensal')}</select></div><div class="field"><label>Intervalo personalizado (meses)</label><input name="interval" type="number" min="1" value="${r?.interval||1}"></div></div></div><div class="notice">Este cadastro é somente para planejamento e não alimenta o Fluxo de Caixa.</div></div><div class="modal-foot">${r?'<button type="button" class="btn danger" id="v10DelPlanExpense">Excluir</button>':''}<button class="btn">Salvar despesa</button></div></form>`);
  x.querySelector('#v10PlanExpense').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),o={id:r?.id||uid(),origin:f.get('origin').trim(),total:+f.get('total')||0,installments:+f.get('installments')||1,start:f.get('start'),cadence:f.get('cadence'),interval:+f.get('interval')||1};r?Object.assign(r,o):db.planExpenses.push(o);save();x.remove();planning()};
  if(r)x.querySelector('#v10DelPlanExpense').onclick=()=>{if(confirm('Excluir esta despesa planejada?')){db.planExpenses=db.planExpenses.filter(q=>q.id!==r.id);save();x.remove();planning()}};
}
planning=function(){
  title('Planejamento');syncERPReceivables();const start=nowMonth(),months=Array.from({length:12},(_,i)=>monthOf(addMonths(start+'-01',i))),rows=plannedRows();
  $('#content').innerHTML=`<div class="toolbar"><div><b>Planejamento dos próximos 12 meses</b><div class="muted">As entradas do ERP são sincronizadas automaticamente e não alteram o Fluxo de Caixa.</div></div><div class="right"><button class="btn ghost" id="v10NewPlanExpense">+ Despesa planejada</button><button class="btn" id="v10NewRevenue">+ Receita planejada</button></div></div><div class="planning-month-grid">${months.map(m=>{const a=rows.filter(x=>x.month===m),iv=a.filter(x=>x.direction==='Entrada').reduce((s,x)=>s+x.value,0),ov=a.filter(x=>x.direction==='Saída').reduce((s,x)=>s+x.value,0),rr=realRows().filter(x=>x.month===m),realBal=rr.reduce((s,x)=>s+(x.direction==='Entrada'?+x.value:-x.value),0);return`<button class="card planning-month-card" data-v10-month="${m}"><span>${monthLabel(m)}</span><b>${moneySafe(iv-ov)}</b><small>Entradas ${moneySafe(iv)} • Saídas ${moneySafe(ov)}</small><small>Real até agora: ${moneySafe(realBal)}</small></button>`}).join('')}</div><div class="grid cols-2"><section class="card"><div class="section-head"><h3>Receitas planejadas manuais</h3></div>${(db.planRevenues||[]).map(r=>`<button class="mini-row" data-v10-revenue="${r.id}"><span><b>${esc(r.origin)}</b><small>${r.installments} parcela(s) • ${esc(r.cadence)}</small></span><strong>${moneySafe(r.total)}</strong></button>`).join('')||'<div class="empty">Nenhuma receita manual cadastrada.</div>'}</section><section class="card"><div class="section-head"><h3>Entradas previstas do ERP</h3></div>${(db.erpPlannedRevenues||[]).slice(0,50).map(r=>`<div class="mini-row readonly"><span><b>${esc(r.project)}</b><small>${esc(r.origin)} • ${r.dueDate?fmt(r.dueDate):'—'}</small></span><strong>${moneySafe(r.remaining)}</strong></div>`).join('')||'<div class="empty">Nenhuma entrada futura sincronizada do ERP.</div>'}</section></div><section class="card"><div class="section-head"><h3>Despesas planejadas</h3></div>${(db.planExpenses||[]).map(r=>`<button class="mini-row" data-v10-plan-exp="${r.id}"><span><b>${esc(r.origin||r.name||'Despesa')}</b><small>${r.installments||1} ocorrência(s) • ${esc(r.cadence||'Mensal')}</small></span><strong>${moneySafe(r.total||r.value)}</strong></button>`).join('')||'<div class="empty">Nenhuma despesa planejada.</div>'}</section>`;
  $('#v10NewRevenue').onclick=()=>revenueForm();$('#v10NewPlanExpense').onclick=()=>expensePlanForm();$$('[data-v10-month]').forEach(b=>b.onclick=()=>planningMonthDetail(b.dataset.v10Month));$$('[data-v10-revenue]').forEach(b=>b.onclick=()=>revenueForm(b.dataset.v10Revenue));$$('[data-v10-plan-exp]').forEach(b=>b.onclick=()=>expensePlanForm(b.dataset.v10PlanExp));
};
window.addEventListener('integral:erp-planning-synced',()=>{if(view==='planning'&&document.querySelector('#content'))planning()});

function userPicker(name,selected=[]){return `<div class="user-select-grid">${activeUsers().map(u=>`<label class="user-select-card"><input type="checkbox" name="${name}" value="${u.id}" ${selected.map(String).includes(String(u.id))?'checked':''}><span class="user-select-text"><b>${esc(u.name)}</b><small>${esc(u.sector||'Sem setor')}</small></span></label>`).join('')||'<span class="muted">Nenhum usuário disponível.</span>'}</div>`}
const modalObserver=new MutationObserver(()=>{document.querySelectorAll('.assignment-grid:not([data-v10-fixed])').forEach(g=>{g.dataset.v10Fixed='1';g.classList.add('user-select-grid');g.querySelectorAll('.check-line').forEach(l=>l.classList.add('user-select-card'))});});modalObserver.observe(document.documentElement,{childList:true,subtree:true});

function employeeMonthlyCost(p,m){
  const first=m+'-01',last=new Date(+m.slice(0,4),+m.slice(5,7),0).toISOString().slice(0,10);if(p.start&&p.start>last)return 0;if(p.end&&p.end<first)return 0;
  const hist=[...(p.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>a.date.localeCompare(b.date));return +(hist.at(-1)?.value??p.currentValue??p.value??0);
}
function hrMonthDetail(m){const people=(db.hrPeople||[]).filter(p=>employeeMonthlyCost(p,m)>0),total=people.reduce((s,p)=>s+employeeMonthlyCost(p,m),0),paid=(db.hrPayments||[]).filter(x=>x.month===m&&x.status==='Pago');v2modal(`RH • ${monthLabel(m)}`,`<div class="modal-body"><div class="grid cols-2 compact-metrics"><div class="card metric mini"><h3>Previsto</h3><b>${moneySafe(total)}</b></div><div class="card metric mini"><h3>Quitações registradas</h3><b>${paid.length}</b></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Colaborador</th><th>Valor vigente</th><th>Status do mês</th></tr></thead><tbody>${people.map(p=>{const q=(db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m);return`<tr><td><b>${esc(p.name)}</b></td><td>${moneySafe(employeeMonthlyCost(p,m))}</td><td>${q?.status==='Pago'?badgeStatus('Pago'):'Previsto'}</td></tr>`}).join('')||'<tr><td colspan="3">Nenhum colaborador vigente.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`)}
function employeeForm(id){
  const p=(db.hrPeople||[]).find(x=>String(x.id)===String(id));const x=v2modal(p?'Editar colaborador':'Cadastrar colaborador',`<form id="v10Employee"><div class="modal-body"><div class="form-section"><h4>Dados do contrato</h4><div class="form-grid"><div class="field full"><label>Nome do colaborador</label><input name="name" value="${esc(p?.name||'')}" required></div><div class="field"><label>Início do contrato</label><input name="start" type="date" value="${p?.start||todayISO()}" required></div><div class="field"><label>Fim do contrato</label><input name="end" type="date" value="${p?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" step="0.01" value="${p?.currentValue||p?.value||''}" required></div><div class="field"><label>Contrato / arquivo</label><input id="v10EmpFile" type="file"></div></div></div><div class="notice">Ao alterar o valor mensal, o sistema registra a mudança no histórico para calcular os meses futuros corretamente.</div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);x.querySelector('#v10Employee').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),newVal=+f.get('value')||0,oldVal=+(p?.currentValue??p?.value??0),files=[...(p?.files||[])],file=x.querySelector('#v10EmpFile').files[0];if(file)files.push(fmeta(file));const history=[...(p?.history||[])];if(!p||newVal!==oldVal)history.push({date:todayISO(),value:newVal,by:user?.name||''});const o={id:p?.id||uid(),name:f.get('name').trim(),start:f.get('start'),end:f.get('end'),currentValue:newVal,files,history};p?Object.assign(p,o):db.hrPeople.push(o);save();x.remove();hr()};}
hr=function(){
  if(!isAdm()){view='budgets';return app()};title('RH');const months=Array.from({length:6},(_,i)=>monthOf(addMonths(nowMonth()+'-01',i))),cur=nowMonth();
  $('#content').innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Selecione um mês para conferir o gasto previsto de pessoal.</div></div><button class="btn" id="v10NewEmployee">+ Cadastrar colaborador</button></div><div class="hr-month-strip">${months.map(m=>{const total=(db.hrPeople||[]).reduce((s,p)=>s+employeeMonthlyCost(p,m),0);return`<button class="card hr-month-card" data-v10-hr-month="${m}"><span>${monthLabel(m)}</span><b>${moneySafe(total)}</b><small>Previsto</small></button>`}).join('')}</div><h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-v10-employee="${p.id}"><div><h3>${esc(p.name)}</h3><span class="badge">${p.end&&p.end<todayISO()?'Encerrado':'Vigente'}</span></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${moneySafe(p.currentValue||p.value)}</b></span><span><small>Contratos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div><h3 class="section-title">Folha do mês vigente</h3><div class="table-wrap"><table class="table"><thead><tr><th>Colaborador</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${(db.hrPeople||[]).filter(p=>employeeMonthlyCost(p,cur)>0).map(p=>{let q=(db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===cur);return`<tr><td><b>${esc(p.name)}</b></td><td>${moneySafe(employeeMonthlyCost(p,cur))}</td><td>${q?.status==='Pago'?badgeStatus('Pago'):'Pendente'}</td><td>${q?.status==='Pago'?'Quitado':`<button class="btn small" data-v10-pay-salary="${p.id}">Marcar pago</button>`}</td></tr>`}).join('')||'<tr><td colspan="4">Sem contratos vigentes neste mês.</td></tr>'}</tbody></table></div>`;
  $('#v10NewEmployee').onclick=()=>employeeForm();$$('[data-v10-employee]').forEach(b=>b.onclick=()=>employeeForm(b.dataset.v10Employee));$$('[data-v10-hr-month]').forEach(b=>b.onclick=()=>hrMonthDetail(b.dataset.v10HrMonth));$$('[data-v10-pay-salary]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.v10PaySalary));if(!p)return;let q=(db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===cur);if(q){q.status='Pago';q.paidAt=todayISO()}else db.hrPayments.push({id:uid(),personId:p.id,month:cur,value:employeeMonthlyCost(p,cur),status:'Pago',paidAt:todayISO()});save();hr()});
};

function duplicateCandidates(){
  const paid=(db.accountPayments||[]).filter(p=>p.status==='Paga').map(p=>{const a=(db.accountMasters||[]).find(x=>x.id===p.accountId);return{id:`acc-${p.id}`,date:p.paidAt||p.due,description:a?.name||'Conta paga',value:+p.value||0,source:'Conta paga'}});
  const budgets=(db.budgetExpenses||[]).map(e=>({id:`bud-${e.id}`,date:e.date,description:e.description,value:+e.value||0,source:'Orçamento'}));
  const cash=(db.cashflow||[]).map(e=>({id:`cash-${e.id}`,date:e.date,description:e.description,value:+e.value||0,source:e.source||'Fluxo'}));return [...paid,...budgets,...cash];
}
async function analyzeDocument(file){const image=await readDataURL(file),r=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,fileName:file.name,sector:'',candidates:duplicateCandidates()})}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.details||d.error||'Falha na IA');return d}
function documentUpload(){
  const x=v2modal('Enviar documento fiscal',`<form id="v10DocUpload"><div class="modal-body"><div class="dropzone"><h3>Documento fiscal ou comprovante</h3><p>A IA identifica valor, fornecedor, data e verifica se o gasto já existe antes de lançá-lo no Fluxo de Caixa.</p><input id="v10DocFile" type="file" accept="image/*,.pdf" required></div><div class="field"><label>Setor</label><select name="sector"><option value="">Não informado</option>${opt(sectorNames())}</select></div><div id="v10DocStatus" class="notice">Aguardando arquivo.</div></div><div class="modal-foot"><button class="btn">Analisar e salvar</button></div></form>`);x.querySelector('#v10DocUpload').onsubmit=async e=>{e.preventDefault();const file=x.querySelector('#v10DocFile').files[0],status=x.querySelector('#v10DocStatus');if(!file)return;status.textContent='IA analisando o documento...';try{const ai=await analyzeDocument(file),sector=new FormData(e.target).get('sector')||'',doc={id:uid(),name:file.name,type:file.type||'Documento',supplier:ai.origin||'',date:ai.date||todayISO(),cat:'Documento fiscal',sector,value:+ai.value||0,status:ai.duplicate?'Duplicidade identificada':'Confirmado',file:fmeta(file),aiData:ai};db.docs.push(doc);if(!ai.duplicate&&doc.value>0){db.cashflow.push({id:uid(),date:doc.date,direction:'Saída',description:ai.description||`Documento fiscal • ${doc.supplier||file.name}`,kind:'Despesa variável',value:doc.value,source:'Documento fiscal',documentId:doc.id})}save();x.remove();documents()}catch(err){status.textContent=err.message}};
}
documents=function(){title('Documentos Fiscais');const m=v2state?.docsMonth||nowMonth(),docs=(db.docs||[]).filter(d=>monthOf(d.date)===m).sort((a,b)=>(b.date||'').localeCompare(a.date||''));$('#content').innerHTML=`<div class="toolbar"><div><input type="month" id="v10DocsMonth" value="${m}"><div class="muted">Documentos novos são analisados pela IA antes de alimentar o Fluxo de Caixa.</div></div><button class="btn" id="v10UploadDoc">+ Enviar documento</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Fornecedor</th><th>Data</th><th>Setor</th><th>Valor</th><th>IA / Fluxo</th></tr></thead><tbody>${docs.map(d=>`<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.supplier||'—')}</td><td>${d.date?fmt(d.date):'—'}</td><td>${esc(d.sector||'—')}</td><td>${moneySafe(d.value)}</td><td>${badgeStatus(d.status||'Confirmado')}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Nenhum documento neste mês.</div></td></tr>'}</tbody></table></div>`;$('#v10DocsMonth').onchange=e=>{if(v2state)v2state.docsMonth=e.target.value;documents()};$('#v10UploadDoc').onclick=documentUpload};

async function analyzeAccount(file){const image=await readDataURL(file),accounts=(db.accountMasters||[]).map(a=>({id:a.id,name:a.name,supplier:a.supplier,registration:a.registration||'',category:a.category,sector:a.sector})),r=await fetch('/api/ai-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,fileName:file.name,accounts})}),d=await r.json();if(!r.ok||!d.ok)throw Error(d.details||d.error||'Falha na leitura da conta');return d}
function applyAnalyzedAccount(ai,file){
  let master=(db.accountMasters||[]).find(a=>String(a.id)===String(ai.matchedAccountId));
  if(!master&&ai.registration)master=(db.accountMasters||[]).find(a=>norm(a.registration)===norm(ai.registration)&&norm(a.supplier)===norm(ai.supplier));
  if(!master){master={id:uid(),name:ai.name||ai.supplier||'Conta',supplier:ai.supplier||'',registration:ai.registration||'',recurrence:ai.recurrence||'Não identificada',category:ai.category||'Outros',sector:ai.sector||'Administrativo',method:ai.paymentMethod||'Outro',active:true,createdByAI:true};db.accountMasters.push(master)}
  else{if(ai.registration&&!master.registration)master.registration=ai.registration;if(ai.recurrence)master.recurrence=ai.recurrence;if(ai.paymentMethod)master.method=ai.paymentMethod}
  const duplicate=(db.accountPayments||[]).find(p=>p.accountId===master.id&&p.due===ai.dueDate&&Math.abs((+p.value||0)-(+ai.value||0))<.01);
  if(!duplicate)db.accountPayments.push({id:uid(),accountId:master.id,value:+ai.value||0,due:ai.dueDate||todayISO(),status:'A vencer',barcode:ai.paymentCode||'',competence:ai.competence||monthOf(ai.dueDate),source:'IA • Conta enviada',file:fmeta(file)});
  return {master,duplicate};
}
function accountAIUpload(){const x=v2modal('Cadastrar / atualizar conta com IA',`<form id="v10AccountAI"><div class="modal-body"><div class="dropzone"><h3>Envie uma conta, fatura ou boleto</h3><p>A IA identifica fornecedor, matrícula/número do cliente, recorrência, vencimento, valor e código de pagamento. Se a conta já existir, cria somente o novo pagamento.</p><input id="v10AccountFiles" type="file" accept="image/*,.pdf" multiple required><div style="margin-top:14px"><button class="btn" id="v10AccountAISubmit" type="submit" disabled>Enviar para análise da IA</button></div></div><div id="v10AccountAIStatus" class="notice">Selecione uma ou mais contas para habilitar o envio.</div></div></form>`);const aiFiles=x.querySelector('#v10AccountFiles'),aiSubmit=x.querySelector('#v10AccountAISubmit'),aiStatus=x.querySelector('#v10AccountAIStatus');aiFiles.onchange=()=>{const n=aiFiles.files.length;aiSubmit.disabled=!n;aiStatus.textContent=n?n+' arquivo(s) selecionado(s). Clique em Enviar para análise da IA.':'Selecione uma ou mais contas para habilitar o envio.'};x.querySelector('#v10AccountAI').onsubmit=async e=>{e.preventDefault();const files=[...aiFiles.files],status=aiStatus;if(!files.length)return;aiSubmit.disabled=true;aiSubmit.textContent='Enviando para IA...';let done=0,newMasters=0,newPays=0;try{for(const file of files){status.textContent=`Analisando ${done+1} de ${files.length}: ${file.name}`;const ai=await analyzeAccount(file),before=db.accountMasters.length,{duplicate}=applyAnalyzedAccount(ai,file);if(db.accountMasters.length>before)newMasters++;if(!duplicate)newPays++;done++}save();x.remove();accounts();alert(`${done} arquivo(s) analisado(s). ${newMasters} nova(s) conta(s) cadastrada(s) e ${newPays} pagamento(s) incluído(s).`)}catch(err){status.textContent=err.message;aiSubmit.disabled=false;aiSubmit.textContent='Enviar para análise da IA'}};}
accounts=function(){if(!isAdm())return documents();title('Contas');const mode=v2state?.accountsMode||'month',m=v2state?.accountsMonth||nowMonth();if(mode==='all'){$('#content').innerHTML=`<div class="toolbar"><div class="segmented"><button id="v10MonthMode">Contas do mês</button><button class="active">Todas as contas cadastradas</button></div><button class="btn" id="v10AccountAI">+ Enviar conta para IA</button></div><div class="grid cols-3 responsive-cards">${(db.accountMasters||[]).map(a=>{const ps=(db.accountPayments||[]).filter(p=>p.accountId===a.id).sort((x,y)=>(y.due||'').localeCompare(x.due||''));return`<button class="card account-master-card" data-v10-account="${a.id}"><span class="badge ${a.active===false?'':'ok'}">${a.active===false?'Inativa':'Ativa'}</span><h3>${esc(a.name)}</h3><p>${esc(a.supplier||'')}</p><div class="account-meta"><span>${esc(a.category||'')}</span><span>${esc(a.sector||'')}</span></div><small>Matrícula / cadastro: <b>${esc(a.registration||'Não informado')}</b></small><small>Recorrência: <b>${esc(a.recurrence||'Não identificada')}</b></small><b>${ps.length} pagamento(s)</b></button>`}).join('')||'<div class="empty">Nenhuma conta cadastrada.</div>'}</div>`;$('#v10MonthMode').onclick=()=>{v2state.accountsMode='month';accounts()};$('#v10AccountAI').onclick=accountAIUpload;$$('[data-v10-account]').forEach(b=>b.onclick=()=>typeof v2AccountModal==='function'?v2AccountModal(+b.dataset.v10Account):null);return}
  const payments=(db.accountPayments||[]).filter(p=>monthOf(p.due)===m).map(p=>({...p,master:(db.accountMasters||[]).find(a=>a.id===p.accountId)}));$('#content').innerHTML=`<div class="toolbar"><div class="left"><div class="segmented"><button class="active">Contas do mês</button><button id="v10AllAccounts">Todas as contas cadastradas</button></div><input type="month" id="v10AccountsMonth" value="${m}"></div><button class="btn" id="v10AccountAI">+ Enviar conta para IA</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Conta</th><th>Matrícula</th><th>Vencimento</th><th>Forma</th><th>Valor</th><th>Status</th></tr></thead><tbody>${payments.map(p=>`<tr><td><b>${esc(p.master?.name||'')}</b><small>${esc(p.master?.supplier||'')}</small></td><td>${esc(p.master?.registration||'—')}</td><td>${p.due?fmt(p.due):'—'}</td><td>${esc(p.master?.method||'—')}</td><td>${moneySafe(p.value)}</td><td>${badgeStatus(p.status||'A vencer')}</td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Nenhuma conta neste mês.</div></td></tr>'}</tbody></table></div>`;$('#v10AllAccounts').onclick=()=>{v2state.accountsMode='all';accounts()};$('#v10AccountsMonth').onchange=e=>{v2state.accountsMonth=e.target.value;accounts()};$('#v10AccountAI').onclick=accountAIUpload};
})();

;

/* ===== SOURCE: patch-v11.js ===== */
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

;

/* ===== SOURCE: patch-v12.js ===== */
/* Integral Financeiro V12 - entradas ERP condensadas por fonte */
(function(){
'use strict';
const moneySafe=v=>money(Number(v||0));
const groupERP=()=>{
  const map=new Map();
  (db.erpPlannedRevenues||[]).forEach(r=>{
    const key=String(r.projectId||r.project||'erp');
    if(!map.has(key))map.set(key,{key,source:r.project||'Projeto ERP',rows:[],total:0});
    const g=map.get(key);g.rows.push(r);g.total+=Number(r.remaining||0);
  });
  return [...map.values()].sort((a,b)=>a.source.localeCompare(b.source,'pt-BR'));
};
function detail(group){
  const rows=[...group.rows].sort((a,b)=>String(a.dueDate||'').localeCompare(String(b.dueDate||'')));
  v2modal(`Entradas previstas • ${esc(group.source)}`,`<div class="modal-body"><div class="card metric mini erp-source-total"><h3>Total em aberto</h3><b>${moneySafe(group.total)}</b><small>${rows.length} parcela(s)/etapa(s) prevista(s)</small></div><div class="table-wrap"><table class="table"><thead><tr><th>Parcela / etapa</th><th>Vencimento</th><th>Previsto</th><th>Recebido</th><th>Saldo a entrar</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.origin||'Recebimento')}</b></td><td>${r.dueDate?fmt(r.dueDate):'—'}</td><td>${moneySafe(r.total)}</td><td>${moneySafe(r.received)}</td><td><b>${moneySafe(r.remaining)}</b></td></tr>`).join('')||'<tr><td colspan="5">Nenhuma parcela em aberto.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);
}
function decorate(){
  if(view!=='planning')return;
  const sections=[...document.querySelectorAll('#content section.card')];
  const target=sections.find(s=>s.querySelector('.section-head h3')?.textContent.trim()==='Entradas previstas do ERP');
  if(!target)return;
  const groups=groupERP();
  target.innerHTML=`<div class="section-head"><div><h3>Entradas previstas do ERP</h3><div class="muted">Condensadas por fonte. Clique para ver cada parcela e vencimento.</div></div></div><div class="erp-source-list">${groups.map((g,i)=>`<button class="erp-source-row" data-erp-source="${i}"><span><b>${esc(g.source)}</b><small>${g.rows.length} parcela(s) em aberto</small></span><strong>${moneySafe(g.total)}</strong><span class="erp-source-chevron">›</span></button>`).join('')||'<div class="empty">Nenhuma entrada prevista no ERP.</div>'}</div>`;
  target.querySelectorAll('[data-erp-source]').forEach(b=>b.onclick=()=>detail(groups[Number(b.dataset.erpSource)]));
}
const basePlanning=planning;
planning=function(){const r=basePlanning();setTimeout(decorate,0);return r;};
window.addEventListener('integral:erp-planning-synced',()=>{if(view==='planning')setTimeout(decorate,0)});
})();

;

/* ===== SOURCE: patch-v13.js ===== */
/* Integral Financeiro V13 - RH estável com projeção mensal de 6 meses */
(function(){
'use strict';
const uid13=()=>typeof v2uid==='function'?v2uid():Date.now()+Math.floor(Math.random()*9999);
const today13=()=>new Date().toISOString().slice(0,10);
const month13=d=>String(d||'').slice(0,7);
const addMonths13=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const label13=m=>{const [y,n]=String(m).split('-');return new Date(+y,+n-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const money13=v=>money(Number(v||0));
const isAdm13=()=>user?.role==='Administrador';
let selectedHrMonth=month13(today13());

function valueForMonth(p,m){
  const first=`${m}-01`, last=`${m}-31`;
  if(p.start&&p.start>last)return 0;
  if(p.end&&p.end<first)return 0;
  const hist=[...(p.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return Number(hist.at(-1)?.value ?? p.currentValue ?? p.value ?? 0);
}
function paymentFor(p,m){return (db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}
function activePeople(m){return (db.hrPeople||[]).filter(p=>valueForMonth(p,m)>0)}
function totalMonth(m){return activePeople(m).reduce((s,p)=>s+valueForMonth(p,m),0)}

function openHrMonth(m){
  selectedHrMonth=m;
  hr();
  setTimeout(()=>document.querySelector('.hr-selected-payroll')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
}

const previousHr=window.hr;
window.hr=hr=function(){
  if(!isAdm13()){
    if(typeof previousHr==='function')return previousHr();
    return;
  }
  title('RH');
  const current=month13(today13());
  const months=Array.from({length:6},(_,i)=>addMonths13(current,i));
  if(!months.includes(selectedHrMonth))selectedHrMonth=current;
  const people=activePeople(selectedHrMonth), monthTotal=totalMonth(selectedHrMonth);
  const paidTotal=people.reduce((s,p)=>{const q=paymentFor(p,selectedHrMonth);return s+(q?.status==='Pago'?Number(q.value||valueForMonth(p,selectedHrMonth)):0)},0);

  $('#content').innerHTML=`
    <div class="toolbar hr13-toolbar">
      <div><b>Gestão de colaboradores e contratos</b><div class="muted">Consulte a projeção da folha para os próximos 6 meses.</div></div>
      <button class="btn" id="hr13NewEmployee">+ Cadastrar colaborador</button>
    </div>

    <section class="card hr13-projection">
      <div class="section-head"><div><h3>Projeção de pagamentos de colaboradores</h3><p class="muted">Selecione um mês para ver quem estará vigente e quanto está previsto para pagamento.</p></div></div>
      <div class="hr13-months">${months.map(m=>`<button class="hr13-month ${m===selectedHrMonth?'active':''}" data-hr13-month="${m}"><span>${label13(m)}</span><b>${money13(totalMonth(m))}</b><small>${activePeople(m).length} colaborador(es)</small></button>`).join('')}</div>
    </section>

    <section class="hr-selected-payroll">
      <div class="page-intro hr13-month-head"><div><h3>${label13(selectedHrMonth)}</h3><p>${selectedHrMonth===current?'Folha do mês vigente':'Projeção de folha futura'}</p></div><div class="hr13-summary"><span><small>Previsto</small><b>${money13(monthTotal)}</b></span><span><small>Quitado</small><b>${money13(paidTotal)}</b></span><span><small>Em aberto</small><b>${money13(Math.max(0,monthTotal-paidTotal))}</b></span></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Colaborador</th><th>Contrato</th><th>Valor previsto</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const q=paymentFor(p,selectedHrMonth),isPaid=q?.status==='Pago';return`<tr><td><b>${esc(p.name)}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${money13(valueForMonth(p,selectedHrMonth))}</b></td><td>${isPaid?badgeStatus('Pago'):(selectedHrMonth===current?'Pendente':'Previsto')}</td><td>${selectedHrMonth===current&&!isPaid?`<button class="btn small" data-hr13-pay="${p.id}">Marcar pago</button>`:isPaid?'Quitado':'—'}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador com contrato vigente neste mês.</div></td></tr>'}</tbody></table></div>
    </section>

    <h3 class="section-title">Funcionários cadastrados</h3>
    <div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr13-employee="${p.id}"><div><h3>${esc(p.name)}</h3><span class="badge">${p.end&&p.end<today13()?'Encerrado':'Vigente'}</span></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${money13(p.currentValue||p.value)}</b></span><span><small>Contratos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;

  $('#hr13NewEmployee').onclick=()=>{ if(typeof employeeForm==='function') employeeForm(); };
  $$('[data-hr13-employee]').forEach(b=>b.onclick=()=>{ if(typeof employeeForm==='function') employeeForm(b.dataset.hr13Employee); });
  $$('[data-hr13-month]').forEach(b=>b.onclick=()=>openHrMonth(b.dataset.hr13Month));
  $$('[data-hr13-pay]').forEach(b=>b.onclick=()=>{
    const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr13Pay)); if(!p)return;
    let q=paymentFor(p,current),val=valueForMonth(p,current);
    if(q){q.status='Pago';q.paidAt=today13();q.value=val;}
    else (db.hrPayments=db.hrPayments||[]).push({id:uid13(),personId:p.id,month:current,value:val,status:'Pago',paidAt:today13()});
    save();hr();
  });
};
})();

;

/* ===== SOURCE: patch-v14.js ===== */
/* Integral Financeiro V14 - exportações CSV/PDF e ZIP de documentos fiscais */
(function(){
'use strict';
const monthOf=d=>String(d||'').slice(0,7);
const nowMonth=()=>new Date().toISOString().slice(0,7);
const safe=s=>String(s||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'_');
const csvCell=v=>`"${String(v??'').replace(/"/g,'""')}"`;
const downloadBlob=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)};
const moneyNum=v=>Number(v||0);
function realRows(){
  const paid=(db.accountPayments||[]).filter(p=>p.status==='Paga').map(p=>{const m=(db.accountMasters||[]).find(a=>a.id===p.accountId);return{date:(p.paidAt||p.due||'').slice(0,10),description:m?.name||'Conta paga',kind:m?.category||'Despesa fixa',direction:'Saída',value:moneyNum(p.value),source:'Conta paga'}});
  const budget=(db.budgetExpenses||[]).map(e=>({date:e.date,description:e.description||'Gasto de orçamento',kind:'Despesa variável',direction:'Saída',value:moneyNum(e.value),source:'Orçamento'}));
  const manual=(db.cashflow||[]).filter(r=>!['Conta paga','Orçamento'].includes(r.source));
  return [...manual,...paid,...budget];
}
function exportCashCsv(month){
  const rows=realRows().filter(r=>monthOf(r.date)===month).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const lines=[['Data','Descrição','Natureza','Origem','Tipo','Valor'].map(csvCell).join(';'),...rows.map(r=>[r.date,r.description,r.kind||'',r.source||'',r.direction||'',Number(r.value||0).toFixed(2).replace('.',',')].map(csvCell).join(';'))];
  downloadBlob(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),`fluxo-caixa-${month}.csv`);
}
function exportCashPdf(month){
  if(!window.jspdf?.jsPDF){alert('Biblioteca de PDF não carregou. Recarregue a página e tente novamente.');return;}
  const rows=realRows().filter(r=>monthOf(r.date)===month).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const ins=rows.filter(r=>r.direction==='Entrada').reduce((s,r)=>s+moneyNum(r.value),0),outs=rows.filter(r=>r.direction==='Saída').reduce((s,r)=>s+moneyNum(r.value),0);
  const doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  doc.setFontSize(16);doc.text(`Fluxo de Caixa - ${month}`,14,16);doc.setFontSize(10);doc.text(`Entradas: ${money(ins)}   Saídas: ${money(outs)}   Saldo: ${money(ins-outs)}`,14,23);
  const body=rows.map(r=>[r.date||'',r.description||'',r.kind||'',r.source||'',r.direction||'',money(r.value)]);
  if(typeof doc.autoTable==='function')doc.autoTable({startY:28,head:[['Data','Descrição','Natureza','Origem','Tipo','Valor']],body,styles:{fontSize:8},columnStyles:{5:{halign:'right'}}});
  else {let y=31;body.slice(0,28).forEach(r=>{doc.text(r.join(' | ').slice(0,180),14,y);y+=6})}
  doc.save(`fluxo-caixa-${month}.pdf`);
}
async function fetchStoredFile(doc){
  if(doc.storagePath){const sb=window.IntegralERP?.sb;if(!sb)throw new Error('Supabase indisponível');const {data,error}=await sb.storage.from(doc.storageBucket||'documentos').download(doc.storagePath);if(error)throw error;return data;}
  if(doc.fileData&&String(doc.fileData).startsWith('data:')){const res=await fetch(doc.fileData);return await res.blob();}
  return null;
}
async function exportFiscalZip(month,button){
  if(!window.JSZip){alert('Biblioteca ZIP não carregou. Recarregue a página e tente novamente.');return;}
  const docs=(db.docs||[]).filter(d=>monthOf(d.date)===month);
  if(!docs.length){alert('Não há documentos fiscais neste mês.');return;}
  const old=button?.textContent;if(button){button.disabled=true;button.textContent='Preparando ZIP...'}
  try{
    const zip=new JSZip();let added=0;const missing=[];
    for(const d of docs){try{const blob=await fetchStoredFile(d);if(blob){zip.file(safe(d.name||`documento-${d.id}`),blob);added++;}else missing.push(d.name||`Documento ${d.id}`);}catch(e){missing.push(d.name||`Documento ${d.id}`)}}
    if(missing.length)zip.file('_arquivos_legados_indisponiveis.txt',`Os seguintes registros possuem apenas metadados e não têm arquivo físico disponível para exportação:\n\n${missing.join('\n')}`);
    if(!added&&missing.length===0){alert('Nenhum arquivo físico disponível para este mês.');return;}
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});downloadBlob(blob,`documentos-fiscais-${month}.zip`);
  }finally{if(button){button.disabled=false;button.textContent=old}}
}
async function analyzeDocument(file){
  const dataUrl=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file)});
  const candidates=realRows().map((r,i)=>({id:String(r.id||i),date:r.date||'',description:r.description||'',value:moneyNum(r.value),source:r.source||''}));
  const r=await fetch('/api/ai-receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataUrl,fileName:file.name,sector:'',candidates})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.details||d.error||'Falha na IA');return d;
}
async function uploadFiscalDocument(){
  const x=v2modal('Enviar documento fiscal',`<form id="v14DocUpload"><div class="modal-body"><div class="dropzone"><h3>Documento fiscal ou comprovante</h3><p>A IA identifica valor, fornecedor e data. O arquivo será armazenado no Supabase para permitir exportação em ZIP.</p><input id="v14DocFile" type="file" accept="image/*,.pdf" required></div><div class="field"><label>Setor</label><select name="sector"><option value="">Não informado</option>${(db.sectors||[]).filter(s=>s.active!==false).map(s=>`<option>${esc(s.name)}</option>`).join('')}</select></div><div id="v14DocStatus" class="notice">Aguardando arquivo.</div></div><div class="modal-foot"><button class="btn">Analisar e salvar</button></div></form>`);
  x.querySelector('#v14DocUpload').onsubmit=async e=>{e.preventDefault();const file=x.querySelector('#v14DocFile').files[0],status=x.querySelector('#v14DocStatus');if(!file)return;status.textContent='Analisando e armazenando documento...';try{
    const ai=await analyzeDocument(file),sector=new FormData(e.target).get('sector')||'',sb=window.IntegralERP?.sb;if(!sb)throw new Error('Conexão com Supabase indisponível.');const {data:{user:authUser}}=await sb.auth.getUser();if(!authUser)throw new Error('Sessão do ERP não encontrada.');const date=ai.date||new Date().toISOString().slice(0,10),month=monthOf(date),path=`${authUser.id}/financeiro-fiscal/${month}/${Date.now()}-${safe(file.name)}`;const up=await sb.storage.from('documentos').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(up.error)throw up.error;
    const doc={id:Date.now()+Math.floor(Math.random()*9999),name:file.name,type:file.type||'Documento',supplier:ai.origin||'',date,cat:'Documento fiscal',sector,value:moneyNum(ai.value),status:ai.duplicate?'Duplicidade identificada':'Confirmado',file:{name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()},storageBucket:'documentos',storagePath:path,aiData:ai};db.docs=db.docs||[];db.docs.push(doc);if(!ai.duplicate&&doc.value>0){db.cashflow=db.cashflow||[];db.cashflow.push({id:Date.now()+Math.floor(Math.random()*9999),date:doc.date,direction:'Saída',description:ai.description||`Documento fiscal • ${doc.supplier||file.name}`,kind:'Despesa variável',value:doc.value,source:'Documento fiscal',documentId:doc.id})}save();x.remove();documents();
  }catch(err){status.textContent=`Não foi possível salvar: ${err.message}`}}
}
function installCashExports(){
  const old=window.cashflow;if(typeof old!=='function'||old.__v14)return;const wrapped=function(){const out=old.apply(this,arguments);setTimeout(()=>{const toolbar=document.querySelector('#content .toolbar');if(!toolbar||document.querySelector('#v14CashCsv'))return;const box=document.createElement('div');box.className='right export-actions';box.innerHTML='<button class="btn ghost" id="v14CashCsv">Exportar CSV</button><button class="btn ghost" id="v14CashPdf">Exportar PDF</button>';toolbar.appendChild(box);document.querySelector('#v14CashCsv').onclick=()=>exportCashCsv(v2state.cashMonth||nowMonth());document.querySelector('#v14CashPdf').onclick=()=>exportCashPdf(v2state.cashMonth||nowMonth());},0);return out};wrapped.__v14=true;window.cashflow=wrapped;cashflow=wrapped;
}
function installDocumentExports(){
  const old=window.documents;if(typeof old!=='function'||old.__v14)return;const wrapped=function(){const out=old.apply(this,arguments);setTimeout(()=>{const toolbar=document.querySelector('#content .toolbar');if(!toolbar)return;const upload=document.querySelector('#v10UploadDoc');if(upload)upload.onclick=uploadFiscalDocument;if(!document.querySelector('#v14DocsZip')){const b=document.createElement('button');b.id='v14DocsZip';b.className='btn ghost';b.textContent='Exportar mês em ZIP';b.onclick=()=>exportFiscalZip(v2state?.docsMonth||nowMonth(),b);toolbar.appendChild(b)}},0);return out};wrapped.__v14=true;window.documents=wrapped;documents=wrapped;
}
setTimeout(()=>{installCashExports();installDocumentExports();if(view==='cashflow')cashflow();if(view==='documents')documents();},300);
})();

;

/* ===== SOURCE: patch-v16.js ===== */
/* Integral Financeiro V16 - sincronização ERP somente manual e planejamento estável */
(function(){
'use strict';

// Restaura APIs globais interceptadas antes do V10.
const originals=window.__IntegralERPManualSyncOriginals;
if(originals){
  window.setTimeout=originals.setTimeout;
  window.setInterval=originals.setInterval;
  Document.prototype.addEventListener=originals.addEventListener;
}

const isAdm=()=>user?.role==='Administrador';
const safeMoney=v=>money(Number(v||0));

// Impede que abrir Planejamento provoque nova consulta ao ERP.
const previousPlanning=planning;
planning=function(){
  const erp=window.IntegralERP;
  const sb=erp?.sb;
  if(erp)erp.sb=null;
  try{return previousPlanning();}
  finally{if(erp)erp.sb=sb;}
};

async function manualSyncERP(button){
  if(!isAdm())return;
  const oldText=button.textContent;
  button.disabled=true;
  button.textContent='Sincronizando...';
  try{
    if(!window.IntegralERP?.sync)throw new Error('Sincronização do ERP indisponível.');
    await window.IntegralERP.sync();
    if(window.IntegralFinanceERPPlanning?.sync)await window.IntegralFinanceERPPlanning.sync();
    db.lastErpManualSync=new Date().toISOString();
    save();
    button.textContent='ERP sincronizado';
    if(view==='planning')planning();
    else if(view==='dashboard'&&typeof dashboard==='function')dashboard();
    setTimeout(()=>{if(document.body.contains(button)){button.disabled=false;button.textContent=oldText;}},1400);
  }catch(e){
    console.error('Sincronização manual ERP:',e);
    button.disabled=false;
    button.textContent='Falha ao sincronizar';
    alert(`Não foi possível sincronizar com o ERP: ${e.message||e}`);
    setTimeout(()=>{if(document.body.contains(button))button.textContent=oldText;},1800);
  }
}

function installManualSync(){
  const foot=document.querySelector('.sidebar-foot');
  if(!foot||!isAdm()||foot.querySelector('#manualErpSync'))return;
  const userMini=foot.querySelector('.user-mini');
  const wrap=document.createElement('div');
  wrap.className='manual-erp-sync-wrap';
  const btn=document.createElement('button');
  btn.id='manualErpSync';
  btn.className='btn secondary wide';
  btn.type='button';
  btn.textContent='Sincronizar com ERP';
  const small=document.createElement('small');
  small.className='muted manual-sync-time';
  small.textContent=db.lastErpManualSync?`Última: ${new Date(db.lastErpManualSync).toLocaleString('pt-BR')}`:'Sincronização somente manual';
  btn.addEventListener('click',async()=>{await manualSyncERP(btn);if(db.lastErpManualSync)small.textContent=`Última: ${new Date(db.lastErpManualSync).toLocaleString('pt-BR')}`;});
  wrap.append(btn,small);
  foot.insertBefore(wrap,userMini||foot.firstChild);
}

const previousApp=app;
app=function(){
  previousApp();
  setTimeout(installManualSync,0);
};

// Garante botão na sessão que já estiver aberta quando o patch carregar.
setTimeout(installManualSync,0);

// Reforça o clique das fontes ERP sem re-render periódico.
function wireERPSourceRows(){
  if(view!=='planning')return;
  document.querySelectorAll('[data-erp-source]').forEach(btn=>{
    btn.style.cursor='pointer';
    btn.setAttribute('aria-label',(btn.textContent||'Entrada prevista do ERP').trim());
  });
}
const oldPlanningStable=planning;
planning=function(){const r=oldPlanningStable();setTimeout(wireERPSourceRows,0);return r;};

})();

;

/* ===== SOURCE: patch-v17.js ===== */
/* Integral Financeiro V17 - RH consolidado e relatório dentro de Viagens */
(function(){
'use strict';
const $q=q=>document.querySelector(q), $$q=q=>[...document.querySelectorAll(q)];
const uid=()=>Date.now()+Math.floor(Math.random()*9999);
const today=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>today().slice(0,7);
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const monthLabel=m=>{const[y,n]=String(m).split('-');return new Date(+y,+n-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const money17=v=>money(Number(v||0));
const isAdm=()=>user?.role==='Administrador';
let selectedMonth=currentMonth();

function valueForMonth(p,m){
  const first=`${m}-01`, last=`${m}-31`;
  if(p.start&&p.start>last)return 0;
  if(p.end&&p.end<first)return 0;
  const hist=[...(p.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return Number(hist.at(-1)?.value ?? p.currentValue ?? p.value ?? 0);
}
function activePeople(m){return (db.hrPeople||[]).filter(p=>valueForMonth(p,m)>0)}
function paymentFor(p,m){return (db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}

function employeeModal(id){
  const p=(db.hrPeople||[]).find(x=>String(x.id)===String(id));
  const x=v2modal(p?'Editar colaborador':'Cadastrar colaborador',`<form id="hr17Form"><div class="modal-body"><div class="form-section"><h4>Contrato do colaborador</h4><div class="form-grid"><div class="field full"><label>Nome do colaborador</label><input name="name" value="${esc(p?.name||'')}" required></div><div class="field"><label>Início do contrato</label><input name="start" type="date" value="${p?.start||today()}" required></div><div class="field"><label>Fim do contrato</label><input name="end" type="date" value="${p?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" step="0.01" min="0" value="${p?.currentValue??p?.value??''}" required></div><div class="field"><label>Adicionar contrato/arquivo</label><input id="hr17File" type="file"></div></div></div><div class="notice">Alterações no valor mensal ficam registradas no histórico e passam a valer nas projeções futuras.</div>${p?.history?.length?`<div class="form-section"><h4>Histórico de valores</h4><div class="history-list">${[...p.history].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(h=>`<div><b>${h.date?fmt(h.date):'—'}</b><span>${money17(h.value)}</span></div>`).join('')}</div></div>`:''}</div><div class="modal-foot">${p?'<button type="button" class="btn danger" id="hr17Delete">Excluir colaborador</button>':''}<button class="btn">Salvar</button></div></form>`);
  const form=x.querySelector('#hr17Form');
  form.onsubmit=e=>{e.preventDefault();const f=new FormData(form),val=Number(f.get('value')||0),old=Number(p?.currentValue??p?.value??0),file=x.querySelector('#hr17File').files[0],files=[...(p?.files||[])],history=[...(p?.history||[])];if(file)files.push({name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});if(!p||val!==old)history.push({date:today(),value:val,by:user?.name||''});const o={id:p?.id||uid(),name:String(f.get('name')||'').trim(),start:f.get('start'),end:f.get('end')||'',currentValue:val,files,history};if(p)Object.assign(p,o);else (db.hrPeople=db.hrPeople||[]).push(o);save();x.remove();hr();};
  if(p)x.querySelector('#hr17Delete').onclick=()=>{if(confirm(`Excluir ${p.name}?`)){db.hrPeople=db.hrPeople.filter(q=>q.id!==p.id);db.hrPayments=(db.hrPayments||[]).filter(q=>String(q.personId)!==String(p.id));save();x.remove();hr();}};
}

window.hr=hr=function(){
  if(!isAdm()){view='budgets';return app();}
  title('RH');
  const start=currentMonth();
  const months=Array.from({length:6},(_,i)=>addMonth(start,i));
  if(!months.includes(selectedMonth))selectedMonth=start;
  const people=activePeople(selectedMonth);
  const total=people.reduce((s,p)=>s+valueForMonth(p,selectedMonth),0);
  const paid=people.reduce((s,p)=>{const q=paymentFor(p,selectedMonth);return s+(q?.status==='Pago'?Number(q.value||valueForMonth(p,selectedMonth)):0)},0);
  $('#content').innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção dos pagamentos dos próximos 6 meses.</div></div><button class="btn" id="hr17New">+ Cadastrar colaborador</button></div>
  <section class="card hr17-month-panel"><div class="section-head"><div><h3>Próximos 6 meses</h3><p class="muted">Clique em um mês para abrir a folha projetada daquele período.</p></div></div><div class="hr17-months">${months.map(m=>{const ps=activePeople(m),t=ps.reduce((s,p)=>s+valueForMonth(p,m),0);return`<button class="hr17-month ${m===selectedMonth?'active':''}" data-hr17-month="${m}"><span>${monthLabel(m)}</span><b>${money17(t)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section>
  <section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedMonth)}</h3><p>${selectedMonth===start?'Folha do mês vigente':'Projeção de pagamentos futuros'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${money17(total)}</b></span><span><small>Quitado</small><b>${money17(paid)}</b></span><span><small>Em aberto</small><b>${money17(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Colaborador</th><th>Vigência</th><th>Valor previsto</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const q=paymentFor(p,selectedMonth),done=q?.status==='Pago';return`<tr><td><b>${esc(p.name)}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${money17(valueForMonth(p,selectedMonth))}</b></td><td>${done?badgeStatus('Pago'):(selectedMonth===start?'Pendente':'Previsto')}</td><td>${selectedMonth===start&&!done?`<button class="btn small" data-hr17-pay="${p.id}">Marcar pago</button>`:done?'Quitado':'—'}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador vigente neste mês.</div></td></tr>'}</tbody></table></div></section>
  <h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr17-person="${p.id}"><div><h3>${esc(p.name)}</h3><span class="badge">${p.end&&p.end<today()?'Encerrado':'Vigente'}</span></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${money17(p.currentValue||p.value)}</b></span><span><small>Arquivos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;
  $('#hr17New').onclick=()=>employeeModal();
  $$q('[data-hr17-person]').forEach(b=>b.onclick=()=>employeeModal(b.dataset.hr17Person));
  $$q('[data-hr17-month]').forEach(b=>b.onclick=()=>{selectedMonth=b.dataset.hr17Month;hr();});
  $$q('[data-hr17-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr17Pay));if(!p)return;let q=paymentFor(p,start),v=valueForMonth(p,start);if(q){q.status='Pago';q.paidAt=today();q.value=v}else(db.hrPayments=db.hrPayments||[]).push({id:uid(),personId:p.id,month:start,value:v,status:'Pago',paidAt:today()});save();hr();});
};

function travelReport(){
  const trips=(db.trips||[]), active=trips.filter(t=>!['Finalizada','Aprovada','Encerrada'].includes(t.status)), spent=trips.reduce((s,t)=>s+Number(t.proven||t.spent||0),0), declared=trips.reduce((s,t)=>s+Number(t.declared||0),0), divergence=trips.filter(t=>String(t.status||'').includes('Diverg'));
  v2modal('Relatório de Viagens',`<div class="modal-body"><div class="grid cols-3 compact-metrics"><div class="card metric mini"><h3>Viagens registradas</h3><b>${trips.length}</b></div><div class="card metric mini"><h3>Comprovado</h3><b>${money17(spent)}</b></div><div class="card metric mini"><h3>Declarado</h3><b>${money17(declared)}</b></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Projeto</th><th>Declarado</th><th>Comprovado</th><th>Status</th></tr></thead><tbody>${trips.map(t=>`<tr><td><b>${esc(t.city||t.destination||'—')}</b></td><td>${esc(t.period||'—')}</td><td>${esc(t.employee||t.team||'—')}</td><td>${esc(t.project||'—')}</td><td>${money17(t.declared)}</td><td>${money17(t.proven||t.spent)}</td><td>${esc(t.status||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma viagem registrada.</td></tr>'}</tbody></table></div>${divergence.length?`<div class="notice warn">${divergence.length} viagem(ns) com divergência de prestação de contas.</div>`:''}</div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);
}

// Remove Relatórios do menu lateral: relatório passa a ser parte de Viagens.
for(let i=adminNav.length-1;i>=0;i--)if(adminNav[i]?.[0]==='reports')adminNav.splice(i,1);
if(Array.isArray(staffNav))for(let i=staffNav.length-1;i>=0;i--)if(staffNav[i]?.[0]==='reports')staffNav.splice(i,1);

const previousTrips=trips;
window.trips=trips=function(){
  const r=previousTrips();
  const toolbar=$q('#content .toolbar');
  if(toolbar&&!$q('#travelReportBtn')){
    let right=toolbar.querySelector('.right');if(!right){right=document.createElement('div');right.className='right';toolbar.appendChild(right);}
    const btn=document.createElement('button');btn.className='btn ghost';btn.id='travelReportBtn';btn.type='button';btn.textContent='Relatório de Viagens';btn.onclick=travelReport;right.prepend(btn);
  }
  return r;
};

// Força o roteamento final do RH consolidado.
const previousRender17=render;
render=function(){if(view==='hr')return hr();return previousRender17();};
})();

;

/* ===== SOURCE: patch-v18.js ===== */
/* Integral Financeiro V18 - correção final independente de RH e Relatórios */
(function(){
'use strict';

const qs=(s)=>document.querySelector(s), qsa=(s)=>Array.from(document.querySelectorAll(s));
const now=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>now().slice(0,7);
const addMonth=(m,n)=>{const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const monthLabel=(m)=>{const parts=String(m).split('-');return new Date(Number(parts[0]),Number(parts[1])-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const money18=(v)=>money(Number(v||0));
let selectedMonth18=currentMonth();

function valueForMonth18(p,m){
  const first=m+'-01', last=m+'-31';
  if(p.start&&p.start>last)return 0;
  if(p.end&&p.end<first)return 0;
  const hist=(p.history||[]).filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const lastHist=hist.length?hist[hist.length-1]:null;
  return Number(lastHist&&lastHist.value!=null?lastHist.value:(p.currentValue!=null?p.currentValue:(p.value||0)));
}
function activePeople18(m){return (db.hrPeople||[]).filter(p=>valueForMonth18(p,m)>0)}
function paymentFor18(p,m){return (db.hrPayments||[]).find(x=>String(x.personId)===String(p.id)&&x.month===m)}

function renderHr18(){
  if(!user||user.role!=='Administrador'){view='budgets';app();return;}
  title('RH');
  const start=currentMonth();
  const months=Array.from({length:6},(_,i)=>addMonth(start,i));
  if(months.indexOf(selectedMonth18)===-1)selectedMonth18=start;
  const people=activePeople18(selectedMonth18);
  const total=people.reduce((s,p)=>s+valueForMonth18(p,selectedMonth18),0);
  const paid=people.reduce((s,p)=>{const q=paymentFor18(p,selectedMonth18);return s+(q&&q.status==='Pago'?Number(q.value||valueForMonth18(p,selectedMonth18)):0)},0);

  qs('#content').innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção de pagamentos para os próximos 6 meses.</div></div><button class="btn" id="hr18New">+ Colaborador</button></div>
  <section class="card hr17-month-panel"><div class="section-head"><div><h3>Próximos 6 meses</h3><p class="muted">Clique em um mês para visualizar a folha projetada.</p></div></div><div class="hr17-months">${months.map(m=>{const ps=activePeople18(m),t=ps.reduce((s,p)=>s+valueForMonth18(p,m),0);return `<button class="hr17-month ${m===selectedMonth18?'active':''}" data-hr18-month="${m}"><span>${monthLabel(m)}</span><b>${money18(t)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section>
  <section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedMonth18)}</h3><p>${selectedMonth18===start?'Folha do mês vigente':'Projeção de pagamentos futuros'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${money18(total)}</b></span><span><small>Quitado</small><b>${money18(paid)}</b></span><span><small>Em aberto</small><b>${money18(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Vigência</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const q=paymentFor18(p,selectedMonth18),done=q&&q.status==='Pago';return `<tr><td><b>${esc(p.name||'')}</b></td><td>${p.start?fmt(p.start):'—'} → ${p.end?fmt(p.end):'Indeterminado'}</td><td><b>${money18(valueForMonth18(p,selectedMonth18))}</b></td><td>${done?badgeStatus('Pago'):(selectedMonth18===start?'Pendente':'Previsto')}</td><td>${selectedMonth18===start&&!done?`<button class="btn small" data-hr18-pay="${p.id}">Marcar pago</button>`:(done?'Quitado':'—')}</td></tr>`}).join('')||'<tr><td colspan="5"><div class="empty">Nenhum colaborador vigente neste mês.</div></td></tr>'}</tbody></table></div></section>
  <h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr18-person="${p.id}"><div><h3>${esc(p.name||'')}</h3></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${money18(p.currentValue||p.value)}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;

  qsa('[data-hr18-month]').forEach(b=>b.onclick=()=>{selectedMonth18=b.dataset.hr18Month;renderHr18();});
  qsa('[data-hr18-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr18Pay));if(!p)return;let q=paymentFor18(p,start),v=valueForMonth18(p,start);if(q){q.status='Pago';q.paidAt=now();q.value=v}else{db.hrPayments=db.hrPayments||[];db.hrPayments.push({id:Date.now(),personId:p.id,month:start,value:v,status:'Pago',paidAt:now()});}save();renderHr18();});
  if(qs('#hr18New'))qs('#hr18New').onclick=()=>{if(typeof employeeForm==='function')employeeForm();else if(window.employeeForm)window.employeeForm();};
  qsa('[data-hr18-person]').forEach(b=>b.onclick=()=>{if(typeof employeeForm==='function')employeeForm(b.dataset.hr18Person);else if(window.employeeForm)window.employeeForm(b.dataset.hr18Person);});
}

function removeReportsEverywhere(){
  try{
    if(Array.isArray(adminNav))for(let i=adminNav.length-1;i>=0;i--)if(adminNav[i]&&adminNav[i][0]==='reports')adminNav.splice(i,1);
    if(typeof staffNav!=='undefined'&&Array.isArray(staffNav))for(let i=staffNav.length-1;i>=0;i--)if(staffNav[i]&&staffNav[i][0]==='reports')staffNav.splice(i,1);
  }catch(e){console.warn('Falha ao limpar menu Relatórios:',e);}
  qsa('[data-view="reports"]').forEach(el=>el.remove());
  qsa('.nav button').forEach(el=>{if((el.textContent||'').trim()==='Relatórios')el.remove();});
}

function installTripReportButton(){
  if(view!=='trips')return;
  const toolbar=qs('#content .toolbar');
  if(!toolbar||qs('#tripReport18'))return;
  let right=toolbar.querySelector('.right');
  if(!right){right=document.createElement('div');right.className='right';toolbar.appendChild(right);}
  const btn=document.createElement('button');btn.id='tripReport18';btn.className='btn ghost';btn.type='button';btn.textContent='Relatório de Viagens';
  btn.onclick=()=>{const tripsList=db.trips||[];const declared=tripsList.reduce((s,t)=>s+Number(t.declared||0),0);const proven=tripsList.reduce((s,t)=>s+Number(t.proven||t.spent||0),0);v2modal('Relatório de Viagens',`<div class="modal-body"><div class="grid cols-3"><div class="card metric"><h3>Viagens</h3><b>${tripsList.length}</b></div><div class="card metric"><h3>Declarado</h3><b>${money18(declared)}</b></div><div class="card metric"><h3>Comprovado</h3><b>${money18(proven)}</b></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Destino</th><th>Período</th><th>Equipe</th><th>Projeto</th><th>Declarado</th><th>Comprovado</th><th>Status</th></tr></thead><tbody>${tripsList.map(t=>`<tr><td><b>${esc(t.city||t.destination||'—')}</b></td><td>${esc(t.period||'—')}</td><td>${esc(t.employee||t.team||'—')}</td><td>${esc(t.project||'—')}</td><td>${money18(t.declared)}</td><td>${money18(t.proven||t.spent)}</td><td>${esc(t.status||'—')}</td></tr>`).join('')||'<tr><td colspan="7">Nenhuma viagem registrada.</td></tr>'}</tbody></table></div></div><div class="modal-foot"><button class="btn" data-v2close>Fechar</button></div>`);};
  right.prepend(btn);
}

const previousRender18=render;
render=function(){
  removeReportsEverywhere();
  if(view==='hr')return renderHr18();
  const r=previousRender18();
  setTimeout(()=>{removeReportsEverywhere();installTripReportButton();},0);
  return r;
};

const previousApp18=app;
app=function(){const r=previousApp18();setTimeout(removeReportsEverywhere,0);return r;};

const obs=new MutationObserver(()=>removeReportsEverywhere());
obs.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(removeReportsEverywhere,0);

})();

;

/* ===== SOURCE: patch-v19.js ===== */
/* Integral Financeiro V19 - Contas/Pagamentos persistidos no Supabase */
(function(){
'use strict';
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pushing=false, loading=false, pushTimer=null, ready=false;

const sb=()=>window.IntegralERP?.sb||null;
const hasSession=()=>!!user;
const id=v=>String(v??'');
const clean=o=>JSON.parse(JSON.stringify(o||{}));

function mapAccount(a){
  return {
    id:id(a.id),
    nome:a.name||a.nome||a.supplier||'Conta',
    fornecedor:a.supplier||a.fornecedor||a.name||'',
    categoria:a.category||a.categoria||'',
    setor:a.sector||a.setor||'',
    matricula_cadastro:a.registration||a.matricula||a.matriculaCadastro||'',
    recorrencia:a.recurrence||a.recorrencia||'',
    ativo:a.active!==false,
    dados:clean(a),
    updated_at:new Date().toISOString()
  };
}
function mapPayment(p){
  return {
    id:id(p.id),
    conta_id:id(p.accountId||p.contaId),
    vencimento:p.due||p.vencimento||new Date().toISOString().slice(0,10),
    valor:Number(p.value||p.valor||0),
    status:p.status||'Pendente',
    forma_pagamento:p.paymentMethod||p.method||p.formaPagamento||'',
    codigo_pagamento:p.paymentCode||p.code||p.codigoPagamento||'',
    pago_em:p.paidAt||p.pagoEm||null,
    dados:clean(p),
    updated_at:new Date().toISOString()
  };
}
function restoreAccount(r){
  const a={...(r.dados||{})};
  a.id=a.id??r.id;
  a.name=a.name||r.nome;
  a.supplier=a.supplier||r.fornecedor;
  a.category=a.category||r.categoria;
  a.sector=a.sector||r.setor;
  a.registration=a.registration||r.matricula_cadastro;
  a.recurrence=a.recurrence||r.recorrencia;
  a.active=r.ativo!==false;
  return a;
}
function restorePayment(r){
  const p={...(r.dados||{})};
  p.id=p.id??r.id;
  p.accountId=p.accountId??r.conta_id;
  p.due=p.due||r.vencimento;
  p.value=Number(p.value??r.valor??0);
  p.status=p.status||r.status;
  p.paymentMethod=p.paymentMethod||r.forma_pagamento||'';
  p.paymentCode=p.paymentCode||r.codigo_pagamento||'';
  p.paidAt=p.paidAt||r.pago_em||null;
  return p;
}

async function tableAvailable(){
  const c=sb(); if(!c||!hasSession())return false;
  const {error}=await c.from('financeiro_contas').select('id').limit(1);
  if(error){
    if(String(error.code)==='42P01'||/does not exist/i.test(error.message||'')) console.warn('Integral Financeiro: schema de contas ainda não foi criado no Supabase.');
    else console.warn('Integral Financeiro: Supabase indisponível para contas.',error);
    return false;
  }
  return true;
}

async function push(){
  if(pushing||loading||!ready)return false;
  const c=sb(); if(!c||!hasSession())return false;
  pushing=true;
  try{
    const accounts=(db.accountMasters||[]).map(mapAccount);
    const payments=(db.accountPayments||[]).map(mapPayment).filter(p=>p.conta_id);
    if(accounts.length){const {error}=await c.from('financeiro_contas').upsert(accounts,{onConflict:'id'});if(error)throw error;}
    if(payments.length){const {error}=await c.from('financeiro_pagamentos').upsert(payments,{onConflict:'id'});if(error)throw error;}
    db.financeCloudLastSync=new Date().toISOString();
    try{localStorage.setItem('integralFinanceiro',JSON.stringify(db));}catch{}
    return true;
  }catch(e){console.warn('Falha ao sincronizar Contas/Pagamentos com Supabase:',e);return false;}
  finally{pushing=false;}
}
function schedulePush(){
  clearTimeout(pushTimer);
  pushTimer=setTimeout(()=>push(),500);
}

async function load(){
  if(loading||!hasSession())return false;
  const c=sb(); if(!c)return false;
  loading=true;
  try{
    if(!await tableAvailable())return false;
    ready=true;
    const [ca,pa]=await Promise.all([
      c.from('financeiro_contas').select('*').order('nome'),
      c.from('financeiro_pagamentos').select('*').order('vencimento')
    ]);
    if(ca.error)throw ca.error;if(pa.error)throw pa.error;
    const cloudAccounts=(ca.data||[]), cloudPayments=(pa.data||[]);
    if(!cloudAccounts.length && (db.accountMasters||[]).length){await push();return true;}
    if(cloudAccounts.length){
      db.accountMasters=cloudAccounts.map(restoreAccount);
      db.accountPayments=cloudPayments.map(restorePayment);
      db.financeCloudLastSync=new Date().toISOString();
      try{localStorage.setItem('integralFinanceiro',JSON.stringify(db));}catch{}
      if(view==='accounts'&&typeof accounts==='function')accounts();
      if(view==='dashboard'&&typeof dashboard==='function')dashboard();
    }
    return true;
  }catch(e){console.warn('Falha ao carregar Contas/Pagamentos do Supabase:',e);return false;}
  finally{loading=false;}
}

// Persiste no Supabase sempre que o Financeiro salva uma alteração local.
const originalSave=window.save;
if(typeof originalSave==='function'){
  window.save=function(){const r=originalSave.apply(this,arguments);if(ready)schedulePush();return r;};
}

async function boot(){
  for(let i=0;i<20;i++){
    if(sb()&&hasSession()){await load();return;}
    await wait(350);
  }
}
setTimeout(boot,300);
window.addEventListener('integral:erp-ready',boot);
window.IntegralFinanceCloud={load,push,get ready(){return ready;}};
})();

;

/* ===== SOURCE: patch-v20.js ===== */
/* Integral Financeiro V20 - estabilização de navegação e RH */
(function(){
'use strict';

const q=(s)=>document.querySelector(s);
const qa=(s)=>Array.from(document.querySelectorAll(s));
const today=()=>new Date().toISOString().slice(0,10);
const monthNow=()=>today().slice(0,7);
const addMonth=(m,n)=>{const d=new Date(`${m}-01T12:00:00`);d.setMonth(d.getMonth()+n);return d.toISOString().slice(0,7)};
const monthLabel=(m)=>{const [y,mm]=String(m).split('-');return new Date(Number(y),Number(mm)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'}).replace(/^./,c=>c.toUpperCase())};
const mny=(v)=>money(Number(v||0));
let selectedHrMonth=monthNow();

function hrBaseValueForMonth(person,month){
  const first=`${month}-01`, last=`${month}-31`;
  if(person.start&&person.start>last)return 0;
  if(person.end&&person.end<first)return 0;
  const hist=[...(person.history||[])].filter(h=>h.date&&h.date<=last).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const item=hist.length?hist[hist.length-1]:null;
  return Number(item?.value ?? person.currentValue ?? person.value ?? 0);
}
function hrMonthlyVariable(person,month){
  db.hrMonthlyVariables=db.hrMonthlyVariables||[];
  return db.hrMonthlyVariables.find(x=>String(x.personId)===String(person.id)&&x.month===month)||null;
}
function hrValueForMonth(person,month){
  const base=hrBaseValueForMonth(person,month);
  if(!base)return 0;
  const variable=hrMonthlyVariable(person,month);
  return base+Number(variable?.overtime||0)+Number(variable?.bonus||0);
}
function hrPeopleForMonth(month){return (db.hrPeople||[]).filter(p=>hrBaseValueForMonth(p,month)>0)}
function hrPayment(person,month){return (db.hrPayments||[]).find(x=>String(x.personId)===String(person.id)&&x.month===month)}
function hrMonthlyVariableModal(person,month){
  if(!person||!month)return;
  db.hrMonthlyVariables=db.hrMonthlyVariables||[];
  const current=hrMonthlyVariable(person,month);
  const base=hrBaseValueForMonth(person,month);
  const overtime=Number(current?.overtime||0), bonus=Number(current?.bonus||0);
  const modal=v2modal(`RH • ${person.name} • ${monthLabel(month)}`,`<form id="hrMonthlyVariableForm"><div class="modal-body"><div class="notice">Estes valores valem somente para <b>${monthLabel(month)}</b> e não serão repetidos nos meses seguintes.</div><div class="form-grid"><div class="field"><label>Valor base do mês</label><input id="hrMonthBase" type="number" step="0.01" value="${base}" readonly></div><div class="field"><label>Horas extras — valor total</label><input id="hrMonthOvertime" name="overtime" type="number" step="0.01" min="0" value="${overtime}"></div><div class="field"><label>Bônus / Comissões — valor total</label><input id="hrMonthBonus" name="bonus" type="number" step="0.01" min="0" value="${bonus}"></div><div class="field"><label>Total do mês</label><input id="hrMonthTotal" type="text" value="${mny(base+overtime+bonus)}" readonly></div></div></div><div class="modal-foot"><button type="button" class="btn ghost" data-v2close>Cancelar</button><button class="btn">Salvar variáveis do mês</button></div></form>`);
  const form=modal.querySelector('#hrMonthlyVariableForm');
  const overtimeInput=modal.querySelector('#hrMonthOvertime'),bonusInput=modal.querySelector('#hrMonthBonus'),totalInput=modal.querySelector('#hrMonthTotal');
  const refreshTotal=()=>{totalInput.value=mny(base+Number(overtimeInput.value||0)+Number(bonusInput.value||0))};
  overtimeInput.oninput=refreshTotal;bonusInput.oninput=refreshTotal;
  form.onsubmit=e=>{
    e.preventDefault();
    const overtimeValue=Math.max(0,Number(overtimeInput.value||0));
    const bonusValue=Math.max(0,Number(bonusInput.value||0));
    const existing=hrMonthlyVariable(person,month);
    if(existing){Object.assign(existing,{overtime:overtimeValue,bonus:bonusValue,updatedAt:new Date().toISOString(),by:user?.name||''});}
    else db.hrMonthlyVariables.push({id:uid(),personId:person.id,month,overtime:overtimeValue,bonus:bonusValue,updatedAt:new Date().toISOString(),by:user?.name||''});
    const payment=hrPayment(person,month);
    if(payment?.status==='Pago')payment.value=base+overtimeValue+bonusValue;
    save();modal.remove();renderHr20();
  };
}

function closeModal(el){if(el&&el.parentNode)el.remove()}

function hrEmployeeModal(id){
  const person=(db.hrPeople||[]).find(x=>String(x.id)===String(id));
  const modal=document.createElement('div');
  modal.className='modal-backdrop';
  modal.innerHTML=`<div class="modal"><div class="modal-head"><h3>${person?'Editar colaborador':'Cadastrar colaborador'}</h3><button class="btn ghost small" type="button" data-close>Fechar</button></div><form id="hr20Form"><div class="modal-body"><div class="form-section"><h4>Dados do contrato</h4><div class="form-grid"><div class="field full"><label>Nome do colaborador</label><input name="name" value="${esc(person?.name||'')}" required></div><div class="field"><label>Início do contrato</label><input name="start" type="date" value="${person?.start||today()}" required></div><div class="field"><label>Fim do contrato</label><input name="end" type="date" value="${person?.end||''}"></div><div class="field"><label>Valor mensal atual</label><input name="value" type="number" min="0" step="0.01" value="${person?.currentValue??person?.value??''}" required></div><div class="field"><label>Adicionar contrato/arquivo</label><input id="hr20File" type="file"></div></div></div>${person?.history?.length?`<div class="form-section"><h4>Histórico de valores</h4><div class="history-list">${[...person.history].sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(h=>`<div><b>${h.date?fmt(h.date):'—'}</b><span>${mny(h.value)}</span></div>`).join('')}</div></div>`:''}</div><div class="modal-foot">${person?'<button type="button" class="btn danger" id="hr20Delete">Excluir colaborador</button>':''}<button class="btn" type="submit">Salvar</button></div></form></div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-close]').onclick=()=>closeModal(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal(modal)});
  const form=modal.querySelector('#hr20Form');
  form.onsubmit=(e)=>{
    e.preventDefault();
    const fd=new FormData(form);
    const value=Number(fd.get('value')||0);
    const old=Number(person?.currentValue??person?.value??0);
    const file=modal.querySelector('#hr20File')?.files?.[0];
    const files=[...(person?.files||[])];
    const history=[...(person?.history||[])];
    if(file)files.push({name:file.name,type:file.type,size:file.size,addedAt:new Date().toISOString()});
    if(!person||value!==old)history.push({date:today(),value,by:user?.name||''});
    const obj={id:person?.id||Date.now()+Math.floor(Math.random()*10000),name:String(fd.get('name')||'').trim(),start:String(fd.get('start')||''),end:String(fd.get('end')||''),currentValue:value,value,files,history};
    db.hrPeople=db.hrPeople||[];
    if(person)Object.assign(person,obj);else db.hrPeople.push(obj);
    save();
    closeModal(modal);
    renderHr20();
  };
  const del=modal.querySelector('#hr20Delete');
  if(del)del.onclick=()=>{if(confirm(`Excluir ${person.name}?`)){db.hrPeople=(db.hrPeople||[]).filter(x=>String(x.id)!==String(person.id));db.hrPayments=(db.hrPayments||[]).filter(x=>String(x.personId)!==String(person.id));save();closeModal(modal);renderHr20();}};
}

function renderHr20(){
  if(!user||user.role!=='Administrador'){view='budgets';return typeof render==='function'?render():undefined;}
  title('RH');
  const start=monthNow();
  const months=Array.from({length:6},(_,i)=>addMonth(start,i));
  if(!months.includes(selectedHrMonth))selectedHrMonth=start;
  const people=hrPeopleForMonth(selectedHrMonth);
  const total=people.reduce((s,p)=>s+hrValueForMonth(p,selectedHrMonth),0);
  const paid=people.reduce((s,p)=>{const x=hrPayment(p,selectedHrMonth);return s+(x?.status==='Pago'?Number(x.value||hrValueForMonth(p,selectedHrMonth)):0)},0);
  const content=q('#content'); if(!content)return;
  content.innerHTML=`<div class="toolbar"><div><b>Gestão de colaboradores e contratos</b><div class="muted">Projeção dos pagamentos para os próximos 6 meses.</div></div><button class="btn" id="hr20New">+ Colaborador</button></div><section class="card hr17-month-panel"><div class="section-head"><div><h3>Próximos 6 meses</h3><p class="muted">Clique em um mês para visualizar a projeção da folha.</p></div></div><div class="hr17-months">${months.map(m=>{const ps=hrPeopleForMonth(m),v=ps.reduce((s,p)=>s+hrValueForMonth(p,m),0);return`<button class="hr17-month ${m===selectedHrMonth?'active':''}" data-hr20-month="${m}"><span>${monthLabel(m)}</span><b>${mny(v)}</b><small>${ps.length} colaborador(es)</small></button>`}).join('')}</div></section><section class="hr17-payroll"><div class="page-intro"><div><h3>${monthLabel(selectedHrMonth)}</h3><p>${selectedHrMonth===start?'Folha do mês vigente':'Projeção de pagamentos futuros'}</p></div><div class="hr17-summary"><span><small>Previsto</small><b>${mny(total)}</b></span><span><small>Quitado</small><b>${mny(paid)}</b></span><span><small>Em aberto</small><b>${mny(Math.max(0,total-paid))}</b></span></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Valor base</th><th>Hora Extra</th><th>Bônus / Comissões</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${people.map(p=>{const x=hrPayment(p,selectedHrMonth),done=x?.status==='Pago',v=hrMonthlyVariable(p,selectedHrMonth),base=hrBaseValueForMonth(p,selectedHrMonth),overtime=Number(v?.overtime||0),bonus=Number(v?.bonus||0),total=base+overtime+bonus;return`<tr><td><button type="button" class="linklike" data-hr20-variable="${p.id}"><b>${esc(p.name||'')}</b><small class="muted" style="display:block">Clique para editar variáveis</small></button></td><td><b>${mny(base)}</b></td><td>${overtime?`<b>${mny(overtime)}</b>`:'—'}</td><td>${bonus?`<b>${mny(bonus)}</b>`:'—'}</td><td><b>${mny(total)}</b></td><td>${done?badgeStatus('Pago'):(selectedHrMonth===start?'Pendente':'Previsto')}</td><td class="actions"><button class="btn small ghost" data-hr20-variable="${p.id}">Editar variáveis</button>${selectedHrMonth===start&&!done?`<button class="btn small" data-hr20-pay="${p.id}">Marcar pago</button>`:(done?'<span class="muted">Quitado</span>':'')}</td></tr>`}).join('')||'<tr><td colspan="7"><div class="empty">Nenhum colaborador vigente neste mês.</div></td></tr>'}</tbody></table></div></section><h3 class="section-title">Funcionários cadastrados</h3><div class="employee-grid">${(db.hrPeople||[]).map(p=>`<button class="card employee-card" data-hr20-person="${p.id}"><div><h3>${esc(p.name||'')}</h3></div><div class="employee-facts"><span><small>Início</small><b>${p.start?fmt(p.start):'—'}</b></span><span><small>Fim</small><b>${p.end?fmt(p.end):'Indeterminado'}</b></span><span><small>Mensal atual</small><b>${mny(p.currentValue??p.value)}</b></span><span><small>Arquivos</small><b>${(p.files||[]).length}</b></span></div></button>`).join('')||'<div class="empty">Nenhum colaborador cadastrado.</div>'}</div>`;
  q('#hr20New').onclick=()=>hrEmployeeModal();
  qa('[data-hr20-person]').forEach(b=>b.onclick=()=>hrEmployeeModal(b.dataset.hr20Person));
  qa('[data-hr20-month]').forEach(b=>b.onclick=()=>{selectedHrMonth=b.dataset.hr20Month;renderHr20()});
  qa('[data-hr20-variable]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Variable));if(p)hrMonthlyVariableModal(p,selectedHrMonth)});
  qa('[data-hr20-pay]').forEach(b=>b.onclick=()=>{const p=(db.hrPeople||[]).find(x=>String(x.id)===String(b.dataset.hr20Pay));if(!p)return;db.hrPayments=db.hrPayments||[];let x=hrPayment(p,selectedHrMonth);const value=hrValueForMonth(p,selectedHrMonth);if(x)Object.assign(x,{status:'Pago',paidAt:today(),value});else db.hrPayments.push({id:Date.now()+Math.floor(Math.random()*10000),personId:p.id,month:selectedHrMonth,value,status:'Pago',paidAt:today()});save();renderHr20()});
}

// Última definição do RH: elimina dependência de employeeForm de patches anteriores.
window.hr=renderHr20;
try{hr=renderHr20}catch{}

// Última definição de render para garantir RH estável e manter todas as demais telas existentes.
const renderBefore20=window.render||render;
const render20=function(){if(view==='hr')return renderHr20();return renderBefore20.apply(this,arguments)};
window.render=render20;
try{render=render20}catch{}

// Clique único no menu: usa delegação em capture e evita rerender duplo do app inteiro.
document.addEventListener('click',function(e){
  const btn=e.target.closest?.('.nav [data-view]');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  const next=btn.dataset.view;
  if(!next)return;
  view=next;
  qa('.nav [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  render20();
},{capture:true});

// Remove Relatórios do menu caso algum patch anterior volte a inseri-lo.
function cleanupMenu(){qa('.nav [data-view="reports"]').forEach(x=>x.remove());qa('.nav button').filter(x=>(x.textContent||'').trim()==='Relatórios').forEach(x=>x.remove());}
cleanupMenu();

// Diagnóstico passivo: erros deixam rastros no console sem interromper a navegação.
window.addEventListener('error',e=>console.error('Integral Financeiro UI error:',e.error||e.message));
window.addEventListener('unhandledrejection',e=>console.error('Integral Financeiro async error:',e.reason));

})();

;
