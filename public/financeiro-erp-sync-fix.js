/* Integral Financeiro - sincronização ERP resiliente
   Garante que previsões financeiras sejam atualizadas mesmo se módulos auxiliares do ERP falharem. */
(function(){
'use strict';

function getDb(){try{return typeof db!=='undefined'?db:window.db}catch{return window.db}}
function getUser(){try{return typeof user!=='undefined'?user:window.user}catch{return window.user}}
function persist(){try{if(typeof save==='function')save()}catch(e){console.warn('ERP sync fix persist:',e)}}
function monthKey(date){
  const s=String(date||'');
  const m=s.match(/^(\d{4})-(\d{2})/);
  return m?`${m[1]}-${m[2]}`:'';
}

async function robustPlanningSync(){
  const erp=window.IntegralERP;
  const sb=erp?.sb;
  const d=getDb();
  if(!sb||!d||!getUser())return {ok:false,reason:'not-ready'};

  let projects=[];
  try{
    const pr=await sb.from('projetos').select('id,nome,status').order('nome');
    if(!pr.error){
      projects=pr.data||[];
      erp.projects=projects;
      d.erpProjects=projects.map(p=>({id:p.id,name:p.nome,status:p.status}));
    }else{
      console.warn('ERP sync: projetos indisponíveis, previsões continuarão sem nome do projeto.',pr.error);
      projects=erp.projects||[];
    }
  }catch(e){
    console.warn('ERP sync: falha ao ler projetos; continuando previsões.',e);
    projects=erp.projects||[];
  }

  const pay=await sb.from('pagamentos')
    .select('id,projeto_id,nome_etapa,valor_previsto,valor_recebido,vencimento,status,data_pagamento,created_at')
    .order('vencimento');
  if(pay.error)throw pay.error;

  d.erpPlannedRevenues=(pay.data||[]).map(p=>{
    const total=Number(p.valor_previsto||0);
    const received=Number(p.valor_recebido||0);
    const remaining=Math.max(0,total-received);
    const project=projects.find(x=>String(x.id)===String(p.projeto_id));
    return {
      id:`erp-${p.id}`,
      erpPaymentId:p.id,
      projectId:p.projeto_id||'',
      project:project?.nome||'Projeto ERP',
      origin:p.nome_etapa||'Recebimento ERP',
      total,received,remaining,
      dueDate:p.vencimento||'',
      month:monthKey(p.vencimento),
      status:p.status||'',
      source:'ERP'
    };
  }).filter(x=>x.remaining>0&&x.dueDate);

  d.lastErpFinancialSync=new Date().toISOString();
  persist();
  window.dispatchEvent(new CustomEvent('integral:erp-planning-synced',{detail:{count:d.erpPlannedRevenues.length}}));
  return {ok:true,count:d.erpPlannedRevenues.length,projects:projects.length};
}

function install(){
  const erp=window.IntegralERP;
  if(!erp?.sb){setTimeout(install,250);return;}

  // A sincronização cadastral pode ficar parcial, mas não deve bloquear o Financeiro.
  if(erp.sync&&!erp.__financeiroSafeWrapped){
    const original=erp.sync.bind(erp);
    erp.sync=async function(){
      try{return await original()}
      catch(error){
        console.warn('ERP cadastral parcialmente indisponível; continuando sincronização financeira.',error);
        erp.loaded=true;
        erp.error=error?.message||String(error);
        return {ok:false,partial:true,error:erp.error};
      }
    };
    erp.__financeiroSafeWrapped=true;
  }

  window.IntegralFinanceERPPlanning={sync:robustPlanningSync};
}

install();
})();
