/* Integral Financeiro - persistencia canonica compartilhada no Supabase.
   localStorage e apenas cache/migracao de legado; Supabase e a fonte de verdade. */
(function(){
'use strict';

const TABLE='financeiro_estado_modulos';
const SAVE_RPC='financeiro_salvar_modulo';
const SIGNAL_TABLE='financeiro_modulos_sinal';
const CACHE_KEY='integral_fin_v1';
const OWNER_KEY='integral_fin_v1_dono';
const PENDING_PREFIX='integral_fin_pendente_v2:';
const CONFLICT_PREFIX='integral_fin_conflitos_v2:';
const LEGACY_KEYS=['integralFinanceiro'];
const VOLATILE=new Set(['financeCloudLastSync']);
const MAX_ATTEMPTS=4;
let initialized=false, initializing=false, pushing=false, pushTimer=null, initPromise=null;
let snapshot={};          // última versão confirmada pelo servidor (JSON): base da mescla em três vias
let revisions={};         // revisão do servidor correspondente ao snapshot
let versioned=true;       // false enquanto a migration de revisão não estiver aplicada
let sessionUid=null, signedOutUid=null;

function client(){return window.IntegralERP?.sb||null}
function state(){try{return typeof db!=='undefined'?db:null}catch{return null}}
function clone(v){try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v))}catch{return v}}}
function json(v){try{return JSON.stringify(v)}catch{return 'null'}}
function parse(s){try{return s===undefined?undefined:JSON.parse(s)}catch{return undefined}}
function validKey(k){return !!k&&!VOLATILE.has(k)&&!String(k).startsWith('__')}
function currentUser(){try{return typeof user!=='undefined'?user:null}catch{return null}}
function lsGet(k){try{return localStorage.getItem(k)}catch{return null}}
function lsSet(k,v){try{localStorage.setItem(k,v);return true}catch{return false}}
function lsDel(k){try{localStorage.removeItem?.(k)}catch{}}

/* ---- Cache por identidade --------------------------------------------------------------
   O cache antigo (integral_fin_v1) era o mesmo para qualquer pessoa no navegador. Agora ele leva o
   dono; cópia de outra pessoa nunca entra na mescla nem é enviada com a sessão atual. */
