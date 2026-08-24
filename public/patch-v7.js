/* Integral Financeiro V7 - integração com o Supabase do ERP Integral */
(function(){
  const cfg=window.ERP_SUPABASE||{};
  const sb=window.supabase?.createClient?.(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  window.IntegralERP={sb,profiles:[],projects:[],plans:[],steps:[],responsibles:[],loaded:false};

  const hashId=(s)=>{let h=0;for(const c of String(s||''))h=(h*31+c.charCodeAt(0))>>>0;return h||1};
  const roleOf=(tipo)=>tipo==='Administrador'?'Administrador':'Funcionário';
  const norm=(s)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  async function loadERP(){
    if(!sb) throw new Error('Supabase do ERP indisponível.');
    const [pr,pp,pl,st,rp]=await Promise.all([
      sb.from('profiles').select('id,nome,email,tipo,ativo').order('nome'),
      sb.from('projetos').select('id,nome,status,cliente_id').order('nome'),
      sb.from('planos_trabalho').select('id,titulo,projeto_id,status,created_at').order('created_at',{ascending:false}),
      sb.from('etapas_plano').select('id,plano_id,titulo,status'),
      sb.from('etapa_responsaveis').select('etapa_id,usuario_id')
    ]);
    for(const [r,n] of [[pr,'Perfis'],[pp,'Projetos'],[pl,'Planos de trabalho'],[st,'Etapas'],[rp,'Responsáveis']]) if(r.error) throw new Error(`${n}: ${r.error.message}`);
    Object.assign(window.IntegralERP,{profiles:pr.data||[],projects:pp.data||[],plans:pl.data||[],steps:st.data||[],responsibles:rp.data||[],loaded:true,loadedAt:new Date().toISOString()});

    // Espelha referências do ERP no cache financeiro sem perder o ID original.
    db.usersMvp=(pr.data||[]).filter(x=>x.ativo!==false).map(x=>({id:hashId(x.id),erpId:x.id,name:x.nome,email:x.email||'',role:roleOf(x.tipo),sector:x.tipo||'Administrativo',active:true,source:'ERP'}));
    db.erpProjects=(pp.data||[]).map(x=>({id:x.id,name:x.nome,status:x.status}));
    db.erpPlans=(pl.data||[]).map(p=>{
      const stepIds=(st.data||[]).filter(s=>s.plano_id===p.id).map(s=>s.id);
      const userIds=(rp.data||[]).filter(r=>stepIds.includes(r.etapa_id)).map(r=>r.usuario_id);
      const sectors=[...new Set((pr.data||[]).filter(u=>userIds.includes(u.id)).map(u=>u.tipo).filter(Boolean))];
      return {id:p.id,title:p.titulo,projectId:p.projeto_id||'',status:p.status,sectors};
    });
    save();
  }

  async function profileFor(authUser){
    const {data,error}=await sb.from('profiles').select('id,nome,email,tipo,ativo').eq('id',authUser.id).maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('Seu usuário existe no login, mas não possui perfil no ERP.');
    if(data.ativo===false)throw new Error('Este usuário está inativo no ERP.');
    return data;
  }

  function renderERPLogin(error=''){
    user=null;
    $('#app').innerHTML=`<main class="login-wrap"><section class="login-card"><img class="login-logo" src="logo-integral.png"><h1>Integral Financeiro</h1><div class="sub">Acesso integrado ao ERP Integral</div><form id="erpFinLogin"><div class="field"><label>E-mail do ERP</label><input id="erpEmail" type="email" required autocomplete="username"></div><div class="field"><label>Senha</label><input id="erpPass" type="password" required autocomplete="current-password"></div><button class="btn wide">Entrar</button><div id="erpErr" class="login-error">${esc(error)}</div></form><div class="muted" style="margin-top:12px">Use o mesmo usuário e senha cadastrados no ERP.</div></section></main>`;
    matrix(true);
    $('#erpFinLogin').onsubmit=async e=>{
      e.preventDefault();const btn=e.target.querySelector('button'),err=$('#erpErr');btn.disabled=true;err.textContent='Conectando ao ERP...';
      try{
        const {data,error}=await sb.auth.signInWithPassword({email:$('#erpEmail').value.trim(),password:$('#erpPass').value});
        if(error)throw error;
        const p=await profileFor(data.user);await loadERP();
        user={name:p.nome,role:roleOf(p.tipo),sector:p.tipo,erpId:p.id,email:p.email||data.user.email};
        view=user.role==='Administrador'?'dashboard':'budgets';matrix(false);app();decorateERP();
      }catch(x){err.textContent=x.message||'Falha ao entrar.';btn.disabled=false;}
    };
  }

  login=async function(){
    try{
      if(user){await sb?.auth.signOut();return renderERPLogin();}
      const {data:{session}}=await sb.auth.getSession();
      if(!session)return renderERPLogin();
      const p=await profileFor(session.user);await loadERP();
      user={name:p.nome,role:roleOf(p.tipo),sector:p.tipo,erpId:p.id,email:p.email||session.user.email};
      view=user.role==='Administrador'?'dashboard':'budgets';matrix(false);app();decorateERP();
    }catch(e){try{await sb?.auth.signOut()}catch{}renderERPLogin(e.message)}
  };

  function planChoices(sector=''){
    const plans=db.erpPlans||[];
    const filtered=plans.filter(p=>!sector||!p.sectors?.length||p.sectors.some(s=>norm(s)===norm(sector)));
    return filtered;
  }

  function enhanceBudgetModal(modal){
    const labels=[...modal.querySelectorAll('label')];
    const planLabel=labels.find(l=>l.textContent.includes('Plano de Trabalho ERP'));
    const sector=modal.querySelector('select[name="sector"]');
    if(planLabel){
      const old=planLabel.parentElement.querySelector('input[name="erp"]');
      if(old){
        const sel=document.createElement('select');sel.name='erp';sel.innerHTML='<option value="">Sem associação</option>';
        const fill=()=>{const current=old.value||sel.value;sel.innerHTML='<option value="">Sem associação</option>'+planChoices(sector?.value||'').map(p=>`<option value="${esc(p.title)}" data-plan-id="${p.id}" ${p.title===current?'selected':''}>${esc(p.title)}${p.status?` • ${esc(p.status)}`:''}</option>`).join('')};
        fill();old.replaceWith(sel);if(sector)sector.addEventListener('change',fill);
      }
    }
    const form=modal.querySelector('#bf');
    if(form&&!form.dataset.erpHook){form.dataset.erpHook='1';form.addEventListener('submit',()=>setTimeout(()=>{
      const title=form.querySelector('[name="erp"]')?.value||'';const p=(db.erpPlans||[]).find(x=>x.title===title);if(!p)return;
      const candidates=(db.budgetRecords||[]).filter(b=>b.erpPlan===title);const b=candidates[candidates.length-1];if(b){b.erpPlanId=p.id;b.erpProjectId=p.projectId||'';b.erpSectors=p.sectors||[];save()}
    },30),true)}
  }

  const observer=new MutationObserver(()=>{
    document.querySelectorAll('.modal-backdrop .modal').forEach(m=>{if(!m.dataset.erpEnhanced&&m.textContent.includes('Plano de Trabalho ERP')){m.dataset.erpEnhanced='1';enhanceBudgetModal(m)}});
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  function decorateERP(){
    const c=$('#content');if(!c||!window.IntegralERP.loaded)return;
    if(!c.querySelector('.erp-sync-chip')){
      const chip=document.createElement('div');chip.className='erp-sync-chip';chip.innerHTML=`<span class="badge ok">ERP conectado</span><span>${db.usersMvp?.length||0} usuários • ${db.erpPlans?.length||0} planos • ${db.erpProjects?.length||0} projetos</span>`;c.prepend(chip);
    }
  }
  const oldApp=app;app=function(){oldApp();setTimeout(decorateERP,0)};

  // Usuários agora são referência do ERP; gestão de acesso permanece no ERP.
  users=function(){
    if(user?.role!=='Administrador')return budgets();title('Usuários do ERP');
    $('#content').innerHTML=`<div class="erp-sync-chip"><span class="badge ok">Sincronizado com ERP</span><span>Cadastro e permissões são geridos no ERP Integral.</span></div><div class="table-wrap excel-wrap"><table class="table excel-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil/Setor</th><th>Status</th></tr></thead><tbody>${(db.usersMvp||[]).map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email||'')}</td><td>${esc(u.sector||'')}</td><td><span class="badge ok">Ativo</span></td></tr>`).join('')}</tbody></table></div>`;
  };

  // Reabre a tela usando a sessão ERP, substituindo o login local antigo.
  setTimeout(()=>login(),0);
})();
