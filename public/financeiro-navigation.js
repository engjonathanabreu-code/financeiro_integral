/* Mantém os controles e seus handlers; altera somente sua apresentação. */
(function(){
'use strict';
const q=s=>document.querySelector(s);
const icons={dashboard:'layout-dashboard',accounts:'wallet',institutionalClients:'users',erpProjects:'clipboard-list',documents:'files',cashflow:'arrow-left-right',budgets:'calculator',trips:'plane',invoices:'request-approval',planning:'clipboard-list',reports:'chart-no-axes-combined',boletos:'receipt',receivables:'receipt',hr:'contact',registers:'folder-cog',users:'users',recebimentos:'receipt',dre:'chart-no-axes-combined',financialAgent:'bot'};
let pending=false;
const phone=matchMedia('(max-width: 740px), (max-width: 960px) and (max-height: 540px) and (pointer: coarse)');
let drawer=null;
const mobileGroups={accounts:'Financeiro',budgets:'Operações',planning:'Análise'};
function menuButton(label,className){
  const button=document.createElement('button');
  button.type='button';button.className=className;button.setAttribute('aria-label',label);
  return button;
}
function updateDrawer(open,restoreFocus=false){
  if(!drawer)return;
  const {sidebar,main,trigger,backdrop,exit}=drawer;
  const mobile=phone.matches;
  const active=mobile&&open;
  const focusedInside=sidebar.contains(document.activeElement);
  drawer.open=active;
  sidebar.toggleAttribute('data-fin-drawer-open',active);
  sidebar.inert=mobile&&!active;
  main.inert=active;
  trigger.setAttribute('aria-expanded',String(active));
  backdrop.hidden=!active;
  document.documentElement.classList.toggle('fin-drawer-lock',active);
  if(active){
    sidebar.setAttribute('role','dialog');
    sidebar.setAttribute('aria-label','Menu de navegação');
    sidebar.setAttribute('aria-modal','true');
    exit.focus();
  }else{
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-label');
    sidebar.removeAttribute('aria-modal');
    if(mobile&&(restoreFocus||focusedInside))trigger.focus();
  }
}
function mountDrawer(sidebar,nav){
  const shell=sidebar.closest('.shell'),main=shell?.querySelector('.main'),top=main?.querySelector('.topbar');
  if(!top)return;
  if(drawer?.sidebar===sidebar)return;
  const trigger=menuButton('Abrir menu de navegação','btn ghost fin-drawer-toggle');
  trigger.textContent='☰';
  trigger.setAttribute('aria-controls','finMobileNavigation');
  const exit=menuButton('Fechar menu de navegação','btn ghost fin-drawer-close');
  exit.textContent='×';
  const backdrop=document.createElement('div');
  backdrop.className='fin-drawer-overlay';backdrop.hidden=true;backdrop.setAttribute('aria-hidden','true');
  sidebar.id='finMobileNavigation';
  top.prepend(trigger);
  sidebar.prepend(exit);
  shell.append(backdrop);
  const destinations=[...nav.querySelectorAll('[data-view]')];
  for(const [index,node] of destinations.entries()){
    const name=mobileGroups[node.dataset.view]||(index===0?'Área de trabalho':'');
    if(name){const heading=document.createElement('span');heading.className='fin-drawer-group';heading.textContent=name;node.before(heading)}
  }
  drawer={sidebar,main,trigger,exit,backdrop,open:false};
  updateDrawer(false);
  trigger.addEventListener('click',()=>updateDrawer(!drawer.open,true));
  exit.addEventListener('click',()=>updateDrawer(false,true));
  backdrop.addEventListener('click',()=>updateDrawer(false,true));
}
function close(focus){const menu=q('#finConfigurationPanel'),toggle=q('#finConfigurationToggle');if(!menu||!toggle)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus()}
function mount(){
  pending=false;const sidebar=q('.sidebar'),foot=q('.sidebar-foot'),nav=q('.sidebar > .nav');
  if(!sidebar||!foot||!nav){
    drawer=null;
    document.documentElement.classList.remove('fin-drawer-lock');
    return;
  }
  sidebar.classList.add('fin-navigation');
  let panel=q('#finConfigurationPanel');
  if(!panel){
    panel=document.createElement('div');panel.id='finConfigurationPanel';panel.className='fin-configuration-panel';panel.hidden=true;panel.setAttribute('role','group');panel.setAttribute('aria-label','Configuração');
    // A classe nav mantém os guardas de acesso e a navegação delegada existentes.
    const actions=document.createElement('nav');actions.className='nav fin-configuration-actions';actions.setAttribute('aria-label','Configuração');panel.append(actions);
    const toggle=document.createElement('button');toggle.type='button';toggle.id='finConfigurationToggle';toggle.className='btn secondary';toggle.dataset.finIcon='settings';toggle.title='Configuração';toggle.setAttribute('aria-label','Configuração');toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','false');
    foot.append(toggle,panel);
    toggle.addEventListener('click',()=>{const open=panel.hidden;panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('button:not([disabled]):not([hidden])')?.focus()});
    panel.addEventListener('click',e=>{if(e.target.closest('button'))close(false)});
    foot.addEventListener('focusout',()=>setTimeout(()=>{if(!foot.contains(document.activeElement))close(false)},0));
  }
  const actions=panel.querySelector('.fin-configuration-actions');
  for(const selector of ['[data-view="registers"]','[data-view="users"]']){
    const b=nav.querySelector(selector);if(b)actions.append(b);
  }
  for(const selector of ['#erpSyncControl','#logout']){const el=foot.querySelector(selector);if(el&&el.parentElement!==actions)actions.append(el)}
  const sync=actions.querySelector('#erpSyncControl'),logout=actions.querySelector('#logout');
  if(sync&&logout&&sync.nextElementSibling!==logout)actions.insertBefore(sync,logout);
  nav.querySelectorAll('.sep').forEach(el=>{el.hidden=true});
  sidebar.querySelectorAll('[data-view]').forEach(b=>{const icon=icons[b.dataset.view];if(icon&&b.dataset.finIcon!==icon)b.dataset.finIcon=icon});
  for(const [selector,icon] of [['#logout','log-out'],['#erpSyncButton','refresh-cw']]){const b=q(selector);if(b&&b.dataset.finIcon!==icon)b.dataset.finIcon=icon}
  sidebar.querySelectorAll('[data-view]').forEach(button=>{
    if(button.classList.contains('active'))button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  mountDrawer(sidebar,nav);
  document.querySelectorAll('.trip-expenses tbody tr').forEach(row=>{
    const labels=['Data','Tipo','Fornecedor / origem','Descrição','Valor','Documento','IA','Status','Ações'];
    [...row.cells].forEach((cell,i)=>{if(cell.colSpan===1&&cell.dataset.label!==labels[i])cell.dataset.label=labels[i]});
  });
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(mount)}
document.addEventListener('click',e=>{if(!e.target.closest('.sidebar-foot'))close(false)});
phone.addEventListener('change',()=>updateDrawer(false));
window.addEventListener('click',event=>{
  if(!drawer?.open)return;
  const button=event.target.closest?.('.nav [data-view],#logout');
  if(!button||!drawer.sidebar.contains(button))return;
  updateDrawer(false);
  if(button.hasAttribute('data-view'))requestAnimationFrame(()=>{
    const title=q('.shell > .main .topbar h2');
    if(title){title.tabIndex=-1;title.focus()}
  });
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&q('#finConfigurationPanel')?.hidden===false){e.preventDefault();close(true);return}
  if(!drawer?.open)return;
  if(e.key==='Escape'){e.preventDefault();updateDrawer(false,true);return}
  if(e.key!=='Tab')return;
  const focusable=[...drawer.sidebar.querySelectorAll('button:not(:disabled),a[href]')].filter(node=>node.getClientRects().length);
  const first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
});
new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
schedule();
})();
