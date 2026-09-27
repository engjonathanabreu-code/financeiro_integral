/* Integral Financeiro — tema claro/escuro.
   Carregado no <head> para aplicar o tema antes da primeira pintura (sem "piscar").
   Preferência por aparelho: Automático (segue o sistema), Claro ou Escuro. */
(function(){
'use strict';
const KEY='integral_fin_theme';
const media=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
function pref(){try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:'auto'}catch{return 'auto'}}
function resolved(p){return p==='auto'?(media&&media.matches?'dark':'light'):p}
function apply(){
  const p=pref(),t=resolved(p),root=document.documentElement;
  root.dataset.theme=t;root.dataset.themePref=p;root.style.colorScheme=t;
  let meta=document.querySelector('meta[name="theme-color"]');
  if(!meta&&document.head){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}
  if(meta)meta.content=t==='dark'?'#0F1719':'#F5F3ED';
  document.querySelectorAll('[data-theme-option]').forEach(b=>{const on=b.dataset.themeOption===p;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
}
function set(p){try{if(p==='auto')localStorage.removeItem(KEY);else localStorage.setItem(KEY,p)}catch{}apply()}
apply();
if(media){const f=()=>{if(pref()==='auto')apply()};media.addEventListener?media.addEventListener('change',f):media.addListener(f)}

/* Seletor dentro do painel de Configuração (engrenagem da barra lateral). */
function install(){
  const panel=document.querySelector('#finConfigurationPanel .fin-configuration-actions')||document.querySelector('#finConfigurationPanel');
  if(!panel||panel.querySelector('.fin-theme-switch'))return;
  const box=document.createElement('div');box.className='fin-theme-switch';box.setAttribute('role','group');box.setAttribute('aria-label','Tema');
  box.innerHTML='<span class="fin-theme-label">Tema</span><div class="segmented"><button type="button" data-theme-option="auto">Automático</button><button type="button" data-theme-option="light">Claro</button><button type="button" data-theme-option="dark">Escuro</button></div>';
  box.addEventListener('click',e=>{const b=e.target.closest('[data-theme-option]');if(!b)return;e.preventDefault();e.stopPropagation();set(b.dataset.themeOption)});
  const logout=panel.querySelector('#logout');if(logout)panel.insertBefore(box,logout);else panel.appendChild(box);
  apply();
}
function boot(){install();new MutationObserver(()=>{if(!document.querySelector('.fin-theme-switch'))install()}).observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.IntegralFinanceTheme={set,get:pref};
})();
