const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/financeiro-cloud-storage.js'),'utf8');
const copy=v=>JSON.parse(JSON.stringify(v));

async function fixture({admin=false,server,local={},cache=null,upsertError}={}){
 const store=new Map(),writes=[],rpcs=[];
 if(cache)store.set('integral_fin_v1',JSON.stringify(cache));
 const files=new Map();
 const context={console:{log(){},warn(){},error(){}},structuredClone,
  db:copy(local),user:{role:admin?'Administrador':'Funcionário',erpId:'u1',name:'U'},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},
  document:{dispatchEvent(){}},CustomEvent:function(){},render(){},addEventListener(){},
  save(){store.set('integral_fin_v1',JSON.stringify(context.db))}};
 context.window=context;
 context.IntegralERP={sb:{
  auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}}),onAuthStateChange(){}},
  from(){return{
   select:()=>{const rows=keys=>({data:Object.entries(server).filter(([k])=>!keys||keys.includes(k)).map(([chave,dados])=>({chave,dados:copy(dados)}))});return{then:(ok,fail)=>Promise.resolve(rows()).then(ok,fail),in:async(_c,keys)=>rows(keys)}},
   upsert:async rows=>{writes.push(copy(rows));for(const r of rows){const e=upsertError?.(r);if(e)return{error:e}}for(const r of rows)server[r.chave]=copy(r.dados);return{error:null}}
  }},
  rpc:async(name,args)=>{rpcs.push(name);if(name==='is_admin')return{data:admin,error:null};if(name==='financeiro_guardar_arquivo'){const id='arq-'+(files.size+1);files.set(id,args.p_conteudo);return{data:id,error:null}}return{error:{message:'rpc inesperada'}}}
 }};
 vm.createContext(context);vm.runInContext(source,context);
 const api=context.IntegralFinanceCloudStorage;assert.equal(await api.initialize(),true);
 return {context,api,server,writes,rpcs,files,store};
}

test('usuário limitado: módulos sem acesso somem da memória e do cache e nunca são enviados',async()=>{
 const f=await fixture({server:{trips:[{id:1,city:'A'}]},cache:{trips:[{id:1,city:'A'}],hrPeople:[{id:1,name:'Fulano',currentValue:9000}],cashflow:[{id:1}]},local:{hrPeople:[{id:9}]}});
 assert.deepEqual(copy(f.context.db.hrPeople),[]);assert.deepEqual(copy(f.context.db.cashflow),[]);
 assert.ok(!f.store.get('integral_fin_v1').includes('Fulano'),'salário antigo apagado do cache local');
 assert.equal(f.writes.length,0,'não cria módulos');
 f.context.db.hrPeople.push({id:2});f.context.db.trips[0].city='B';
 assert.equal(await f.api.push(),true);
 assert.deepEqual(f.writes.flat().map(r=>r.chave),['trips']);
});

test('salvar viagem não desfaz o que outro usuário gravou depois do carregamento',async()=>{
 const server={tripExpenses:[{id:1,value:10,status:'Registrado'},{id:2,value:20}],trips:[{id:7,city:'X',status:'Planejada',assigned:[1]}]};
 const f=await fixture({server});
 // outro usuário (ADM) altera a despesa 1, exclui a 2 e muda o status da viagem
 server.tripExpenses=[{id:1,value:10,status:'Aprovada'},{id:3,value:30}];
 server.trips=[{id:7,city:'X',status:'Em andamento',assigned:[1,5]}];
 // este usuário adiciona a despesa 4 e corrige a cidade, a partir da cópia antiga
 f.context.db.tripExpenses.push({id:4,value:40});f.context.db.trips[0].city='Y';
 assert.equal(await f.api.push(),true);
 assert.deepEqual(f.server.tripExpenses,[{id:1,value:10,status:'Aprovada'},{id:3,value:30},{id:4,value:40}]);
 assert.deepEqual(f.server.trips,[{id:7,city:'Y',status:'Em andamento',assigned:[1,5]}]);
 assert.deepEqual(copy(f.context.db.tripExpenses),f.server.tripExpenses,'tela recebe a versão mesclada');
});

test('mesmo campo alterado nos dois lados: prevalece o valor local, como antes',async()=>{
 const server={budgetExpenses:[{id:1,value:10,history:['a']}]};
 const f=await fixture({server});
 server.budgetExpenses=[{id:1,value:11,history:['a','b']}];
 f.context.db.budgetExpenses[0].value=12;f.context.db.budgetExpenses[0].history.push('c');
 assert.equal(await f.api.push(),true);
 assert.deepEqual(f.server.budgetExpenses,[{id:1,value:12,history:['a','c','b']}]);
});

test('erro permanente em um módulo não trava os outros nem repete sem parar',async()=>{
 const server={budgetRecords:[{id:1,name:'A'}],trips:[{id:1}]};
 const f=await fixture({server,upsertError:r=>r.chave==='budgetRecords'?{code:'42501',message:'Somente ADM pode fechar ou alterar o encerramento de orçamentos.'}:null});
 f.context.db.budgetRecords[0].name='B';f.context.db.trips.push({id:2});
 assert.equal(await f.api.push(),false);
 assert.deepEqual(f.server.trips,[{id:1},{id:2}],'viagens salvas mesmo com o orçamento recusado');
 const before=f.writes.length;assert.equal(await f.api.push(),false);assert.equal(f.writes.length,before,'não reenvia o mesmo conteúdo recusado');
 f.context.db.budgetRecords[0].name='C';await f.api.push();assert.equal(f.writes.length,before+1,'nova alteração tenta de novo');
});

test('comprovante novo vai para financeiro_arquivos e o módulo leva só o arquivoId',async()=>{
 const server={tripExpenses:[]};
 const f=await fixture({server});
 const dataUrl='data:image/png;base64,'+'A'.repeat(5000);
 f.context.db.tripExpenses.push({id:1,file:{name:'cupom.png',type:'image/png',dataUrl}});
 assert.equal(await f.api.push(),true);
 assert.deepEqual(f.server.tripExpenses,[{id:1,file:{name:'cupom.png',type:'image/png',arquivoId:'arq-1'}}]);
 assert.equal(f.files.get('arq-1'),dataUrl);
 assert.ok(JSON.stringify(f.writes).length<1000,'envio pequeno');
});

test('ADM continua criando módulos novos',async()=>{
 const f=await fixture({admin:true,server:{trips:[]},local:{planRevenues:[{id:1}]}});
 assert.deepEqual(f.server.planRevenues,[{id:1}]);
 f.context.db.dreOverrides={a:1};assert.equal(await f.api.push(),true);assert.deepEqual(f.server.dreOverrides,{a:1});
});
