const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {id}=require('./veiculos-fixtures.cjs');
const request=()=>({id:id(10),requesterId:id(2),requesterName:'Pessoa sintética',requesterLocalUserId:null,requesterSector:'Projetos',category:'trip',status:'Pendente',title:'Vistoria',vehicleId:'hb20',neededAt:'2099-01-01',estimatedValue:10});
function load(users=[]){
 const elements=new Map();const root={remove(){},querySelector:s=>{if(!elements.has(s))elements.set(s,{value:'Revisado',disabled:false,addEventListener(){}});return elements.get(s)},querySelectorAll:()=>[]};
 const context={db:{usersMvp:users,trips:[],invoiceRequests:[],budgetRecords:[],accountMasters:[],accountPayments:[]},user:{role:'Administrador'},window:{},document:{createElement:()=>root,body:{append(){}},querySelector:()=>({}),querySelectorAll:()=>[]},structuredClone,alerts:[],confirm:()=>true,save(){},renderInvoices(){},alert(m){context.alerts.push(m)},calls:0};
 context.window.IntegralERP={sb:{auth:{getUser:async()=>({data:{user:{id:id(1)}}})},rpc:async(name,args)=>{context.calls++;return {data:[args.p_request]}}}};
 const source=fs.readFileSync(path.join(__dirname,'../public/financeiro-invoices.js'),'utf8').replace('boot();','window.test={conversion,detailModal};');vm.createContext(context);vm.runInContext(source,context);return {context,api:context.window.test,elements};
}
test('conversão: usa UUID ativo único e ignora nome homônimo/ID local adulterado',()=>{
 const {context,api}=load([{id:7,erpId:id(3),name:'Pessoa sintética'},{id:8,erpId:id(2),name:'Nome atualizado'}]);
 const a={...request(),requesterLocalUserId:7};const before=structuredClone(a);api.conversion(a);assert.deepEqual(a,before);assert.equal(context.db.trips[0].assigned[0],8);assert.equal(context.db.trips[0].invoiceRequestId,a.id);assert.equal(context.db.trips[0].plannedAmount,10);
});
test('conversão: sem vínculo, homônimo, inativo ou ambíguo não geram viagem',()=>{
 for(const users of [[],[{id:7,name:'Pessoa sintética'}],[{id:7,erpId:id(2),active:false}],[{id:7,erpId:id(2),active:'false'}],[{id:7,erpId:id(2)},{id:8,erpId:id(2)}],[{id:7,erpId:id(2)},{id:'7',erpId:id(3)}]]){
  const {context,api}=load(users);assert.throws(()=>api.conversion({...request(),requesterLocalUserId:7}),/vínculo/);assert.equal(context.db.trips.length,0);
 }
});
test('conversão: orçamento zero/negativo/não finito e veículo/data ausentes falham antes de gravar',()=>{
 const {context,api}=load([{id:8,erpId:id(2)}]);
 for(const value of [0,-1,'inválido',Infinity,NaN])assert.throws(()=>api.conversion({...request(),estimatedValue:value}),/orçamento/);
 for(const change of [{vehicleId:''},{neededAt:''}])assert.throws(()=>api.conversion({...request(),...change}),/veículo e a data/);
 assert.equal(context.db.trips.length,0);
 // Compras e orçamentos mantêm o fluxo anterior.
 for(const category of ['purchase','budget'])api.conversion({...request(),category,estimatedValue:0});assert.equal(context.db.accountMasters.length,1);assert.equal(context.db.budgetRecords.length,1);
});
test('aprovação na tela: dados inválidos mostram orientação sem RPC nem mutação; rejeição preservada',async()=>{
 for(const [users,change,message] of [[[],{},/vínculo/],[[{id:8,erpId:id(2)}],{estimatedValue:0},/orçamento/]]){
  const {context,api,elements}=load(users);const a={...request(),...change};api.detailModal(a);await elements.get('#invoiceApprove').onclick();assert.match(context.alerts[0],message);assert.equal(context.calls,0);assert.equal(context.db.trips.length,0);assert.equal(a.status,'Pendente');
 }
 const {context,api,elements}=load([]);api.detailModal(request());await elements.get('#invoiceReject').onclick();assert.equal(context.calls,1);assert.equal(context.db.invoiceRequests[0].status,'Rejeitada');assert.equal(context.db.trips.length,0);
});
test('aprovação válida persiste atribuição canônica; falha da RPC desfaz conversão local',async()=>{
 for(const failed of [false,true]){
  const {context,api,elements}=load([{id:8,erpId:id(2)}]);
  if(failed)context.window.IntegralERP.sb.rpc=async()=>({error:Error('Conflito sintético')});
  const a=request();api.detailModal(a);await elements.get('#invoiceApprove').onclick();
  assert.equal(a.status,'Pendente','objeto original preservado');
  if(failed){assert.equal(context.db.trips.length,0);assert.match(context.alerts[0],/Conflito sintético/)}
  else{assert.equal(context.calls,1);assert.equal(context.db.invoiceRequests[0].status,'Aprovada');assert.equal(context.db.trips[0].assigned[0],8);assert.equal(context.db.invoiceRequests[0].convertedId,context.db.trips[0].id)}
 }
});
