/* Integral Financeiro — competência inicial sempre no mês vigente */
(function(){
'use strict';

function localMonth(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function resetMonthlyViews(){
  const month=localMonth();
  try{
    if(typeof v2state!=='undefined'&&v2state){
      v2state.accountsMonth=month;
      v2state.docsMonth=month;
      v2state.cashMonth=month;
      v2state.tripsMonth=month;
      v2state.accountsMode='month';
    }
  }catch(e){console.warn('Financeiro: não foi possível definir a competência vigente.',e)}
  window.__INTEGRAL_CURRENT_MONTH__=month;
  return month;
}

/* Boot e restauração automática de sessão */
resetMonthlyViews();

/* Novo login sem recarregar a página */
document.addEventListener('submit',function(e){
  if(e.target?.id==='login')resetMonthlyViews();
},true);

window.IntegralFinanceCurrentMonth={reset:resetMonthlyViews,current:localMonth};
})();
