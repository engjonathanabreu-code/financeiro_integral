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
