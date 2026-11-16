/* Regras de leitura do painel e projeções isoladas. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./financeiro-dre-shared.js'));
  else root.IntegralPlanningAnalysis=factory(root.IntegralDREShared);
})(typeof self!=='undefined'?self:this,function(shared){
  'use strict';

  const {dateKey,cents,norm,cancelled,settled,openERP}=shared;
  const dayMs=86400000;
  const dates={event:'Data do evento',due:'Vencimento',paid:'Pagamento',received:'Recebimento',competence:'Competência'};
  const scopes={
    operational:'Contas e Recebimentos',
    cash:'Extratos e lançamentos próprios do Caixa',
    erp:'Contratos do ERP',
    manual:'Previsões manuais',
    payroll:'Folha projetada'
  };
  const text=value=>String(value??'').trim();
  const asList=value=>Array.isArray(value)?value:[];
  const dateObject=day=>new Date(day+'T00:00:00Z');
  const fullDay=date=>date.toISOString().slice(0,10);
  const shiftDays=(day,count)=>fullDay(new Date(+dateObject(day)+count*dayMs));
  function shiftMonths(day,count){
    const date=dateObject(day);
    const number=date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth()+count);
    const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(number,last));
    return fullDay(date);
  }
  const firstMonthDay=day=>day.slice(0,7)+'-01';
  const lastMonthDay=day=>shiftDays(shiftMonths(firstMonthDay(day),1),-1);
  const startWeek=day=>shiftDays(day,-((dateObject(day).getUTCDay()+6)%7));
  const validRange=({start,end})=>Boolean(dateKey(start)&&dateKey(end)&&start<=end&&(+dateObject(end)-+dateObject(start))/dayMs<=366);
  function period(option,today){
    const month=Number(today.slice(5,7))-1;
    let start=firstMonthDay(today), end=lastMonthDay(today);
    if(option==='today')start=end=today;
    else if(option==='week'){start=startWeek(today);end=shiftDays(start,6);}
    else if(option==='next'){start=shiftMonths(start,1);end=lastMonthDay(start);}
    else if(['quarter','semester','year'].includes(option)){
      const width={quarter:3,semester:6,year:12}[option];
      start=shiftMonths(start,-(month%width));
      end=shiftDays(shiftMonths(start,width),-1);
    }else if(['30','60','90','365'].includes(option)){
      start=today;end=shiftDays(today,Number(option)-1);
    }
    return {start,end};
  }
  function previousPeriod({start,end}){
    const days=(+dateObject(end)-+dateObject(start))/dayMs+1;
    return {start:shiftDays(start,-days),end:shiftDays(start,-1)};
  }
  const asDate=value=>dateKey(value)||(/^\d{4}-(0[1-9]|1[0-2])$/.test(text(value))?text(value):'');
  const financeDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
  function datedPayment(value){
    const raw=text(value);
    if(!/T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw))return dateKey(raw);
    const timestamp=new Date(raw);
    if(!Number.isFinite(+timestamp))return '';
    const parts=Object.fromEntries(financeDate.formatToParts(timestamp).map(part=>[part.type,part.value]));
    return [parts.year,parts.month,parts.day].join('-');
  }
  const explicitTransfer=row=>row.internalTransfer===true||row.transferenciaInterna===true||
    norm(row.kind||row.category)==='TRANSFERENCIA INTERNA';
  const recurrenceStep=row=>({Trimestral:3,Semestral:6,Anual:12})[row.cadence]||
    (row.cadence==='Personalizado'?Math.min(120,Math.max(1,Math.trunc(Number(row.interval)||1))):1);
  const indexById=rows=>new Map(asList(rows).map(row=>[String(row.id),row]));

  function createModel(data,receivables,{today,start,end}){
    const rows=[];
    const excluded={transfers:0,missingDates:0,divergent:0,missingFields:0};
    function add(meta,phase,value,date,status,other={}){
      if(!Number.isFinite(value)||value<=0)return;
      if(!date){excluded.missingDates++;return;}
      const row={...meta,...other,key:meta.source+':'+meta.id+':'+phase+':'+date,phase,amount:value,date,status};
      for(const field of attributes)if(row[field]!=null)row[field]=text(row[field]);
      rows.push(row);
    }
    function expected(meta,value,due,status,open){
      if(cancelled(status)){add(meta,'cancelled',value,due,'Cancelado');return;}
      if(value==null){excluded.missingFields++;return;}
      const isOpen=open>0;
      const label=['manual','payroll'].includes(meta.scope)?'Previsto':norm(status)==='PARCIAL'?'Parcial':isOpen?(due<today?'Vencido':'Em aberto'):settled(status)?'Quitado':'Previsto';
      add(meta,'expected',value,due,label);
      if(isOpen)add(meta,'open',open,due,label);
    }

    const accountMap=indexById(data.accountPayments);
    const masterMap=indexById(data.accountMasters);
    const budgetMap=indexById(data.budgetRecords);
    const expenseMap=indexById(data.budgetExpenses);
    const parcelMap=indexById(receivables?.parcels);
    const clientMap=indexById(receivables?.clients);
    const cityMap=indexById(receivables?.cities);

    function accountMetadata(payment){
      const master=masterMap.get(String(payment.accountId));
      return {
        id:String(payment.id),description:master?.name||payment.description||'Conta cadastrada',
        direction:'Saída',source:'Contas',scope:'operational',
        due:dateKey(payment.due),competence:asDate(payment.competence||payment.competencia),
        paid:datedPayment(payment.paidAt),category:master?.category||payment.category,subcategory:master?.subcategory,
        sector:master?.sector||payment.sector,supplier:master?.supplier||payment.supplier,
        account:master?.financialAccount||payment.financialAccount,center:master?.costCenter||payment.costCenter,
        project:master?.project||payment.project,person:payment.responsible||master?.responsible,
        method:payment.method||master?.method,recurring:Boolean(master?.recurrence&&norm(master.recurrence)!=='AVULSA')
      };
    }
    function parcelMetadata(parcel){
      const client=clientMap.get(String(parcel.cliente_id));
      return {
        id:String(parcel.id),description:client?.nome||'Parcela de recebimento',
        direction:'Entrada',source:'Recebimentos',scope:'operational',
        due:dateKey(parcel.vencimento),received:dateKey(parcel.pago_em),competence:asDate(parcel.competencia),
        category:'Recebimentos de clientes',customer:client?.nome,
        city:cityMap.get(String(client?.municipio_id))?.nome,
        method:parcel.forma_pagamento
      };
    }
    const parcelActive=parcel=>{
      const client=clientMap.get(String(parcel.cliente_id));
      return parcel.ativo!==false&&client?.ativo!==false&&cityMap.get(String(client?.municipio_id))?.ativo!==false;
    };
    for(const payment of asList(data.accountPayments)){
      if(payment.active===false)continue;
      const master=masterMap.get(String(payment.accountId));
      if(explicitTransfer(payment)||explicitTransfer(master||{})){excluded.transfers++;continue;}
      const meta=accountMetadata(payment);
      const value=payment.value==null?null:cents(payment.value);
      let open=shared.openAccount(payment)?value:0;
      if(norm(payment.status)==='PARCIAL'){
        if(payment.paidAmount==null&&payment.valor_liquidado==null){open=0;excluded.missingFields++;}
        else open=Math.max(0,value-cents(payment.paidAmount??payment.valor_liquidado));
      }
      expected(meta,value,meta.due,payment.status,open);
      const partial=norm(payment.status)==='PARCIAL';
      if((settled(payment.status)||partial)&&(!meta.paid||meta.paid<=today)){
        add(meta,'actual',partial?cents(payment.paidAmount??payment.valor_liquidado):value,meta.paid,
          partial?'Baixa parcial declarada':'Pagamento registrado',{evidence:'registro'});
      }
    }
    for(const parcel of parcelMap.values()){
      if(!parcelActive(parcel))continue;
      const meta=parcelMetadata(parcel);
      expected(meta,parcel.valor_previsto==null?null:cents(shared.parcelFaceValue(parcel)),meta.due,parcel.status,cents(shared.outstanding(parcel)));
    }

    const bankAndCash=shared.realizedMovements(data,today);
    for(const movement of bankAndCash){
      if(movement._derived)continue;
      const linked=shared.referenceKey(movement)||movement._sourceKey||'';
      const colon=linked.indexOf(':');
      const group=linked.slice(0,colon);
      const id=linked.slice(colon+1);
      const account=group==='account'?accountMap.get(id):null;
      const parcel=group==='receivable'?parcelMap.get(id):null;
      const bank=shared.imported(movement);
      if(explicitTransfer(movement)||explicitTransfer(account||{})||explicitTransfer(masterMap.get(String(account?.accountId))||{})){
        excluded.transfers++;continue;
      }
      if(movement._bankIdentityDivergent||movement._reconciliationDivergent){excluded.divergent++;continue;}
      const referenceMeta=account?accountMetadata(account):parcel?parcelMetadata(parcel):{};
      const budgetExpense=group==='budget'?expenseMap.get(id):undefined;
      const budget=budgetMap.get(String(budgetExpense?.budgetId));
      const meta={
        ...referenceMeta,id:account||parcel?id:text(movement.id||movement._sourceKey),
        description:movement.description||referenceMeta.description||'Movimento registrado',
        reference:linked||undefined,
        direction:movement.direction,
        source:bank?'Extrato bancário':movement.source||'Fluxo de Caixa',scope:'cash',
        paid:movement.direction==='Saída'?movement.date:undefined,
        received:movement.direction==='Entrada'?movement.date:undefined,
        competence:asDate(movement.competence||movement.competencia)||referenceMeta.competence,
        account:movement.bankAccountId||movement.account||referenceMeta.account,person:movement.responsible||referenceMeta.person,
        center:movement.costCenter||referenceMeta.center,
        sector:movement.sector||referenceMeta.sector||budget?.sector,
        project:movement.project||referenceMeta.project||budget?.project,
        category:movement.kind||movement.category||referenceMeta.category,
        subcategory:movement.subcategory||referenceMeta.subcategory
      };
      add(meta,'actual',cents(movement.value),movement.date,bank?'Extrato bancário':'Movimento registrado',{evidence:bank?'extrato':'registro'});
    }
    for(const receipt of shared.declaredReceipts([...parcelMap.values()].filter(parcelActive),bankAndCash)){
      if(receipt.date>today)continue;
      const meta=parcelMetadata(receipt);
      const partial=norm(receipt.status)==='PARCIAL';
      add(meta,'actual',cents(receipt.value),receipt.date,
        receipt.evidence==='extrato'?'Baixa conciliada por referência':receipt.evidence==='retorno'?(partial?'Retorno bancário parcial':'Retorno bancário'):(partial?'Baixa parcial declarada':'Baixa declarada'),
        {evidence:receipt.evidence||'declarado'});
    }
    for(const item of asList(data.erpPlannedRevenues)){
      if(!openERP(item))continue;
      const due=dateKey(item.dueDate);
      const meta={id:String(item.erpPaymentId||item.id),scope:'erp',direction:'Entrada',source:'ERP',
        description:item.origin||'Recebimento de contrato',project:item.project,customer:item.customer,city:item.city,due};
      expected(meta,item.total==null?cents(item.remaining):cents(item.total),due,item.status,cents(item.remaining));
    }

    const manualSchedules=[['Entrada',data.planRevenues],['Saída',data.planExpenses]];
    for(const [direction,items] of manualSchedules)for(const item of asList(items)){
      if(item.active===false)continue;
      const origin=dateKey(item.start);
      if(!origin){excluded.missingDates++;continue;}
      const {entry,installments}=shared.planAmounts(item,direction);
      const values=entry>0?[entry,...installments]:installments;
      values.forEach((value,index)=>{
        const due=shiftMonths(origin,index*recurrenceStep(item));
        const meta={id:String(item.id)+'/'+(index+1),reference:String(item.id),scope:'manual',source:'Planejamento manual',
          direction,due,description:item.origin||item.name||'Previsão manual',recurring:values.length>1,
          category:item.category,subcategory:item.subcategory,center:item.costCenter,sector:item.sector,project:item.project};
        const amount=cents(value);
        expected(meta,amount,due,item.status,amount);
      });
    }

    const payrollStart=firstMonthDay(start||today);
    const payrollEnd=firstMonthDay(end||today);
    for(let due=payrollStart;due<=payrollEnd;due=shiftMonths(due,1)){
      const last=lastMonthDay(due);
      for(const person of asList(data.hrPeople)){
        if(person.active===false||dateKey(person.start)>last||(dateKey(person.end)&&dateKey(person.end)<due))continue;
        const history=asList(person.history).filter(item=>dateKey(item.date)&&dateKey(item.date)<=last).sort((a,b)=>a.date.localeCompare(b.date));
        const amount=cents(history.at(-1)?.value??person.currentValue??person.value);
        const meta={id:String(person.id)+'/'+due.slice(0,7),reference:String(person.id),direction:'Saída',scope:'payroll',source:'RH',
          description:person.name||'Colaborador',person:person.name,sector:person.sector,category:'Folha e colaboradores',
          due,competence:due,recurring:true};
        expected(meta,amount,due,undefined,amount);
      }
    }
    return {rows,excluded,operationalComplete:Boolean(receivables)};
  }

  const attributes=['category','subcategory','account','center','sector','project','city','customer','supplier','person','method','source'];
  const rowDate=(row,basis)=>basis==='event'?row.date:row[basis];
  const toSearch=value=>norm(value);
  function withinBasis(row,criteria){
    const date=rowDate(row,criteria.dateBasis);
    if(!date)return false;
    return date.length===7
      ? date>=criteria.start.slice(0,7)&&date<=criteria.end.slice(0,7)
      :date>=criteria.start&&date<=criteria.end;
  }
  function selectRows(rows,criteria,ignorePeriod=false){
    if(!validRange(criteria))return [];
    const search=toSearch(criteria.search);
    return rows
      .filter(row=>row.scope===criteria.scope)
      .filter(row=>ignorePeriod||withinBasis(row,criteria))
      .filter(row=>!criteria.direction||row.direction===criteria.direction)
      .filter(row=>!criteria.status||row.status===criteria.status)
      .filter(row=>attributes.every(key=>!criteria[key]||row[key]===criteria[key]))
      .filter(row=>!search||[row.id,row.description,row.reference,row.project,row.customer,row.supplier].some(value=>toSearch(value).includes(search)))
      .map(row=>({...row,displayDate:rowDate(row,criteria.dateBasis)}));
  }

  function totals(rows,phase){
    const scoped=rows.filter(row=>row.phase===phase);
    const incoming=scoped.filter(row=>row.direction==='Entrada').reduce((sum,row)=>sum+row.amount,0);
    const outgoing=scoped.filter(row=>row.direction==='Saída').reduce((sum,row)=>sum+row.amount,0);
    return {incoming,outgoing,net:incoming-outgoing,count:scoped.length};
  }
  function groupKey(day,mode){
    if(mode==='year')return day.slice(0,4);
    if(mode==='month')return day.slice(0,7);
    if(mode==='week')return day.length===7?day:startWeek(day);
    return day;
  }
  function grouped(rows,mode,phase){
    const map=new Map();
    for(const row of rows.filter(row=>row.phase===phase)){
      const key=groupKey(row.displayDate||row.date,mode);
      if(!map.has(key))map.set(key,[]);
      map.get(key).push(row);
    }
    return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,items])=>({key,items,...totals(items,phase)}));
  }

  function projection(rows,scenario,today){
    const adjusted=rows.filter(row=>row.phase==='open'&&row.date>=today).map(row=>{
      const ratio=row.direction==='Entrada'?scenario.incoming:scenario.outgoing;
      const delay=row.direction==='Entrada'?scenario.incomingDelay:scenario.outgoingDelay;
      const date=shiftDays(row.date,delay);
      return {...row,date,displayDate:date,amount:Math.round(row.amount*(100+ratio)/100)};
    });
    if(scenario.extraAmount>0&&dateKey(scenario.extraDate)){
      for(let index=0;index<scenario.extraMonths;index++){
        const date=shiftMonths(scenario.extraDate,index);
        adjusted.push({key:'extra:'+index,id:'Premissa '+(index+1),description:'Ocorrência hipotética',amount:scenario.extraAmount,
          phase:'open',source:'Simulação',direction:scenario.extraDirection,date,displayDate:date});
      }
    }
    return adjusted;
  }

  function safeCSV(value){
    const string=text(value);
    return '"'+(/^[=+\-@\t\r\n]/.test(string)?"'":"")+string.replace(/"/g,'""')+'"';
  }
  const csv=rows=>'\uFEFF'+rows.map(row=>row.map(safeCSV).join(';')).join('\r\n')+'\r\n';

  return {createModel,selectRows,totals,grouped,projection,period,previousPeriod,groupKey,validRange,firstMonthDay,lastMonthDay,shiftDays,shiftMonths,dates,scopes,attributes,csv};
});
