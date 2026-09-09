/* Integral Financeiro V33 — persistência imediata de alterações no celular */
(function(){
'use strict';
if(window.__integralMobileTripSaveV33)return;
window.__integralMobileTripSaveV33=true;

const previousSave=typeof save==='function'?save:null;
if(!previousSave)return;

let syncing=false;
async function syncNow(){
  if(syncing)return;
  const cloud=window.IntegralFinanceCloudStorage;
  if(!cloud||typeof cloud.syncNow!=='function')return;
  syncing=true;
  try{await cloud.syncNow()}catch(err){console.error('Financeiro: falha na sincronização imediata',err)}finally{syncing=false}
}

const immediateSave=function(){
  previousSave();
  // Não espera o debounce normal da persistência. Isso evita que navegadores
  // móveis suspendam a página antes de a despesa chegar ao Supabase.
  Promise.resolve().then(syncNow);
};
try{save=immediateSave}catch{window.save=immediateSave}

// Se o usuário alternar de aplicativo logo após salvar, tenta sincronizar
// novamente o estado que já ficou gravado no cache local.
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')syncNow();
});
window.addEventListener('pagehide',syncNow);
})();
