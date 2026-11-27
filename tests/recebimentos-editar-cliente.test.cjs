const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const src=fs.readFileSync(path.join(__dirname,'../public/financeiro-recebimentos.js'),'utf8');
const clientForm=src.slice(src.indexOf('function clientForm('),src.indexOf('\nfunction fileData('));
const record={id:'cliente',municipio_id:'cidade',nome:'Nome anterior',cpf_cnpj:null,codigo:'',valor_global:1000,valor_entrada:0,valor_parcela:100,numero_parcelas:null,primeiro_vencimento:null,dia_vencimento:null};

function setup(result,recordOrNull=record){
 const form={},save={disabled:false},observed={alerts:[],updates:[],inserts:[],removed:0,loads:0,renders:0};
 let submit;
 const modal=(title,html,callback)=>{
  observed.title=title;
  form.municipio_id='cidade';
  for(const [,k,v] of html.matchAll(/<input name="([^"]+)"[^>]*?value="([^"]*)"/g))form[k]=v;
  submit=callback;
 };
 const sb={from(table){return {
  update(patch){
   assert.equal(table,'fin_receb_clientes');
   observed.updates.push({...patch});
   return {eq(k,v){assert.equal(k,'id');assert.equal(v,record.id);return {select(projection){
    assert.equal(projection,'id');
    return {single:result};
   }}}};
  },
  insert(payload){
   observed.inserts.push({table,payload:JSON.parse(JSON.stringify(payload))});
   return table==='fin_receb_clientes'?{select:()=>({single:async()=>({data:{id:'novo'}})})}:Promise.resolve({error:null});
  }
 }}};
 vm.runInNewContext(clientForm+'\nclientForm(client)',{
  client:recordOrNull,state:{municipios:[{id:'cidade',nome:'Cidade',uf:'SC'}]},modal,sb,esc:x=>x,
  FormData:class{constructor(f){return Object.entries(f)}},
  q:s=>({'#cf':form,'#recebSave':save,'#recebModal':{remove(){observed.removed++}}}[s]),
  alert:message=>observed.alerts.push(message),load:async()=>{observed.loads++},render:()=>{observed.renders++},uid:()=> 'parcela',
 });
 return {form,submit,save,observed};
}

test('edita somente os campos modificados e só fecha com o ID correspondente',async()=>{
 const {form,submit,observed}=setup(async()=>({data:{id:record.id}}));
 assert.equal(form.numero_parcelas,'');assert.equal(form.dia_vencimento,'');
 form.nome='Nome novo';
 await submit();
 assert.deepEqual(observed.updates,[{nome:'Nome novo'}]);
 assert.equal(observed.removed,1);assert.equal(observed.loads,1);assert.equal(observed.renders,1);
 assert.deepEqual(observed.alerts,[]);
});

test('recusa, resposta vazia, ID errado e falha de rede mantêm a edição aberta',async()=>{
 for(const response of [
  async()=>({error:{message:'Sem permissão'}}),async()=>({data:null}),
  async()=>({data:{id:'outro'}}),async()=>{throw new Error('Rede indisponível')},
 ]){
  const {form,submit,save,observed}=setup(response);
  form.nome='Manter no formulário';
  await submit();
  assert.match(observed.alerts[0],/Não foi possível confirmar/);
  assert.equal(observed.removed,0);assert.equal(observed.loads,0);assert.equal(save.disabled,false);
  assert.equal(form.nome,'Manter no formulário');
 }
});

test('não envia formulário intacto nem cliques repetidos durante confirmação',async()=>{
 let release;
 const {form,submit,save,observed}=setup(()=>new Promise(resolve=>{release=resolve}));
 await submit();assert.equal(observed.updates.length,0);
 form.valor_entrada='25.5';
 const pending=submit();
 assert.equal(save.disabled,true);
 await submit();assert.deepEqual(observed.updates,[{valor_entrada:25.5}]);
 release({data:{id:record.id}});await pending;
 assert.equal(observed.removed,1);
});

test('novo cliente ainda usa os padrões e gera as parcelas',async()=>{
 const {form,submit,observed}=setup(null,null);
 assert.equal(form.numero_parcelas,'24');assert.equal(form.dia_vencimento,'15');
 Object.assign(form,{nome:'Novo cliente',numero_parcelas:'2',primeiro_vencimento:'2026-11-15',valor_parcela:'100'});
 await submit();
 assert.equal(observed.inserts.length,2);
 assert.equal(observed.inserts[0].table,'fin_receb_clientes');
 assert.equal(observed.inserts[1].table,'fin_receb_parcelas');
 assert.deepEqual(observed.inserts[1].payload.map(x=>[x.cliente_id,x.numero,x.vencimento]),[['novo',1,'2026-11-15'],['novo',2,'2026-12-15']]);
 assert.equal(observed.removed,1);
});
