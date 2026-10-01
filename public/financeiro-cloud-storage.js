/* Integral Financeiro - persistencia canonica compartilhada no Supabase.
   localStorage e apenas cache/migracao de legado; Supabase e a fonte de verdade. */
(function(){
'use strict';

const TABLE='financeiro_estado_modulos';
const CACHE_KEY='integral_fin_v1';
const LEGACY_KEYS=['integralFinanceiro'];
const VOLATILE=new Set(['financeCloudLastSync']);
let initialized=false, initializing=false, pushing=false, pushTimer=null, initPromise=null;
let snapshot={};

function client(){return window.IntegralERP?.sb||null}
function state(){try{return typeof db!=='undefined'?db:null}catch{return null}}
function clone(v){try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}}
function json(v){try{return JSON.stringify(v)}catch{return 'null'}}
function validKey(k){return !!k&&!VOLATILE.has(k)&&!String(k).startsWith('__')}
function currentUser(){try{return typeof user!=='undefined'?user:null}catch{return null}}

function localCandidates(){
  const out=[];
  for(const key of [CACHE_KEY,...LEGACY_KEYS]){
    try{const raw=localStorage.getItem(key);if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')out.push(parsed)}}catch{}
  }
  const d=state();if(d&&typeof d==='object')out.unshift(d);
  return out;
}

function itemKey(x){
  if(x&&typeof x==='object'){
    for(const k of ['id','uuid','key','chave','code','codigo'])if(x[k]!==undefined&&x[k]!==null&&String(x[k]))return `${k}:${String(x[k])}`;
  }
  return `json:${json(x)}`;
}
function mergeArray(local,cloud){
  const result=[],seen=new Set();
  for(const x of Array.isArray(cloud)?cloud:[]){const k=itemKey(x);if(!seen.has(k)){seen.add(k);result.push(clone(x))}}
  for(const x of Array.isArray(local)?local:[]){const k=itemKey(x);if(!seen.has(k)){seen.add(k);result.push(clone(x))}}
  return result;
}
function mergeValue(local,cloud,cloudExists){
  return cloudExists?clone(cloud):clone(local);
}
function mergeLocalSources(sources){
  const out={};
  for(const src of [...sources].reverse())for(const [k,v] of Object.entries(src||{})){
    if(!validKey(k))continue;
    if(!(k in out))out[k]=clone(v);else if(Array.isArray(v)&&Array.isArray(out[k]))out[k]=mergeArray(v,out[k]);
  }
  return out;
}

function cacheAll(){
  const d=state();if(!d)return;
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(d))}catch{}
}

async function session(){
  const c=client();if(!c)return null;
  try{const {data}=await c.auth.getSession();return data?.session||null}catch{return null}
}

async function upsertRows(rows){
  const c=client();if(!c||!rows.length)return;
  for(let i=0;i<rows.length;i+=40){
    const chunk=rows.slice(i,i+40);
    const {error}=await c.from(TABLE).upsert(chunk,{onConflict:'chave'});
    if(error)throw error;
  }
}

async function initialize(){
  if(initialized)return true;
  if(initPromise)return initPromise;
  const c=client(),s=await session();if(!c||!s)return false;
  initializing=true;
  initPromise=(async()=>{
    try{
      const {data,error}=await c.from(TABLE).select('chave,dados,updated_at');
      if(error)throw error;
      const cloud=new Map((data||[]).map(r=>[r.chave,r.dados]));
      const local=mergeLocalSources(localCandidates());
      const keys=new Set([...Object.keys(local),...cloud.keys()]);
      const merged={};
      const rows=[];
      const now=new Date().toISOString();
      for(const k of keys){
        if(!validKey(k))continue;
        const cloudExists=cloud.has(k);
        const value=mergeValue(local[k],cloud.get(k),cloudExists);
        merged[k]=value;
        if(!cloudExists&&k!=='invoiceRequests')rows.push({chave:k,dados:value,updated_by:s.user.id,updated_at:now});
      }
      const d=state();if(d){for(const k of Object.keys(d))if(validKey(k)&&!(k in merged))delete d[k];Object.assign(d,merged)}
      await upsertRows(rows);
      snapshot={};for(const [k,v] of Object.entries(state()||{}))if(validKey(k))snapshot[k]=json(v);
      cacheAll();initialized=true;
      document.dispatchEvent(new CustomEvent('integral-finance-cloud-ready'));
      try{if(typeof render==='function'&&currentUser())render()}catch{}
      return true;
    }catch(e){console.error('Financeiro: falha ao inicializar persistencia Supabase',e);return false}
    finally{initializing=false;initPromise=null}
  })();
  return initPromise;
}

let pushAgain=false,retryTimer=null,pushPromise=null,closingBudget=false,budgetConflict=false;
function pushChanged(allowDuringClose=false){
  if(closingBudget&&!allowDuringClose){pushAgain=true;return Promise.resolve(false)}
  if(pushPromise){pushAgain=true;return pushPromise}
  if(!initialized)return Promise.resolve(false);
  pushing=true;pushAgain=false;
  pushPromise=(async()=>{
  const pending={};
  try{
    const c=client(),s=await session(),d=state();if(!c||!s||!d)return false;
    const rows=[],now=new Date().toISOString();
    for(const [k,v] of Object.entries(d)){
      if(!validKey(k)||k==='invoiceRequests'||(k==='budgetRecords'&&budgetConflict))continue;
      const j=json(v);if(snapshot[k]===j)continue;
      rows.push({chave:k,dados:clone(v),updated_by:s.user.id,updated_at:now});pending[k]=j;
    }
    await upsertRows(rows);
    /* Só marca como sincronizado depois que o Supabase confirmou a gravação. */
    Object.assign(snapshot,pending);
    return true;
  }catch(e){
    console.error('Financeiro: falha ao salvar no Supabase; nova tentativa em instantes',e);
    clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(initialized)pushChanged()},5000);
    return false;
  }finally{
    pushing=false;pushPromise=null;
    if(pushAgain&&!closingBudget){pushAgain=false;schedulePush()}
  }
  })();
  return pushPromise;
}
function schedulePush(){clearTimeout(pushTimer);pushTimer=setTimeout(()=>{if(initialized)pushChanged()},180)}