function foreignCache(uid){
  const owner=lsGet(OWNER_KEY);
  return !!uid&&((!!signedOutUid&&signedOutUid!==uid)||(!!owner&&owner!==uid));
}
function localCandidates(uid){
  if(foreignCache(uid))return [];
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

/* Alterações ainda não confirmadas pelo servidor ficam guardadas por usuário, com a base em que foram
   feitas: depois de recarregar, cair a conexão ou a sessão expirar, são reaplicadas pela mesma mescla. */
function pendingKey(uid){return PENDING_PREFIX+uid}
function readPending(uid){const p=parse(lsGet(pendingKey(uid))||'null');return p&&p.uid===uid&&p.keys&&typeof p.keys==='object'?p:{uid,keys:{}}}
function pendingKeys(){const d=state();if(!d)return [];return Object.keys(d).filter(k=>validKey(k)&&snapshot[k]!==undefined&&snapshot[k]!==json(d[k]))}
function cacheAll(){
  const d=state();if(!d)return;
  lsSet(CACHE_KEY,JSON.stringify(d));
  if(!sessionUid||!initialized)return;
  lsSet(OWNER_KEY,sessionUid);
  const keys={};
  for(const k of pendingKeys())keys[k]={base:snapshot[k],revisao:revisions[k]??null,local:d[k]};
  if(Object.keys(keys).length){if(!lsSet(pendingKey(sessionUid),JSON.stringify({uid:sessionUid,at:new Date().toISOString(),keys})))console.warn('Financeiro: não foi possível guardar o rascunho local (espaço do navegador).')}
  else lsDel(pendingKey(sessionUid));
}

async function session(){
  const c=client();if(!c)return null;
  try{const {data}=await c.auth.getSession();return data?.session||null}catch{return null}
}

const missingColumn=e=>String(e?.code||'')==='42703'||(/revisao/.test(String(e?.message||''))&&/column|coluna/i.test(String(e?.message||'')));
const missingFunction=e=>['PGRST202','42883'].includes(String(e?.code||''))||/Could not find the function|function .* does not exist/i.test(String(e?.message||''));
async function readRows(keys,columns='chave,dados,revisao'){
  const c=client();
  const run=()=>{const q=c.from(TABLE).select(versioned?columns:columns.replace(/,?revisao/,''));return keys?q.in('chave',keys):q};
  let {data,error}=await run();
  if(error&&versioned&&missingColumn(error)){versioned=false;({data,error}=await run())}
  if(error)throw error;
  return data||[];
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

/* ---- Mescla em três vias (base confirmada × local × servidor) ---------------------------
   Só as diferenças locais são aplicadas sobre a versão atual do servidor. Quando os dois lados
   mudaram o mesmo campo para valores diferentes, ninguém é sobrescrito em silêncio: fica o valor do
   servidor (que outra pessoa já viu salvo), o valor local vai para a lista de conflitos e a tela
   avisa, com opção de reaplicar. Exclusão de um lado com edição do outro mantém o registro e avisa. */
const same=(a,b)=>json(a)===json(b);
const has=(o,f)=>!!o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,f);
function hasIds(list){return Array.isArray(list)&&list.every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&x.id!==undefined&&x.id!==null&&String(x.id)!=='')}
function uniqueIds(list){const ids=list.map(x=>String(x.id));return new Set(ids).size===ids.length}
function conflict(ctx,path,tipo,local,server){if(ctx)ctx.push({path,tipo,local:clone(local),servidor:clone(server)})}
function mergeObject(base,local,server,ctx,path=[]){
  const out={};
  for(const f of new Set([...Object.keys(server||{}),...Object.keys(local||{})])){
    const b=base?.[f],l=local?.[f],r=server?.[f],inB=has(base,f),inL=has(local,f),inR=has(server,f);
    if(same(l,b)&&inL===inB){if(inR)out[f]=clone(r);continue}
    if(same(r,b)&&inR===inB){if(inL)out[f]=clone(l);continue}
    if(inL&&inR)out[f]=mergeValue3(b,l,r,ctx,[...path,f]);
    else if(inL){out[f]=clone(l);conflict(ctx,[...path,f],'removido-no-servidor',l,undefined)}
    else if(inR){out[f]=clone(r);conflict(ctx,[...path,f],'removido-aqui',undefined,r)}
  }
  return out;
}
function mergeValue3(base,local,server,ctx=null,path=[]){
  if(same(local,base))return clone(server);
  if(same(server,base)||same(local,server))return clone(local);
  if(Array.isArray(local)&&Array.isArray(server)&&hasIds(local)&&hasIds(server)&&uniqueIds(local)&&uniqueIds(server)&&(base===undefined||(hasIds(base)&&uniqueIds(base)))){
    const B=new Map((base||[]).map(x=>[String(x.id),x])),L=new Map(local.map(x=>[String(x.id),x])),out=[];
    const order=[...server.map(x=>String(x.id)),...local.map(x=>String(x.id)).filter(id=>!server.some(x=>String(x.id)===id))];
    const R=new Map(server.map(x=>[String(x.id),x]));
    for(const id of order){
      const b=B.get(id),l=L.get(id),r=R.get(id),p=[...path,{id}];
      if(l===undefined&&r===undefined)continue;
      if(same(l,b)){if(r!==undefined)out.push(clone(r));continue}          // só o servidor mudou (ou excluiu)
      if(same(r,b)){if(l!==undefined)out.push(clone(l));continue}          // só aqui mudou (ou excluiu)
      if(l===undefined){out.push(clone(r));conflict(ctx,p,'excluido-aqui-alterado-no-servidor',undefined,r);continue}
      if(r===undefined){out.push(clone(l));conflict(ctx,p,'excluido-no-servidor-alterado-aqui',l,undefined);continue}
      out.push(mergeObject(b,l,r,ctx,p));
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
  if(local&&server&&typeof local==='object'&&typeof server==='object'&&!Array.isArray(local)&&!Array.isArray(server))return mergeObject(base&&typeof base==='object'?base:{},local,server,ctx,path);
  conflict(ctx,path,'campo',local,server);
  return clone(server);
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

/* ---- Conflitos e estado do salvamento -------------------------------------------------- */
function conflictKey(){return CONFLICT_PREFIX+(sessionUid||'sem-sessao')}
function readConflicts(){const v=parse(lsGet(conflictKey())||'[]');return Array.isArray(v)?v:[]}
function writeConflicts(list){if(list.length)lsSet(conflictKey(),JSON.stringify(list));else lsDel(conflictKey())}
function recordConflicts(chave,list){
  if(!list?.length)return;
  const at=new Date().toISOString(),all=readConflicts();
  for(const c of list){
    const id=`${chave}|${json(c.path)}`,i=all.findIndex(x=>x.id===id);
    const item={id,chave,path:c.path,tipo:c.tipo,local:c.local,servidor:c.servidor,em:at};
    if(i>=0)all[i]=item;else all.push(item);
  }
  writeConflicts(all);
  setStatus('conflito');
}
let saveState='salvo',statusTimer=null;
const STATUS_TEXT={
  salvando:'Salvando…',
  salvo:'Salvo no servidor',
  pendente:'Sem conexão: alterações guardadas neste navegador e enviadas ao reconectar',
  conflito:'Conflito: uma alteração sua não foi aplicada porque outra pessoa mudou o mesmo dado',
  falha:'Falha ao salvar: a alteração continua guardada neste navegador'
};
function setStatus(next,detail){
  if(next==='salvo'&&readConflicts().length)next='conflito';
  saveState=next;
  try{window.dispatchEvent?.(new CustomEvent('integral-finance-save-state',{detail:{state:next,conflicts:readConflicts().length,detail}}))}catch{}
  try{
    if(typeof document==='undefined'||!document.body||!document.createElement)return;
    let el=document.getElementById('financeSaveStatus');
    if(!el){el=document.createElement('div');el.id='financeSaveStatus';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el)}
    el.className=`fin-save-status is-${next}`;
    el.textContent='';
    const text=document.createElement('span');text.textContent=STATUS_TEXT[next]||next;el.appendChild(text);
    if(next==='conflito'){const b=document.createElement('button');b.type='button';b.className='btn small';b.textContent='Revisar';b.onclick=openConflicts;el.appendChild(b)}
    if(next==='falha'||next==='pendente'){const b=document.createElement('button');b.type='button';b.className='btn ghost small';b.textContent='Tentar agora';b.onclick=()=>pushChanged();el.appendChild(b)}
    clearTimeout(statusTimer);el.hidden=false;
    if(next==='salvo')statusTimer=setTimeout(()=>{el.hidden=true},2500);
  }catch{}
}

function locate(root,path){
  let holder=root;
  for(const step of path){
    if(step&&typeof step==='object'){if(!Array.isArray(holder))return null;holder=holder.find(x=>x&&String(x.id)===String(step.id));}
    else holder=holder&&typeof holder==='object'?holder[step]:undefined;
    if(holder===undefined||holder===null)return null;
  }
  return holder;
}
function resolveConflict(id,keepLocal){
  const all=readConflicts(),c=all.find(x=>x.id===id);if(!c)return false;
  const d=state();
  if(keepLocal){
    if(!d)return false;
    if(!c.path.length)d[c.chave]=clone(c.local);
    else{
      const holder=locate(d[c.chave],c.path.slice(0,-1)),last=c.path[c.path.length-1];
      if(!holder||typeof holder!=='object')return false;
      if(last&&typeof last==='object'){
        if(!Array.isArray(holder))return false;
        const i=holder.findIndex(x=>x&&String(x.id)===String(last.id));
        if(c.local===undefined){if(i>=0)holder.splice(i,1)}else if(i>=0)holder[i]=clone(c.local);else holder.push(clone(c.local));
      }else if(c.local===undefined)delete holder[last];else holder[last]=clone(c.local);
    }
  }
  writeConflicts(all.filter(x=>x.id!==id));
  if(keepLocal){try{(typeof save==='function'?save:window.save)?.()}catch{schedulePush()}}
  setStatus(saveState==='conflito'?'salvo':saveState);
  try{if(keepLocal&&typeof render==='function'&&currentUser()&&!editing())render()}catch{}
  return true;
}
const MODULE_NAMES={trips:'Viagens',tripExpenses:'Despesas de viagem',tripDocuments:'Documentos de viagem',budgetRecords:'Orçamentos',budgetExpenses:'Gastos de orçamento',docs:'Documentos fiscais',cashflow:'Fluxo de caixa',accountPayments:'Pagamentos de contas',accountMasters:'Contas'};
function describe(c){
  const rec=c.path.find(p=>p&&typeof p==='object'),fields=c.path.filter(p=>typeof p==='string');
  return `${MODULE_NAMES[c.chave]||c.chave}${rec?` · registro ${rec.id}`:''}${fields.length?` · campo ${fields.join('.')}`:''}`;
}
function show(v){if(v===undefined)return '(excluído)';const s=typeof v==='string'?v:json(v);return s.length>240?s.slice(0,240)+'…':s}
function openConflicts(){
  if(typeof document==='undefined'||!document.body)return;
  document.getElementById('finConflictModal')?.remove();
  const prev=document.activeElement;
  const el=document.createElement('div');el.id='finConflictModal';el.className='modal-backdrop';
  const box=document.createElement('section');box.className='modal fin-conflict-modal';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby','finConflictTitle');
  const close=()=>{el.remove();try{prev?.focus?.()}catch{}};
  const draw=()=>{
    const list=readConflicts();
    box.innerHTML='<div class="modal-head"><h3 id="finConflictTitle">Alterações em conflito</h3><button type="button" class="btn ghost small" data-close>Fechar</button></div><div class="modal-body"></div>';
    const body=box.querySelector('.modal-body');
    if(!list.length)body.textContent='Nenhum conflito pendente.';
    for(const c of list){
      const row=document.createElement('div');row.className='fin-conflict-item';
      const h=document.createElement('strong');h.textContent=describe(c);row.appendChild(h);
      const p1=document.createElement('p');p1.textContent=`Sua versão: ${show(c.local)}`;
      const p2=document.createElement('p');p2.textContent=`Versão salva no servidor: ${show(c.servidor)}`;row.append(p1,p2);
      const actions=document.createElement('div');actions.className='fin-conflict-actions';
      const keep=document.createElement('button');keep.type='button';keep.className='btn small';keep.textContent='Reaplicar minha versão';
      const drop=document.createElement('button');drop.type='button';drop.className='btn ghost small';drop.textContent='Manter a do servidor';
      keep.onclick=()=>{if(!resolveConflict(c.id,true)){p1.textContent+=' — o registro não existe mais no servidor; não foi possível reaplicar.';return}draw()};
      drop.onclick=()=>{resolveConflict(c.id,false);draw()};
      actions.append(keep,drop);row.appendChild(actions);body.appendChild(row);
    }
    box.querySelector('[data-close]').onclick=close;
    (box.querySelector('.fin-conflict-actions button')||box.querySelector('[data-close]'))?.focus?.();
  };
  el.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(e.key!=='Tab')return;
    const f=[...box.querySelectorAll('button')];if(!f.length)return;
    if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus()}
    else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus()}
  });
  el.appendChild(box);document.body.appendChild(el);draw();
}

