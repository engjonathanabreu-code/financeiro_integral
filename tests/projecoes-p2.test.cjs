const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const shared=require('../public/financeiro-dre-shared.js');
const source=name=>fs.readFileSync(path.join(__dirname,'../public',name),'utf8');

const number=n=>String(n).padStart(4,'0');
const uuid=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const amounts=(expected,received=0)=>({valor_previsto:expected,valor_recebido:received});
function fixture(tables,limit=500){
  const calls=[];
  let actor=uuid(1),authChange,fail;
  const client={
    auth:{
      getSession:async()=>({data:{session:actor?{user:{id:actor}}:null}}),
      onAuthStateChange:fn=>{authChange=fn}
    },
    from(table){
      return {select(fields){
        assert.ok(fields);
        const orders=[];
        let cursor,start,compound;
        const read=(offset,max)=>{
          calls.push([table,cursor,offset,max]);
          if(fail?.(table,cursor,offset))return {error:Error('página indisponível')};
          const rows=[...(tables[table]||[])];
          rows.sort((a,b)=>orders.reduce((result,key)=>result||String(a[key]).localeCompare(String(b[key])),0));
          return {data:rows.filter(row=>(cursor===undefined||row.id>cursor)&&(!start||row.vencimento>=start)
            &&(!compound||row.etapa_id>compound[0]||row.etapa_id===compound[0]&&row.usuario_id>compound[1]))
            .slice(offset,offset+Math.min(max,limit))};
        };
        return {order(key){orders.push(key);return this},gt(key,value){assert.equal(key,'id');cursor=value;return this},
          gte(key,value){assert.equal(key,'vencimento');start=value;return this},
          or(expression){
            const [first,same,next]=expression.replace('and(','').replace(')','').split(',');
            const afterStage=first.split('.').at(-1),sameStage=same.split('.').at(-1);
            assert.equal(afterStage,sameStage);compound=[afterStage,next.split('.').at(-1)];return this},
          limit(max){return read(0,max)}};
      }};
    }
  };
  return {client,calls,fail:fn=>{fail=fn},login:id=>{actor=id;authChange?.('SIGNED_IN',id?{user:{id}}:null)}};
}

function future(mock,month='2099-01'){
  const elements=new Map(),alerts=[];
  function element(){
    return {isConnected:true,style:{},prepend(el){elements.set('#'+el.id,el)},
      querySelectorAll(){return []},querySelector(){return null},addEventListener(){},focus(){},
      remove(){this.isConnected=false;elements.delete('#'+this.id)}};
  }
  elements.set('#title',{textContent:'Recebimentos'});
  elements.set('#recebMonth',{value:month});
  const host=element();
  elements.set('.receb-toolbar .right',host);
  const context={document:{getElementById:id=>elements.get('#'+id),querySelector:selector=>elements.get(selector),
    createElement:element,head:{appendChild:el=>elements.set('#'+el.id,el)},body:{appendChild:el=>elements.set('#'+el.id,el)}},
    IntegralDREShared:{...shared,todayISO:()=> '2099-01-04'},
    supabase:{createClient:()=>mock.client},MutationObserver:class{observe(){}},
    addEventListener(){},alert:message=>alerts.push(message)};
  context.window=context;
  vm.runInNewContext(source('financeiro-recebimentos-futuro.js'),context);
  return {click:()=>elements.get('#futureReceb').onclick(),html:()=>elements.get('#recebFutureModal')?.innerHTML,alerts};
}

