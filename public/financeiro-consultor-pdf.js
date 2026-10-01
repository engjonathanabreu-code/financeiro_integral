/* Integral Financeiro — relatórios em PDF do Consultor Financeiro.
   Monta no navegador (jsPDF + autotable já carregados pelo index.html):
   capa com indicadores, texto da análise, gráficos vetoriais, DRE e tabelas.
   Sem IA disponível, o texto é gerado a partir dos próprios indicadores. */
(function(){
'use strict';
const BRAND=[17,94,89],SOFT=[227,238,236],TEXT=[24,53,82],MUTED=[91,107,123],LINE=[214,226,223];
const TONE={positivo:[30,123,69],atencao:[178,94,9],critico:[180,35,24]};
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const pct=v=>v==null||!isFinite(v)?'—':`${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const dateBR=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'';
/* jsPDF usa fontes WinAnsi: troca símbolos que não existem nela. */
function clean(s){return String(s??'').replace(/[−–—]/g,'-').replace(/×/g,'x').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/…/g,'...').replace(/[•·]/g,'-').replace(/≥/g,'>=').replace(/≤/g,'<=').replace(/→/g,'->').replace(/[^\x00-\xFF]/g,'')}
function plain(md){return clean(String(md||'').replace(/\*\*(.+?)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/^#{1,6}\s*/gm,'').replace(/^\s*[-*]\s+/gm,'- '))}
let logoPromise=null;
function logo(){if(!logoPromise)logoPromise=fetch('logo-integral.png').then(r=>r.ok?r.blob():null).then(b=>b?new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>res(null);fr.readAsDataURL(b)}):null).catch(()=>null);return logoPromise}

/* Leitura automática dos números — usada quando a IA não está disponível
   e como saudação do consultor no chat. */
function insights(b){
 const f=b.observado?.fluxo_caixa||{},r=b.observado?.recebimentos||{},cmp=b.observado?.comparacao||{},dre=b.dre||{},ind=b.indicadores||{};
 const out=[];
 if(f.registros){
  out.push({tema:'Resultado de caixa',avaliacao:f.resultado>=0?'positivo':'critico',texto:`Entraram ${brl(f.entradas)} e saíram ${brl(f.saidas)}, resultado de ${brl(f.resultado)}${ind.margem_caixa_pct!=null?` (margem de caixa de ${pct(ind.margem_caixa_pct)})`:''}.`});
  if(cmp.registros&&ind.variacao_entradas_vs_periodo_anterior_pct!=null)out.push({tema:'Comparação com o período anterior',avaliacao:ind.variacao_entradas_vs_periodo_anterior_pct>=0?'positivo':'atencao',texto:`As entradas variaram ${pct(ind.variacao_entradas_vs_periodo_anterior_pct)} e as saídas ${pct(ind.variacao_saidas_vs_periodo_anterior_pct)} em relação a ${dateBR(cmp.periodo?.start)}–${dateBR(cmp.periodo?.end)}.`});
  const top=(b.composicao?.saidas_por_natureza||[])[0];if(top&&f.saidas)out.push({tema:'Maior grupo de saídas',avaliacao:top.valor/f.saidas>0.4?'atencao':'positivo',texto:`${top.nome} somou ${brl(top.valor)}, ${pct(top.valor/f.saidas*100)} das saídas do período.`});
  if(dre.distribuicao_socios&&f.resultado!=null){const soc=Math.abs(dre.distribuicao_socios);out.push({tema:'Retiradas dos sócios',avaliacao:soc>Math.max(0,dre.resultado_liquido||0)?'atencao':'positivo',texto:`As retiradas somaram ${brl(soc)} frente a um resultado líquido de ${brl(dre.resultado_liquido)} antes delas.`})}
 }else out.push({tema:'Fluxo de caixa',avaliacao:'atencao',texto:'Não há lançamentos no fluxo de caixa para este período; os totais zerados não significam ausência de movimento na empresa.'});
 if(r.parcelas_vencendo)out.push({tema:'Recebimentos de boletos',avaliacao:(ind.inadimplencia_do_periodo_pct||0)>15?'critico':(ind.inadimplencia_do_periodo_pct||0)>5?'atencao':'positivo',texto:`${r.parcelas_vencendo} parcelas venceram no período (${brl(r.previsto_vencendo_no_periodo)}); ${brl(r.liquidado_por_data_pagamento)} foram liquidados e há ${brl(r.saldo_em_atraso)} em atraso (${r.em_atraso_ate_fim_periodo} parcelas).`});
 return out;
}

function kpis(b){const f=b.observado?.fluxo_caixa||{},r=b.observado?.recebimentos||{},d=b.dre||{};return [['Entradas',brl(f.entradas)],['Saídas',brl(f.saidas)],['Resultado de caixa',brl(f.resultado)],['Margem líquida (DRE)',pct(d.margens?.liquida_pct)],['Boletos liquidados',brl(r.liquidado_por_data_pagamento)],['Em atraso',brl(r.saldo_em_atraso)]]}

async function build({base,relatorio=null,analise=null,usuario=''}){
 const J=window.jspdf?.jsPDF;if(!J)throw Error('Biblioteca de PDF não carregada. Recarregue a página.');
 const doc=new J({unit:'mm',format:'a4'}),W=210,H=297,M=16,CW=W-2*M,img=await logo();
 const per=base.periodo||{},periodo=`${dateBR(per.start)} a ${dateBR(per.end)}`;
 let y=0;
 const text=(s,size=10,style='normal',color=TEXT)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...color);return clean(s)};
 const ensure=h=>{if(y+h>H-18){doc.addPage();y=M+4}};
 const para=(s,size=10,color=TEXT,gap=1.6)=>{const lines=doc.splitTextToSize(text(s,size,'normal',color),CW);lines.forEach(l=>{ensure(size*0.45);doc.text(l,M,y);y+=size*0.42+0.4});y+=gap};
 const heading=s=>{ensure(14);y+=3;doc.setFillColor(...BRAND);doc.rect(M,y-4,1.2,5.6,'F');doc.text(text(s,13,'bold',TEXT),M+4,y);y+=7};
 /* Cabeçalho */
 doc.setFillColor(...SOFT);doc.rect(0,0,W,40,'F');doc.setFillColor(...BRAND);doc.rect(0,40,W,1.2,'F');
 if(img)try{doc.addImage(img,'PNG',M,9,34,19,undefined,'FAST')}catch{}
 const title=relatorio?.titulo||(analise?'Análise do Consultor Financeiro':'Relatório financeiro gerencial');
 doc.text(text('RELATÓRIO FINANCEIRO',8,'bold',BRAND),W-M,13,{align:'right'});
 doc.text(doc.splitTextToSize(text(title,15,'bold'),110),W-M,20,{align:'right'});
 doc.text(text(`Período: ${periodo}`,9,'normal',MUTED),W-M,32,{align:'right'});
 doc.text(text(`Gerado em ${new Date().toLocaleString('pt-BR')}${usuario?` para ${usuario}`:''}`,8,'normal',MUTED),W-M,36.5,{align:'right'});
 y=50;
 /* Mensagem-chave */
 const key=relatorio?.mensagem_chave||(analise?null:insights(base)[0]?.texto);
 if(key){const lines=doc.splitTextToSize(text(key,11,'bold'),CW-12);const h=lines.length*5+8;doc.setFillColor(...SOFT);doc.roundedRect(M,y,CW,h,2,2,'F');doc.setFillColor(...BRAND);doc.rect(M,y,1.4,h,'F');doc.text(lines,M+6,y+6.5);y+=h+6}
 /* Indicadores */
 const k=kpis(base),cw=(CW-8)/3;
 k.forEach(([l,v],i)=>{const cx=M+(i%3)*(cw+4),cy=y+Math.floor(i/3)*20;doc.setDrawColor(...LINE);doc.setLineWidth(0.3);doc.roundedRect(cx,cy,cw,16,2,2,'S');doc.text(text(l,8,'normal',MUTED),cx+4,cy+5.5);doc.text(text(v,12,'bold'),cx+4,cy+12)});
 y+=Math.ceil(k.length/3)*20+4;
 /* Texto principal */
 if(analise){
  heading('Pergunta');para(analise.pergunta,10,MUTED);
  heading('Análise');
  plain(analise.texto).split(/\n{1,}/).forEach(p=>{if(p.trim())para(p.trim(),10,TEXT,1)});
 }else{
  heading('Resumo executivo');
  if(relatorio?.resumo_executivo)plain(relatorio.resumo_executivo).split(/\n{2,}|\n/).forEach(p=>{if(p.trim())para(p.trim())});
  else para('Leitura automática dos indicadores (a análise com IA não estava disponível ao gerar este relatório).',9,MUTED);
  const diag=relatorio?.diagnostico?.length?relatorio.diagnostico:insights(base);
  heading('Diagnóstico');
  diag.forEach(d=>{const tone=TONE[d.avaliacao]||MUTED,label=d.avaliacao==='positivo'?'Positivo':d.avaliacao==='critico'?'Crítico':'Atenção';ensure(16);doc.setFillColor(...tone);doc.roundedRect(M,y-3.6,18,5,1.2,1.2,'F');doc.text(text(label,7,'bold',[255,255,255]),M+9,y-0.2,{align:'center'});doc.text(text(d.tema,10,'bold'),M+21,y);y+=5;para(d.texto,9.5,TEXT,2.5)});
 }
 /* Gráficos */
 const C=window.IntegralAgentCharts;
 let charts=(analise?.graficos?.length?analise.graficos:relatorio?.graficos?.length?relatorio.graficos:['fluxo_mensal','saidas_natureza','dre_resumo','recebimentos_mensal']).filter(id=>C?.hasData(id,base));
 if(!analise&&!charts.includes('dre_resumo')&&C?.hasData('dre_resumo',base))charts.push('dre_resumo');
 if(charts.length){heading('Gráficos');charts.forEach(id=>{ensure(78);C.pdf(doc,id,base,M,y,CW,72,clean);y+=80})}
 /* Riscos e recomendações (relatório com IA) */
 const table=(head,body,widths)=>{if(!doc.autoTable)return;doc.autoTable({startY:y,head:[head.map(clean)],body:body.map(r=>r.map(clean)),margin:{left:M,right:M},styles:{font:'helvetica',fontSize:8.5,cellPadding:2.2,textColor:TEXT,lineColor:LINE,lineWidth:0.2,valign:'top'},headStyles:{fillColor:BRAND,textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[250,249,245]},columnStyles:widths||{},didDrawPage:()=>{}});y=doc.lastAutoTable.finalY+6};
 if(relatorio?.recomendacoes?.length){heading('Recomendações');table(['Prioridade','Ação','Por quê','Impacto estimado','Prazo'],relatorio.recomendacoes.map(r=>[r.prioridade==='alta'?'Alta':r.prioridade==='media'?'Média':'Baixa',r.acao,r.porque,r.impacto_estimado,r.prazo]),{0:{cellWidth:18},1:{cellWidth:42},4:{cellWidth:20}})}
 if(relatorio?.riscos?.length){heading('Riscos e mitigação');table(['Risco','Impacto','Mitigação'],relatorio.riscos.map(r=>[r.risco,r.impacto,r.mitigacao]))}
 if(relatorio?.proximos_passos?.length){heading('Próximos passos');relatorio.proximos_passos.forEach((p,i)=>para(`${i+1}. ${p}`,10,TEXT,0.8));y+=2}
 /* DRE */
 const d=base.dre;
 if(d&&d.receita_bruta!=null&&!analise){heading('DRE gerencial do período');
  const rows=[['Receita operacional bruta',d.receita_bruta],['(-) Deduções',d.deducoes],['= Receita líquida',d.receita_liquida],['(-) Custos dos serviços',d.custos_servicos],['= Lucro bruto',d.lucro_bruto],['(-) Despesas operacionais',d.despesas_operacionais],['= Resultado operacional (EBITDA)',d.resultado_operacional],['(-) Resultado financeiro',d.resultado_financeiro],['= Resultado líquido',d.resultado_liquido],['(-) Investimentos',d.investimentos],['(-) Distribuição aos sócios',d.distribuicao_socios],['= Geração de caixa',d.geracao_caixa]];
  table(['Linha','Valor','% da receita'],rows.map(([l,v])=>[l,brl(v),d.receita_bruta?pct(v/d.receita_bruta*100):'—']),{1:{halign:'right',cellWidth:38},2:{halign:'right',cellWidth:28}});
  para('Regime de caixa, com as regras automáticas da aba DRE e somente lançamentos do sistema.',8,MUTED);
 }
 const top=base.detalhe?.maiores_saidas||[];
 if(top.length&&!analise){heading('Maiores saídas do período');table(['Data','Descrição','Natureza','Valor'],top.map(r=>[dateBR(r.data),r.descricao,r.natureza,brl(r.valor)]),{0:{cellWidth:20},3:{halign:'right',cellWidth:30}})}
 /* Fontes e limitações */
 heading('Fontes e limitações');
 para(`Fontes: ${(base.base||[]).join('; ')}.`,8,MUTED,1);
 (base.limitacoes||[]).forEach(l=>para(`- ${l}`,8,MUTED,0.6));
 para('Análise gerencial gerada com apoio de IA a partir dos dados do sistema; não substitui a contabilidade oficial e exige interpretação humana.',8,MUTED);
 /* Rodapé */
 const pages=doc.getNumberOfPages();
 for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(...LINE);doc.setLineWidth(0.2);doc.line(M,H-12,W-M,H-12);doc.text(text('Integral Soluções em Engenharia · Consultor Financeiro · uso interno',7.5,'normal',MUTED),M,H-7.5);doc.text(text(`Página ${i} de ${pages}`,7.5,'normal',MUTED),W-M,H-7.5,{align:'right'})}
 const name=`Relatorio_Financeiro_Integral_${per.start||''}_a_${per.end||''}.pdf`;
 doc.save(name);
 return name;
}
window.IntegralAgentPDF={build,insights,clean};
})();
