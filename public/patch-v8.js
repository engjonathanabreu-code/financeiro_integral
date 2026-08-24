/* Integral Financeiro V8.1 - setores ERP e escopo por usuário/setor */
(function(){
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const isAdm=()=>user?.role==='Administrador';
  const currentLocalUser=()=> (db.usersMvp||[]).find(u=>u.erpId===user?.erpId||String(u.email||'').toLowerCase()===String(user?.email||'').toLowerCase()||u.name===user?.name);
  const sameSector=(a,b)=>norm(a)&&norm(a)===norm(b);

  function syncSectorsFromERP(){
    const profiles=window.IntegralERP?.profiles||[];
    const names=[...new Set(profiles.map(p=>p.tipo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    if(!names.length)return;
    db.sectors=names.map((name,i)=>({id:i+1,name,active:true,source:'ERP'}));
    normalizeAssignments();
    save();
  }

  function sectorUserIds(sector){
    return (db.usersMvp||[]).filter(u=>u.active!==false&&sameSector(u.sector,sector)).map(u=>u.id);
  }

  function normalizeAssignments(){
    db.trips=(db.trips||[]).map(t=>({...t,assigned:Array.isArray(t.assigned)?t.assigned:[],sector:t.sector||''}));
    db.budgetRecords=(db.budgetRecords||[]).map(b=>{
      const direct=Array.isArray(b.assignedDirect)?b.assignedDirect:(Array.isArray(b.assigned)?b.assigned:[]);
      const effective=[...new Set([...direct,...sectorUserIds(b.sector)])];
      return {...b,assignedDirect:direct,assigned:effective};
    });
  }

  function canAccessBudget(b){
    if(isAdm())return true;
    const u=currentLocalUser();
    return (b.assigned||[]).includes(u?.id)||sameSector(b.sector,user?.sector);
  }

  function canAccessTrip(t){
    if(isAdm())return true;
    const u=currentLocalUser();
    return (t.assigned||[]).includes(u?.id)||sameSector(t.sector,user?.sector);
  }

  function enforceLimitedNav(){
    if(!user||isAdm())return;
    const nav=document.querySelector('.nav');
    if(!nav)return;
    nav.querySelectorAll('button[data-view]').forEach(btn=>{btn.style.display=['budgets','trips'].includes(btn.dataset.view)?'':'none'});
  }

  const baseApp=app;
  app=function(){
    if(user&&!isAdm()&&!['budgets','trips'].includes(view))view='budgets';
    normalizeAssignments();
    baseApp();
    if(window.IntegralERP?.loaded)syncSectorsFromERP();
    setTimeout(enforceLimitedNav,0);
  };

  const baseBudgets=budgets;
  budgets=function(){
    normalizeAssignments();
    return baseBudgets();
  };

  const baseTrips=trips;
  trips=function(){
    normalizeAssignments();
    const all=db.trips;
    if(!isAdm()){
      db.trips=all.filter(canAccessTrip);
      try{return baseTrips();}
      finally{db.trips=all;}
    }
    baseTrips();
    decorateTripAssignments();
  };

  function decorateTripAssignments(){
    if(!isAdm())return;
    const rows=[...document.querySelectorAll('#content tbody tr')];
    rows.forEach((tr,i)=>{
      const t=(db.trips||[])[i];if(!t)return;
      const cell=tr.lastElementChild;if(!cell||cell.querySelector('[data-trip-assign]'))return;
      const b=document.createElement('button');b.className='btn small ghost';b.dataset.tripAssign=t.id;b.textContent='Atribuir';
      b.style.marginLeft='6px';b.onclick=e=>{e.stopPropagation();tripAssignModal(t.id)};cell.appendChild(b);
    });
  }

  function options(items,selected=''){return items.map(x=>`<option value="${esc(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('')}
  function tripAssignModal(id){
    if(!isAdm())return;
    const t=(db.trips||[]).find(x=>String(x.id)===String(id));if(!t)return;
    const sectors=(db.sectors||[]).filter(s=>s.active!==false).map(s=>s.name);
    const users=(db.usersMvp||[]).filter(u=>u.active!==false);
    const x=v2modal('Atribuir viagem',`<form id="v8TripAssign"><div class="modal-body"><div class="field"><label>Setor com acesso</label><select name="sector"><option value="">Nenhum setor</option>${options(sectors,t.sector||'')}</select></div><div class="field"><label>Usuários com acesso</label>${users.map(u=>`<label class="check-line"><input type="checkbox" name="assigned" value="${u.id}" ${(t.assigned||[]).includes(u.id)?'checked':''}>${esc(u.name)} <small>${esc(u.sector||'')}</small></label>`).join('')}</div><div class="muted">O acesso é liberado se o usuário estiver atribuído diretamente ou pertencer ao setor selecionado.</div></div><div class="modal-foot"><button class="btn">Salvar</button></div></form>`);
    x.querySelector('#v8TripAssign').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);t.sector=f.get('sector')||'';t.assigned=f.getAll('assigned').map(Number);save();x.remove();trips()};
  }

  function hookBudgetAssignmentForm(form){
    if(form.dataset.v8Hook)return;form.dataset.v8Hook='1';
    form.addEventListener('submit',()=>{
      const fd=new FormData(form),name=String(fd.get('name')||''),sector=String(fd.get('sector')||''),selected=fd.getAll('assigned').map(Number);
      const direct=selected.filter(id=>{const u=(db.usersMvp||[]).find(x=>x.id===id);return !u||!sameSector(u.sector,sector)});
      setTimeout(()=>{
        const matches=(db.budgetRecords||[]).filter(b=>b.name===name&&b.sector===sector),b=matches[matches.length-1];
        if(!b)return;b.assignedDirect=direct;b.assigned=[...new Set([...direct,...sectorUserIds(sector)])];save();
      },50);
    },true);
  }

  const obs=new MutationObserver(()=>{
    if(window.IntegralERP?.loaded)syncSectorsFromERP();
    enforceLimitedNav();
    document.querySelectorAll('#bf').forEach(hookBudgetAssignmentForm);
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});

  window.IntegralFinanceScope={syncSectorsFromERP,canAccessBudget,canAccessTrip};
})();