async function initialize(){
  if(initialized)return true;
  if(initPromise)return initPromise;
  const c=client(),s=await session();if(!c||!s)return false;
  initializing=true;
  initPromise=(async()=>{
    try{
      const uid=s.user.id;
      const data=await readRows(null);
      adminSession=await detectAdmin(c);
      const cloud=new Map(data.map(r=>[r.chave,r.dados])),revs=new Map(data.map(r=>[r.chave,r.revisao]));
      cloudKeys=new Set(cloud.keys());
      const local=mergeLocalSources(localCandidates(uid));
      const pending=readPending(uid);
      sessionUid=uid;signedOutUid=null;
      const keys=new Set([...Object.keys(local),...cloud.keys()]);
      const merged={},created=[],found=[];
      snapshot={};revisions={};
      for(const k of keys){
        if(!validKey(k))continue;
        const cloudExists=cloud.has(k);
        if(!cloudExists&&!adminSession){merged[k]=emptyLike(local[k]);continue} // sem acesso: não guarda cópia antiga
        if(cloudExists){
          snapshot[k]=json(cloud.get(k));revisions[k]=revs.get(k);
          const p=pending.keys[k];
          if(p&&p.base!==undefined){                          // rascunho não confirmado na sessão anterior
            const ctx=[];merged[k]=mergeValue3(parse(p.base),p.local,cloud.get(k),ctx);
            if(ctx.length)found.push([k,ctx]);
          }else merged[k]=mergeValue(local[k],cloud.get(k),true);
        }else{
          merged[k]=clone(local[k]);
          if(k!=='invoiceRequests')created.push(k);
        }
      }
      const d=state();if(d){for(const k of Object.keys(d))if(validKey(k)&&!(k in merged))delete d[k];Object.assign(d,merged)}
      for(const k of created){
        try{const r=await writeModule(k,merged[k],null);if(r.status==='salvo'){snapshot[k]=json(r.dados);revisions[k]=r.revisao??undefined;cloudKeys.add(k)}}
        catch(e){console.warn(`Financeiro: módulo local ${k} não pôde ser criado no Supabase`,e)}
      }
      initialized=true;
      for(const [k,ctx] of found)recordConflicts(k,ctx);
      cacheAll();
      document.dispatchEvent(new CustomEvent('integral-finance-cloud-ready'));
      try{if(typeof render==='function'&&currentUser())render()}catch{}
      if(pendingKeys().length)schedulePush();
      startSync();
      return true;
    }catch(e){console.error('Financeiro: falha ao inicializar persistencia Supabase',e);return false}
    finally{initializing=false;initPromise=null}
  })();
  return initPromise;
}

