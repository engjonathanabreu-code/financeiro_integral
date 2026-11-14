/* Integral Financeiro — regras compartilhadas da DRE gerencial.
   Usado no navegador (DRE e Agente Financeiro) e no servidor
   (lib/financial-consultant.js), para que as duas telas classifiquem
   os lançamentos exatamente do mesmo jeito. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.IntegralDREShared=api;
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim().toUpperCase();

/* Linhas analíticas. sign: +1 receita, -1 dedução/custo/despesa. */
const LINES=[
  {id:'rec_boletos',label:'Boletos de clientes (REURB)',group:'rb',sign:1},
  {id:'rec_publicos',label:'Contratos públicos (prefeituras)',group:'rb',sign:1},
  {id:'rec_privados',label:'Contratos privados e avulsos',group:'rb',sign:1},
  {id:'rec_outras',label:'Outras receitas',group:'rb',sign:1},
  {id:'ded_impostos',label:'Simples Nacional e impostos sobre receita',group:'ded',sign:-1},
  {id:'ded_distratos',label:'Distratos e devoluções',group:'ded',sign:-1},
  {id:'csp_terceiros',label:'Terceiros, técnicos e comissões',group:'csp',sign:-1},
  {id:'csp_viagens',label:'Viagens, combustível e locação',group:'csp',sign:-1},
  {id:'csp_art',label:'ART, registros e cartórios',group:'csp',sign:-1},
  {id:'dop_pessoal',label:'Pessoal e encargos (folha, FGTS, INSS, benefícios)',group:'dop',sign:-1},
  {id:'dop_admin',label:'Administrativas e estrutura',group:'dop',sign:-1},
  {id:'dop_gerais',label:'Cartão de crédito e despesas gerais',group:'dop',sign:-1},
  {id:'fin_tarifas',label:'Tarifas e despesas bancárias',group:'fin',sign:-1},
  {id:'fin_emprestimos',label:'Empréstimos e consórcios',group:'fin',sign:-1},
  {id:'investimentos',label:'Investimentos (drone, equipamentos, imobilizado)',group:'inv',sign:-1},
  {id:'socios',label:'Retiradas e distribuição aos sócios',group:'soc',sign:-1}
];
const LINE=Object.fromEntries(LINES.map(l=>[l.id,l]));
const GROUPS={rb:'RECEITA OPERACIONAL BRUTA',ded:'(−) DEDUÇÕES DA RECEITA',csp:'(−) CUSTOS DOS SERVIÇOS PRESTADOS',dop:'(−) DESPESAS OPERACIONAIS',fin:'(−) RESULTADO FINANCEIRO',inv:'(−) INVESTIMENTOS',soc:'(−) DISTRIBUIÇÃO AOS SÓCIOS'};
/* Estrutura exibida: grupos, linhas e subtotais acumulados. */
const LAYOUT=[
  {group:'rb'},
  {group:'ded'},{total:'rl',label:'= RECEITA LÍQUIDA',groups:['rb','ded']},
  {group:'csp'},{total:'lb',label:'= LUCRO BRUTO',groups:['rb','ded','csp'],margin:true},
  {group:'dop'},{total:'ro',label:'= RESULTADO OPERACIONAL (EBITDA)',groups:['rb','ded','csp','dop'],margin:true},
  {group:'fin'},{total:'rl2',label:'= RESULTADO LÍQUIDO DO PERÍODO',groups:['rb','ded','csp','dop','fin'],margin:true,strong:true},
  {group:'inv'},{group:'soc'},{total:'caixa',label:'= GERAÇÃO DE CAIXA APÓS INVESTIMENTOS E SÓCIOS',groups:['rb','ded','csp','dop','fin','inv','soc'],strong:true}
];

