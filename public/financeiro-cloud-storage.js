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

/* ---- Acesso por módulo ----------------------------------------------------------------
   O banco devolve só os módulos que o perfil pode ver (RH, DRE e planejamento são do ADM).
   Quem não é ADM nunca cria módulo novo: um módulo ausente aqui é um módulo sem acesso. */
let cloudKeys=new Set(), adminSession=false;
async function detectAdmin(c){try{const {data,error}=await c.rpc('is_admin');return !error&&data===true}catch{return false}}
function emptyLike(v){return Array.isArray(v)?[]:(v&&typeof v==='object')?{}:(typeof v==='string'?'':null)}

/* ---- Anexos ------------------------------------------------------------------------------
   O original vai para financeiro_arquivos e o módulo guarda só o arquivoId; antes cada salvamento
   reenviava todos os comprovantes (até 28 MB) e estourava o tempo limite do banco. */
const FILE_KEYS=new Set(['docs','tripExpenses','tripDocuments','budgetExpenses']);
const INLINE_FIELDS=['dataUrl','dataURL','fileData'];
async function externalizeFiles(k,value){
  if(!FILE_KEYS.has(k)||!Array.isArray(value))return;
  const c=client();if(!c)return;
  const holders=[];
  for(const item of value){if(item&&typeof item==='object'){holders.push(item);if(item.file&&typeof item.file==='object')holders.push(item.file)}}
  for(const h of holders){
    for(const field of INLINE_FIELDS){
      const data=h[field];if(typeof data!=='string'||!data.startsWith('data:'))continue;
      try{
        const {data:id,error}=await c.rpc('financeiro_guardar_arquivo',{p_conteudo:data,p_nome:String(h.name||h.doc||'arquivo').slice(0,300)});
        if(error||!id)continue;
        if(h[field]!==data)continue; // o registro mudou enquanto o arquivo subia
        delete h[field];h[h.arquivoId&&field!=='dataUrl'?field+'ArquivoId':'arquivoId']=id;
      }catch(e){console.warn('Financeiro: anexo mantido no registro; será convertido no servidor.',e)}
    }
  }
}

/* ---- Mescla em três vias (base sincronizada × local × servidor) ------------------------
   Cada salvamento reenviava o módulo inteiro e desfazia o que outra pessoa gravou nesse meio-tempo.
   Agora só as diferenças locais são aplicadas sobre a versão atual do servidor; em conflito no
   mesmo campo, prevalece o valor local (comportamento anterior). */
