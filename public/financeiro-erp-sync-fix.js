/* Sincronização manual do ERP, com paginação e confirmação integral da leitura. */
(function(){
'use strict';

const dbState=()=>typeof db!=='undefined'?db:window.db;
const currentUser=()=>typeof user!=='undefined'?user:window.user;

async function readAllAssignments(client){
  const rows=[];
  let last;
  for(;;){
    let query=client.from('etapa_responsaveis').select('etapa_id,usuario_id')
      .order('etapa_id',{ascending:true}).order('usuario_id',{ascending:true});
    // Os dois campos são UUIDs. O cursor composto continua após o último par.
    if(last)query=query.or(`etapa_id.gt.${last.etapa_id},and(etapa_id.eq.${last.etapa_id},usuario_id.gt.${last.usuario_id})`);
    const {data,error}=await query.limit(500);
    if(error)throw error;
    if(!data?.length)return rows;
    const next=data.at(-1);
    const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
    if(!uuid.test(next.etapa_id)||!uuid.test(next.usuario_id)||
      (last&&next.etapa_id===last.etapa_id&&next.usuario_id===last.usuario_id)){
      throw Error('A paginação dos responsáveis não avançou.');
    }
    rows.push(...data);
    last=next;
  }
}

function planningRows(payments,projects,shared){
  const byProject=new Map(projects.map(project=>[String(project.id),project]));
  const rows=[];
  for(const payment of payments){
    const dueDate=shared.dateKey(payment.vencimento);
    const project=byProject.get(String(payment.projeto_id));
    if(!dueDate||shared.cancelled(payment.status)||shared.settled(payment.status)||shared.cancelled(project?.status))continue;
    const gross=shared.cents(payment.valor_previsto);
    const received=shared.cents(payment.valor_recebido);
    const remaining=Math.max(0,gross-received);
    if(!remaining)continue;
    rows.push({
      id:`erp-${payment.id}`,erpPaymentId:payment.id,projectId:payment.projeto_id||'',
      project:project?.nome||'Projeto ERP',
      origin:payment.nome_etapa||'Recebimento ERP',total:gross/100,received:received/100,remaining:remaining/100,
      dueDate,month:dueDate.slice(0,7),status:payment.status||'',source:'ERP'
    });
  }
  return rows.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id));
}

let running;
async function sync(){
  const erp=window.IntegralERP,client=erp?.sb,shared=window.IntegralDREShared;
  const actor=currentUser(),state=dbState();
  if(!client||!state||!actor||!shared)throw Error('A integração com o ERP ainda não está disponível.');
  if(actor.role!=='Administrador')throw Error('Sincronização com o ERP disponível somente para administradores.');
  const actorId=actor.erpId;
  let switched=false;
  const subscription=client.auth.onAuthStateChange?.((_event,session)=>{
    if(session?.user?.id!==actorId)switched=true;
  })?.data?.subscription;
  const sameUser=async()=>{
    const {data,error}=await client.auth.getSession();
    if(error)throw error;
    if(switched||!actorId||data?.session?.user?.id!==actorId||currentUser()!==actor||
      currentUser()?.role!=='Administrador'||dbState()!==state)throw Error('A sessão mudou. Entre novamente para sincronizar.');
  };
  try{
    await sameUser();
    const [profiles,projects,plans,steps,responsibles,payments]=await Promise.all([
      shared.allPages(client,'profiles','id,nome,email,tipo,ativo'),
      shared.allPages(client,'projetos','id,nome,status,cliente_id'),
      shared.allPages(client,'planos_trabalho','id,titulo,projeto_id,status,created_at'),
      shared.allPages(client,'etapas_plano','id,plano_id,titulo,status'),
      readAllAssignments(client),
      shared.allPages(client,'pagamentos','id,projeto_id,nome_etapa,valor_previsto,valor_recebido,vencimento,status')
    ]);
    await sameUser();

    const byProfile=new Map(profiles.map(profile=>[profile.id,profile]));
    const authenticated=byProfile.get(actorId);
    if(!authenticated||authenticated.ativo!==true||authenticated.tipo!=='Administrador'){
      throw Error('Somente um administrador ativo pode atualizar a projeção do ERP.');
    }
    const planByStep=new Map(steps.map(step=>[step.id,step.plano_id]));
    const sectorsByPlan=new Map();
    for(const responsible of responsibles){
      const planId=planByStep.get(responsible.etapa_id),sector=byProfile.get(responsible.usuario_id)?.tipo;
      if(!planId||!sector)continue;
      if(!sectorsByPlan.has(planId))sectorsByPlan.set(planId,new Set());
      sectorsByPlan.get(planId).add(sector);
    }
    // Preserve IDs locais de pessoas já vinculadas a viagens, solicitações e orçamentos.
    const localUsers=(state.usersMvp||[]).map(local=>{
      const profile=byProfile.get(local.erpId);
      if(!profile)return local;
      if(profile.ativo===false)return {...local,active:false};
      return {...local,name:profile.nome,email:profile.email||'',
        role:profile.tipo==='Administrador'?'Administrador':'Funcionário',sector:profile.tipo||'Administrativo'};
    });
    // Usa o mesmo identificador local do login legado quando ele pode ser atribuído sem colisão.
    for(const profile of profiles){
      if(profile.ativo===false||localUsers.some(local=>local.erpId===profile.id))continue;
      let id=0;
      for(const character of String(profile.id))id=(id*31+character.charCodeAt(0))>>>0;
      id=id||1;
      if(localUsers.some(local=>String(local.id)===String(id)))continue;
      localUsers.push({id,erpId:profile.id,name:profile.nome,email:profile.email||'',
        role:profile.tipo==='Administrador'?'Administrador':'Funcionário',sector:profile.tipo||'Administrativo',
        active:true,source:'ERP'});
    }
    const planning=planningRows(payments,projects,shared);
    const timestamp=new Date().toISOString();
    const snapshot={
      usersMvp:localUsers,
      erpProjects:projects.map(project=>({id:project.id,name:project.nome,status:project.status})),
      erpPlans:plans.map(plan=>({id:plan.id,title:plan.titulo,projectId:plan.projeto_id||'',status:plan.status,
        sectors:[...(sectorsByPlan.get(plan.id)||[])]})),
      erpPlannedRevenues:planning,lastErpFinancialSync:timestamp,lastErpManualSync:timestamp,lastErpSyncReason:'manual'
    };
    Object.assign(state,snapshot);
    Object.assign(erp,{profiles,projects,plans,steps,responsibles,loaded:true,error:'',loadedAt:timestamp});
    if(typeof save==='function')save();
    window.dispatchEvent(new CustomEvent('integral:erp-planning-synced',{detail:{count:planning.length,projects:projects.length}}));
    return {ok:true,count:planning.length,projects:projects.length};
  }finally{subscription?.unsubscribe()}
}
function syncERP(){
  if(!running)running=sync().finally(()=>{running=null});
  return running;
}
window.IntegralFinanceERPPlanning={sync:syncERP};
window.syncERPReceivables=syncERP;
})();
