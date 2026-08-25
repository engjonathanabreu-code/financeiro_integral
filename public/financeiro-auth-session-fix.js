/* Integral Financeiro - sessao persistente ERP/Financeiro
   Sign-out somente por acao explicita do usuario e sincronizacao com refresh de token. */
(function(){
'use strict';

function getUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function getLogin(){try{return typeof login==='function'?login:window.login}catch{return window.login}}
function getSB(){return window.IntegralERP?.sb}

let explicitLogout=false;

function protectSignOut(){
  const sb=getSB();
  if(!sb?.auth?.signOut||sb.auth.signOut.__financeProtected)return false;
  const original=sb.auth.signOut.bind(sb.auth);
  const wrapped=async function(...args){
    if(!explicitLogout){
      console.warn('Financeiro: logout interno bloqueado para preservar a sessao do ERP.');
      return {error:null};
    }
    explicitLogout=false;
    return original(...args);
  };
  wrapped.__financeProtected=true;
  wrapped.__original=original;
  sb.auth.signOut=wrapped;
  return true;
}

const previousLogin=getLogin();
if(typeof previousLogin==='function'&&!previousLogin.__financeSessionSafe){
  async function safeLogin(event){
    const isLogout=!!(event&&(event.type==='click'||event.currentTarget?.id==='logout'||event.target?.id==='logout'));
    if(isLogout){
      explicitLogout=true;
      return previousLogin.apply(this,arguments);
    }

    // Nunca transforme uma chamada interna de login() em logout de uma sessao valida.
    const current=getUser();
    if(current){
      const sb=getSB();
      try{
        let {data,error}=await sb.auth.getSession();
        if(error)throw error;
        if(!data?.session){
          const refreshed=await sb.auth.refreshSession();
          data=refreshed.data;error=refreshed.error;
          if(error)throw error;
        }
        if(data?.session)return current;
      }catch(e){console.warn('Financeiro: sessao atual nao pode ser renovada.',e)}
      // Sessao realmente ausente: limpa apenas o estado visual e deixa o login legado montar a tela.
      try{user=null;window.user=null}catch{}
    }
    return previousLogin.apply(this,arguments);
  }
  safeLogin.__financeSessionSafe=true;
  window.login=safeLogin;
  try{login=safeLogin}catch{}
}

// O app recria o botao Sair em cada render; captura antes do onclick legado.
document.addEventListener('click',function(e){
  const btn=e.target?.closest?.('#logout');
  if(!btn)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  explicitLogout=true;
  const fn=getLogin();
  if(typeof fn==='function')fn(e);
},{capture:true});

async function validSession(){
  const sb=getSB();
  if(!sb)return null;
  let {data,error}=await sb.auth.getSession();
  if(error)throw error;
  if(data?.session)return data.session;
  const refreshed=await sb.auth.refreshSession();
  if(refreshed.error)throw refreshed.error;
  return refreshed.data?.session||null;
}

function installSyncGuard(){
  const api=window.IntegralFinanceERPPlanning;
  if(!api?.sync||api.__sessionGuardedV2)return false;
  const original=api.sync.bind(api);
  api.sync=async function(){
    const session=await validSession();
    if(!session)throw new Error('Sessao do ERP ausente. Entre novamente no Financeiro.');
    return original.apply(this,arguments);
  };
  api.__sessionGuardedV2=true;
  return true;
}

protectSignOut();
installSyncGuard();
let tries=0;
const timer=setInterval(()=>{
  tries++;
  protectSignOut();
  installSyncGuard();
  if(tries>80)clearInterval(timer);
},250);
})();