/* Classificação automática por natureza + descrição + categoria. */
function classify(r){
  const kind=norm(r.kind),text=`${kind} | ${norm(r.description)} | ${norm(r.category)}`;
  if(r.direction==='Entrada'){
    if(/PARCELAD|COBRANCA|BOLETO|REURB/.test(text))return 'rec_boletos';
    if(/CONTRATOS PUBLICOS|PREFEITURA|MUNICIPIO|\bPM\b/.test(text))return 'rec_publicos';
    if(/CONTRATOS PRIVADOS|AVULSA/.test(text))return 'rec_privados';
    return 'rec_outras';
  }
  if(/RETIRADA|DISTRIBUI|SOCIO|PRO-?LABORE|DESPESAS PESSOAIS/.test(kind))return 'socios';
  if(/EMPRESTIMO|FINANCIAMENTO/.test(kind))return 'fin_emprestimos';
  if(/TARIFA/.test(kind))return 'fin_tarifas';
  if(/FOLHA/.test(kind))return 'dop_pessoal';
  if(/\bART\b/.test(kind))return 'csp_art';
  if(/COMBUST/.test(kind))return 'csp_viagens';
  if(/RETIRADA|DISTRIBUICAO DE LUCRO|PRO-?LABORE|\bSOCIOS?\b/.test(text))return 'socios';
  if(/EMPREST|BNDES|BADESC|CONSORC|PARC\.? ?EMP|FINANCIAMENTO/.test(text))return 'fin_emprestimos';
  if(/TARIFA|DESP.* BANCARI|ENCARGOS? CART|\bIOF\b|JUROS|DB\.? COTAS/.test(text))return 'fin_tarifas';
  if(/SIMPLES|PGDAS|\bDAS\b|ICMS|\bISS\b|ISSQN/.test(text))return 'ded_impostos';
  if(/DISTRATO|DEVOLUC|ESTORNO/.test(text))return 'ded_distratos';
  if(/FOLHA|SALARI|BONUS|BONIFIC|FGTS|INSS|UNIMED|PLANO DE SAUDE|ADMISSIONAL|FERIAS|RESCIS|SINDICATO|SEGURANCA DO TRABALHO|\bRH\b/.test(text))return 'dop_pessoal';
  if(/SEGURO/.test(text))return 'dop_admin';
  if(/\bART\b|REGISTRO DE IMOV|CARTOR|EXECUCAO PROCESS/.test(text))return 'csp_art';
  if(/COMBUST|POSTO|GASOLINA|VIAGEM|HOSPEDAG|AIRBNB|HOTEL|LOCALIZA|LOCACAO|PEDAGIO|PASSAGEM/.test(text))return 'csp_viagens';
  if(/TERCEIR|AUXILIAR|TOPOGRAF|COMISS|TECNICO|VENDEDOR/.test(text))return 'csp_terceiros';
  if(/MARKETING|ANUNCIO|GOOGLE|IMPULSIONAMENTO|PUBLICACAO/.test(text))return 'dop_admin';
  if(/DRONE|IMOBILIZ|COMPUTADOR|EQUIPAMENTO|INVESTIMENTO/.test(text))return 'investimentos';
  if(/CARTAO|FATURA/.test(text))return 'dop_gerais';
  if(/DESPESA FIXA|CONSELHO|ALUGUEL|CONTAB|HONORARIO|TELEF|\bTIM\b|CLARO|VIVO|INTERNET|ENERGIA|CELESC|AGUA|CASAN|PROCOB|SOFTWARE|CREA|\bCAU\b|LIMPEZA|FAXINA|MATERIAL|PAPELARIA|MERCADO|ESCRITORIO|IPVA|LICENCIAMENTO|MANUTENC|CORREIOS|ALVARA|TAXA|MULTA|CUSTOS FIXOS/.test(text))return 'dop_admin';
  return 'dop_gerais';
}

/* Previsões do módulo Planejamento: receitas planejadas são lotes de boletos
   REURB; recebimentos do ERP são contratos; despesas seguem a regra geral. */
function classifyPlan(r){
  if(r.direction==='Entrada'){
    if(r.source==='Planejamento')return 'rec_boletos';
    const t=norm(`${r.origin} ${r.category||''}`);
    if(/REGISTRAL|PRIVAD|FAMILIA|LTDA|S\.?A\.?\b/.test(t))return 'rec_privados';
    return 'rec_publicos';
  }
  if(r.source==='RH')return 'dop_pessoal';
  return classify({direction:'Saída',kind:r.category||'',description:r.origin||'',category:r.category||''});
}

const cents=value=>Number.isFinite(Number(value))?Math.round(Number(value)*100):0;
const sumMoney=rows=>rows.reduce((sum,row)=>sum+cents(row.value),0)/100;
function dateKey(value){
  const text=String(value||'');
  if(!/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(text))return '';
  const key=text.slice(0,10),date=new Date(key+'T00:00:00Z');
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===key?key:'';
}
const todayISO=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'});
const imported=row=>/extrato banc[aá]rio/i.test(String(row.source||''));
const cancelled=status=>/^CANCELAD/.test(norm(status));
const settled=status=>['PAGA','PAGO','LIQUIDADA','LIQUIDADO','QUITADA','QUITADO','RECEBIDA','RECEBIDO'].includes(norm(status));

function manualMovements(data){
  return (data.cashflow||[]).filter(row=>row.active!==false&&!['Conta paga','Orçamento'].includes(row.source))
    .map(row=>{
      const key=`cash:${row.id}`;
      const overrides=data.cashflowOverrides?.[key];
      return {...row,...(imported(row)?overrides?.display:null),id:row.id,source:row.source,reference:row.reference,
        _sourceKey:key,_derived:false,_reconciledTo:overrides?.reconciledTo,_bankEvidence:imported(row)?row:null};
    });
}

