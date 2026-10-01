/* Integral Financeiro — gráficos do Consultor Financeiro.
   Uma única definição por gráfico, desenhada em SVG no chat e em vetor no PDF.
   Os números vêm sempre da base calculada no servidor, nunca do texto da IA. */
(function(){
'use strict';
const MES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mesLabel=m=>{const [y,mm]=String(m).split('-');return `${MES[+mm-1]||mm}/${String(y).slice(2)}`};
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function compact(v){const a=Math.abs(v),s=v<0?'-':'';if(a>=1e6)return `${s}R$ ${(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})} mi`;if(a>=1e3)return `${s}R$ ${(a/1e3).toLocaleString('pt-BR',{maximumFractionDigits:a>=1e4?0:1})} mil`;return `${s}R$ ${Math.round(a)}`}
/* Paleta de referência validada (slots 1–2 categóricos e polo negativo). */
const PDF_COLORS={s1:[42,120,214],s2:[235,104,52],neg:[227,73,72],grid:[224,230,229],text:[24,53,82],muted:[91,107,123]};

const DEFS={
 fluxo_mensal:{titulo:'Entradas e saídas por mês',sub:'Fluxo de caixa realizado',type:'columns',data:b=>{const s=b.series?.fluxo_mensal||[];return {cats:s.map(x=>mesLabel(x.mes)),series:[{name:'Entradas',slot:'s1',values:s.map(x=>x.entradas)},{name:'Saídas',slot:'s2',values:s.map(x=>x.saidas)}]}}},
 resultado_mensal:{titulo:'Resultado de caixa por mês',sub:'Entradas menos saídas',type:'columns',polarity:true,data:b=>{const s=b.series?.fluxo_mensal||[];return {cats:s.map(x=>mesLabel(x.mes)),series:[{name:'Resultado',slot:'s1',values:s.map(x=>x.resultado)}]}}},
 saidas_natureza:{titulo:'Para onde foi o dinheiro',sub:'Saídas do período por natureza',type:'hbars',data:b=>({items:(b.composicao?.saidas_por_natureza||[]).map(x=>({label:x.nome,value:x.valor}))})},
 entradas_natureza:{titulo:'De onde veio o dinheiro',sub:'Entradas do período por natureza',type:'hbars',data:b=>({items:(b.composicao?.entradas_por_natureza||[]).map(x=>({label:x.nome,value:x.valor}))})},
 recebimentos_mensal:{titulo:'Boletos: previsto x liquidado',sub:'Recebimentos por mês (vencimento x pagamento)',type:'columns',data:b=>{const s=b.series?.recebimentos_mensal||[];return {cats:s.map(x=>mesLabel(x.mes)),series:[{name:'Previsto',slot:'s1',values:s.map(x=>x.previsto)},{name:'Liquidado',slot:'s2',values:s.map(x=>x.liquidado)}]}}},
 planejado_mensal:{titulo:'Próximos meses no Planejamento',sub:'Entradas e saídas planejadas',type:'columns',data:b=>{const s=b.series?.planejado_mensal||[];return {cats:s.map(x=>mesLabel(x.mes)),series:[{name:'Entradas planejadas',slot:'s1',values:s.map(x=>x.entradas)},{name:'Saídas planejadas',slot:'s2',values:s.map(x=>x.saidas)}]}}},
 dre_resumo:{titulo:'DRE gerencial do período',sub:'Resultados acumulados (regime de caixa)',type:'hbars',polarity:true,data:b=>{const d=b.dre||{};return {items:[['Receita bruta',d.receita_bruta],['Receita líquida',d.receita_liquida],['Lucro bruto',d.lucro_bruto],['Resultado operacional',d.resultado_operacional],['Resultado líquido',d.resultado_liquido],['Geração de caixa',d.geracao_caixa]].map(([label,value])=>({label,value:Number(value||0)}))}}}
};
const hasData=(id,b)=>{const def=DEFS[id];if(!def)return false;const d=def.data(b);return def.type==='hbars'?d.items.some(x=>x.value):d.series.some(s=>s.values.some(v=>v))};
function niceMax(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p}

/* ---------- SVG (chat) ---------- */
function svg(id,base){
 const def=DEFS[id];if(!def||!hasData(id,base))return '';
 const d=def.data(base),W=640;
 let body='',H,legend='';
 if(def.type==='columns'){
  H=250;const L=64,R=12,T=14,B=30,pw=W-L-R,ph=H-T-B;
  const all=d.series.flatMap(s=>s.values),max=niceMax(Math.max(0,...all)),min=def.polarity?-niceMax(Math.max(0,...all.map(v=>-v))):0;
  const y=v=>T+ph*(max-v)/((max-min)||1),zero=y(0);
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);body+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" class="g"/><text x="${L-8}" y="${yy+4}" text-anchor="end" class="t">${E(compact(v))}</text>`}
  const band=pw/Math.max(1,d.cats.length),n=d.series.length,bw=Math.min(24,(band*0.7-2*(n-1))/n);
  d.cats.forEach((c,i)=>{
   const gx=L+band*i+band/2-(n*bw+2*(n-1))/2;
   d.series.forEach((s,k)=>{const v=s.values[i]||0,x=gx+k*(bw+2),top=Math.min(y(v),zero),h=Math.max(v?1:0,Math.abs(y(v)-zero)),cls=def.polarity?(v<0?'neg':'s1'):s.slot,r=Math.min(4,h,bw/2);
    const path=v>=0?`M${x},${top+h}V${top+r}Q${x},${top} ${x+r},${top}H${x+bw-r}Q${x+bw},${top} ${x+bw},${top+r}V${top+h}Z`:`M${x},${top}V${top+h-r}Q${x},${top+h} ${x+r},${top+h}H${x+bw-r}Q${x+bw},${top+h} ${x+bw},${top+h-r}V${top}Z`;
    body+=`<path d="${path}" class="${cls}"><title>${E(c)} · ${E(s.name)}: ${E(brl(v))}</title></path>`});
   body+=`<text x="${L+band*i+band/2}" y="${H-10}" text-anchor="middle" class="t">${E(c)}</text>`;
  });
  body+=`<line x1="${L}" x2="${W-R}" y1="${zero}" y2="${zero}" class="z"/>`;
  if(n>1)legend=`<div class="fin-agent-legend">${d.series.map(s=>`<span><i class="${s.slot}"></i>${E(s.name)}</span>`).join('')}</div>`;
 }else{
  const items=d.items,row=28;H=items.length*row+16;const L=170,R=96,pw=W-L-R;
  const max=Math.max(0,...items.map(x=>x.value)),min=def.polarity?Math.min(0,...items.map(x=>x.value)):0,span=(max-min)||1,x0=L+pw*(-min)/span;
  items.forEach((it,i)=>{const yy=8+i*row,w=pw*Math.abs(it.value)/span,x=it.value>=0?x0:x0-w,cls=def.polarity&&it.value<0?'neg':'s1',r=Math.min(4,w/2);
   const path=it.value>=0?`M${x},${yy}H${x+w-r}Q${x+w},${yy} ${x+w},${yy+r}V${yy+18-r}Q${x+w},${yy+18} ${x+w-r},${yy+18}H${x}Z`:`M${x+w},${yy}H${x+r}Q${x},${yy} ${x},${yy+r}V${yy+18-r}Q${x},${yy+18} ${x+r},${yy+18}H${x+w}Z`;
   body+=`<text x="${L-10}" y="${yy+13}" text-anchor="end" class="t l">${E(it.label.length>26?it.label.slice(0,25)+'…':it.label)}</text><path d="${path}" class="${cls}"><title>${E(it.label)}: ${E(brl(it.value))}</title></path><text x="${Math.max(x+w,x0)+6}" y="${yy+13}" class="t v">${E(compact(it.value))}</text>`});
  if(min<0)body+=`<line x1="${x0}" x2="${x0}" y1="4" y2="${H-4}" class="z"/>`;
 }
 const table=def.type==='columns'?`<table><thead><tr><th>Mês</th>${d.series.map(s=>`<th>${E(s.name)}</th>`).join('')}</tr></thead><tbody>${d.cats.map((c,i)=>`<tr><td>${E(c)}</td>${d.series.map(s=>`<td>${E(brl(s.values[i]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`:`<table><tbody>${d.items.map(x=>`<tr><td>${E(x.label)}</td><td>${E(brl(x.value))}</td></tr>`).join('')}</tbody></table>`;
 return `<figure class="fin-agent-chart" data-chart="${id}"><figcaption><b>${E(def.titulo)}</b><small>${E(def.sub)}</small></figcaption>${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${E(def.titulo)}">${body}</svg><details><summary>Ver dados</summary>${table}</details></figure>`;
}

/* ---------- PDF (jsPDF, milímetros) ---------- */
function pdf(doc,id,base,x,y,w,h,clean){
 const def=DEFS[id];if(!def||!hasData(id,base))return false;
 const d=def.data(base),c=PDF_COLORS,t=s=>clean?clean(s):s;
 doc.setTextColor(...c.text);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(t(def.titulo),x,y+4);
 doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...c.muted);doc.text(t(def.sub),x,y+8.5);
 let top=y+13;
 if(def.type==='columns'&&d.series.length>1){let lx=x;d.series.forEach(s=>{doc.setFillColor(...c[s.slot]);doc.roundedRect(lx,top-2.4,3,3,0.6,0.6,'F');doc.setTextColor(...c.text);doc.text(t(s.name),lx+4.5,top);lx+=doc.getTextWidth(t(s.name))+11});top+=4}
 if(def.type==='columns'){
  const L=x+20,R=x+w,T=top+2,B=y+h-7,ph=B-T,pw=R-L;
  const all=d.series.flatMap(s=>s.values),max=niceMax(Math.max(0,...all)),min=def.polarity?-niceMax(Math.max(0,...all.map(v=>-v))):0,yy=v=>T+ph*(max-v)/((max-min)||1);
  doc.setFontSize(7);
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,py=yy(v);doc.setDrawColor(...c.grid);doc.setLineWidth(0.2);doc.line(L,py,R,py);doc.setTextColor(...c.muted);doc.text(t(compact(v)),L-2,py+1,{align:'right'})}
  const band=pw/Math.max(1,d.cats.length),n=d.series.length,bw=Math.min(7,(band*0.7-0.6*(n-1))/n);
  d.cats.forEach((cat,i)=>{const gx=L+band*i+band/2-(n*bw+0.6*(n-1))/2;
   d.series.forEach((s,k)=>{const v=s.values[i]||0;if(!v)return;const bx=gx+k*(bw+0.6),y1=yy(v),y0=yy(0),hh=Math.abs(y1-y0);doc.setFillColor(...(def.polarity?(v<0?c.neg:c.s1):c[s.slot]));const r=Math.min(1,hh/2,bw/2);doc.roundedRect(bx,Math.min(y1,y0),bw,hh,r,r,'F');doc.rect(bx,v>=0?y0-Math.min(r,hh):Math.min(y1,y0),bw,Math.min(r,hh),'F')});
   doc.setTextColor(...c.muted);doc.text(t(cat),L+band*i+band/2,B+4,{align:'center'})});
  doc.setDrawColor(...c.muted);doc.setLineWidth(0.3);doc.line(L,yy(0),R,yy(0));
 }else{
  const items=d.items,rowH=Math.min(7,(y+h-top)/Math.max(1,items.length)),L=x+48,R=x+w-24,pw=R-L;
  const max=Math.max(0,...items.map(i=>i.value)),min=def.polarity?Math.min(0,...items.map(i=>i.value)):0,span=(max-min)||1,x0=L+pw*(-min)/span;
  doc.setFontSize(8);
  items.forEach((it,i)=>{const py=top+i*rowH,bh=rowH*0.62,bwid=pw*Math.abs(it.value)/span,bx=it.value>=0?x0:x0-bwid;
   doc.setTextColor(...c.text);const lab=t(it.label.length>30?it.label.slice(0,29)+'...':it.label);doc.text(lab,L-2,py+bh*0.75,{align:'right'});
   if(bwid>0){doc.setFillColor(...(def.polarity&&it.value<0?c.neg:c.s1));doc.roundedRect(bx,py,bwid,bh,Math.min(1,bwid/2),Math.min(1,bwid/2),'F')}
   doc.setTextColor(...c.muted);doc.text(t(compact(it.value)),Math.max(bx+bwid,x0)+1.5,py+bh*0.75)});
  if(min<0){doc.setDrawColor(...c.muted);doc.setLineWidth(0.3);doc.line(x0,top-1,x0,top+items.length*rowH)}
 }
 return true;
}
window.IntegralAgentCharts={ids:Object.keys(DEFS),defs:DEFS,svg,pdf,hasData,compact,brl,mesLabel};
})();
