const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/agente-financeiro'),{analyze,period,scheduled}=require('../lib/financial-consultant');
test('integer-cent calculations, partial receipts, late balance, separated bases and periods',()=>{
 const result=analyze({cashflow:[{date:'2026-10-01',direction:'Entrada',value:0.1},{date:'2026-10-02',direction:'Entrada',value:0.2},{date:'2026-10-02',direction:'Saída',value:0.15}],budgetRecords:[{id:1,limit:100,status:'Fechado'}],budgetExpenses:[{budgetId:1,value:20}],trips:[{status:'Concluída'},{status:'Planejada'}]},[{vencimento:'2026-09-01',valor_previsto:100,juros:10,multa:5,valor_liquidado:40,pago_em:'2026-10-01',status:'Parcial'}],{start:'2026-10-01',end:'2026-10-02'},'2026-10-03',{target:100});
 assert.equal(result.observado.fluxo_caixa.entradas,0.3);assert.equal(result.observado.recebimentos.saldo_em_atraso,75);assert.equal(result.observado.recebimentos.liquidado_por_data_pagamento,40);assert.equal(result.observado.orcamentos[0].gastos,20);assert.equal(result.observado.viagens.concluidas,1);assert.equal(result.observado.comparacao.periodo.start,'2026-09-29');assert.equal(result.cenario_meta.diferenca_para_entrada_caixa,99.7);
 assert.throws(()=>period({start:'2026-02-30',end:'2026-10-01'},'2026-10-01'),/válido/);
 assert.equal(scheduled({start:'2026-10-01',installments:2,entry:20,total:100},'Entrada').reduce((s,r)=>s+r.value,0),100);
});
test('API authenticates actual profile before reading metrics or calling IA; forged client admin has no effect',async()=>{
 const previous=global.fetch;const calls=[];let tipo='Funcionário',active=true;
 global.fetch=async(url,opts)=>{calls.push(url);if(url.includes('/auth/'))return {ok:true,json:async()=>({id:'actor'})};if(url.includes('/profiles?'))return {ok:true,json:async()=>[{tipo,ativo:active}]};if(url.includes('/rpc/'))return {ok:true,json:async()=>({cashflow:[]})};if(url.includes('/fin_receb_'))return {ok:true,json:async()=>[]};throw Error('Unexpected IA')};
 const run=async(auth='Bearer real')=>{let status=200,body;await handler({method:'POST',headers:{authorization:auth},body:{question:'Resumo financeiro',role:'Administrador',start:'2026-10-01',end:'2026-10-01'}},{setHeader(){},status(v){status=v;return this},json(v){body=v}});return {status,body}};
 const key=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;
 try{assert.equal((await run('')).status,401);assert.equal((await run()).status,403);assert.equal(calls.some(c=>c.includes('/rpc/')),false);tipo='Administrador';active=false;assert.equal((await run()).status,403);active=true;const r=await run();assert.equal(r.status,200);assert.equal(r.body.modo,'indicadores');assert.ok(r.body.base.limitacoes.length);assert.equal(r.body.base.observado.fluxo_caixa.registros,0)}finally{global.fetch=previous;if(key!==undefined)process.env.OPENAI_API_KEY=key}
});
test('IA receives only authorized metrics; returns sourced analysis and detects incomplete provider output',async()=>{
 const previous=global.fetch,key=process.env.OPENAI_API_KEY;let incomplete=false,payload;
 process.env.OPENAI_API_KEY='test-key';
 global.fetch=async(url,opts)=>{
  if(url.includes('/auth/'))return {ok:true,json:async()=>({id:'actor'})};
  if(url.includes('/profiles?'))return {ok:true,json:async()=>[{tipo:'Administrador',ativo:true}]};
  if(url.includes('/rpc/'))return {ok:true,json:async()=>({cashflow:[{date:'2026-10-01',direction:'Entrada',value:100}]})};
  if(url.includes('/fin_receb_'))return {ok:true,json:async()=>[]};
  payload=JSON.parse(opts.body);return {ok:true,json:async()=>({status:incomplete?'incomplete':'completed',model:'fixture',output:[{content:[{type:'output_text',text:'Observado: R$ 100 de entradas. Base: fluxo de caixa em 01/10/2026. Projeções: insuficientes. Recomendação: conciliar recebimentos.'}]}]})};
 };
 const run=async()=>{let status=200,body;await handler({method:'POST',headers:{authorization:'Bearer adm'},body:{question:'Resumo financeiro',start:'2026-10-01',end:'2026-10-01',cashflow:[{value:99999}]}},{setHeader(){},status(v){status=v;return this},json(v){body=v}});return {status,body}};
 try{const r=await run();assert.equal(r.status,200);assert.equal(r.body.modo,'ia');assert.equal(r.body.base.observado.fluxo_caixa.entradas,100);assert.ok(!JSON.stringify(payload).includes('99999'));assert.match(payload.instructions,/Nunca invente/);assert.match(r.body.resposta,/Base:/);incomplete=true;assert.equal((await run()).status,503)}finally{global.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key}
});
