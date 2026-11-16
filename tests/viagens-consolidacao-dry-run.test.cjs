const {test}=require('node:test');
const assert=require('node:assert/strict');
const {plan,undo}=require('../scripts/viagens-consolidacao-dry-run.cjs');

const group={canonicalId:'1',duplicateId:'2',evidence:'identidade da operação comprovada no ensaio sintético'};
const trip={city:'Lages',sector:'Projetos',status:'Concluída',start:'2026-11-12',end:'2026-11-13'};
const example=()=>({
 trips:[{id:1,...trip,updatedAt:'2026-11-13T12:00:00Z'},{id:2,...trip,updatedAt:'2026-11-14T12:00:00Z'}],
 tripExpenses:[{id:5,tripId:1,value:120},{id:6,tripId:2,value:55}],
 tripDocuments:[{id:7,tripId:2,expenseId:6,file:{storagePath:'teste/recibo'}}],
 accountPayments:[{id:8,tripId:1,value:120},{id:9,tripId:2,value:55}],
 invoiceRequests:[],vehicleUses:[],otherLinks:[]
});

test('dry-run remapeia IDs de ligação, preserva valores e permite reversão completa',()=>{
 const original=example(),copy=structuredClone(original);
 const result=plan(original,group);
 assert.equal(result.status,'ensaiado');
 assert.equal(result.after.trips.length,1);
 assert.deepEqual(result.archive.original,original.trips[1]);
 assert.deepEqual(result.after.tripExpenses.map(x=>[x.id,x.tripId,x.value]),[[5,1,120],[6,1,55]]);
 assert.deepEqual(result.after.tripDocuments[0],{...original.tripDocuments[0],tripId:1});
 assert.deepEqual(result.after.accountPayments.map(x=>[x.id,x.tripId,x.value]),[[8,1,120],[9,1,55]]);
 assert.deepEqual(undo({...original,...result.after},result),original);
 assert.deepEqual(original,copy);
 result.after=structuredClone(result.after);
 const intervening=structuredClone(result.after);
 intervening.tripExpenses[1].value=56;
 assert.throws(()=>undo(intervening,result),/módulo mudou/);
});

test('origens de aprovação, pagamentos ambíguos e divergências preservam o grupo para revisão',()=>{
 const data=example();
 data.trips[0].plannedAmount=10;
 data.trips[1].plannedAmount=0;
 data.invoiceRequests.push({id:'A',category:'trip',convertedId:1});
 data.vehicleUses.push({viagem_id:2});
 data.tripExpenses[1].value=120;
 const result=plan(data,group);
 assert.equal(result.status,'pendente');
 assert.deepEqual(result.conflicts.map(x=>x.type),
 ['campos-de-viagem','aprovacao-vinculada','uso-de-veiculo','possivel-despesa-repetida']);
});
