/* Integral Financeiro — autenticação canônica via ERP/Supabase.
   Substitui somente o login legado de demonstração. Não altera dados financeiros. */
(function(){
'use strict';
const cfg=window.ERP_SUPABASE||{};
if(!window.supabase?.createClient||!cfg.url||!cfg.publishableKey)return;
const sb=window.IntegralERP?.sb||window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.IntegralERP=window.IntegralERP||{};window.IntegralERP.sb=sb;
let renderingLogin=false,booting=false;
const q=s=>document.querySelector(s);
function setGlobalUser(profile,authUser){
 const role=String(profile?.tipo||'').trim()==='Administrador'?'Administrador':(profile?.tipo||'Funcionário');
 const u={name:profile?.nome||authUser?.email||'Usuário',nome:profile?.nome||'',email:profile?.email||authUser?.email||'',role,setor:profile?.setor||profile?.tipo||'',sector:profile?.setor||profile?.tipo||'',tipo:profile?.tipo||'',erpId:profile?.id||authUser?.id||''};
 try{user=u}catch{}window.user=u;return u;
}
async function profileFor(authUser){
 const {data,error}=await sb.from('profiles').select('id,nome,email,tipo,setor,ativo').eq('id',authUser.id).maybeSingle();
 if(error)throw error;if(!data)throw new Error('Usuário não encontrado no cadastro do ERP.');if(data.ativo===false)throw new Error('Este usuário está inativo no ERP.');return data;
}
function renderLogin(message=''){
 if(renderingLogin)return;renderingLogin=true;
 try{try{user=null}catch{}window.user=null;try{view='dashboard'}catch{}window.view='dashboard';
  const app=q('#app');if(!app)return;
  app.innerHTML=`<main class="login-wrap"><section class="login-card"><img class="login-logo" src="logo-integral.png"><h1>Integral Financeiro</h1><div class="sub">Acesse com o mesmo usuário do ERP Integral</div><form id="canonicalFinanceLogin"><div class="field"><label>E-mail</label><input id="financeEmail" type="email" autocomplete="username" required></div><div class="field"><label>Senha</label><input id="financePass" type="password" autocomplete="current-password" required></div><button class="btn wide" id="financeLoginBtn">Entrar</button><div id="financeLoginError" class="login-error">${message||''}</div></form></section></main>`;
  try{if(typeof matrix==='function')matrix(true)}catch{}
  q('#canonicalFinanceLogin').onsubmit=async e=>{e.preventDefault();const btn=q('#financeLoginBtn'),err=q('#financeLoginError');btn.disabled=true;err.textContent='';try{const email=q('#financeEmail').value.trim().toLowerCase(),password=q('#financePass').value;const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;const p=await profileFor(data.user);const u=setGlobalUser(p,data.user);try{view=u.role==='Administrador'?'dashboard':'documents'}catch{}window.view=u.role==='Administrador'?'dashboard':'documents';try{if(typeof matrix==='function')matrix(false)}catch{};if(typeof appFn()==='function')appFn()();}catch(ex){err.textContent=ex?.message==='Invalid login credentials'?'E-mail ou senha inválidos.':(ex?.message||'Não foi possível entrar.');btn.disabled=false;}};
 }finally{renderingLogin=false}
}
function appFn(){try{return typeof app==='function'?app:window.app}catch{return window.app}}
async function enterFromSession(session){
 const p=await profileFor(session.user),u=setGlobalUser(p,session.user);try{view=u.role==='Administrador'?'dashboard':'documents'}catch{}window.view=u.role==='Administrador'?'dashboard':'documents';try{if(typeof matrix==='function')matrix(false)}catch{};const fn=appFn();if(typeof fn==='function')fn();
}
async function boot(){if(booting)return;booting=true;try{const {data,error}=await sb.auth.getSession();if(error)throw error;if(data?.session)await enterFromSession(data.session);else renderLogin();}catch(e){console.error('Financeiro auth:',e);renderLogin(e?.message||'Não foi possível validar sua sessão.')}finally{booting=false}}
/* Substitui chamadas futuras ao login legado. */
window.login=function(){sb.auth.signOut().catch(()=>{}).finally(()=>renderLogin())};try{login=window.login}catch{}
sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')renderLogin();else if(event==='SIGNED_IN'&&session&&!window.user)enterFromSession(session).catch(e=>renderLogin(e.message));});
setTimeout(boot,0);
window.IntegralFinanceAuth={sb,boot,renderLogin};
})();
