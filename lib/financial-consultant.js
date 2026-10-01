'use strict';
const DRE=require('../public/financeiro-dre-shared.js');
const number=v=>Number.isFinite(Number(v))?Number(v):0;
const cents=v=>Math.round(number(v)*100);
const sum=rows=>rows.reduce((s,r)=>s+cents(r.value),0)/100;
const round=v=>Math.round(number(v)*100)/100;
const norm=v=>String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
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
 const origin=r.origin||r.name||'';
 return [...(entry>0?[{date:r.start,direction,value:entry,origin}]:[]),...Array.from({length:count},(_,i)=>({date:shift((i+(entry>0?1:0))*step),direction,value,origin}))];
}
// Match the displayed Fluxo de Caixa: derive paid accounts/budget expenses,
// apply its overrides, and exclude legacy duplicate derived rows in cashflow.
// Description/natureza ride along for the DRE classification and charts.
function cashRows(d){
 const override=(row,key)=>({...row,...(d.cashflowOverrides?.[key]||{})});
 const masters=new Map(list(d,'accountMasters').map(m=>[String(m.id),m]));
 return [...list(d,'cashflow').filter(r=>!['Conta paga','Orçamento'].includes(r.source)),
 ...list(d,'accountPayments').filter(r=>r.status==='Paga').map(r=>{const m=masters.get(String(r.accountId));return override({date:r.paidAt?.slice(0,10)||r.due,direction:'Saída',value:number(r.value),description:m?.name||'Conta paga',kind:m?.category||'Despesa fixa',source:'Conta paga'},'account:'+r.id)}),
 ...list(d,'budgetExpenses').map(r=>override({date:r.date,direction:'Saída',value:number(r.value),description:r.description||'Gasto de orçamento',kind:'Despesa variável',source:'Orçamento'},'budget:'+r.id))];
}
const monthOf=v=>String(v||'').slice(0,7);
function shiftMonth(m,n){const x=new Date(m+'-01T00:00:00Z');x.setUTCMonth(x.getUTCMonth()+n);return x.toISOString().slice(0,7)}
function monthRange(a,b){const out=[];for(let m=a;m<=b&&out.length<24;m=shiftMonth(m,1))out.push(m);return out}
function monthsBack(end,n){const out=[];const d=new Date(monthOf(end)+'-01T00:00:00Z');for(let i=n-1;i>=0;i--){const x=new Date(d);x.setUTCMonth(x.getUTCMonth()-i);out.push(x.toISOString().slice(0,7))}return out}
function topGroups(rows,key,limit){
 const map=new Map();rows.forEach(r=>{const k=String(key(r)||'Sem natureza').trim()||'Sem natureza';map.set(k,(map.get(k)||0)+cents(r.value))});
 const all=[...map].map(([nome,c])=>({nome,valor:c/100})).sort((a,b)=>b.valor-a.valor);
 if(all.length<=limit)return all;
 const head=all.slice(0,limit-1),rest=all.slice(limit-1);
 return [...head,{nome:`Outras (${rest.length})`,valor:round(rest.reduce((s,x)=>s+x.valor,0))}];
}
// DRE gerencial (regime de caixa) com as mesmas regras da aba DRE.
function dreOf(rows){
 const lines=Object.fromEntries(DRE.LINES.map(l=>[l.id,0]));
 rows.forEach(r=>{const id=DRE.classify(r);lines[id]=(lines[id]||0)+cents(r.value)});
 const g={};DRE.LINES.forEach(l=>{g[l.group]=(g[l.group]||0)+lines[l.id]*l.sign});
 const val=gs=>gs.reduce((s,k)=>s+(g[k]||0),0)/100;
 const rb=val(['rb']);
 const pct=v=>rb?round(v/rb*100):null;
 const out={receita_bruta:rb,deducoes:val(['ded']),receita_liquida:val(['rb','ded']),custos_servicos:val(['csp']),lucro_bruto:val(['rb','ded','csp']),despesas_operacionais:val(['dop']),resultado_operacional:val(['rb','ded','csp','dop']),resultado_financeiro:val(['fin']),resultado_liquido:val(['rb','ded','csp','dop','fin']),investimentos:val(['inv']),distribuicao_socios:val(['soc']),geracao_caixa:val(['rb','ded','csp','dop','fin','inv','soc'])};
 out.margens={bruta_pct:pct(out.lucro_bruto),operacional_pct:pct(out.resultado_operacional),liquida_pct:pct(out.resultado_liquido)};
 out.linhas=DRE.LINES.map(l=>({id:l.id,linha:l.label,grupo:l.group,valor:round(lines[l.id]/100*l.sign)})).filter(x=>x.valor);
 return out;
}
function analyze(d,parcels,p,today,body={}){
 const within=v=>date(v)&&v>=p.start&&v<=p.end;
 const rows=cashRows(d).filter(r=>r.active!==false&&['Entrada','Saída'].includes(r.direction)&&date(r.date));
 const flow=rows.filter(r=>within(r.date));
 const cash={entradas:sum(flow.filter(r=>r.direction==='Entrada')),saidas:sum(flow.filter(r=>r.direction==='Saída')),registros:flow.length};cash.resultado=round(cash.entradas-cash.saidas);
 const due=parcels.filter(r=>within(r.vencimento));
 const outstanding=r=>Math.max(0,number(r.valor_previsto)+number(r.juros)+number(r.multa)-number(r.valor_liquidado));
 const late=parcels.filter(r=>r.vencimento<=p.end&&r.vencimento<today&&!['Pago','Cancelado'].includes(r.status)&&outstanding(r)>0);
 const receipts=parcels.filter(r=>within(r.pago_em));
 const planned=[...list(d,'planRevenues').flatMap(r=>scheduled(r,'Entrada')),...list(d,'planExpenses').flatMap(r=>scheduled(r,'Saída'))];
 const forecast=planned.filter(r=>within(r.date));
 const unpaid=list(d,'accountPayments').filter(r=>within(r.due)&&!['Paga','Pago','Cancelada','Cancelado'].includes(r.status));
 const previousEnd=new Date(Date.parse(p.start)-86400000).toISOString().slice(0,10),days=(Date.parse(p.end)-Date.parse(p.start))/86400000+1;
 const previousStart=new Date(Date.parse(p.start)-days*86400000).toISOString().slice(0,10),prior=rows.filter(r=>r.date>=previousStart&&r.date<=previousEnd);
 const result={periodo:p,gerado_em:new Date().toISOString(),base:['financeiro_estado_modulos: cashflow, budgetRecords, budgetExpenses, trips, tripExpenses, accountPayments, accountMasters, planRevenues, planExpenses, erpPlannedRevenues','fin_receb_parcelas: parcelas ativas e não canceladas'],observado:{fluxo_caixa:cash,recebimentos:{previsto_vencendo_no_periodo:sum(due.map(r=>({value:number(r.valor_previsto)+number(r.juros)+number(r.multa)}))),liquidado_por_data_pagamento:sum(receipts.map(r=>({value:r.valor_liquidado}))),parcelas_vencendo:due.length,em_atraso_ate_fim_periodo:late.length,saldo_em_atraso:sum(late.map(r=>({value:outstanding(r)})))},orcamentos:list(d,'budgetRecords').filter(r=>r.active!==false).map(b=>({nome:b.name,setor:b.sector,status:b.status||'Aberto',limite:number(b.limit),gastos:sum(list(d,'budgetExpenses').filter(e=>String(e.budgetId)===String(b.id)))})),viagens:{ativas:list(d,'trips').filter(t=>!['concluida','finalizada'].includes(norm(t.status))).length,concluidas:list(d,'trips').filter(t=>['concluida','finalizada'].includes(norm(t.status))).length,despesas_periodo:sum(list(d,'tripExpenses').filter(e=>within(e.date)))},comparacao:{periodo:{start:previousStart,end:previousEnd},entradas:sum(prior.filter(r=>r.direction==='Entrada')),saidas:sum(prior.filter(r=>r.direction==='Saída')),registros:prior.length}},projecao:{planejamento_manual:{entradas:sum(forecast.filter(r=>r.direction==='Entrada')),saidas:sum(forecast.filter(r=>r.direction==='Saída'))},contas_abertas_periodo:sum(unpaid),parcelas_a_receber_periodo:sum(due.map(r=>({value:outstanding(r)}))),entradas_erp_sincronizadas:sum(list(d,'erpPlannedRevenues').filter(r=>within(r.dueDate)).map(r=>({value:r.remaining})))},limitacoes:['Fluxo de caixa e recebimentos são bases distintas: não somar, podem representar o mesmo dinheiro. Gastos de viagens/orçamentos podem já estar no fluxo: não somar novamente.','Orçamentos e contagem de viagens: posição atual completa; despesas: datas no período.','Planejamento manual, parcelas e receitas ERP são fontes separadas; não somar sem reconciliar duplicidades. Folha futura não calculada nesta base.','DRE gerencial calculada só com lançamentos do sistema (regime de caixa), com as regras automáticas da aba DRE; reclassificações manuais e o histórico da planilha (jul–ago/2026) não entram.','Registros sem data válida são excluídos dos totais por período. Comparação sem registros não comprova ausência de atividade.','Saldo bancário inicial, margem de contribuição, ticket médio e ciclo de conversão não disponíveis. Caixa final e meta de vendas em unidades exigem essas premissas.','Liquidações parciais sem data de pagamento não entram no recebido por período. Inadimplência usa saldo em aberto atual: não reconstrói posição histórica.','Planejamento agrupa parcelas no primeiro dia do mês, conforme cadastro; não é fluxo diário garantido.']};
 // Séries mensais: o período e até 5 meses anteriores, para tendência.
 const window6=monthRange(monthOf(p.start)<monthsBack(p.end,6)[0]?monthOf(p.start):monthsBack(p.end,6)[0],monthOf(p.end));
 result.series={
  fluxo_mensal:window6.map(m=>{const r=rows.filter(x=>monthOf(x.date)===m),e=sum(r.filter(x=>x.direction==='Entrada')),s=sum(r.filter(x=>x.direction==='Saída'));return {mes:m,entradas:e,saidas:s,resultado:round(e-s),registros:r.length}}),
  recebimentos_mensal:window6.map(m=>{const v=parcels.filter(x=>monthOf(x.vencimento)===m),pg=v.filter(x=>x.status==='Pago').length;return {mes:m,previsto:sum(v.map(x=>({value:number(x.valor_previsto)}))),liquidado:sum(parcels.filter(x=>monthOf(x.pago_em)===m).map(x=>({value:x.valor_liquidado}))),parcelas:v.length,adimplencia_pct:v.length?round(pg/v.length*100):null}}),
  planejado_mensal:monthRange(monthOf(p.end),shiftMonth(monthOf(p.end),5)).map(m=>({mes:m,entradas:sum(planned.filter(x=>monthOf(x.date)===m&&x.direction==='Entrada')),saidas:sum(planned.filter(x=>monthOf(x.date)===m&&x.direction==='Saída'))}))
 };
 // Sem meses vazios antes do primeiro dado (mantém pelo menos o último mês).
 const trim=(arr,has)=>{const i=arr.findIndex(has);return i<0?arr.slice(-1):arr.slice(i)};
 result.series.fluxo_mensal=trim(result.series.fluxo_mensal,x=>x.registros);
 result.series.recebimentos_mensal=trim(result.series.recebimentos_mensal,x=>x.parcelas||x.liquidado);
 result.composicao={entradas_por_natureza:topGroups(flow.filter(r=>r.direction==='Entrada'),r=>r.kind,6),saidas_por_natureza:topGroups(flow.filter(r=>r.direction==='Saída'),r=>r.kind,8)};
 result.dre=dreOf(flow);
 // Detalhe para gráficos e PDF no navegador; o servidor não envia estas descrições à IA.
 result.detalhe={maiores_saidas:flow.filter(r=>r.direction==='Saída').sort((a,b)=>number(b.value)-number(a.value)).slice(0,10).map(r=>({data:r.date,descricao:String(r.description||'').slice(0,80),natureza:r.kind||'',valor:round(r.value)}))};
 const mesesComDados=result.series.fluxo_mensal.filter(x=>x.registros);
 result.indicadores={margem_caixa_pct:cash.entradas?round(cash.resultado/cash.entradas*100):null,saida_media_mensal_6m:mesesComDados.length?round(mesesComDados.reduce((s,x)=>s+x.saidas,0)/mesesComDados.length):null,entrada_media_mensal_6m:mesesComDados.length?round(mesesComDados.reduce((s,x)=>s+x.entradas,0)/mesesComDados.length):null,meses_com_lancamentos:mesesComDados.length,variacao_entradas_vs_periodo_anterior_pct:result.observado.comparacao.entradas?round((cash.entradas-result.observado.comparacao.entradas)/result.observado.comparacao.entradas*100):null,variacao_saidas_vs_periodo_anterior_pct:result.observado.comparacao.saidas?round((cash.saidas-result.observado.comparacao.saidas)/result.observado.comparacao.saidas*100):null,inadimplencia_do_periodo_pct:result.observado.recebimentos.previsto_vencendo_no_periodo?round(sum(due.filter(r=>r.vencimento<today&&!['Pago','Cancelado'].includes(r.status)).map(r=>({value:outstanding(r)})))/result.observado.recebimentos.previsto_vencendo_no_periodo*100):null};
 if(body.target!==undefined){const target=Number(body.target);if(!Number.isFinite(target)||target<0)throw Object.assign(Error('Meta deve ser um valor positivo.'),{status:400});result.cenario_meta={objetivo_faturamento:target,entrada_caixa_observada:cash.entradas,diferenca_para_entrada_caixa:Math.max(0,round(target-cash.entradas)),premissa:'Comparação com entradas de caixa, que não equivalem a faturamento contábil. Prazo, margem e conversão de vendas em caixa precisam ser informados.'}}
 return result;
}
// O que vai para a IA: tudo menos descrições linha a linha (podem conter nomes de pessoas).
function forModel(metrics){const {detalhe,...rest}=metrics;return rest}
module.exports={period,analyze,scheduled,cashRows,dreOf,forModel};