function cashMovements(data){
  const manual=manualMovements(data);
  const masters=new Map((data.accountMasters||[]).map(row=>[String(row.id),row]));
  const override=(row,key)=>({...row,...data.cashflowOverrides?.[key],id:row.id,_sourceKey:key,_derived:true});
  const paid=(data.accountPayments||[]).filter(row=>row.active!==false&&settled(row.status)).map(row=>{
    const master=masters.get(String(row.accountId));
    return override({id:`a${row.id}`,date:dateKey(row.paidAt)||row.due,description:master?.name||'Conta paga',kind:master?.category||'Despesa fixa',sector:master?.sector,direction:'Saída',value:row.value,source:'Conta paga'},`account:${row.id}`);
  });
  const budget=(data.budgetExpenses||[]).filter(row=>row.active!==false).map(row=>override({
    id:`b${row.id}`,date:row.date,description:row.description,kind:'Despesa variável',direction:'Saída',value:row.value,source:'Orçamento'
  },`budget:${row.id}`));
  return [...manual,...paid,...budget];
}

/* O agrupamento automático antigo guardava os movimentos sob mergedItems.
   Reconstrua apenas grupos íntegros. Ajustes posteriores de valor/data
   continuam representados pelo lançamento consolidado e pelos originais aninhados. */
function originalMovements(row){
  const items=row.mergedItems;
  if(row.mergeMode!=='automatic'||!Array.isArray(items)||items.length<2)return [row];
  if(items.some(item=>item.id==null||!dateKey(item.date)||item.direction!==row.direction)
    ||cents(sumMoney(items))!==cents(row.value)
    ||items.map(item=>dateKey(item.date)).sort().at(-1)!==dateKey(row.date))return [row];
  return items.map((item,index)=>({...item,kind:item.kind||row.kind,reference:item.reference||'',accountPaymentId:item.accountPaymentId,
    budgetExpenseId:item.budgetExpenseId,receivableParcelId:item.receivableParcelId,_reconciledTo:item._reconciledTo,
    _legacyDreKey:`${row._sourceKey}|${row.date}|${Math.abs(Number(row.value)||0)}`,
    _bankEvidence:item,_sourceKey:`${row._sourceKey}:part:${item.id}:${index}`,_parentKey:row._sourceKey,_historicalPart:true
  }));
}

function referenceKey(row){
  if(row._reconciledTo!==undefined)return row._reconciledTo||'';
  if(row.accountPaymentId!=null)return `account:${row.accountPaymentId}`;
  if(row.budgetExpenseId!=null)return `budget:${row.budgetExpenseId}`;
  if(row.receivableParcelId!=null)return `receivable:${row.receivableParcelId}`;
  const value=String(row.reference||'').trim();
  return /^(?:account|budget|receivable):[^\s]+$/.test(value)?value:'';
}

function bankLinks(movements){
  const links=new Map();
  for(const row of movements){
    if(!imported(row)||row._bankIdentityDivergent||row.mergedItems?.length)continue;
    const ref=referenceKey(row);
    if(!ref)continue;
    if(!links.has(ref))links.set(ref,[]);
    links.get(ref).push(row);
  }
  return links;
}

function consistentBankMovement(bank,movement){
  const evidence=bank._bankEvidence||bank;
  return dateKey(evidence.date)===movement.date&&bank.date===movement.date
    &&evidence.direction===movement.direction&&bank.direction===movement.direction
    &&Math.abs(cents(evidence.value))===cents(movement.value)&&cents(bank.value)===cents(movement.value);
}

function deduplicateBankMovements(rows){
  const sightings=new Map();
  const identity=row=>{
    if(!imported(row)||row.mergedItems?.length)return '';
    const evidence=row._bankEvidence||row;
    if(evidence.bankAccountId&&evidence.bankTransactionId){
      return JSON.stringify(['event',String(evidence.bankAccountId),String(evidence.bankTransactionId)]);
    }
    // A legacy reference can be a ticket or a batch number shared by multiple movements.
    // In that case only an identical replay of the same stored record is unambiguous.
    if(evidence.id!=null&&String(evidence.id).trim())return JSON.stringify(['row',String(evidence.id)]);
    return '';
  };
  for(const row of rows){
    const id=identity(row);
    if(!id)continue;
    const original=row._bankEvidence||row;
    const signature=JSON.stringify([row.date,row.direction,cents(row.value),referenceKey(row),
      original.date,original.direction,cents(original.value),original.reference||'',
      ...(!original.bankTransactionId?[original.description||'',original.importedAt||'']:[])]);
    if(!sightings.has(id))sightings.set(id,new Set());
    sightings.get(id).add(signature);
  }
  const seen=new Set();
  return rows.flatMap(row=>{
    const id=identity(row);
    if(!id)return [row];
    if(sightings.get(id).size>1)return [{...row,_bankIdentityDivergent:true}];
    if(seen.has(id))return [];
    seen.add(id);
    return [row];
  });
}