/* Grava um módulo com a revisão esperada. Sem a migration aplicada, usa o UPSERT antigo. */
async function writeModule(k,value,revisao){
  const c=client();
  if(versioned){
    const {data,error}=await c.rpc(SAVE_RPC,{p_chave:k,p_dados:value,p_revisao:revisao??null});
    if(!error){
      if(!data||!['salvo','conflito'].includes(data.status))throw Object.assign(Error('O servidor não confirmou o salvamento.'),{code:'FIN_SEM_CONFIRMACAO'});
      return data;
    }
    if(!missingFunction(error))throw error;
    versioned=false;console.warn('Financeiro: salvamento versionado indisponível; usando gravação compatível.');
  }
  const s=await session();
  const {error}=await c.from(TABLE).upsert([{chave:k,dados:value,updated_by:s?.user?.id,updated_at:new Date().toISOString()}],{onConflict:'chave'});
  if(error)throw error;
  return {status:'salvo',dados:value,revisao:null};
}

/* Erros que repetir não resolve (permissão, proteção do banco, dados inválidos): para de insistir
   naquele módulo, avisa na tela e segue salvando os demais. */
const blocked={};
function permanentError(e){const code=String(e?.code||'');return ['42501','22023','40001','P0001','23514','23502','22P02'].includes(code)||/FINANCEIRO_PROTECAO|Somente ADM|row-level security|violates|Versão desatualizada|sem permissão/i.test(String(e?.message||''))}
function discardLocal(k){
  const d=state();if(!d||snapshot[k]===undefined)return;
  applyInPlace(d,k,parse(snapshot[k]));delete blocked[k];cacheAll();
  try{document.getElementById('financeSaveBlocked')?.remove()}catch{}
  setStatus(Object.keys(blocked).length?'falha':'salvo');
  try{if(typeof render==='function'&&currentUser())render()}catch{}
}
function notifyBlocked(k,e){
  console.error(`Financeiro: o módulo ${k} não foi salvo`,e);
  setStatus('falha',{chave:k,message:e?.message});
  try{
    if(typeof document==='undefined'||!document.body||!document.createElement)return;
    let box=document.getElementById('financeSaveBlocked');
    if(!box){box=document.createElement('div');box.id='financeSaveBlocked';box.setAttribute('role','alert');box.className='fin-save-blocked';document.body.appendChild(box)}
    box.textContent='';
    const p=document.createElement('p');
    p.textContent=`Uma alteração em ${MODULE_NAMES[k]||k} não foi salva: ${e?.message||'erro'}. Ela continua guardada neste navegador. Confira com o responsável ou descarte para voltar à versão do servidor.`;
    const b=document.createElement('button');b.type='button';b.className='btn ghost small';b.textContent='Descartar minha alteração';b.onclick=()=>discardLocal(k);
    const x=document.createElement('button');x.type='button';x.className='btn ghost small';x.textContent='Fechar aviso';x.onclick=()=>box.remove();
    box.append(p,b,x);
  }catch{}
}