const legacySave=typeof save==='function'?save:null;
const cloudSave=function(){
  try{if(legacySave)legacySave();else cacheAll()}catch{cacheAll()}
  if(!initialized)initialize().then(ok=>{if(ok)schedulePush()});else schedulePush();
};
try{save=cloudSave}catch{window.save=cloudSave}

async function syncNow(){const ok=await initialize();if(!ok)return false;return pushChanged()}
// Serialize closure with saves and reconcile the response against the confirmed
// baseline. Pending local edits and newly observed server records are preserved.
async function closeBudget(expected){
  if(closingBudget)throw Error('Já existe um encerramento em andamento.');
  const confirmed=clone(expected),id=String(confirmed.id);
  closingBudget=true;clearTimeout(pushTimer);
  try{
    if(!await initialize())throw Error('Não foi possível carregar a base compartilhada.');
    if(pushPromise&&!await pushPromise)throw Error('Há alterações ainda não salvas. Aguarde a sincronização antes de fechar.');
    if(!await pushChanged(true))throw Error('Há alterações ainda não salvas. Aguarde a sincronização antes de fechar.');
    if(budgetConflict)throw Error('Há alterações simultâneas pendentes de revisão.');
    const baseline=JSON.parse(snapshot.budgetRecords||'[]');
    const before=clone((state().budgetRecords||[]).find(b=>String(b.id)===id));
    if(json(before)!==json(confirmed))throw Error('O orçamento mudou. Confira os dados antes de fechar.');
    const actor=currentUser()?.erpId||currentUser()?.email;
    const {data,error}=await client().rpc('financeiro_close_budget',{p_id:id,p_expected:confirmed});
    if(error)throw Error(error.message);
    const closed=Array.isArray(data)?data.find(b=>String(b.id)===id):null;
    if(!closed||closed.status!=='Fechado')throw Error('O servidor não confirmou o encerramento. Atualize a tela para conferir.');
    if(actor!==(currentUser()?.erpId||currentUser()?.email))throw Error('A sessão mudou. Entre novamente para consultar o encerramento.');
    const d=state(),items=d.budgetRecords||[],local=items.find(b=>String(b.id)===id);
    const changed=json(local)!==json(before),conflicts=[];
    const baseMap=new Map(baseline.map(b=>[String(b.id),b]));
    const localMap=new Map(items.map(b=>[String(b.id),b]));
    const serverMap=new Map(data.map(b=>[String(b.id),b]));
    const merged=[];
    for(const key of new Set([...serverMap.keys(),...localMap.keys(),...baseMap.keys()])){
      const previous=baseMap.get(key),current=localMap.get(key),remote=serverMap.get(key);
      let record;
      if(key===id){
        record=changed&&current?{...clone(current),status:closed.status,closedAt:closed.closedAt,closedBy:closed.closedBy,history:mergeArray(current.history,closed.history)}:clone(closed);
      }else if(json(current)===json(previous)){record=clone(remote)}
      else if(json(remote)===json(previous)||json(current)===json(remote)){record=clone(current)}
      else if(current&&remote&&previous){
        record={};
        for(const field of new Set([...Object.keys(previous),...Object.keys(current),...Object.keys(remote)])){
          const a=previous[field],l=current[field],r=remote[field];
          if(json(l)===json(a))record[field]=clone(r);
          else if(json(r)===json(a)||json(l)===json(r))record[field]=clone(l);
          else if(field==='history')record[field]=mergeArray(l,r);
          else{record[field]=clone(l);conflicts.push({id:key,field,local:clone(l),server:clone(r)})}
        }
      }else{record=clone(current||remote);conflicts.push({id:key,local:clone(current),server:clone(remote)})}
      if(record)merged.push(record);
    }
    // On a true same-field conflict, keep both copies and stop this module's
    // automatic writes rather than overwrite either person's pending work.
    if(conflicts.length){
      budgetConflict=true;
      localStorage.setItem('integral_fin_budget_conflicts',JSON.stringify({at:new Date().toISOString(),local:items,server:data,conflicts}));
    }
    d.budgetRecords=merged;snapshot.budgetRecords=json(data);cacheAll();
    return {changedDuringClose:changed,conflicts:conflicts.length};
  }finally{closingBudget=false;schedulePush()}
}
window.IntegralFinanceCloudStorage={initialize,syncNow,push:pushChanged,closeBudget};

let attempts=0;const boot=setInterval(async()=>{attempts++;if(await initialize()||attempts>120)clearInterval(boot)},500);
/* Renovar o token não recarrega os dados: recarregar substituía o db com modais abertos e descartava edições. */
try{client()?.auth?.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'||!s){initialized=false;initPromise=null;return}if(event==='SIGNED_IN'&&!initialized&&!initializing){initPromise=null;initialize()}})}catch{}
window.addEventListener('beforeunload',()=>{try{cacheAll()}catch{}});
})();
