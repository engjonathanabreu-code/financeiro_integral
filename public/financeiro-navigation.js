/* Mantém os controles e seus handlers; altera somente sua apresentação. */
(function(){
'use strict';
const q=s=>document.querySelector(s);
const icons={dashboard:'layout-dashboard',accounts:'wallet',institutionalClients:'users',erpProjects:'clipboard-list',documents:'files',cashflow:'arrow-left-right',budgets:'calculator',trips:'plane',invoices:'clipboard-check',planning:'clipboard-list',reports:'chart-no-axes-combined',receivables:'receipt',hr:'contact',registers:'folder-cog',users:'users',recebimentos:'receipt'};
let pending=false;
function close(focus){const menu=q('#finConfigurationPanel'),toggle=q('#finConfigurationToggle');if(!menu||!toggle)return;menu.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus()}
function mount(){
  pending=false;const sidebar=q('.sidebar'),foot=q('.sidebar-foot'),nav=q('.sidebar > .nav');if(!sidebar||!foot||!nav)return;
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
  document.querySelectorAll('.trip-expenses tbody tr').forEach(row=>{
    const labels=['Data','Tipo','Fornecedor / origem','Descrição','Valor','Documento','IA','Status','Ações'];
    [...row.cells].forEach((cell,i)=>{if(cell.colSpan===1&&cell.dataset.label!==labels[i])cell.dataset.label=labels[i]});
  });
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(mount)}
document.addEventListener('click',e=>{if(!e.target.closest('.sidebar-foot'))close(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('#finConfigurationPanel')?.hidden===false){e.preventDefault();close(true)}});
new MutationObserver(schedule).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
schedule();
})();
