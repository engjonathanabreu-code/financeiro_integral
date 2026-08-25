/* Integral Financeiro - sincronização ERP resiliente
   Garante que previsões financeiras sejam atualizadas com os nomes reais dos projetos. */
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

  // O Financeiro resolve os nomes diretamente no ERP antes de montar as previsões.
  // Assim não depende de uma lista de projetos em memória estar previamente carregada.
  const projectResponse=await sb.from('projetos').select('id,nome,status').order('nome');
  let projects=[];
  if(projectResponse.error){
    console.warn('ERP sync: falha ao consultar projetos; usando cache como contingência.',projectResponse.error);
    projects=(erp.projects||d.erpProjects||[]).map(p=>({id:p.id,nome:p.nome||p.name||'',status:p.status||''}));
  }else{
    projects=projectResponse.data||[];
    erp.projects=projects;
    d.erpProjects=projects.map(p=>({id:p.id,name:p.nome,status:p.status}));
  }
  const projectMap=new Map(projects.map(p=>[String(p.id),p.nome||p.name||'']));

  const pay=await sb.from('pagamentos')
    .select('id,projeto_id,nome_etapa,valor_previsto,valor_recebido,vencimento,status,data_pagamento,created_at')
    .order('vencimento');
  if(pay.error)throw pay.error;

  d.erpPlannedRevenues=(pay.data||[]).map(p=>{
    const total=Number(p.valor_previsto||0);
    const received=Number(p.valor_recebido||0);
    const remaining=Math.max(0,total-received);
    const projectName=projectMap.get(String(p.projeto_id||''));
    return {
      id:`erp-${p.id}`,
      erpPaymentId:p.id,
      projectId:p.projeto_id||'',
      project:projectName||'Projeto ERP',
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
  window.dispatchEvent(new CustomEvent('integral:erp-planning-synced',{detail:{count:d.erpPlannedRevenues.length,projects:projects.length}}));
  return {ok:true,count:d.erpPlannedRevenues.length,projects:projects.length};
}

function install(){
  const erp=window.IntegralERP;
  if(!erp?.sb){setTimeout(install,250);return;}

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
  // Substitui também a rota antiga usada pelo Planejamento canônico.
  try{syncERPReceivables=robustPlanningSync}catch{}
  window.syncERPReceivables=robustPlanningSync;
}

install();
})();
