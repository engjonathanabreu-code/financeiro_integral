// FIN-01, FIN-02, FIN-14 e FIN-16: duas sessões no mesmo módulo, conflitos, reconexão, recarga,
// troca de usuário e atualização a partir do servidor. Dados sintéticos.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fakeModules,copy}=require('./fake-modulos-supabase.cjs');
const source=fs.readFileSync(path.join(__dirname,'../public/financeiro-cloud-storage.js'),'utf8');
const turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};

function shared(server){
 const hooks={},writes=[];
 const table=fakeModules(server,{beforeWrite:async row=>{writes.push(row);return (await hooks.write?.(row))||null}});
 return {server,table,hooks,writes};
}
async function client(world,{uid='u1',admin=false,store=new Map(),local={},versioned=true,modal=false}={}){
 const listeners={};
 const context={console:{log(){},warn(){},error(){}},structuredClone,
  db:copy(local),user:{role:admin?'Administrador':'Funcionário',erpId:uid,name:uid},
  localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
  setTimeout(){return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},
  navigator:{onLine:true},
  document:{dispatchEvent(){},querySelector:q=>modal&&q==='.modal-backdrop'?{}:null,activeElement:null,addEventListener(){}},
  CustomEvent:function(){},render(){context.renders++},renders:0,addEventListener(){},
  save(){store.set('integral_fin_v1',JSON.stringify(context.db))}};
 context.window=context;
 let auth=null;const sessionRef={uid};
 context.IntegralERP={sb:{
  auth:{getSession:async()=>({data:{session:sessionRef.uid?{user:{id:sessionRef.uid},access_token:'t'}:null}}),onAuthStateChange(fn){auth=fn}},
  from(){return{select:cols=>{
   if(!versioned&&/revisao/.test(cols))return {then:(ok,f)=>Promise.resolve({data:null,error:{code:'42703',message:'column financeiro_estado_modulos.revisao does not exist'}}).then(ok,f),in:async()=>({data:null,error:{code:'42703',message:'column revisao does not exist'}})};
   return {then:(ok,f)=>Promise.resolve(world.table.rows()).then(ok,f),in:async(_c,keys)=>world.table.rows(keys)};
  },upsert:async rows=>{for(const r of rows){world.writes.push({chave:r.chave,dados:r.dados,legado:true});world.server[r.chave]=copy(r.dados)}return {error:null}}}},
  rpc:async(name,args)=>{
   if(name==='is_admin')return {data:admin,error:null};
   if(name==='financeiro_salvar_modulo')return versioned?world.table.save(args):{data:null,error:{code:'PGRST202',message:'Could not find the function public.financeiro_salvar_modulo'}};
   if(name==='financeiro_guardar_arquivo')return {data:'arq',error:null};
   return {data:null,error:{message:'rpc inesperada '+name}};
  }
 }};
 vm.createContext(context);vm.runInContext(source,context);
 const api=context.IntegralFinanceCloudStorage;assert.equal(await api.initialize(),true);
 return {context,api,store,signOut:()=>{sessionRef.uid=null;auth?.('SIGNED_OUT',null)},signIn:id=>{sessionRef.uid=id;auth?.('SIGNED_IN',{user:{id}})},setModal:v=>{modal=v}};
}
const base=()=>({trips:[{id:1,city:'A',status:'Planejada',assigned:[1]},{id:2,city:'B',status:'Planejada',assigned:[2]}],tripExpenses:[{id:10,tripId:1,value:5}]});

test('duas sessões salvando registros diferentes ao mesmo tempo: as duas alterações permanecem',async()=>{
 const world=shared(base());
 const a=await client(world,{uid:'a'}),b=await client(world,{uid:'b'});
 const gate=deferred();let paused=false;
 world.hooks.write=async row=>{if(!paused&&row.dados[0]?.city==='A-editado'){paused=true;await gate.promise}};
 a.context.db.trips[0].city='A-editado';b.context.db.trips[1].city='B-editado';
 const pa=a.api.push();await turn();                    // A leu a revisão 1 e está no meio da gravação
 assert.equal(await b.api.push(),true);                 // B grava a revisão 2 nesse intervalo
 gate.resolve();assert.equal(await pa,true);            // A recebe conflito, mescla e grava a revisão 3
 assert.deepEqual(world.server.trips.map(t=>t.city),['A-editado','B-editado']);
 assert.equal(world.table.rev('trips'),3);
 assert.equal(a.api.conflicts().length,0);
 assert.deepEqual(copy(a.context.db.trips),world.server.trips,'A já vê a alteração de B');
 assert.equal(await b.api.refresh(),true);assert.deepEqual(copy(b.context.db.trips),world.server.trips,'B recebe a de A');
});

