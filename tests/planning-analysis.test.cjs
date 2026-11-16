const assert=require('node:assert/strict');
const {test}=require('node:test');
const planning=require('../public/financeiro-planning-analysis.js');

const today='2026-11-16';
const context={today,start:'2026-11-01',end:'2027-01-31'};
const criteria={...context,scope:'operational',dateBasis:'event'};

test('separa saldo previsto, aberto e baixas sem somar Caixa, ERP ou previsões manuais',()=>{
  const data={
    accountMasters:[{id:1,name:'Fornecedor A',supplier:'Fornecedor A',category:'Serviço'}],
    accountPayments:[
      {id:11,accountId:1,status:'Paga',value:50,due:'2026-11-02',paidAt:'2026-11-04T01:00:00Z'},
      {id:12,accountId:1,status:'Paga',value:25,due:'2026-11-03'},
      {id:13,accountId:1,status:'Pendente',value:10,due:'2026-11-17'},
      {id:14,accountId:1,status:'Cancelada',value:900,due:'2026-11-18'},
      {id:15,accountId:1,status:'Pendente',value:600,due:'2026-11-17',internalTransfer:true},
      {id:16,accountId:1,status:'Parcial',value:99,due:'2026-11-18',paidAmount:49,paidAt:'2026-11-05'}
    ],
    cashflow:[
      {id:1,date:'2026-11-06',direction:'Entrada',value:30,source:'Extrato bancário',reference:'receivable:r1'},
      {id:2,date:'2026-11-04',direction:'Saída',value:50,source:'Extrato bancário',reference:'account:11'},
      {id:3,date:'2026-11-07',direction:'Saída',value:300,source:'Extrato bancário',kind:'Transferência interna'}
    ],
    erpPlannedRevenues:[{id:'erp-1',total:120,received:40,remaining:80,dueDate:'2026-11-20',status:'Parcial'}],
    planRevenues:[{id:9,origin:'Estimativa',total:100,start:'2026-11-18'}],
    budgetExpenses:[{id:10,date:'2026-11-07',value:100,description:'Apenas orçamento'}]
  };
  const receivables={
    clients:[{id:'c1',nome:'Cliente A',municipio_id:'m'}],
    cities:[{id:'m',nome:'Cidade A'}],
    parcels:[
      {id:'r1',cliente_id:'c1',status:'Parcial',valor_previsto:100,valor_liquidado:30,juros:5,multa:2,vencimento:'2026-11-07',pago_em:'2026-11-06'},
      {id:'r2',cliente_id:'c1',status:'Pendente',valor_previsto:20,vencimento:'2026-11-14'},
      {id:'r3',cliente_id:'c1',status:'Cancelado',valor_previsto:40,valor_liquidado:40,pago_em:'2026-11-07',vencimento:'2026-11-07'}
    ]
  };
  const model=planning.createModel(data,receivables,context);
  const operational=planning.selectRows(model.rows,criteria);
  assert.deepEqual(planning.totals(operational,'expected'),{incoming:12700,outgoing:18400,net:-5700,count:6});
  assert.deepEqual(planning.totals(operational,'open'),{incoming:9700,outgoing:6000,net:3700,count:4});
  assert.deepEqual(planning.totals(operational,'actual'),{incoming:3000,outgoing:9900,net:-6900,count:3});
  assert.deepEqual(planning.totals(operational,'cancelled'),{incoming:4000,outgoing:90000,net:-86000,count:2});
  assert.equal(operational.find(row=>row.phase==='actual'&&row.direction==='Entrada').evidence,'extrato');
  assert.equal(operational.find(row=>row.phase==='actual'&&row.id==='11').date,'2026-11-03');
  assert.equal(model.excluded.missingDates,1);
  assert.equal(model.excluded.transfers,2);
  const cash=planning.selectRows(model.rows,{...criteria,scope:'cash'});
  assert.deepEqual(planning.totals(cash,'actual'),{incoming:3000,outgoing:5000,net:-2000,count:2});
  assert.equal(planning.totals(planning.selectRows(model.rows,{...criteria,scope:'erp'}),'open').incoming,8000);
  assert.equal(planning.totals(planning.selectRows(model.rows,{...criteria,scope:'manual'}),'expected').incoming,10000);
});

test('compara datas de vencimento, pagamento e competência mensal, com filtros combinados',()=>{
  const {rows}=planning.createModel({
    accountMasters:[{id:1,name:'Restaurante A',category:'Viagem',supplier:'Alimentação',project:'Carga'}],
    accountPayments:[{id:81,accountId:1,status:'Paga',value:10.05,competence:'2026-10',due:'2026-11-30',paidAt:'2026-12-01'}]
  },null,context);
  const contextDates={...criteria,start:'2026-11-01',end:'2026-11-30',category:'Viagem',project:'Carga',search:'alimentacao'};
  assert.deepEqual(planning.selectRows(rows,{...contextDates,dateBasis:'due'}).map(row=>row.phase),['expected']);
  assert.equal(planning.selectRows(rows,{...contextDates,dateBasis:'paid'}).length,0);
  const byMonth=planning.selectRows(rows,{...contextDates,dateBasis:'competence',start:'2026-10-15',end:'2026-10-30'});
  assert.equal(byMonth[0].displayDate,'2026-10');
  assert.equal(planning.grouped(byMonth,'month','expected')[0].outgoing,1005);
  assert.deepEqual(planning.period('week','2027-01-02'),{start:'2026-12-28',end:'2027-01-03'});
  assert.deepEqual(planning.previousPeriod({start:'2027-01-01',end:'2027-01-05'}),{start:'2026-12-27',end:'2026-12-31'});
});

test('distribui centavos nas parcelas e simula recorrência em uma cópia dos dados',()=>{
  const load={planRevenues:[{id:2,origin:'Receita manual',start:'2026-10-31',entry:10,total:20.01,installments:3}]};
  const before=JSON.stringify(load);
  const model=planning.createModel(load,null,context);
  const selected=planning.selectRows(model.rows,{...criteria,scope:'manual'},true);
  const expected=selected.filter(row=>row.phase==='expected');
  assert.deepEqual(expected.map(row=>[row.date,row.amount]),[['2026-10-31',1000],['2026-11-30',334],['2026-12-31',334],['2027-01-31',333]]);
  const simulated=planning.projection(selected,{
    incoming:10,outgoing:0,incomingDelay:4,outgoingDelay:0,extraAmount:200,extraDate:'2027-01-31',extraMonths:2,extraDirection:'Saída'
  },today);
  assert.deepEqual(simulated.map(row=>[row.date,row.amount]),[['2026-12-04',367],['2027-01-04',367],['2027-02-04',366],['2027-01-31',200],['2027-02-28',200]]);
  assert.equal(JSON.stringify(load),before);
  assert.ok(selected.every(row=>row.source==='Planejamento manual'));
  assert.equal(planning.csv([['=HYPERLINK("exemplo");','Cliente']]),'\uFEFF"\'=HYPERLINK(""exemplo"");";"Cliente"\r\n');
});
