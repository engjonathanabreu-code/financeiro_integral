// FIN-03: regras por registro/ação aplicadas no banco (dados sintéticos), pelo caminho antigo
// (UPDATE direto) e pela função versionada.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,login,id,ADM,STAFF,FIN,INATIVO}=require('./financeiro-db-fixture.cjs');
const sql=f=>fs.readFileSync(path.join(__dirname,'../supabase',f),'utf8');
const hashId=s=>{let h=0;for(const c of String(s||''))h=(h*31+c.charCodeAt(0))>>>0;return h||1};
const trips=()=>[{id:1,city:'A',status:'Planejada',sector:'Comercial',assigned:[11]},{id:2,city:'B',status:'Aprovada',sector:'Comercial',assigned:[12]}];
const budgets=()=>[{id:'b1',name:'Aberto',sector:'Comercial',active:true,history:[]},{id:'b2',name:'Fechado',active:true,status:'Fechado',closedAt:'2026-10-01',closedBy:'x',history:[]}];
const bexp=()=>[{id:'e1',budgetId:'b1',value:10},{id:'e2',budgetId:'b2',value:20,file:{name:'n.pdf'}}];

async function prepared(){
 const db=await setup();
 await db.exec(`select set_config('request.jwt.claim.sub','${id(ADM)}',false)`);
 const seed={trips:trips(),tripExpenses:[{id:5,tripId:1,value:3}],tripDocuments:[{id:6,tripId:1,expenseId:5}],budgetRecords:budgets(),budgetExpenses:bexp(),docs:[{id:7,name:'nf',value:1}]};
 for(const [k,v] of Object.entries(seed))await db.query('insert into financeiro_estado_modulos(chave,dados,updated_at) values($1,$2,now())',[k,JSON.stringify(v)]);
 for(const f of ['auditoria_acessos_20261005.sql','financeiro_modulos_revisao_20261021.sql','financeiro_guarda_registros_20261021.sql'])await db.exec(sql(f));
 return db;
}
const put=(db,chave,dados)=>db.query('update financeiro_estado_modulos set dados=$2 where chave=$1',[chave,JSON.stringify(dados)]);
const save=async(db,chave,dados)=>{const r=(await db.query('select revisao::int from financeiro_estado_modulos where chave=$1',[chave])).rows[0];return (await db.query('select financeiro_salvar_modulo($1,$2,$3) r',[chave,JSON.stringify(dados),r.revisao])).rows[0].r};
const read=async(db,chave)=>(await db.query('select dados,updated_by from financeiro_estado_modulos where chave=$1',[chave])).rows[0];

test('viagens: colaborador cria, edita e conclui; não aprova, não exclui, não muda responsáveis',async()=>{
 const db=await prepared();
 try{
  for(const n of [STAFF,FIN]){
   await login(db,n);
   const t=trips();t[0].city='Nova';t[0].status='Concluída';t.push({id:3,city:'C',status:'Planejada',assigned:[13]});
   assert.equal((await save(db,'trips',t)).status,'salvo');
   const cur=(await read(db,'trips')).dados;
   await assert.rejects(put(db,'trips',cur.map(x=>x.id===1?{...x,status:'Aprovada'}:x)),/aprovar viagens/);
   await assert.rejects(save(db,'trips',cur.map(x=>x.id===1?{...x,status:'Aprovada'}:x)),/aprovar viagens/);
   await assert.rejects(put(db,'trips',[...cur,{id:9,status:'Aprovada'}]),/aprovar viagens/,'nem criar já aprovada');
   await assert.rejects(put(db,'trips',cur.filter(x=>x.id!==3)),/excluir viagens/);
   await assert.rejects(put(db,'trips',cur.map(x=>x.id===1?{...x,assigned:[11,99]}:x)),/responsáveis/);
   assert.equal((await save(db,'trips',cur.map(x=>x.id===2?{...x,report:'ok'}:x))).status,'salvo','viagem já aprovada continua editável nos demais campos');
   await login(db,ADM);await put(db,'trips',trips());
  }
  assert.equal((await read(db,'trips')).updated_by,id(ADM),'autor registrado pelo banco');
  await login(db,STAFF);await put(db,'trips',trips().map(x=>x.id===1?{...x,city:'Z'}:x));
  assert.equal((await read(db,'trips')).updated_by,id(STAFF));
  await db.query(`update financeiro_estado_modulos set updated_by=$1 where chave='trips'`,[id(ADM)]);
  assert.equal((await read(db,'trips')).updated_by,id(STAFF),'navegador não forja o autor');
  await login(db,ADM);
  const t=trips().filter(x=>x.id!==2);t[0].status='Aprovada';t[0].assigned=[11,12];
  assert.equal((await save(db,'trips',t)).status,'salvo','ADM aprova, atribui e exclui');
 }finally{await db.close()}
});