test('duas sessões no mesmo campo: o segundo vê conflito, ninguém é sobrescrito em silêncio',async()=>{
 const world=shared(base());
 const a=await client(world,{uid:'a'}),b=await client(world,{uid:'b'});
 a.context.db.trips[0].status='Em andamento';assert.equal(await a.api.push(),true);
 b.context.db.trips[0].status='Concluída';b.context.db.trips[0].city='A2';assert.equal(await b.api.push(),true);
 assert.equal(world.server.trips[0].status,'Em andamento','valor salvo antes permanece');
 assert.equal(world.server.trips[0].city,'A2','campo sem conflito é gravado');
 const c=b.api.conflicts();assert.equal(c.length,1);assert.equal(c[0].local,'Concluída');assert.equal(c[0].servidor,'Em andamento');
 assert.equal(b.api.status(),'conflito');
 assert.equal(b.api.resolveConflict(c[0].id,false),true);assert.equal(b.api.conflicts().length,0);
 assert.equal(world.server.trips[0].status,'Em andamento');
});

test('exclusão concorrente com edição: o registro editado é mantido e o conflito informado',async()=>{
 const world=shared(base());
 const a=await client(world,{uid:'a',admin:true}),b=await client(world,{uid:'b'});
 a.context.db.trips.splice(1,1);assert.equal(await a.api.push(),true);
 assert.equal(world.server.trips.length,1);
 b.context.db.trips[1].city='B editada depois';assert.equal(await b.api.push(),true);
 assert.deepEqual(world.server.trips.map(t=>t.id),[1,2],'edição não se perde');
 assert.equal(b.api.conflicts()[0].tipo,'excluido-no-servidor-alterado-aqui');
 // o inverso: B exclui, A tinha editado (lado servidor) — a edição permanece
 const w2=shared(base()),x=await client(w2,{uid:'x'}),y=await client(w2,{uid:'y',admin:true});
 x.context.db.trips[1].city='editada';await x.api.push();
 y.context.db.trips.splice(1,1);await y.api.push();
 assert.equal(w2.server.trips.find(t=>t.id===2).city,'editada');
 assert.equal(y.api.conflicts()[0].tipo,'excluido-aqui-alterado-no-servidor');
});

test('nenhum sucesso sem confirmação do servidor; queda de conexão guarda e reenvia',async()=>{
 const world=shared(base());const store=new Map();
 const a=await client(world,{uid:'a',store});
 world.hooks.write=()=>({message:'Failed to fetch'});
 a.context.db.trips[0].city='offline';a.context.save();
 assert.equal(await a.api.push(),false,'falha de rede não é sucesso');
 assert.equal(a.api.status(),'falha');assert.equal(world.server.trips[0].city,'A');
 const pend=JSON.parse(store.get('integral_fin_pendente_v2:a'));assert.equal(pend.keys.trips.local[0].city,'offline');
 // Recarrega a página (mesmo navegador, mesma pessoa) com a conexão de volta.
 delete world.hooks.write;world.server.trips[1].city='B-servidor';
 const again=await client(world,{uid:'a',store,local:JSON.parse(store.get('integral_fin_v1'))});
 assert.equal(await again.api.push(),true);
 assert.deepEqual(world.server.trips.map(t=>t.city),['offline','B-servidor'],'rascunho reaplicado sobre a versão nova');
 assert.equal(store.has('integral_fin_pendente_v2:a'),false,'rascunho apagado depois de confirmado');
});

test('resposta sem confirmação explícita não é tratada como salvo',async()=>{
 const world=shared(base());const a=await client(world,{uid:'a'});
 world.table.save=async()=>({data:null,error:null});
 a.context.db.trips[0].city='x';assert.equal(await a.api.push(),false);
});

test('persistência após recarga: a outra pessoa vê o dado gravado',async()=>{
 const world=shared(base());
 const a=await client(world,{uid:'a'});a.context.db.tripExpenses.push({id:11,tripId:1,value:7});assert.equal(await a.api.push(),true);
 const b=await client(world,{uid:'b'});assert.deepEqual(copy(b.context.db.tripExpenses).map(e=>e.id),[10,11]);
});

