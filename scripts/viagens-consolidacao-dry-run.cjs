/* Ensaio local. Recebe um snapshot JSON de teste ou de auditoria pelo stdin.
   A função não se conecta ao Supabase e não contém operação de escrita remota. */
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');

const MODULES=['trips','tripExpenses','tripDocuments','accountPayments'];
const id=value=>String(value??'');
const clone=value=>JSON.parse(JSON.stringify(value));

function stable(value){
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  }
  return value;
}
const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));

function travelValues(trip){
  const values={...trip};
  for(const key of ['id','createdAt','updatedAt','syncOperation','updatedBy'])delete values[key];
  return values;
}
function fieldsThatDiffer(a,b){
  return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(key=>!same(a[key],b[key]));
}
function checkUnique(rows,module){
  const ids=rows.map(row=>id(row.id));
  if(ids.some(value=>!value)||new Set(ids).size!==ids.length)throw Error('Há IDs ambíguos em '+module+'.');
}

function plan(snapshot,{canonicalId,duplicateId,evidence}){
  const ids=new Set([id(canonicalId),id(duplicateId)]);
  if(ids.size!==2||ids.has('')||typeof evidence!=='string'||!evidence.trim()){
    throw Error('Informe dois IDs distintos e a evidência de que correspondem à mesma operação.');
  }
  const arrays={};
  for(const module of MODULES){
    if(!Array.isArray(snapshot[module]))throw Error('Inclua no snapshot o módulo '+module+'.');
    arrays[module]=snapshot[module];
  }
  for(const module of MODULES)checkUnique(arrays[module],module);
  const canonical=arrays.trips.find(row=>id(row.id)===id(canonicalId));
  const duplicate=arrays.trips.find(row=>id(row.id)===id(duplicateId));
  if(!canonical||!duplicate)throw Error('Os dois IDs devem constar no snapshot.');
  const required=['invoiceRequests','vehicleUses','otherLinks'];
  for(const module of required)if(!Array.isArray(snapshot[module]))throw Error('Confira também '+module+'.');
  const attachments=arrays.tripDocuments.filter(row=>ids.has(id(row.tripId)));
  const expenses=arrays.tripExpenses.filter(row=>ids.has(id(row.tripId)));
  const items=new Map(expenses.map(row=>[id(row.id),row]));
  const conflicts=[];
  const divergent=fieldsThatDiffer(travelValues(canonical),travelValues(duplicate));
  if(divergent.length)conflicts.push({type:'campos-de-viagem',fields:divergent});
  if(canonical.invoiceRequestId||duplicate.invoiceRequestId||
     snapshot.invoiceRequests.some(request=>request.category==='trip'&&ids.has(id(request.convertedId)))){
    conflicts.push({type:'aprovacao-vinculada'});
  }
  if(snapshot.vehicleUses.some(row=>ids.has(id(row.viagem_id??row.tripId))))conflicts.push({type:'uso-de-veiculo'});
  if(snapshot.otherLinks.some(row=>ids.has(id(row.viagem_id??row.tripId))))conflicts.push({type:'demais-vinculos'});
  for(const doc of attachments){
    if(doc.expenseId!=null&&id(items.get(id(doc.expenseId))?.tripId)!==id(doc.tripId)){
      conflicts.push({type:'comprovante-com-despesa-ambigua',id:id(doc.id)});
    }
  }
  // Duas despesas de regiões diferentes podem ser o mesmo evento financeiro.
  // Sem comprovante ou identidade da operação não há como decidir isso automaticamente.
  for(const entry of expenses.filter(row=>id(row.tripId)===id(duplicateId))){
    const peers=expenses.filter(row=>id(row.tripId)===id(canonicalId)&&
      fieldsThatDiffer({...row,id:null,tripId:null},{...entry,id:null,tripId:null}).length===0);
    if(peers.length)conflicts.push({type:'possivel-despesa-repetida',id:id(entry.id)});
  }
  if(conflicts.length)return {status:'pendente',canonicalId:id(canonicalId),duplicateId:id(duplicateId),conflicts};

  const before=clone(arrays),after=clone(arrays);
  const operations=[];
  const archived=after.trips.find(row=>id(row.id)===id(duplicateId));
  after.trips=after.trips.filter(row=>id(row.id)!==id(duplicateId));
  for(const module of MODULES.filter(key=>key!=='trips')){
    after[module]=after[module].map(row=>{
      if(id(row.tripId)!==id(duplicateId))return row;
      const replacement={...row,tripId:canonical.id};
      operations.push({module,record:id(row.id),from:row.tripId,to:canonical.id});
      return replacement;
    });
  }
  return {
    status:'ensaiado',evidence,canonicalId:id(canonicalId),duplicateId:id(duplicateId),
    archive:{original:archived,canonicalId:canonical.id},operations,before,after
  };
}

function undo(current,journal){
  if(journal.status!=='ensaiado')throw Error('O grupo está pendente.');
  for(const module of MODULES){
    if(!same(current[module],journal.after[module]))throw Error('O módulo mudou depois do ensaio: '+module+'.');
  }
  return {...clone(current),...clone(journal.before)};
}

if(require.main===module){
  const source=JSON.parse(readFileSync(0,'utf8'));
  const result=plan(source.snapshot,source.group);
  // A referência de entrada deve ser preservada exatamente como recebida.
  if(result.status==='ensaiado'){
    assert.deepEqual(undo(result.after,result),result.before);
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}

module.exports={plan,undo};