let pushAgain=false,retryTimer=null,pushPromise=null,closingBudget=false,budgetConflict=false;
function pushChanged(allowDuringClose=false){
  if(closingBudget&&!allowDuringClose){pushAgain=true;return Promise.resolve(false)}
  if(pushPromise){pushAgain=true;return pushPromise}
  if(!initialized)return Promise.resolve(false);
  pushing=true;pushAgain=false;
  pushPromise=(async()=>{
  let allOk=true,transient=false,wrote=false;
  try{
    const c=client(),s=await session(),d=state();if(!c||!s||!d){transient=true;return false}
    if(s.user.id!==sessionUid){console.warn('Financeiro: a sessão mudou; alterações não enviadas com a nova identidade.');return false}
    const changed=[];
    for(const k of Object.keys(d)){
      if(!validKey(k)||k==='invoiceRequests'||(k==='budgetRecords'&&budgetConflict))continue;
      if(!adminSession&&!cloudKeys.has(k))continue;
      if(snapshot[k]===json(d[k]))continue;
      if(blocked[k]!==undefined&&blocked[k]===json(d[k])){allOk=false;continue}
      changed.push(k);
    }
    if(!changed.length)return allOk;
    setStatus('salvando');
    for(const k of changed)await externalizeFiles(k,d[k]);
    for(const k of changed){
      const localJson=json(d[k]),local=JSON.parse(localJson);
      try{
        let base=parse(snapshot[k]),rev=revisions[k],value=local,result=null;
        const ctx=[];
        if(cloudKeys.has(k)&&(!versioned||rev===undefined||rev===null)){ // revisão desconhecida ou modo compatível
          const row=(await readRows([k]))[0];
          if(row){value=base===undefined?local:mergeValue3(base,local,row.dados,ctx);base=row.dados;rev=row.revisao}
        }
        for(let attempt=0;attempt<MAX_ATTEMPTS;attempt++){
          result=await writeModule(k,value,cloudKeys.has(k)?rev:null);
          if(result.status==='salvo')break;
          // Outra pessoa salvou antes: nada foi gravado. Mescla sobre a versão atual e tenta de novo.
          value=mergeValue3(base,value,result.dados,ctx);base=result.dados;rev=result.revisao;cloudKeys.add(k);result=null;
        }
        if(!result)throw Object.assign(Error('Muitas gravações simultâneas; nova tentativa em instantes.'),{code:'FIN_CONCORRENCIA'});
        cloudKeys.add(k);delete blocked[k];wrote=true;
        const stored=result.dados;
        snapshot[k]=json(stored);revisions[k]=result.revisao??undefined;
        recordConflicts(k,ctx);
        /* Se ninguém editou durante o envio, a tela recebe a versão gravada; senão, as edições novas
           são mescladas sobre ela (sem perder o que veio do servidor). */
        if(json(d[k])===localJson){if(!same(stored,local))applyInPlace(d,k,clone(stored))}
        else{const again=[];applyInPlace(d,k,mergeValue3(local,JSON.parse(json(d[k])),stored,again));recordConflicts(k,again)}
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
    if(transient){
      clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(initialized)pushChanged()},5000);
      setStatus(typeof navigator!=='undefined'&&navigator.onLine===false?'pendente':'falha');
    }else if(allOk&&wrote)setStatus('salvo');
    pushing=false;pushPromise=null;
    if(pushAgain&&!closingBudget){pushAgain=false;schedulePush()}
  }
  })();
  return pushPromise;
}
function schedulePush(){clearTimeout(pushTimer);pushTimer=setTimeout(()=>{if(initialized)pushChanged()},180)}