test('troca de usuário: cache de outra pessoa não entra na mescla; logout limpa e guarda rascunho só para o dono',async()=>{
 const world=shared(base());const store=new Map();
 const a=await client(world,{uid:'a',store,admin:true,local:{hrPeople:[{id:1,name:'Pessoa sintética'}]}});
 assert.deepEqual(world.server.hrPeople,[{id:1,name:'Pessoa sintética'}]);
 world.hooks.write=()=>({message:'Failed to fetch'});
 a.context.db.trips[0].city='rascunho de A';a.context.save();await a.api.push();
 a.signOut();
 assert.equal(store.has('integral_fin_v1'),false,'cache compartilhado removido no logout');
 assert.deepEqual(copy(a.context.db.trips),[],'dados fora da memória');
 assert.ok(store.get('integral_fin_pendente_v2:a').includes('rascunho de A'),'rascunho guardado para A');
 delete world.hooks.write;
 // Outra pessoa (sem acesso a RH) entra no mesmo navegador, com cache antigo de A ainda presente.
 store.set('integral_fin_v1',JSON.stringify({trips:[{id:1,city:'rascunho de A'}],hrPeople:[{id:9,name:'cache antigo'}],planRevenues:[{id:1}]}));store.set('integral_fin_v1_dono','a');
 const b=await client(world,{uid:'b',store,local:JSON.parse(store.get('integral_fin_v1'))});
 assert.equal(b.context.db.trips[0].city,'A','B não herda o rascunho de A');
 assert.ok(!JSON.stringify(b.context.db).includes('cache antigo'),'nada do cache de A fica na memória de B');
 assert.equal(await b.api.push(),true);assert.equal(world.server.trips[0].city,'A');
 assert.equal(world.server.planRevenues,undefined,'nada do cache de A é criado no servidor');
 // A volta: o rascunho é reaplicado.
 const a2=await client(world,{uid:'a',store,admin:true});
 assert.equal(await a2.api.push(),true);assert.equal(world.server.trips[0].city,'rascunho de A');
});

test('FIN-02: atualização remota aplicada sem ciclo de gravação e sem perder edição local pendente',async()=>{
 const world=shared(base());
 const a=await client(world,{uid:'a'});const writes=world.writes.length;
 world.server.trips[1].city='remoto';
 a.context.db.trips[0].city='local pendente';
 assert.equal(await a.api.refresh(),true);
 assert.equal(a.context.db.trips[1].city,'remoto');assert.equal(a.context.db.trips[0].city,'local pendente');
 assert.equal(world.writes.length,writes,'atualizar não grava nada');
 assert.equal(await a.api.refresh(),false,'sem revisão nova, nada a fazer (evento duplicado)');
 assert.equal(await a.api.push(),true);assert.deepEqual(world.server.trips.map(t=>t.city),['local pendente','remoto']);
 assert.equal(await a.api.refresh(),false,'a própria gravação não volta como mudança remota');
});

test('FIN-02: com formulário aberto a atualização espera; depois aplica',async()=>{
 const world=shared(base());const a=await client(world,{uid:'a',modal:true});
 const before=a.context.renders;world.server.trips[0].city='remoto';
 assert.equal(await a.api.refresh(),false);assert.equal(a.context.db.trips[0].city,'A');assert.equal(a.context.renders,before);
 a.setModal(false);assert.equal(await a.api.refresh(),true);assert.equal(a.context.db.trips[0].city,'remoto');assert.ok(a.context.renders>before);
});

test('sem a migration aplicada: continua salvando pelo caminho antigo (compatibilidade de implantação)',async()=>{
 const world=shared(base());const a=await client(world,{uid:'a',versioned:false});
 a.context.db.trips[0].city='compat';assert.equal(await a.api.push(),true);
 assert.equal(world.server.trips[0].city,'compat');assert.ok(world.writes.at(-1).legado);
});

test('erro permanente: aviso não manda recarregar; descartar volta à versão do servidor',async()=>{
 const world=shared(base());const a=await client(world,{uid:'a'});
 world.hooks.write=()=>({code:'42501',message:'Somente ADM pode aprovar.'});
 a.context.db.trips[0].status='Aprovada';assert.equal(await a.api.push(),false);
 assert.equal(a.api.status(),'falha');assert.equal(a.context.db.trips[0].status,'Aprovada','alteração local preservada até a pessoa decidir');
});
