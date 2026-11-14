const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../public/patch-v26-trip-ai.js'),'utf8');
function setup(){
 const content={innerHTML:''},buttons=new Map();let heading='';
 const context={db:{trips:[{id:1,city:'Penha',sector:'Projetos'},{id:2,city:'Penha',sector:'Topografia'}],tripExpenses:[],tripDocuments:[],usersMvp:[]},user:{role:'Administrador',sector:'Projetos'},IntegralTripDocuments:{},title:t=>{heading=t},money:n=>String(n),document:{querySelector:s=>{if(s==='#content')return content;if(!content.innerHTML.includes(`id="${s.slice(1)}"`))return null;if(!buttons.has(s))buttons.set(s,{});return buttons.get(s)},querySelectorAll:()=>[]}};
 context.window=context;vm.runInNewContext(code,context);
 return {context,api:context.IntegralFinanceTripsAI,content,buttons,heading:()=>heading};
}
test('initial route is the list',()=>{const s=setup();s.context.trips();assert.equal(s.heading(),'Viagens')});
test('normal rerender preserves open trip and refreshes its data',()=>{const s=setup();s.api.detail('1');s.context.db.trips[0].city='Penha atualizada';s.context.trips();assert.equal(s.heading(),'Viagem • Penha atualizada');assert.ok(s.content.innerHTML.includes('trip26Back'))});
test('explicit Back returns to list and subsequent refresh stays on list',()=>{const s=setup();s.api.detail(1);s.buttons.get('#trip26Back').onclick();s.context.trips();assert.equal(s.heading(),'Viagens')});
test('identity uses ID, not city name or object reference',()=>{const s=setup();s.api.detail(2);s.context.db.trips=JSON.parse(JSON.stringify(s.context.db.trips));s.context.db.trips[1].city='Segunda viagem';s.api.render();assert.equal(s.heading(),'Viagem • Segunda viagem')});
test('removed trip resets route without a render loop',()=>{const s=setup();s.api.detail(1);s.context.db.trips=[];s.context.trips();s.context.trips();assert.equal(s.heading(),'Viagens')});
test('permission checks still apply after data refresh',()=>{const s=setup();s.api.detail(2);s.context.user={role:'Funcionário',sector:'Projetos'};s.context.trips();assert.equal(s.heading(),'Viagens');assert.ok(!s.content.innerHTML.includes('data-trip26-open="2"'))});
test('directly assigned employee retains access to open detail',()=>{const s=setup();s.context.db.usersMvp=[{id:10,email:'staff@example.invalid'}];s.context.db.trips[1].assigned=[10];s.context.user={role:'Funcionário',sector:'Projetos',email:'staff@example.invalid'};s.api.detail(2);s.context.trips();assert.equal(s.heading(),'Viagem • Penha')});
test('route changes do not mutate or persist business records',()=>{const s=setup(),before=JSON.stringify(s.context.db);s.context.save=()=>assert.fail('Navigation must not save');s.api.detail(1);s.context.trips();s.api.list();assert.equal(JSON.stringify(s.context.db),before)});
test('an approved request protects its trip even when the reciprocal reference is legacy',()=>{
 const s=setup();
 s.context.db.invoiceRequests=[{id:'pedido',category:'trip',status:'Aprovada',convertedId:'1'}];
 s.context.db.tripExpenses=[{id:10,tripId:1,description:'Despesa preservada'}];
 s.api.detail(1);
 assert.match(s.content.innerHTML,/exclusão desta viagem está indisponível/);
 assert.match(s.content.innerHTML,/Despesa preservada/);
 assert.doesNotMatch(s.content.innerHTML,/trip26Delete/);
 assert.match(s.content.innerHTML,/trip26Edit/);
 s.api.detail(2);
 assert.match(s.content.innerHTML,/trip26Delete/);
 const staleDelete=s.buttons.get('#trip26Delete').onclick;
 s.context.db.trips[1].invoiceRequestId='novo-pedido';
 s.context.save=()=>assert.fail('Linked records must not be deleted');
 staleDelete();
 assert.equal(s.context.db.trips.length,2);
 assert.equal(s.context.db.tripExpenses.length,1);
});
test('trip deletion never cascades to expenses or documents',()=>{
 const s=setup();
 s.context.db.tripExpenses=[{id:21,tripId:1,value:12}];
 s.context.db.tripDocuments=[{id:22,tripId:2,file:{name:'arquivo.pdf'}}];
 for(const id of [1,2]){
  s.api.detail(id);
  assert.doesNotMatch(s.content.innerHTML,/trip26Delete/);
 }
 assert.equal(s.context.db.tripExpenses.length,1);
 assert.equal(s.context.db.tripDocuments.length,1);
});
test('identical copies of a trip render once without changing records or links',()=>{
 const s=setup();
 s.context.db.trips=[{id:7,city:'Vistoria',status:'Concluída'},{status:'Concluída',city:'Vistoria',id:7}];
 s.context.db.tripExpenses=[{id:8,tripId:7,value:12,description:'Gasto sintético'}];
 s.context.db.tripDocuments=[{id:9,tripId:7,file:{name:'comprovante.pdf'}}];
 const before=JSON.stringify(s.context.db);
 s.context.save=()=>assert.fail('Rendering must not save');
 s.api.list();
 assert.equal(s.content.innerHTML.match(/data-trip26-open="7"/g)?.length,1);
 assert.match(s.content.innerHTML,/id="finCompletedTrips".*data-trip26-open="7"/);
 s.api.detail('7');
 assert.match(s.content.innerHTML,/Gasto sintético/);
 assert.match(s.content.innerHTML,/comprovante\.pdf/);
 assert.match(s.content.innerHTML,/disponível para consulta/);
 assert.doesNotMatch(s.content.innerHTML,/trip26Edit|trip26Delete|trip26Manual|trip26Upload|data-trip26-review/);
 assert.equal(JSON.stringify(s.context.db),before);
});
test('distinct trip IDs stay open and keep their own expenses and documents',()=>{
 const s=setup(),shared={city:'Penha',start:'2026-11-13',end:'2026-11-13',sector:'Projetos',employee:'Equipe',project:'Vistoria',assigned:[10,12]};
 s.context.db.trips=[{id:1,...shared},{id:2,...shared,city:' penha ',assigned:['12','10']},{id:3,...shared,city:'Outra cidade',invoiceRequestId:'req'},{id:4,...shared,city:'Terceira cidade',invoiceRequestId:'req'},{id:5,...shared,assigned:[10]}];
 s.context.db.tripExpenses=[{id:8,tripId:1,value:12,description:'Gasto exclusivo'}];
 s.context.db.tripDocuments=[{id:9,tripId:2,file:{name:'comprovante-exclusivo.pdf'}}];
 s.api.list();
 assert.equal(s.content.innerHTML.match(/Viagem semelhante com outro ID/g)?.length,2);
 assert.equal(s.content.innerHTML.match(/Outra viagem vinculada à mesma solicitação/g)?.length,2);
 for(const id of [1,2,3,4,5])assert.match(s.content.innerHTML,new RegExp(`data-trip26-open="${id}"`));
 s.api.detail(1);
 assert.match(s.content.innerHTML,/Gasto exclusivo/);
 assert.doesNotMatch(s.content.innerHTML,/comprovante-exclusivo/);
 s.api.detail(2);
 assert.doesNotMatch(s.content.innerHTML,/Gasto exclusivo/);
 assert.match(s.content.innerHTML,/comprovante-exclusivo/);
});
test('a repeated ID with conflicting data does not open an arbitrary trip',()=>{
 const s=setup();
 s.context.db.trips.push({id:'1',city:'Outra versão',sector:'Projetos',status:'Finalizada'});
 s.context.db.tripExpenses=[{id:8,tripId:1,value:983,description:'Gasto de atribuição ambígua'}];
 s.api.detail(1);
 assert.equal(s.heading(),'Viagens');
 assert.equal(s.content.innerHTML.match(/ID de viagem em conflito/g)?.length,2);
 assert.match(s.content.innerHTML,/Outra versão/);
 assert.doesNotMatch(s.content.innerHTML,/data-trip26-open="1"|983/);
});
test('similarity and shared references use only trips visible to the active profile',()=>{
 const s=setup();
 s.context.db.trips[0].invoiceRequestId='req';
 s.context.db.trips[1].invoiceRequestId='req';
 s.context.user={role:'Funcionário',sector:'Projetos'};
 s.api.list();
 assert.match(s.content.innerHTML,/data-trip26-open="1"/);
 assert.doesNotMatch(s.content.innerHTML,/Outra viagem vinculada|data-trip26-open="2"/);
});
test('cloud initialization finishing after Open refreshes the same detail, not the list',async()=>{
 const s=setup();let finishLoad,refreshes=0;
 const response=new Promise(resolve=>{finishLoad=resolve});
 const cloudRows=JSON.parse(JSON.stringify(s.context.db));cloudRows.trips[0].city='Penha sincronizada';
 Object.assign(s.context,{structuredClone,localStorage:{getItem:()=>null,setItem(){}},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,console,CustomEvent:class{}});
 s.context.document.dispatchEvent=()=>{};s.context.addEventListener=()=>{};
 s.context.render=()=>{refreshes++;s.context.trips()};
 s.context.IntegralERP={sb:{rpc:async()=>({error:{code:'PGRST202'}}),auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},from:()=>({select:()=>response,upsert:()=>assert.fail('Existing records must not be rewritten')})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/financeiro-cloud-storage.js'),'utf8'),s.context);
 const loading=s.context.IntegralFinanceCloudStorage.initialize();
 s.api.detail(1);
 finishLoad({data:Object.entries(cloudRows).map(([chave,dados])=>({chave,dados}))});
 assert.equal(await loading,true);assert.equal(refreshes,1);
 assert.equal(s.heading(),'Viagem • Penha sincronizada');
 assert.equal(s.context.db.trips[0].city,'Penha sincronizada');
});