test('Futuro percorre as três tabelas acima do limite e separa bruto, saldo e encerramento',async()=>{
  const clientRows=Array.from({length:1001},(_,i)=>({id:number(i),municipio_id:'m1000',ativo:true}));
  clientRows[0].ativo=false;
  const municipalities=Array.from({length:1001},(_,i)=>({id:'m'+number(i),nome:i===1000?'Município depois do limite':'Outro'}));
  const base={cliente_id:'1000',vencimento:'2099-01-10',status:'Pendente'};
  const rows=[
    { ...base,id:'p1',valor_previsto:'1000',status:'Pago',valor_liquidado:'1000' },
    { ...base,id:'p2',valor_previsto:'100',status:'Parcial',valor_liquidado:'70',juros:'0.02' },
    { ...base,id:'p3',valor_previsto:'1000',status:'Cancelada' },
    { ...base,id:'p4',valor_previsto:'1000',cliente_id:'0000' },
    { ...base,id:'p5',valor_previsto:'5',valor_liquidado:'5.01' },
    { ...base,id:'p6',valor_previsto:'200',vencimento:'2099-02-10',status:'Pago' },
    { ...base,id:'p7',valor_previsto:'300',vencimento:'2099-03-10',ativo:false },
    { ...base,id:'p8',valor_previsto:'400',vencimento:'0027-01-10' }
  ];
  rows.push(...Array.from({length:1001},(_,i)=>({ ...base,id:'a'+number(i),status:'Cancelado',valor_previsto:'1000' })));
  const mock=fixture({fin_receb_parcelas:rows,fin_receb_clientes:clientRows,fin_receb_municipios:municipalities},97);
  const ui=future(mock);
  await ui.click();
  assert.match(ui.html(),/Valor contratual bruto<\/small><b>R\$\s1\.305,00/);
  assert.match(ui.html(),/Saldo esperado em caixa<\/small><b>R\$\s30,02/);
  assert.match(ui.html(),/Último mês com saldo<\/small><b>01\/2099/);
  assert.match(ui.html(),/Último saldo em aberto: Município depois do limite/);
  assert.match(ui.html(),/02\/2099[\s\S]+Saldo R\$\s0,00/);
  assert.doesNotMatch(ui.html(),/0027/);
  assert.equal(mock.calls.filter(([table])=>table==='fin_receb_clientes').length,12);
  assert.equal(mock.calls.filter(([table])=>table==='fin_receb_municipios').length,12);
  assert.equal(mock.calls.filter(([table])=>table==='fin_receb_parcelas').length,12);
});

test('Futuro conserva saldo global de cliente ativo sem município, respeita RLS e abandona a leitura ao sair',async()=>{
  const items={fin_receb_clientes:[{id:'c',municipio_id:'não visível'}],
    fin_receb_parcelas:[{id:'p',cliente_id:'c',vencimento:'2099-01-09',valor_previsto:'19.99'}]};
  const mock=fixture(items,1);
  const ui=future(mock);
  await ui.click();
  assert.match(ui.html(),/Saldo esperado em caixa<\/small><b>R\$\s19,99/);
  assert.match(ui.html(),/Municípios com saldo<\/small><b>0/);
  mock.login(null);
  assert.equal(ui.html(),undefined);
  mock.login(uuid(1));
  mock.fail((table,cursor)=>table==='fin_receb_clientes'&&Boolean(cursor));
  await ui.click();
  assert.equal(ui.html(),undefined);
  assert.match(ui.alerts.at(-1),/página indisponível/);
});

function erp(mock,db={}){
  const events=[];
  const context={IntegralERP:{sb:mock.client},IntegralDREShared:shared,db,user:{role:'Administrador',erpId:uuid(1)},
    save:()=>events.push('save'),dispatchEvent:event=>events.push(event.type),
    CustomEvent:class{constructor(type){this.type=type}}};
  context.window=context;
  vm.runInNewContext(source('financeiro-erp-sync-fix.js'),context);
  return {sync:context.IntegralFinanceERPPlanning.sync,events,context};
}

