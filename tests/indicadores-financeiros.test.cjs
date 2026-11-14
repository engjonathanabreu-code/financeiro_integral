const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const shared=require('../public/financeiro-dre-shared');
const {analyze,scheduled}=require('../lib/financial-consultant');
const source=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');
const day='2026-11-13';

test('movimentos legados preservam datas originais e não contam vínculo explícito duas vezes',()=>{
  const first={id:'a',date:'2026-11-02',direction:'Saída',value:12,source:'Extrato bancário',reference:'account:1'};
  const second={id:'b',date:'2026-11-18',direction:'Saída',value:23,source:'Extrato bancário'};
  const db={
    cashflow:[{...first,date:second.date,value:35,mergeMode:'automatic',mergedItems:[first,second]},
      {id:3,date:day,direction:'Entrada',value:5}],
    accountPayments:[{id:1,status:'Paga',value:12,paidAt:first.date},{id:2,status:'Paga',value:12,paidAt:first.date}]
  };
  const before=structuredClone(db);
  const rows=shared.realizedMovements(db,day);
  assert.equal(shared.sumMoney(rows.filter(row=>row.direction==='Saída')),24);
  assert.ok(rows.some(row=>row.id==='a'&&row.date===first.date&&row.reference===first.reference));
  assert.ok(rows.some(row=>row._sourceKey==='account:2'));
  assert.ok(shared.registeredMovements(db).some(row=>row.id==='b'&&row.date===second.date));
  assert.deepEqual(db,before);

  const duplicate={...first,id:'duplicado'};
  db.cashflow.push(duplicate);
  assert.ok(shared.realizedMovements(db,day).some(row=>row._sourceKey==='account:1'),'vínculo ambíguo deve ficar pendente');
  db.cashflow[0].value=45;
  assert.equal(shared.registeredMovements(db).find(row=>row._sourceKey==='cash:a').value,45,'preserva ajuste explícito posterior');
});

test('baixas declaradas incluem parcelas parciais sem substituir os valores ausentes pelo nominal',()=>{
  const parcels=[
    {id:1,status:'Pago',pago_em:day,valor_previsto:120,valor_liquidado:120},
    {id:2,status:'Parcial',pago_em:day,valor_previsto:60,valor_liquidado:30},
    {id:3,status:'Pago',pago_em:day,valor_previsto:50,valor_liquidado:0},
    {id:4,status:'Pago',vencimento:day,valor_previsto:50,valor_liquidado:50}
  ];
  const cashflow=[{id:5,date:day,direction:'Entrada',value:120,source:'Extrato bancário',reference:'receivable:1',kind:'Boletos'}];
  const rows=shared.realizedMovements({cashflow},day);
  const receipts=shared.declaredReceipts(parcels,rows);
  assert.deepEqual(receipts.map(r=>[r.id,r.value,r.matched]),[[1,120,true],[2,30,false]]);
  const result=analyze({cashflow},parcels,{start:day,end:day},day);
  assert.equal(result.observado.fluxo_caixa.entradas,120);
  assert.equal(result.dre.receita_bruta,120);
  assert.equal(result.observado.recebimentos.liquidado_por_data_pagamento,150);
  assert.equal(result.observado.recebimentos.sem_vinculo_confirmado_no_extrato,30);
});

