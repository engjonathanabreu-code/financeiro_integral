/* Integral Financeiro - bloqueia apenas os agendamentos automáticos do ERP antes do V10 */
(function(){
'use strict';
const original={
  setTimeout:window.setTimeout.bind(window),
  setInterval:window.setInterval.bind(window),
  addEventListener:Document.prototype.addEventListener
};
window.__IntegralERPManualSyncOriginals=original;
const isERPCallback=fn=>typeof fn==='function'&&String(fn).includes('syncERPReceivables');
window.setTimeout=function(fn,delay,...args){
  if(isERPCallback(fn))return 0;
  return original.setTimeout(fn,delay,...args);
};
window.setInterval=function(fn,delay,...args){
  if(isERPCallback(fn))return 0;
  return original.setInterval(fn,delay,...args);
};
Document.prototype.addEventListener=function(type,listener,options){
  if(type==='visibilitychange'&&isERPCallback(listener))return;
  return original.addEventListener.call(this,type,listener,options);
};
})();
