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
    /* Mescla com os setores já cadastrados: nunca remove setores criados no Financeiro. */
    const current=Array.isArray(db.sectors)?db.sectors:(db.sectors=[]);
    let changed=false,nextId=Math.max(0,...current.map(s=>Number(s.id)||0))+1;
    for(const name of names){if(!current.some(s=>norm(s.name)===norm(name))){current.push({id:nextId++,name,active:true,source:'ERP'});changed=true}}
    if(normalizeAssignments())changed=true;
    if(changed)save();
  }

  function sectorUserIds(sector){
    return (db.usersMvp||[]).filter(u=>u.active!==false&&sameSector(u.sector,sector)).map(u=>u.id);
  }

  function normalizeAssignments(){
    /* Ajusta os registros no lugar (sem recriar objetos), para não invalidar edições em modais abertos.
       Só o ADM grava essa normalização: para os demais a visibilidade já considera o setor, e regravar
       budgetRecords a partir de uma cópia antiga desfazia edições do ADM ou travava os salvamentos. */
    if(!isAdm())return false;
    let changed=false;
    if(!Array.isArray(db.trips))db.trips=[];
    for(const t of db.trips){if(!Array.isArray(t.assigned)){t.assigned=[];changed=true}if(t.sector==null){t.sector='';changed=true}}
    if(!Array.isArray(db.budgetRecords))db.budgetRecords=[];
    for(const b of db.budgetRecords){
      const direct=Array.isArray(b.assignedDirect)?b.assignedDirect:(Array.isArray(b.assigned)?b.assigned:[]);
      const effective=[...new Set([...direct,...sectorUserIds(b.sector)])];
      if(b.assignedDirect!==direct){b.assignedDirect=direct;changed=true}
      if(JSON.stringify(b.assigned)!==JSON.stringify(effective)){b.assigned=effective;changed=true}
    }
    return changed;
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

  const isFinanceSector=()=>{try{return !!window.IntegralFinanceSectorAccess?.isFinance?.()}catch{return false}};
  function enforceLimitedNav(){
    /* O setor Financeiro tem menu próprio (financeiro-finance-sector-access.js). */
    if(!user||isAdm()||isFinanceSector())return;
    const nav=document.querySelector('.nav');
    if(!nav)return;
    nav.querySelectorAll('button[data-view]').forEach(btn=>{btn.style.display=['budgets','trips','invoices'].includes(btn.dataset.view)?'':'none'});
  }

  const baseApp=app;
  app=function(){
    if(user&&!isAdm()&&!isFinanceSector()&&!['budgets','trips','invoices'].includes(view))view='budgets';
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
