const test=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/agente-financeiro'),{analyze,forModel}=require('../lib/financial-consultant');

const base={cashflow:[
 {id:1,date:'2026-08-10',direction:'Entrada',value:1000,kind:'Receita parcelada de clientes',description:'Cobrança'},
 {id:2,date:'2026-09-10',direction:'Entrada',value:800,kind:'Receita de contratos públicos',description:'Prefeitura'},
 {id:3,date:'2026-09-12',direction:'Saída',value:300,kind:'Tributos',description:'Simples'},
 {id:4,date:'2026-09-20',direction:'Saída',value:200,kind:'Retirada e distribuição aos sócios',description:'Retirada Fulano'}],
 accountMasters:[{id:'m1',name:'Aluguel sala',category:'Outros'}],accountPayments:[{id:1,accountId:'m1',status:'Paga',value:100,paidAt:'2026-09-05T10:00:00Z'}]};

test('séries mensais, composição, DRE e indicadores usam as mesmas regras da aba DRE',()=>{
 const r=analyze(base,[{vencimento:'2026-09-10',valor_previsto:50,status:'Pago',pago_em:'2026-09-11',valor_liquidado:50},{vencimento:'2026-09-15',valor_previsto:50,status:'Pendente',valor_liquidado:0}],{start:'2026-09-01',end:'2026-09-30'},'2026-10-01');
 assert.deepEqual(r.series.fluxo_mensal.map(x=>x.mes),['2026-08','2026-09']);
 assert.equal(r.series.fluxo_mensal[1].saidas,600);
 assert.equal(r.composicao.saidas_por_natureza[0].nome,'Tributos');
 assert.equal(r.dre.receita_bruta,800);assert.equal(r.dre.deducoes,-300);assert.equal(r.dre.distribuicao_socios,-200);
 assert.equal(r.dre.resultado_liquido,400);assert.equal(r.dre.geracao_caixa,200);
 assert.equal(r.indicadores.inadimplencia_do_periodo_pct,50);
 assert.equal(r.series.recebimentos_mensal.at(-1).adimplencia_pct,50);
 assert.equal(r.detalhe.maiores_saidas[0].valor,300);
 assert.ok(!JSON.stringify(forModel(r)).includes('Retirada Fulano'),'descrições linha a linha não vão para a IA');
});

test('marcador de gráficos é removido do texto e só aceita ids conhecidos',()=>{
 const {chartsFrom}=handler._test;
 assert.deepEqual(chartsFrom('Texto.\n[[graficos: fluxo_mensal, inventado, dre_resumo]]'),{texto:'Texto.',graficos:['fluxo_mensal','dre_resumo']});
 assert.deepEqual(chartsFrom('Sem gráfico'),{texto:'Sem gráfico',graficos:[]});
});

const auth=async(url)=>{if(url.includes('/auth/'))return {ok:true,json:async()=>({id:'adm'})};if(url.includes('/profiles?'))return {ok:true,json:async()=>[{tipo:'Administrador',ativo:true}]};if(url.includes('/rpc/'))return {ok:true,json:async()=>base};if(url.includes('/fin_receb_'))return {ok:true,json:async()=>[]};return null};

test('modo indicadores responde sem IA; relatório devolve JSON estruturado; leitura fica em cache na conversa',async()=>{
 const previous=global.fetch,key=process.env.OPENAI_API_KEY;let rpc=0,payload;
 process.env.OPENAI_API_KEY='k';handler._test.cache.clear();
 global.fetch=async(url,opts)=>{if(url.includes('/rpc/'))rpc++;const a=await auth(url);if(a)return a;payload=JSON.parse(opts.body);return {ok:true,json:async()=>({status:'completed',model:'fixture',output_text:JSON.stringify({titulo:'T',mensagem_chave:'M',resumo_executivo:'R',diagnostico:[],riscos:[],recomendacoes:[],proximos_passos:[],graficos:['fluxo_mensal','xyz']})})}};
 const run=async body=>{let status=200,out;await handler({method:'POST',headers:{authorization:'Bearer t'},body:{start:'2026-09-01',end:'2026-09-30',...body}},{setHeader(){},status(v){status=v;return this},json(v){out=v}});return {status,out}};
 try{
  const a=await run({mode:'indicadores'});assert.equal(a.status,200);assert.equal(a.out.modo,'indicadores');assert.equal(payload,undefined);
  const b=await run({mode:'relatorio'});assert.equal(b.status,200);assert.equal(b.out.relatorio.titulo,'T');assert.deepEqual(b.out.relatorio.graficos,['fluxo_mensal']);
  assert.equal(payload.text.format.type,'json_schema');assert.match(payload.instructions,/Nunca invente/);
  assert.equal(rpc,1,'segunda chamada usa o cache');
  await run({mode:'indicadores',refresh:true});assert.equal(rpc,2);
 }finally{global.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key}
});

test('chat em streaming repassa o texto em NDJSON e encerra com os gráficos',async()=>{
 const previous=global.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='k';handler._test.cache.clear();
 const enc=new TextEncoder(),events=['Fechamos ','no azul.\n[[graficos: fluxo_mensal]]'].map(d=>`data: ${JSON.stringify({type:'response.output_text.delta',delta:d})}\n\n`).concat(`data: ${JSON.stringify({type:'response.completed',response:{model:'fixture'}})}\n\n`);
 global.fetch=async(url,opts)=>{const a=await auth(url);if(a)return a;assert.equal(JSON.parse(opts.body).stream,true);return {ok:true,body:new ReadableStream({start(c){events.forEach(e=>c.enqueue(enc.encode(e)));c.close()}})}};
 let written='',ended=false;const res={statusCode:0,setHeader(){},status(){return this},json(){throw Error('não deveria responder JSON')},write(s){written+=s},end(){ended=true}};
 try{
  await handler({method:'POST',headers:{authorization:'Bearer t'},body:{question:'Como fechamos?',stream:true,start:'2026-09-01',end:'2026-09-30'}},res);
  const lines=written.trim().split('\n').map(l=>JSON.parse(l));
  assert.equal(lines[0].type,'meta');assert.ok(lines[0].base.dre);
  assert.equal(lines.filter(l=>l.type==='delta').map(l=>l.text).join(''),'Fechamos no azul.\n[[graficos: fluxo_mensal]]');
  assert.deepEqual(lines.at(-1),{type:'done',modelo:'fixture',graficos:['fluxo_mensal']});assert.ok(ended);
 }finally{global.fetch=previous;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key}
});