test('sincronização do ERP atravessa limite, preserva IDs e exclui pagos, cancelados e antecipados',async()=>{
  const payment={vencimento:'2099-02-01',projeto_id:'1000',status:'Parcial'};
  const projects=Array.from({length:1001},(_,i)=>({id:number(i),nome:'Projeto '+i}));
  projects[0].status='Cancelado';
  const payments=Array.from({length:1001},(_,i)=>({id:number(i),...payment,status:'Pago',...amounts(50)}));
  payments.push({id:'1001',...payment,...amounts('100.02','70.01')},{id:'1002',...payment,status:'Cancelado',...amounts(90)},
    {id:'1003',...payment,status:'Pendente',...amounts(100,100.01)},
    {id:'1004',...payment,projeto_id:'0000',status:'Pendente',...amounts(100)});
  const tables={projetos:projects,pagamentos:payments,
    profiles:[{id:uuid(1),nome:'Administrador',tipo:'Administrador',ativo:true},{id:uuid(2),nome:'Novo nome',tipo:'Financeiro',ativo:true}],
    planos_trabalho:[{id:'pl',titulo:'Plano'}],etapas_plano:[{id:uuid(100),plano_id:'pl'}],
    etapa_responsaveis:Array.from({length:1001},(_,i)=>({etapa_id:uuid(100),usuario_id:uuid(i+2)}))};
  const mock=fixture(tables,87);
  const db={usersMvp:[{id:55,erpId:uuid(2),name:'Nome anterior'},{id:56,erpId:'histórico'}],trips:[{id:'v',assigned:[55,56]}]};
  const {sync,events}=erp(mock,db);
  const a=sync(),b=sync();
  assert.equal(a,b);
  assert.equal((await a).count,1);
  assert.equal(db.erpProjects.length,1001);
  const [row]=db.erpPlannedRevenues;
  assert.equal(row.project,'Projeto 1000');
  assert.equal(row.total,100.02);
  assert.equal(row.received,70.01);
  assert.equal(row.remaining,30.01);
  assert.equal(db.usersMvp[0].id,55);
  assert.equal(db.erpPlans[0].sectors[0],'Financeiro');
  assert.equal(mock.calls.filter(([table])=>table==='etapa_responsaveis').length,13);
  assert.equal(db.usersMvp[1].id,56);
  assert.deepEqual(db.trips,[{id:'v',assigned:[55,56]}]);
  assert.deepEqual(events,['save','integral:erp-planning-synced']);
});

test('falha de página e troca de sessão preservam caches e impedem gravação',async()=>{
  const mock=fixture({projetos:[{id:'p'}],pagamentos:[{id:'q'}]},1);
  const initial={erpProjects:[{id:'original'}],erpPlannedRevenues:[{id:'original'}]};
  const db=structuredClone(initial);
  const {sync,events,context}=erp(mock,db);
  mock.fail((table,cursor)=>table==='pagamentos'&&Boolean(cursor));
  await assert.rejects(sync(),/página indisponível/);
  assert.deepEqual(db,initial);
  assert.deepEqual(events,[]);
  mock.fail((table,cursor)=>{if(table==='pagamentos'&&cursor)mock.login('outro');return false});
  await assert.rejects(sync(),/sessão mudou/);
  assert.deepEqual(db,initial);
  assert.deepEqual(events,[]);
  context.user.role='Funcionário';
  await assert.rejects(sync(),/somente para administradores/);
});

test('cronograma já publicado conserva o total ao distribuir resíduo de centavos',()=>{
  assert.deepEqual(shared.planAmounts({total:100,installments:3},'Entrada').installments,[33.34,33.33,33.33]);
  assert.deepEqual(shared.planAmounts({total:100.01,entry:10,installments:3},'Entrada'),
    {entry:10,installments:[30.01,30,30]});
});

test('Recebimentos principal preserva ordenação e descarta respostas de uma sessão trocada',async()=>{
  const clients=[{id:'a',nome:'Zélia'},{id:'b',nome:'Álvaro'},{id:'c',nome:'Bruno'}];
  const originalFamily=[{id:'p2',vencimento:'2099-02-01'},{id:'p1',vencimento:'2099-01-01'}];
  const mock=fixture({fin_receb_clientes:clients,fin_receb_parcelas:originalFamily},1);
  const context={document:{querySelector:()=>null},IntegralDREShared:shared,supabase:{createClient:()=>mock.client}};
  context.window=context;
  vm.runInNewContext(source('financeiro-recebimentos.js'),context);
  const api=context.IntegralReceivables;

  await api.reload();
  assert.deepEqual(Array.from(api.getState().clientes,row=>row.nome),['Álvaro','Bruno','Zélia']);
  assert.deepEqual(Array.from(api.getState().parcelas,row=>row.id),['p1','p2']);
  mock.fail((table,cursor)=>table==='fin_receb_parcelas'&&Boolean(cursor));
  await assert.rejects(api.reload(),/página indisponível/);
  assert.equal(api.getState().clientes.length,3);
  mock.fail((table,cursor)=>{if(table==='fin_receb_parcelas'&&cursor)mock.login('outro');return false});
  await assert.rejects(api.reload(),/sessão mudou/);
  assert.equal(api.getState().clientes.length,0);
});