/* ---- Atualização a partir do servidor (FIN-02) -----------------------------------------
   O Realtime só avisa que algo mudou; a consistência vem da comparação de revisões, feita também
   ao voltar à aba, ao reconectar e periodicamente. Com formulário aberto ou campo em edição, a
   atualização espera para não trocar dados embaixo de quem está digitando. */
function editing(){
  try{
    if(typeof document==='undefined'||!document.querySelector)return false;
    if(document.querySelector('.modal-backdrop'))return true;
    return !!document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
  }catch{return false}
}
let refreshTimer=null,refreshing=null,refreshAgain=false,syncStarted=false;
function scheduleRefresh(delay=400){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refresh()},delay)}
async function refresh(){
  if(!initialized||!versioned)return false;
  if(refreshing){refreshAgain=true;return refreshing}
  if(pushPromise||closingBudget||editing()){scheduleRefresh(3000);return false}
  refreshing=(async()=>{
    try{
      const s=await session();if(!s||s.user.id!==sessionUid)return false;
      const light=await readRows(null,'chave,revisao');
      if(!versioned)return false;
      const stale=light.filter(r=>validKey(r.chave)&&(revisions[r.chave]==null||Number(r.revisao)>Number(revisions[r.chave])));
      if(!stale.length)return false;
      const rows=await readRows(stale.map(r=>r.chave));
      if(pushPromise||closingBudget||editing()){scheduleRefresh(3000);return false} // algo começou durante a leitura
      const d=state();if(!d)return false;
      const applied=[];
      for(const r of rows){
        const k=r.chave;if(revisions[k]!=null&&Number(r.revisao)<=Number(revisions[k]))continue;
        const base=parse(snapshot[k]),local=d[k];
        if(snapshot[k]===undefined||json(local)===snapshot[k])applyInPlace(d,k,clone(r.dados));
        else{const ctx=[];applyInPlace(d,k,mergeValue3(base,JSON.parse(json(local)),r.dados,ctx));recordConflicts(k,ctx)}
        snapshot[k]=json(r.dados);revisions[k]=r.revisao;cloudKeys.add(k);applied.push(k);
      }
      if(applied.length){
        cacheAll();
        try{document.dispatchEvent(new CustomEvent('integral-finance-remote-update',{detail:{keys:applied}}))}catch{}
        try{if(typeof render==='function'&&currentUser())render()}catch(e){console.error(e)}
        if(pendingKeys().length)schedulePush();
      }
      return applied.length>0;
    }catch(e){console.warn('Financeiro: atualização compartilhada adiada',e);return false}
    finally{refreshing=null;if(refreshAgain){refreshAgain=false;scheduleRefresh()}}
  })();
  return refreshing;
}
function startSync(){
  if(syncStarted)return;syncStarted=true;
  try{
    client()?.channel?.('financeiro-modulos-v1')
      ?.on?.('postgres_changes',{event:'*',schema:'public',table:SIGNAL_TABLE},()=>scheduleRefresh())
      ?.subscribe?.(status=>{if(status==='SUBSCRIBED')scheduleRefresh()});
  }catch(e){console.warn('Financeiro: Realtime indisponível; atualização por verificação periódica.',e)}
  try{
    window.addEventListener('online',()=>{scheduleRefresh(100);pushChanged()});
    window.addEventListener('focus',()=>scheduleRefresh(100));
    document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)scheduleRefresh(100)});
  }catch{}
  setInterval(()=>{try{if(typeof document!=='undefined'&&document.hidden)return}catch{}scheduleRefresh(0)},30000);
}

