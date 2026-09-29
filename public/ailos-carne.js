(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.AilosCarne=factory();})(globalThis,function(){
'use strict';
function plano({quantidade,valor,vencimento,periodicidade}){
 const n=Number(quantidade),v=Number(valor);if(!Number.isInteger(n)||n<1||n>500)throw Error('Informe de 1 a 500 boletos.');
 if(!Number.isFinite(v)||v<=0||v>99999999.99||Math.abs(v*100-Math.round(v*100))>.0001)throw Error('Informe um valor positivo com até duas casas decimais.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(vencimento))throw Error('Informe o vencimento.');
 const [y,m,d]=vencimento.split('-').map(Number),base=new Date(Date.UTC(y,m-1,d));
 if(base.toISOString().slice(0,10)!==vencimento)throw Error('Vencimento inválido.');
 if(!['igual','mensal'].includes(periodicidade))throw Error('Escolha vencimentos iguais ou mensais.');
 return Array.from({length:n},(_,i)=>{const date=new Date(Date.UTC(y,m-1+(periodicidade==='mensal'?i:0),1));const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(d,last));return {ordem:i+1,total:n,valor:v,vencimento:date.toISOString().slice(0,10)};});
}
return {plano};
});