function registeredMovements(data){
  const normalized=cashMovements(data).flatMap(originalMovements).map(row=>({...row,date:dateKey(row.date||row.data_movimento||row.createdAt),direction:row.direction||row.direcao,
    value:Math.abs(cents(row.value??row.amount??row.valor))/100})).filter(row=>row.date&&['Entrada','Saída'].includes(row.direction));
  const rows=deduplicateBankMovements(normalized);
  const links=bankLinks(rows);
  const derivedCounts=new Map();
  for(const row of rows.filter(row=>row._derived))derivedCounts.set(row._sourceKey,(derivedCounts.get(row._sourceKey)||0)+1);
  return rows.flatMap(row=>{
    if(!row._derived||derivedCounts.get(row._sourceKey)!==1)return [row];
    const candidates=links.get(row._sourceKey)||[];
    if(candidates.length===1&&consistentBankMovement(candidates[0],row))return [];
    return [{...row,_reconciliationDivergent:candidates.length>0}];
  });
}

function dreMovementKey(row){
  return `${row._sourceKey||`cash:${row.id}`}|${row.date}|${Math.abs(Number(row.value)||0)}`;
}

function dreMovementLine(row,overrides={}){
  const override=overrides[dreMovementKey(row)]||overrides[row._legacyDreKey];
  return LINE[override]?override:classify(row);
}

function realizedMovements(data,through=todayISO()){
  return registeredMovements(data).filter(row=>row.date<=through);
}

function declaredReceipts(parcels,movements){
  const links=bankLinks(movements);
  return parcels.filter(row=>row.ativo!==false&&(settled(row.status)||norm(row.status)==='PARCIAL')
      &&dateKey(row.pago_em)&&cents(row.valor_liquidado)>0).map(row=>{
    const candidates=row.id==null?[]:links.get(`receivable:${row.id}`)||[];
    const matched=candidates.length===1&&consistentBankMovement(candidates[0],{direction:'Entrada',date:dateKey(row.pago_em),value:row.valor_liquidado});
    const evidence=matched?'extrato':row.origem_baixa==='ailos'?'retorno':null;
    return {...row,date:dateKey(row.pago_em),value:cents(row.valor_liquidado)/100,matched,evidence};
  });
}

function parcelFaceValue(row){
  return (cents(row.valor_previsto)+cents(row.juros)+cents(row.multa))/100;
}

function outstanding(row){
  if(row.ativo===false||cancelled(row.status)||settled(row.status))return 0;
  return Math.max(0,cents(parcelFaceValue(row))-cents(row.valor_liquidado))/100;
}

const openAccount=row=>row.active!==false&&!cancelled(row.status)&&!settled(row.status);
const openERP=row=>row.active!==false&&!cancelled(row.status)&&!settled(row.status)&&cents(row.remaining)>0;

function planAmounts(row,direction){
  const count=Math.min(600,Math.max(1,Math.trunc(Number(row.installments)||1)));
  const entry=direction==='Entrada'?Math.max(0,cents(row.entry)):0;
  const total=cents(row.total)||(cents(row.installmentValue)||cents(row.value))*count+entry;
  const balance=Math.max(0,total-entry);
  const unit=Math.floor(balance/count);
  const remainder=balance%count;
  return {entry:entry/100,installments:Array.from({length:count},(_,index)=>(unit+Number(index<remainder))/100)};
}

async function allPages(client,table,columns,filter=query=>query){
  const rows=[];
  const size=500;
  let lastId;
  for(;;){
    let query=filter(client.from(table).select(columns)).order('id',{ascending:true});
    if(lastId!==undefined)query=query.gt('id',lastId);
    const {data,error}=await query.limit(size);
    if(error)throw error;
    if(!data?.length)return rows;
    rows.push(...data);
    const nextId=data.at(-1).id;
    if(nextId==null||nextId===lastId)throw Error('A paginação não avançou. Atualize os dados e tente novamente.');
    lastId=nextId;
  }
}

return {LINES,LINE,GROUPS,LAYOUT,classify,classifyPlan,norm,cents,sumMoney,dateKey,todayISO,imported,cancelled,settled,dreMovementKey,dreMovementLine,cashMovements,registeredMovements,realizedMovements,declaredReceipts,referenceKey,parcelFaceValue,outstanding,openAccount,openERP,planAmounts,allPages};
});
