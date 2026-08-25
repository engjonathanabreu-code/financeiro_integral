/* Integral Financeiro - persistencia canonica compartilhada no Supabase.
   localStorage e apenas cache/migracao de legado; Supabase e a fonte de verdade. */
(function(){
'use strict';

const TABLE='financeiro_estado_modulos';
const CACHE_KEY='integral_fin_v1';
const LEGACY_KEYS=['integralFinanceiro'];
const VOLATILE=new Set(['financeCloudLastSync']);
let initialized=false, initializing=false, pushing=false, pushTimer=null;
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
  // Migracao inicial: se a nuvem ainda nao possui a chave, aproveita o dado local legado.
  // Depois da primeira gravacao, Supabase passa a ser a fonte oficial e o cache local nao ressuscita dados removidos.
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
  if(initialized||initializing)return initialized;
  const c=client(),s=await session();if(!c||!s)return false;
  initializing=true;
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
      if(!cloudExists)rows.push({chave:k,dados:value,updated_by:s.user.id,updated_at:now});
    }
    // Nunca substitui a referencia global: modulos antigos mantem o mesmo objeto db.
    const d=state();if(d){for(const k of Object.keys(d))if(validKey(k)&&!(k in merged))delete d[k];Object.assign(d,merged)}
    await upsertRows(rows);
    snapshot={};for(const [k,v] of Object.entries(state()||{}))if(validKey(k))snapshot[k]=json(v);
    cacheAll();initialized=true;
    document.dispatchEvent(new CustomEvent('integral-finance-cloud-ready'));
    try{if(typeof render==='function'&&currentUser())render()}catch{}
    return true;
  }catch(e){console.error('Financeiro: falha ao inicializar persistencia Supabase',e);return false}
  finally{initializing=false}
}

async function pushChanged(){
  if(pushing)return;const c=client(),s=await session(),d=state();if(!c||!s||!d)return;
  pushing=true;
  try{
    const rows=[],now=new Date().toISOString();
    for(const [k,v] of Object.entries(d)){
      if(!validKey(k))continue;
      const j=json(v);if(snapshot[k]===j)continue;
      rows.push({chave:k,dados:v,updated_by:s.user.id,updated_at:now});snapshot[k]=j;
    }
    await upsertRows(rows);
  }catch(e){console.error('Financeiro: falha ao salvar no Supabase',e)}finally{pushing=false}
}
function schedulePush(){clearTimeout(pushTimer);pushTimer=setTimeout(pushChanged,180)}

// Substitui o save legado: navegador fica como cache e Supabase recebe a alteracao.
const legacySave=typeof save==='function'?save:null;
const cloudSave=function(){
  try{if(legacySave)legacySave();else cacheAll()}catch{cacheAll()}
  if(!initialized)initialize().then(()=>schedulePush());else schedulePush();
};
try{save=cloudSave}catch{window.save=cloudSave}

async function syncNow(){await initialize();await pushChanged();return true}
window.IntegralFinanceCloudStorage={initialize,syncNow,push:pushChanged};

// Inicializa assim que existir sessao. Tambem cobre login posterior sem refresh.
let attempts=0;const boot=setInterval(async()=>{attempts++;if(await initialize()||attempts>120)clearInterval(boot)},500);
try{client()?.auth?.onAuthStateChange((_event,s)=>{if(s){initialized=false;initialize()}else{initialized=false}})}catch{}
window.addEventListener('beforeunload',()=>{try{cacheAll()}catch{}});
})();
