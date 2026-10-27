/* Cálculos determinísticos. Valores em centavos; nenhuma inferência de consumo. */
(function(root){
'use strict';
function metrics(usos,despesas){
 let km=0,centavos=0,litros=0,kmCiclo=0,litrosCiclo=0,pendentes=0,semDistancia=0,comprovantes=0;
 for(const u of usos.filter(u=>u.estado==='devolvido')){
  const distancia=Number(u.km_final)-Number(u.km_inicial);
  if(!Number.isFinite(distancia)||distancia<0)continue;
  km+=distancia;
  const ds=despesas.filter(d=>d.uso_id===u.id);
  const validas=ds.filter(d=>d.atual===true&&Number.isSafeInteger(Number(d.centavos))&&Number(d.centavos)>0);
  pendentes+=ds.length-validas.length;
  const custo=validas.reduce((s,d)=>s+Number(d.centavos),0);
  centavos+=custo;comprovantes+=validas.length;
  if(distancia===0)semDistancia++;
  for(const d of validas)if(Number(d.litros)>0)litros+=Number(d.litros);
  if(distancia>0&&u.tanque_inicial_cheio&&u.ciclo_confirmado&&ds.length>0&&validas.length===ds.length&&validas.every(d=>Number(d.litros)>0)){
   kmCiclo+=distancia;litrosCiclo+=validas.reduce((s,d)=>s+Number(d.litros),0);
  }
 }
 return {km:Math.round(km*10)/10,centavos,litros,custoKm:km>0&&comprovantes>0?centavos/100/km:null,consumo:litrosCiclo>0?kmCiclo/litrosCiclo:null,pendentes,semDistancia};
}
const api={metrics};if(typeof module!=='undefined')module.exports=api;else root.IntegralVehicleMetrics=api;
})(typeof window!=='undefined'?window:globalThis);
