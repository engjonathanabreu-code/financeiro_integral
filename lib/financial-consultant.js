'use strict';
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const cents=v=>Math.round(number(v)*100);
const sum=rows=>rows.reduce((s,r)=>s+cents(r.value),0)/100;
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const list=(d,k)=>Array.isArray(d[k])?d[k]:[];
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function period(body,today){
 const start=body.start||today.slice(0,7)+'-01',end=body.end||today;
 if(!date(start)||!date(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>366)throw Object.assign(Error('Informe um período válido de até 366 dias.'),{status:400});
 return {start,end};
}
function scheduled(r,direction){
 if(!date(r.start))return [];
 const count=Math.max(1,Math.min(600,number(r.installments)||1));
 const step=({Trimestral:3,Semestral:6,Anual:12})[r.cadence]||(r.cadence==='Personalizado'?Math.max(1,number(r.interval)):1);
 const entry=direction==='Entrada'?Math.max(0,number(r.entry)):0;
 const total=number(r.total)||number(r.value)*count;
 const value=direction==='Entrada'?(number(r.installmentValue)||(total-entry)/count):total/count;
 const shift=n=>{const d=new Date(r.start+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,10)};
 return [...(entry>0?[{date:r.start,direction,value:entry}]:[]),...Array.from({length:count},(_,i)=>({date:shift((i+(entry>0?1:0))*step),direction,value}))];
}
// Match the displayed Fluxo de Caixa: derive paid accounts/budget expenses,
// apply its overrides, and exclude legacy duplicate derived rows in cashflow.
function cashRows(d){
 const override=(row,key)=>({...row,...(d.cashflowOverrides?.[key]||{})});
 return [...list(d,'cashflow').filter(r=>!['Conta paga','Orçamento'].includes(r.source)),
 ...list(d,'accountPayments').filter(r=>r.status==='Paga').map(r=>override({date:r.paidAt?.slice(0,10)||r.due,direction:'Saída',value:number(r.value)},'account:'+r.id)),
 ...list(d,'budgetExpenses').map(r=>override({date:r.date,direction:'Saída',value:number(r.value)},'budget:'+r.id))];
}
function analyze(d,parcels,p,today,body={}){
 const within=v=>date(v)&&v>=p.start&&v<=p.end;
 const rows=cashRows(d).filter(r=>r.active!==false&&['Entrada','Saída'].includes(r.direction)&&date(r.date));
 const flow=rows.filter(r=>within(r.date));
 const cash={entradas:sum(flow.filter(r=>r.direction==='Entrada')),saidas:sum(flow.filter(r=>r.direction==='Saída')),registros:flow.length};cash.resultado=cash.entradas-cash.saidas;
 const due=parcels.filter(r=>within(r.vencimento));
 const outstanding=r=>Math.max(0,number(r.valor_previsto)+number(r.juros)+number(r.multa)-number(r.valor_liquidado));
 const late=parcels.filter(r=>r.vencimento<=p.end&&r.vencimento<today&&!['Pago','Cancelado'].includes(r.status)&&outstanding(r)>0);
 const receipts=parcels.filter(r=>within(r.pago_em));
 const planned=[...list(d,'planRevenues').flatMap(r=>scheduled(r,'Entrada')),...list(d,'planExpenses').flatMap(r=>scheduled(r,'Saída'))];
 const forecast=planned.filter(r=>within(r.date));
 const unpaid=list(d,'accountPayments').filter(r=>within(r.due)&&!['Paga','Pago','Cancelada','Cancelado'].includes(r.status));
 const previousEnd=new Date(Date.parse(p.start)-86400000).toISOString().slice(0,10),days=(Date.parse(p.end)-Date.parse(p.start))/86400000+1;
 const previousStart=new Date(Date.parse(p.start)-days*86400000).toISOString().slice(0,10),prior=rows.filter(r=>r.date>=previousStart&&r.date<=previousEnd);
 const result={periodo:p,gerado_em:new Date().toISOString(),base:['financeiro_estado_modulos: cashflow, budgetRecords, budgetExpenses, trips, tripExpenses, accountPayments, planRevenues, planExpenses, erpPlannedRevenues','fin_receb_parcelas: parcelas ativas e não canceladas'],observado:{fluxo_caixa:cash,recebimentos:{previsto_vencendo_no_periodo:sum(due.map(r=>({value:number(r.valor_previsto)+number(r.juros)+number(r.multa)}))),liquidado_por_data_pagamento:sum(receipts.map(r=>({value:r.valor_liquidado}))),parcelas_vencendo:due.length,em_atraso_ate_fim_periodo:late.length,saldo_em_atraso:sum(late.map(r=>({value:outstanding(r)})))},orcamentos:list(d,'budgetRecords').filter(r=>r.active!==false).map(b=>({nome:b.name,setor:b.sector,status:b.status||'Aberto',limite:number(b.limit),gastos:sum(list(d,'budgetExpenses').filter(e=>String(e.budgetId)===String(b.id)))})),viagens:{ativas:list(d,'trips').filter(t=>!['concluida','finalizada'].includes(norm(t.status))).length,concluidas:list(d,'trips').filter(t=>['concluida','finalizada'].includes(norm(t.status))).length,despesas_periodo:sum(list(d,'tripExpenses').filter(e=>within(e.date)))},comparacao:{periodo:{start:previousStart,end:previousEnd},entradas:sum(prior.filter(r=>r.direction==='Entrada')),saidas:sum(prior.filter(r=>r.direction==='Saída')),registros:prior.length}},projecao:{planejamento_manual:{entradas:sum(forecast.filter(r=>r.direction==='Entrada')),saidas:sum(forecast.filter(r=>r.direction==='Saída'))},contas_abertas_periodo:sum(unpaid),parcelas_a_receber_periodo:sum(due.map(r=>({value:outstanding(r)}))),entradas_erp_sincronizadas:sum(list(d,'erpPlannedRevenues').filter(r=>within(r.dueDate)).map(r=>({value:r.remaining})))},limitacoes:['Fluxo de caixa e recebimentos são bases distintas: não somar, podem representar o mesmo dinheiro. Gastos de viagens/orçamentos podem já estar no fluxo: não somar novamente.','Orçamentos e contagem de viagens: posição atual completa; despesas: datas no período.','Planejamento manual, parcelas e receitas ERP são fontes separadas; não somar sem reconciliar duplicidades. Folha futura e DRE não calculadas nesta base.','Registros sem data válida são excluídos dos totais por período. Comparação sem registros não comprova ausência de atividade.','Saldo bancário inicial, margem de contribuição, ticket médio e ciclo de conversão não disponíveis. Caixa final e meta de vendas em unidades exigem essas premissas.','Liquidações parciais sem data de pagamento não entram no recebido por período. Inadimplência usa saldo em aberto atual: não reconstrói posição histórica.','Planejamento agrupa parcelas no primeiro dia do mês, conforme cadastro; não é fluxo diário garantido.']};
 if(body.target!==undefined){const target=Number(body.target);if(!Number.isFinite(target)||target<0)throw Object.assign(Error('Meta deve ser um valor positivo.'),{status:400});result.cenario_meta={objetivo_faturamento:target,entrada_caixa_observada:cash.entradas,diferenca_para_entrada_caixa:Math.max(0,target-cash.entradas),premissa:'Comparação com entradas de caixa, que não equivalem a faturamento contábil. Prazo, margem e conversão de vendas em caixa precisam ser informados.'}}
 return result;
}
module.exports={period,analyze,scheduled,cashRows};
