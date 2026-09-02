/* Integral Financeiro V31 — colaboradores podem criar e alimentar viagens */
(function(){
'use strict';
const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
const E=v=>typeof esc==='function'?esc(String(v??'')):String(v??'');
const F=d=>{if(!d)return'—';try{return typeof fmt==='function'?fmt(d):new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR')}catch{return d}};
const uid=()=>Date.now()+Math.floor(Math.random()*100000);
const isAdm=()=>{try{return user?.role==='Administrador'}catch{return false}};
const currentLocalUser=()=>{try{return (db.usersMvp||[]).find(u=>u.erpId===user?.erpId||String(u.email||'').toLowerCase()===String(user?.email||'').toLowerCase()||u.name===user?.name)||null}catch{return null}};
const tripById=id=>(db.trips||[]).find(t=>String(t.id)===String(id));
function persist(){if(typeof save==='function')save();}
function sectors(){const list=(db.sectors||[]).filter(s=>s.active!==false).map(s=>s.name).filter(Boolean);if(user?.sector&&!list.includes(user.sector))list.push(user.sector);return list;}
function users(){return (db.usersMvp||[]).filter(u=>u.active!==false);}
function modalTrip(id){
  const t=tripById(id), me=currentLocalUser(), allUsers=users(), selected=(t?.assigned||[]).map(String);
  const sectorList=sectors();
  const currentSector=t?.sector||user?.sector||me?.sector||'';
  const assignment=isAdm()?`<div class="field full"><label>Usuários com acesso individual</label><div class="assignment-grid">${allUsers.map(u=>`<label class="check-line"><input type="checkbox" name="assigned" value="${u.id}" ${selected.includes(String(u.id))?'checked':''}>${E(u.name)} <small>${E(u.sector||'')}</small></label>`).join('')}</div></div>`:'';
  const x=v2modal(t?'Editar viagem':'Nova viagem',`<form id="trip31Form"><div class="modal-body"><div class="form-grid"><div class="field"><label>Destino / cidade</label><input name="city" value="${E(t?.city||'')}" required></div><div class="field"><label>Projeto / atividade</label><input name="project" value="${E(t?.project||'')}"></div><div class="field"><label>Data inicial</label><input name="start" type="date" value="${t?.start||''}" required></div><div class="field"><label>Data final</label><input name="end" type="date" value="${t?.end||''}" required></div><div class="field full"><label>Equipe / viajantes</label><input name="employee" value="${E(t?.employee||user?.name||'')}" required></div><div class="field"><label>Setor</label><select name="sector"><option value="">Selecione</option>${sectorList.map(s=>`<option ${s===currentSector?'selected':''}>${E(s)}</option>`).join('')}</select></div><div class="field"><label>Status</label><select name="status">${['Planejada','Em andamento','Aguardando prestação','Aprovada','Divergência','Concluída'].map(s=>`<option ${s===(t?.status||'Planejada')?'selected':''}>${s}</option>`).join('')}</select></div><div class="field full"><label>Objetivo da viagem</label><textarea name="objective">${E(t?.objective||'')}</textarea></div><div class="field full"><label>Relatório / observações</label><textarea name="report">${E(t?.report||'')}</textarea></div>${assignment}</div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);
  q('#trip31Form',x).onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),start=f.get('start'),end=f.get('end');let assigned=isAdm()?f.getAll('assigned').map(Number):(t?.assigned||[]).slice();if(!isAdm()&&me?.id&&!assigned.map(String).includes(String(me.id)))assigned.push(me.id);const o={id:t?.id||uid(),city:String(f.get('city')||'').trim(),project:String(f.get('project')||'').trim(),start,end,period:start&&end?`${F(start)} a ${F(end)}`:'',month:String(start||'').slice(0,7),employee:String(f.get('employee')||'').trim(),sector:f.get('sector')||currentSector||'',status:f.get('status')||'Planejada',objective:String(f.get('objective')||'').trim(),report:String(f.get('report')||'').trim(),assigned,declared:t?.declared||0,proven:t?.proven||0,issues:t?.issues||[],createdBy:t?.createdBy||{name:user?.name||'',email:user?.email||'',erpId:user?.erpId||null,localUserId:me?.id||null},updatedBy:{name:user?.name||'',email:user?.email||'',at:new Date().toISOString()}};if(t)Object.assign(t,o);else{db.trips=db.trips||[];db.trips.push(o)}persist();x.remove();if(window.IntegralFinanceTripsAI?.render)window.IntegralFinanceTripsAI.render();else if(typeof trips==='function')trips();};
}
function enhance(){
  const content=q('#content');if(!content)return;
  const titleText=q('#title')?.textContent||'';
  if(titleText==='Viagens'){
    const toolbar=q('.toolbar',content);
    const canonicalNew=q('#trip26New',toolbar);
    const collaboratorNew=q('#trip31New',toolbar);
    if(canonicalNew&&collaboratorNew) collaboratorNew.remove();
    if(toolbar&&!canonicalNew&&!q('#trip31New',toolbar)){
      const b=document.createElement('button');b.className='btn';b.id='trip31New';b.textContent='+ Nova viagem';b.onclick=()=>modalTrip();toolbar.appendChild(b);
    }
  }
  if(/^Viagem\s*•/.test(titleText)){
    const right=q('.toolbar .right',content);if(right&&!q('#trip31Edit',right)){const b=document.createElement('button');b.className='btn ghost';b.id='trip31Edit';b.textContent='Editar viagem';const current=(db.trips||[]).find(t=>String(t.city||'')===titleText.replace(/^Viagem\s*•\s*/,''));b.onclick=()=>current&&modalTrip(current.id);right.insertBefore(b,right.firstChild);}
  }
}
const obs=new MutationObserver(()=>setTimeout(enhance,0));
function boot(){const app=q('#app');if(app)obs.observe(app,{childList:true,subtree:true});enhance();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
window.IntegralFinanceTripCollaborators={open:modalTrip,enhance};
})();