const same=(a,b)=>json(a)===json(b);
function hasIds(list){return Array.isArray(list)&&list.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&x.id!==undefined&&x.id!==null&&String(x.id)!=='')}
function uniqueIds(list){const ids=list.map(x=>String(x.id));return new Set(ids).size===ids.length}
function mergeObject(base,local,server){
  const out={};
  for(const f of new Set([...Object.keys(server||{}),...Object.keys(local||{})])){
    const b=base?.[f],l=local?.[f],r=server?.[f],inL=Object.prototype.hasOwnProperty.call(local||{},f),inR=Object.prototype.hasOwnProperty.call(server||{},f);
    if(same(l,b)&&inL===Object.prototype.hasOwnProperty.call(base||{},f)){if(inR)out[f]=clone(r);continue}
    if(same(r,b)&&inR===Object.prototype.hasOwnProperty.call(base||{},f)){if(inL)out[f]=clone(l);continue}
    if(inL)out[f]=clone(mergeValue3(b,l,r));else if(inR)out[f]=clone(r);
  }
  return out;
}
function mergeValue3(base,local,server){
  if(same(local,base))return clone(server);
  if(same(server,base)||same(local,server))return clone(local);
  if(Array.isArray(local)&&Array.isArray(server)&&hasIds(local)&&hasIds(server)&&uniqueIds(local)&&uniqueIds(server)&&(base===undefined||(hasIds(base)&&uniqueIds(base)))){
    const B=new Map((base||[]).map(x=>[String(x.id),x])),L=new Map(local.map(x=>[String(x.id),x])),out=[];
    const order=[...server.map(x=>String(x.id)),...local.map(x=>String(x.id)).filter(id=>!server.some(x=>String(x.id)===id))];
    const R=new Map(server.map(x=>[String(x.id),x]));
    for(const id of order){
      const b=B.get(id),l=L.get(id),r=R.get(id);
      if(l===undefined&&r===undefined)continue;
      if(same(l,b)){if(r!==undefined)out.push(clone(r));continue}          // só o servidor mudou (ou excluiu)
      if(same(r,b)){if(l!==undefined)out.push(clone(l));continue}          // só aqui mudou (ou excluiu)
      if(l===undefined){out.push(clone(r));continue}                       // excluído aqui, alterado lá: mantém
      if(r===undefined){out.push(clone(l));continue}                       // excluído lá, alterado aqui: mantém
      out.push(mergeObject(b,l,r));
    }
    return out;
  }
  if(Array.isArray(local)&&Array.isArray(server)&&Array.isArray(base)&&!local.some(x=>x&&typeof x==='object'&&x.id!=null)&&!server.some(x=>x&&typeof x==='object'&&x.id!=null)){
    // Listas sem id (histórico, ids de responsáveis): aplica inclusões e remoções dos dois lados.
    const key=x=>json(x),B=new Set(base.map(key)),S=new Set(server.map(key)),L=new Set(local.map(key));
    const out=local.filter(x=>!(B.has(key(x))&&!S.has(key(x))));
    for(const x of server)if(!B.has(key(x))&&!L.has(key(x)))out.push(clone(x));
    return out;
  }
  if(local&&server&&typeof local==='object'&&typeof server==='object'&&!Array.isArray(local)&&!Array.isArray(server))return mergeObject(base&&typeof base==='object'?base:{},local,server);
  return clone(local);
}
function applyInPlace(d,k,value){
  const cur=d[k];
  if(Array.isArray(cur)&&Array.isArray(value)){
    const byId=new Map(cur.filter(x=>x&&typeof x==='object'&&x.id!=null).map(x=>[String(x.id),x]));
    const next=value.map(v=>{const o=v&&typeof v==='object'&&v.id!=null?byId.get(String(v.id)):null;if(o&&!Array.isArray(o)&&!Array.isArray(v)){if(!same(o,v)){for(const f of Object.keys(o))if(!(f in v))delete o[f];Object.assign(o,v)}return o}return v});
    cur.splice(0,cur.length,...next);return;
  }
  if(cur&&value&&typeof cur==='object'&&typeof value==='object'&&!Array.isArray(cur)&&!Array.isArray(value)){for(const f of Object.keys(cur))if(!(f in value))delete cur[f];Object.assign(cur,value);return}
  d[k]=value;
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
      adminSession=await detectAdmin(c);
      const cloud=new Map((data||[]).map(r=>[r.chave,r.dados]));
      cloudKeys=new Set(cloud.keys());
      const local=mergeLocalSources(localCandidates());
      const keys=new Set([...Object.keys(local),...cloud.keys()]);
      const merged={};
      const rows=[];
      const now=new Date().toISOString();
      for(const k of keys){
        if(!validKey(k))continue;
        const cloudExists=cloud.has(k);
        if(!cloudExists&&!adminSession){merged[k]=emptyLike(local[k]);continue} // sem acesso: não guarda cópia antiga
        const value=mergeValue(local[k],cloud.get(k),cloudExists);
        merged[k]=value;
        if(!cloudExists&&k!=='invoiceRequests')rows.push({chave:k,dados:value,updated_by:s.user.id,updated_at:now});
      }
      const d=state();if(d){for(const k of Object.keys(d))if(validKey(k)&&!(k in merged))delete d[k];Object.assign(d,merged)}
      try{await upsertRows(rows);for(const r of rows)cloudKeys.add(r.chave)}catch(e){console.warn('Financeiro: módulos locais não puderam ser criados no Supabase',e)}
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

/* Erros que repetir não resolve (permissão, proteção do banco, dados inválidos): para de insistir
   naquele módulo, avisa na tela e segue salvando os demais. */
const blocked={};
function permanentError(e){const code=String(e?.code||'');return ['42501','22023','40001','P0001','23514','23502','22P02'].includes(code)||/FINANCEIRO_PROTECAO|Somente ADM|row-level security|violates/i.test(String(e?.message||''))}
function notifyBlocked(k,e){
  console.error(`Financeiro: o módulo ${k} não foi salvo`,e);
  try{
    if(typeof document==='undefined'||!document.body||!document.createElement)return;
    let box=document.getElementById('financeSaveBlocked');
    if(!box){box=document.createElement('div');box.id='financeSaveBlocked';box.setAttribute('role','alert');box.style.cssText='position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;background:#fff4e5;color:#7a3e00;border:1px solid #f0b46b;border-radius:10px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.15);font:14px/1.4 system-ui,sans-serif';document.body.appendChild(box)}
    box.textContent=`Uma alteração não foi salva (${e?.message||'erro'}). Atualize a página para ver a versão atual antes de editar de novo.`;
  }catch{}
}

let pushAgain=false,retryTimer=null,pushPromise=null,closingBudget=false,budgetConflict=false;
function pushChanged(allowDuringClose=false){
  if(closingBudget&&!allowDuringClose){pushAgain=true;return Promise.resolve(false)}
  if(pushPromise){pushAgain=true;return pushPromise}
  if(!initialized)return Promise.resolve(false);
  pushing=true;pushAgain=false;
  pushPromise=(async()=>{
  let allOk=true,transient=false;
  try{
    const c=client(),s=await session(),d=state();if(!c||!s||!d)return false;
    const changed=[];
    for(const k of Object.keys(d)){
      if(!validKey(k)||k==='invoiceRequests'||(k==='budgetRecords'&&budgetConflict))continue;
      if(!adminSession&&!cloudKeys.has(k))continue;
      if(snapshot[k]===json(d[k]))continue;
      if(blocked[k]!==undefined&&blocked[k]===json(d[k])){allOk=false;continue}
      changed.push(k);
    }
    if(!changed.length)return allOk;
    for(const k of changed)await externalizeFiles(k,d[k]);
    const {data:serverRows,error:readError}=await c.from(TABLE).select('chave,dados,updated_at').in('chave',changed);
    if(readError)throw readError;
    const server=new Map((serverRows||[]).map(r=>[r.chave,r.dados]));
    for(const k of changed){
      const localJson=json(d[k]),local=JSON.parse(localJson);
      const base=snapshot[k]===undefined?undefined:JSON.parse(snapshot[k]);
      const exists=server.has(k);
      const value=exists&&base!==undefined?mergeValue3(base,local,server.get(k)):local;
      try{
        if(!exists||!same(value,server.get(k))){
          const {error}=await c.from(TABLE).upsert([{chave:k,dados:value,updated_by:s.user.id,updated_at:new Date().toISOString()}],{onConflict:'chave'});
          if(error)throw error;
        }
        cloudKeys.add(k);delete blocked[k];
        /* Só aplica a mescla na tela se ninguém editou durante o envio; senão a próxima rodada mescla. */
        if(json(d[k])===localJson){if(!same(value,local))applyInPlace(d,k,value);snapshot[k]=json(d[k])}
        else snapshot[k]=json(value);
      }catch(e){
        allOk=false;
        if(permanentError(e)){blocked[k]=localJson;notifyBlocked(k,e)}else{transient=true;console.error(`Financeiro: falha ao salvar ${k} no Supabase; nova tentativa em instantes`,e)}
      }
    }
    cacheAll();
    return allOk;
  }catch(e){
    allOk=false;transient=true;
    console.error('Financeiro: falha ao salvar no Supabase; nova tentativa em instantes',e);
    return false;
  }finally{
    if(transient){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(initialized)pushChanged()},5000)}
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
