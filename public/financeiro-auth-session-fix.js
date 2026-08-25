/* Integral Financeiro - correção de sessão compartilhada ERP/Financeiro
   Evita que chamadas programáticas de login() sejam interpretadas como logout. */
(function(){
'use strict';

function getUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function getLogin(){try{return typeof login==='function'?login:window.login}catch{return window.login}}

const previousLogin=getLogin();
if(typeof previousLogin!=='function'||previousLogin.__financeSessionSafe)return;

async function safeLogin(event){
  const explicitLogout=!!(event && (event.type==='click'||event.currentTarget?.id==='logout'||event.target?.id==='logout'));

  // Clique real em Sair: mantém o comportamento original, incluindo signOut do Supabase.
  if(explicitLogout)return previousLogin.apply(this,arguments);

  // Chamadas internas de inicialização não podem derrubar uma sessão já válida.
  const current=getUser();
  if(current){
    try{
      const sb=window.IntegralERP?.sb;
      if(sb){
        const {data,error}=await sb.auth.getSession();
        if(!error&&data?.session)return current;
      }
    }catch(e){console.warn('Financeiro: não foi possível validar a sessão atual.',e)}
  }

  return previousLogin.apply(this,arguments);
}
safeLogin.__financeSessionSafe=true;
window.login=safeLogin;
try{login=safeLogin}catch{}

// O app recria o botão Sair a cada render. Passe o evento explicitamente para distinguir logout de boot.
document.addEventListener('click',function(e){
  const btn=e.target?.closest?.('#logout');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  safeLogin(e);
},{capture:true});

// Antes de qualquer sincronização manual, confirme que ainda existe sessão do ERP.
function installSyncGuard(){
  const api=window.IntegralFinanceERPPlanning;
  if(!api?.sync||api.__sessionGuarded)return false;
  const original=api.sync.bind(api);
  api.sync=async function(){
    const sb=window.IntegralERP?.sb;
    if(!sb)throw new Error('Conexão com o ERP indisponível.');
    const {data,error}=await sb.auth.getSession();
    if(error)throw error;
    if(!data?.session)throw new Error('Sua sessão do ERP expirou. Saia e entre novamente no Financeiro.');
    return original.apply(this,arguments);
  };
  api.__sessionGuarded=true;
  return true;
}

let tries=0;
const timer=setInterval(()=>{tries++;if(installSyncGuard()||tries>40)clearInterval(timer)},250);
installSyncGuard();
})();