test('despesas e documentos de viagem: inclusão livre, exclusão só ADM',async()=>{
 const db=await prepared();
 try{
  await login(db,STAFF);
  assert.equal((await save(db,'tripExpenses',[{id:5,tripId:1,value:4},{id:8,tripId:1,value:1}])).status,'salvo');
  await assert.rejects(put(db,'tripExpenses',[{id:8,tripId:1,value:1}]),/Somente ADM pode excluir despesas/);
  assert.equal((await save(db,'tripDocuments',[{id:6,tripId:1,expenseId:5},{id:9,tripId:1}])).status,'salvo');
  await assert.rejects(put(db,'tripDocuments',[{id:9,tripId:1}]),/Somente ADM/);
  await login(db,ADM);assert.equal((await save(db,'tripExpenses',[{id:8,tripId:1,value:1}])).status,'salvo');
 }finally{await db.close()}
});

test('orçamentos e gastos: só ADM altera orçamento; gasto de orçamento fechado é imutável para os demais',async()=>{
 const db=await prepared();
 try{
  await login(db,STAFF);
  await assert.rejects(put(db,'budgetRecords',budgets().map(b=>b.id==='b1'?{...b,limit:999}:b)),/Somente ADM pode criar, alterar ou excluir orçamentos/);
  await assert.rejects(put(db,'budgetRecords',[...budgets(),{id:'b3',name:'novo'}]),/Somente ADM/);
  assert.equal((await save(db,'budgetRecords',budgets())).status,'salvo','salvar sem mudança não é bloqueado');
  const e=bexp();
  assert.equal((await save(db,'budgetExpenses',[...e,{id:'e3',budgetId:'b1',value:5}])).status,'salvo','gasto em orçamento aberto');
  const cur=(await read(db,'budgetExpenses')).dados;
  assert.equal((await save(db,'budgetExpenses',cur.map(x=>x.id==='e2'?{...x,fiscalDocId:77}:x))).status,'salvo','vínculo fiscal automático é permitido');
  const cur2=(await read(db,'budgetExpenses')).dados;
  await assert.rejects(put(db,'budgetExpenses',cur2.map(x=>x.id==='e2'?{...x,value:21}:x)),/Orçamento fechado/);
  await assert.rejects(put(db,'budgetExpenses',[...cur2,{id:'e4',budgetId:'b2',value:1}]),/Orçamento fechado/);
  await assert.rejects(put(db,'budgetExpenses',cur2.map(x=>x.id==='e1'?{...x,budgetId:'b2'}:x)),/Orçamento fechado/);
  await assert.rejects(put(db,'budgetExpenses',cur2.map(x=>x.id==='e2'?{...x,budgetId:'b1'}:x)),/Orçamento fechado/,'nem retirar gasto de orçamento fechado');
  await assert.rejects(put(db,'budgetExpenses',cur2.filter(x=>x.id!=='e3')),/excluir gastos/);
  await login(db,ADM);assert.equal((await save(db,'budgetExpenses',cur2.filter(x=>x.id!=='e3'))).status,'salvo');
 }finally{await db.close()}
});

test('documentos fiscais: colaborador só inclui; Financeiro e ADM alteram e excluem',async()=>{
 const db=await prepared();
 try{
  await login(db,STAFF);
  assert.equal((await save(db,'docs',[{id:70,name:'auto',source:'Orçamento'},{id:7,name:'nf',value:1}])).status,'salvo');
  await assert.rejects(put(db,'docs',[{id:70,name:'auto',source:'Orçamento'},{id:7,name:'nf',value:999}]),/Financeiro ou ADM/);
  await assert.rejects(put(db,'docs',[{id:7,name:'nf',value:1}]),/Financeiro ou ADM/);
  await login(db,FIN);assert.equal((await save(db,'docs',[{id:7,name:'nf',value:2}])).status,'salvo');
  await login(db,INATIVO);await assert.rejects(db.query('select financeiro_salvar_modulo($1,$2,$3)',['docs','[]',1]),/sem permissão/);
 }finally{await db.close()}
});

test('edição de viagem pelo colaborador (v31) pode incluir a si mesmo em responsáveis, mas não outros',async()=>{
 const db=await prepared();
 try{
  await login(db,STAFF);const eu=hashId(id(STAFF));
  const legado=trips().map(t=>t.id===1?{...t,assigned:undefined,city:'editada'}:t);   // viagem antiga sem responsáveis
  await login(db,ADM);await put(db,'trips',trips().map(t=>t.id===1?{...t,assigned:undefined}:t));await login(db,STAFF);
  assert.equal((await save(db,'trips',legado.map(t=>t.id===1?{...t,assigned:[eu]}:t))).status,'salvo','sem responsáveis → [eu]');
  const cur=(await read(db,'trips')).dados;
  assert.equal((await save(db,'trips',cur.map(t=>t.id===2?{...t,assigned:[...t.assigned,eu]}:t))).status,'salvo','[x] → [x, eu]');
  const cur2=(await read(db,'trips')).dados;
  await assert.rejects(put(db,'trips',cur2.map(t=>t.id===2?{...t,assigned:[...t.assigned,hashId(id(FIN))]}:t)),/responsáveis/,'incluir outra pessoa');
  await assert.rejects(put(db,'trips',cur2.map(t=>t.id===2?{...t,assigned:[eu]}:t)),/responsáveis/,'remover alguém');
 }finally{await db.close()}
});