test('repetição de um evento identificado conta uma vez e divergência fica visível',()=>{
  const bank={id:'111',date:day,direction:'Entrada',value:0.10,source:'Extrato bancário',bankAccountId:'a',bankTransactionId:'t',reference:'receivable:4'};
  const cashflow=[bank,{...bank,id:'112'},
    {...bank,id:'113',bankAccountId:'b',reference:''},
    {...bank,id:'114',bankAccountId:null,bankTransactionId:null,reference:'lote'},
    {...bank,id:'115',bankAccountId:null,bankTransactionId:null,reference:'lote'}];
  const parcels=[{id:4,status:'Pago',pago_em:day,valor_liquidado:0.10},
    {id:5,status:'Parcial',pago_em:day,valor_previsto:1,valor_liquidado:0.20,origem_baixa:'ailos'}];
  const snapshot=structuredClone(cashflow);
  let rows=shared.realizedMovements({cashflow},day);
  assert.equal(shared.sumMoney(rows),0.4);
  assert.deepEqual(shared.declaredReceipts(parcels,rows).map(row=>row.evidence),['extrato','retorno']);
  assert.deepEqual(cashflow,snapshot);
  cashflow[1]={...cashflow[1],value:0.15};
  rows=shared.realizedMovements({cashflow},day);
  assert.equal(shared.sumMoney(rows),0.55);
  assert.equal(rows.filter(row=>row._bankIdentityDivergent).length,2);
  assert.equal(shared.declaredReceipts(parcels,rows)[0].evidence,null);
});

test('ajuste de exibição, agrupamento manual e competência original preservam seus valores',()=>{
  const earlier={id:'1',date:'2026-09-30',direction:'Saída',value:0.10,source:'Extrato bancário',reference:'origem-a'};
  const later={id:'2',date:'2026-10-01',direction:'Saída',value:0.20,source:'Extrato bancário',reference:'origem-b'};
  const parent={...earlier,date:later.date,value:0.30,mergeMode:'automatic',mergedItems:[earlier,later]};
  const base={cashflow:[parent]};
  assert.deepEqual(shared.realizedMovements(base,day).map(r=>[r.date,r.value,r.reference]),[
    ['2026-09-30',0.10,'origem-a'],['2026-10-01',0.20,'origem-b']]);
  for(const altered of [{...parent,mergeMode:'manual'},{...parent,value:0.35}]){
    const [row]=shared.realizedMovements({cashflow:[altered]},day);
    assert.equal(row.value,altered.value);
    assert.deepEqual(row.mergedItems,parent.mergedItems);
  }
  const before=structuredClone(base);
  shared.realizedMovements({...base,cashflowOverrides:{'cash:1':{display:{date:day,value:0.35}}}},day);
  assert.deepEqual(base,before);
});

test('receita futura desconta o principal antecipado e parcial e preserva o total planejado em centavos',()=>{
  assert.equal(shared.outstanding({status:'Pago',valor_previsto:50}),0);
  assert.equal(shared.outstanding({status:'Cancelado',valor_previsto:100}),0);
  assert.equal(shared.outstanding({status:'Parcial',valor_previsto:100,juros:4,multa:1,valor_liquidado:70}),35);
  const data={start:day,entry:10,total:110,installments:3,installmentValue:33.33};
  assert.deepEqual(shared.planAmounts(data,'Entrada'),{entry:10,installments:[33.34,33.33,33.33]});
  assert.equal(shared.sumMoney(scheduled(data,'Entrada')),110);
});

function paginatedDb(tables,cap=500){
  return {
    from(table){
      return {
        last:undefined,select(){return this},order(){return this},
        gt(field,value){assert.equal(field,'id');this.last=value;return this},
        gte(field,value){this.lower={field,value};return this},
        async limit(size){
          const data=tables[table].filter(row=>(this.last===undefined||row.id>this.last)
            &&(!this.lower||row[this.lower.field]>=this.lower.value)).slice(0,Math.min(size,cap));
          return {data};
        }
      };
    }
  };
}

test('paginação por identificador prossegue com limites abaixo do tamanho solicitado',async()=>{
  const rows=Array.from({length:1201},(_,i)=>({id:i+1}));
  const client=paginatedDb({pagamentos:rows},300);
  assert.deepEqual(await shared.allPages(client,'pagamentos','id'),rows);
});

