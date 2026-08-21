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