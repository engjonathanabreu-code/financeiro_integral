/* Integral Financeiro V19 - Contas/Pagamentos persistidos no Supabase */
(function(){
'use strict';
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pushing=false, loading=false, pushTimer=null, ready=false;

const sb=()=>window.IntegralERP?.sb||null;
const hasSession=()=>!!user;
const id=v=>String(v??'');
const clean=o=>JSON.parse(JSON.stringify(o||{}));

function mapAccount(a){
  return {
    id:id(a.id),
    nome:a.name||a.nome||a.supplier||'Conta',
    fornecedor:a.supplier||a.fornecedor||a.name||'',
    categoria:a.category||a.categoria||'',
    setor:a.sector||a.setor||'',
    matricula_cadastro:a.registration||a.matricula||a.matriculaCadastro||'',
    recorrencia:a.recurrence||a.recorrencia||'',
    ativo:a.active!==false,
    dados:clean(a),
    updated_at:new Date().toISOString()
  };
}
function mapPayment(p){
  return {
    id:id(p.id),
    conta_id:id(p.accountId||p.contaId),
    vencimento:p.due||p.vencimento||new Date().toISOString().slice(0,10),
    valor:Number(p.value||p.valor||0),
    status:p.status||'Pendente',
    forma_pagamento:p.paymentMethod||p.method||p.formaPagamento||'',
    codigo_pagamento:p.paymentCode||p.code||p.codigoPagamento||'',
    pago_em:p.paidAt||p.pagoEm||null,
    dados:clean(p),
    updated_at:new Date().toISOString()
  };
}
function restoreAccount(r){
  const a={...(r.dados||{})};
  a.id=a.id??r.id;
  a.name=a.name||r.nome;
  a.supplier=a.supplier||r.fornecedor;
  a.category=a.category||r.categoria;
  a.sector=a.sector||r.setor;
  a.registration=a.registration||r.matricula_cadastro;
  a.recurrence=a.recurrence||r.recorrencia;
  a.active=r.ativo!==false;
  return a;
}
function restorePayment(r){
  const p={...(r.dados||{})};
  p.id=p.id??r.id;
  p.accountId=p.accountId??r.conta_id;
  p.due=p.due||r.vencimento;
  p.value=Number(p.value??r.valor??0);
  p.status=p.status||r.status;
  p.paymentMethod=p.paymentMethod||r.forma_pagamento||'';
  p.paymentCode=p.paymentCode||r.codigo_pagamento||'';
  p.paidAt=p.paidAt||r.pago_em||null;
  return p;
}

async function tableAvailable(){
  const c=sb(); if(!c||!hasSession())return false;
  const {error}=await c.from('financeiro_contas').select('id').limit(1);
  if(error){
    if(String(error.code)==='42P01'||/does not exist/i.test(error.message||'')) console.warn('Integral Financeiro: schema de contas ainda não foi criado no Supabase.');
    else console.warn('Integral Financeiro: Supabase indisponível para contas.',error);
    return false;
  }
  return true;
}

async function push(){
  if(pushing||loading||!ready)return false;
  const c=sb(); if(!c||!hasSession())return false;
  pushing=true;
  try{
    const accounts=(db.accountMasters||[]).map(mapAccount);
    const payments=(db.accountPayments||[]).map(mapPayment).filter(p=>p.conta_id);
    if(accounts.length){const {error}=await c.from('financeiro_contas').upsert(accounts,{onConflict:'id'});if(error)throw error;}
    if(payments.length){const {error}=await c.from('financeiro_pagamentos').upsert(payments,{onConflict:'id'});if(error)throw error;}
    db.financeCloudLastSync=new Date().toISOString();
    try{localStorage.setItem('integralFinanceiro',JSON.stringify(db));}catch{}
    return true;
  }catch(e){console.warn('Falha ao sincronizar Contas/Pagamentos com Supabase:',e);return false;}
  finally{pushing=false;}
}
function schedulePush(){
  clearTimeout(pushTimer);
  pushTimer=setTimeout(()=>push(),500);
}

async function load(){
  if(loading||!hasSession())return false;
  const c=sb(); if(!c)return false;
  loading=true;
  try{
    if(!await tableAvailable())return false;
    ready=true;
    const [ca,pa]=await Promise.all([
      c.from('financeiro_contas').select('*').order('nome'),
      c.from('financeiro_pagamentos').select('*').order('vencimento')
    ]);
    if(ca.error)throw ca.error;if(pa.error)throw pa.error;
    const cloudAccounts=(ca.data||[]), cloudPayments=(pa.data||[]);
    if(!cloudAccounts.length && (db.accountMasters||[]).length){await push();return true;}
    if(cloudAccounts.length){
      db.accountMasters=cloudAccounts.map(restoreAccount);
      db.accountPayments=cloudPayments.map(restorePayment);
      db.financeCloudLastSync=new Date().toISOString();
      try{localStorage.setItem('integralFinanceiro',JSON.stringify(db));}catch{}
      if(view==='accounts'&&typeof accounts==='function')accounts();
      if(view==='dashboard'&&typeof dashboard==='function')dashboard();
    }
    return true;
  }catch(e){console.warn('Falha ao carregar Contas/Pagamentos do Supabase:',e);return false;}
  finally{loading=false;}
}

// Persiste no Supabase sempre que o Financeiro salva uma alteração local.
const originalSave=window.save;
if(typeof originalSave==='function'){
  window.save=function(){const r=originalSave.apply(this,arguments);if(ready)schedulePush();return r;};
}

async function boot(){
  for(let i=0;i<20;i++){
    if(sb()&&hasSession()){await load();return;}
    await wait(350);
  }
}
setTimeout(boot,300);
window.addEventListener('integral:erp-ready',boot);
window.IntegralFinanceCloud={load,push,get ready(){return ready;}};
})();