function browserContext(db,client){
  const nodes=new Map();
  const node=key=>{
    if(!nodes.has(key))nodes.set(key,{dataset:{},style:{},querySelectorAll(){return []},append(){},prepend(){},remove(){}});
    return nodes.get(key);
  };
  const document={
    querySelector:key=>key==='#futureReceb'?null:node(key),querySelectorAll:()=>[],getElementById:()=>null,createElement:()=>node('created'),
    addEventListener(){},head:{append(){},appendChild(){}},body:{appendChild(){}},documentElement:{}
  };
  const saves=[];
  const FakeDate=class extends Date{
    constructor(...args){super(...(args.length?args:[day+'T15:00:00Z']))}
    static now(){return +new this()}
  };
  const window={IntegralDREShared:shared,IntegralERP:{sb:client},supabase:{createClient:()=>client},addEventListener(){},dispatchEvent(){}};
  const context=vm.createContext({
    window,document,db,user:{role:'Administrador'},Date:FakeDate,console,save(){saves.push(structuredClone(db))},
    $:node,$$:()=>[],esc:String,money:v=>Number(v).toFixed(2),fmt:String,title(value){node('#title').textContent=value},v2state:{cashMonth:'2026-11'},
    v2picker(){return ''},cashflow(){},alert(message){assert.fail(message)},MutationObserver:class{observe(){}},
    CustomEvent:class{}
  });
  return {window,node,saves,run:name=>vm.runInContext(source(name),context)};
}

test('abrir Caixa não altera nem salva o estado e Dashboard usa o mesmo saldo realizado',()=>{
  const db={
    cashflow:[
      {id:1,date:'2026-11-10',direction:'Entrada',value:100,description:'Receita',source:'Extrato bancário'},
      {id:2,date:'2026-11-12',direction:'Entrada',value:50,description:'Receita',source:'Extrato bancário'},
      {id:3,date:'2026-11-30',direction:'Entrada',value:1000,description:'Receita futura'}
    ],
    accountPayments:[{id:1,status:'Paga',value:40,due:'2026-11-11'}]
  };
  const before=structuredClone(db);
  const h=browserContext(db);
  // Usa o módulo no próprio contexto para que o relógio do browser se aplique.
  h.run('financeiro-dre-shared.js');
  h.run('financeiro-cashflow-editor.js');
  h.window.IntegralFinanceCashflowEditor.render();
  assert.deepEqual(db,before);
  assert.equal(h.saves.length,0);
  assert.match(h.node('#content').innerHTML,/Agrupamentos do extrato e manuais/);
  assert.match(h.node('#content').innerHTML,/Lançamentos futuros do mês/);
  assert.equal(h.window.IntegralFinanceCashflowEditor.allRows().length,3);
  h.run('financeiro-dashboard-canonical.js');
  h.window.IntegralFinanceDashboard.render();
  assert.match(h.node('#content').innerHTML,/Saldo atual<\/span><b[^>]*>110\.00/);
});

test('DRE mantém todas as baixas no quadro separado quando o extrato cobre só uma parcela',async()=>{
  const db={cashflow:[{id:1,date:day,direction:'Entrada',value:100,description:'Boleto',source:'Extrato bancário',reference:'receivable:1'}]};
  const parcels=[
    {id:1,vencimento:day,pago_em:day,status:'Pago',valor_previsto:100,valor_liquidado:100},
    {id:2,vencimento:day,pago_em:day,status:'Pago',valor_previsto:200,valor_liquidado:200},
    {id:3,vencimento:day,pago_em:day,status:'Parcial',valor_previsto:100,valor_liquidado:50},
    {id:4,vencimento:day,pago_em:day,status:'Pago',valor_previsto:400,valor_liquidado:0}
  ];
  const h=browserContext(db,paginatedDb({fin_receb_parcelas:parcels}));
  h.run('financeiro-dre-shared.js');
  h.run('financeiro-cashflow-editor.js');
  h.run('financeiro-dre.js');
  await h.window.IntegralDRE.render();
  assert.equal(shared.sumMoney(h.window.IntegralDRE.collect('real').filter(row=>row.month==='2026-11')),100);
  const html=h.node('#content').innerHTML;
  assert.match(html,/Baixas declaradas \(inclui parciais\)<\/td>[^\n]*350,00/);
  assert.match(html,/sem vínculo confirmado no extrato<\/td>[^\n]*250,00/);
});
