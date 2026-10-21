/* Integral Financeiro - leitura completa de tabelas grandes (FIN-10).
   A API do Supabase devolve no máximo max_rows linhas por consulta (1.000 por padrão); uma consulta
   sem paginação mostrava totais parciais como se fossem gerais. Aqui cada página é pedida em ordem
   estável (id) e a leitura só termina quando o servidor devolve uma página vazia, seja qual for o
   limite configurado. */
(function(){
'use strict';
async function all(build,{pageSize=1000,orderBy='id'}={}){
  const rows=[];
  for(let from=0;;){
    let q=build();if(orderBy)q=q.order(orderBy);
    const r=await q.range(from,from+pageSize-1);
    if(r.error)throw r.error;
    const page=r.data||[];
    if(!page.length)return rows;
    rows.push(...page);from+=page.length;
  }
}
window.IntegralPaging={all};
})();
