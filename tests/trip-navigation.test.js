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
test('cloud initialization finishing after Open refreshes the same detail, not the list',async()=>{
 const s=setup();let finishLoad,refreshes=0;
 const response=new Promise(resolve=>{finishLoad=resolve});
 const cloudRows=JSON.parse(JSON.stringify(s.context.db));cloudRows.trips[0].city='Penha sincronizada';
 Object.assign(s.context,{structuredClone,localStorage:{getItem:()=>null,setItem(){}},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout,console,CustomEvent:class{}});
 s.context.document.dispatchEvent=()=>{};s.context.addEventListener=()=>{};
 s.context.render=()=>{refreshes++;s.context.trips()};
 s.context.IntegralERP={sb:{auth:{getSession:async()=>({data:{session:{user:{id:'test'}}}})},from:()=>({select:()=>response,upsert:()=>assert.fail('Existing records must not be rewritten')})}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/financeiro-cloud-storage.js'),'utf8'),s.context);
 const loading=s.context.IntegralFinanceCloudStorage.initialize();
 s.api.detail(1);
 finishLoad({data:Object.entries(cloudRows).map(([chave,dados])=>({chave,dados}))});
 assert.equal(await loading,true);assert.equal(refreshes,1);
 assert.equal(s.heading(),'Viagem • Penha sincronizada');
 assert.equal(s.context.db.trips[0].city,'Penha sincronizada');
});