const legacySave=typeof save==='function'?save:null;
const cloudSave=function(){
  try{if(legacySave)legacySave();else cacheAll()}catch{cacheAll()}
  if(initialized)cacheAll();
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
    d.budgetRecords=merged;snapshot.budgetRecords=json(data);delete revisions.budgetRecords;cacheAll();
    return {changedDuringClose:changed,conflicts:conflicts.length};
  }finally{closingBudget=false;schedulePush()}
}

/* Troca de usuário ou fim da sessão: guarda o rascunho de quem saiu (só para essa pessoa) e tira da
   memória e do cache compartilhado os dados que a próxima pessoa não deve ver. */
function forgetSession(){
  const uid=sessionUid;
  if(uid&&initialized)cacheAll();
  signedOutUid=uid||signedOutUid;
  initialized=false;initPromise=null;snapshot={};revisions={};cloudKeys=new Set();adminSession=false;
  for(const k of Object.keys(blocked))delete blocked[k];
  lsDel(CACHE_KEY);lsDel(OWNER_KEY);for(const k of LEGACY_KEYS)lsDel(k);
  const d=state();if(d)for(const k of Object.keys(d))if(validKey(k))d[k]=emptyLike(d[k]);
  sessionUid=null;
}
window.IntegralFinanceCloudStorage={initialize,syncNow,push:pushChanged,closeBudget,refresh,
  conflicts:()=>readConflicts(),resolveConflict,openConflicts,status:()=>saveState,forgetSession};

let attempts=0;const boot=setInterval(async()=>{attempts++;if(await initialize()||attempts>120)clearInterval(boot)},500);
/* Renovar o token não recarrega os dados: recarregar substituía o db com modais abertos e descartava edições. */
try{client()?.auth?.onAuthStateChange((event,s)=>{
  if(event==='SIGNED_OUT'||!s){if(sessionUid||initialized)forgetSession();return}
  if(sessionUid&&s.user?.id&&s.user.id!==sessionUid){forgetSession();initialize();return}
  if(event==='SIGNED_IN'&&!initialized&&!initializing){initPromise=null;initialize()}
})}catch{}
window.addEventListener('beforeunload',e=>{try{cacheAll()}catch{}if(initialized&&(pushPromise||pendingKeys().length)){try{e.preventDefault();e.returnValue=''}catch{}}});
})();
