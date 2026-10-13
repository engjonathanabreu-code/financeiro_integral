(function(root){
'use strict';
const compare=(a,b)=>String(a||'').localeCompare(String(b||''),'pt-BR',{numeric:true,sensitivity:'base'});
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const br=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Sem vencimento';
const cents=v=>Math.round((Number(v)||0)*100);
const norm=v=>String(v||'').trim().toUpperCase();
function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function groupFor(c,remessas){
 const r=remessas.find(r=>r.id===c.remessa_id&&r.municipio_id===c.municipio_id);
 if(r)return {id:r.id,label:[r.codigo,r.nome].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' — ')||'Sem nome'};
 // Same fallback used by the existing Recebimentos grouping; never merge by name.
 const code=norm(c.codigo).match(/^([A-Z]{2,5}\d{1,3})(?:_|$)/)?.[1];
 if(!c.remessa_id&&code){
  const matches=remessas.filter(r=>r.municipio_id===c.municipio_id&&norm(r.codigo)===code);
  if(matches.length===1)return groupFor({...c,remessa_id:matches[0].id},remessas);
  return {id:'codigo:'+code,label:code+' (pelo código do cliente)'};
 }
 return {id:c.remessa_id?'vinculo:'+c.remessa_id:'sem-remessa',label:c.remessa_id?'Remessa não encontrada':'Sem núcleo / remessa'};
}
function buildReport(data,options){
 const {municipioId,groupId='',mode='overdue',referenceDate=today()}=options;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate))throw new Error('Data de referência inválida.');
 const municipality=data.municipios.find(m=>m.id===municipioId&&m.ativo!==false);
 if(!municipality)throw new Error('Selecione um município ativo.');
 const clients=new Map(data.clientes.filter(c=>c.municipio_id===municipioId&&c.ativo!==false).map(c=>[c.id,c]));
 const rows=new Map();let missingDates=0;
 for(const p of data.parcelas){
  const c=clients.get(p.cliente_id);
  if(!c||p.ativo===false||['Pago','Cancelado'].includes(p.status))continue;
  const group=groupFor(c,data.remessas||[]);if(groupId&&group.id!==groupId)continue;
  const balance=Math.max(0,cents(p.valor_previsto)+cents(p.juros)+cents(p.multa)-cents(p.valor_liquidado));
  if(!balance)continue;
  const due=String(p.vencimento||'').slice(0,10),validDate=/^\d{4}-\d{2}-\d{2}$/.test(due);
  if(!validDate)missingDates++;
  // A bill due today is not overdue. Ignore manual status for future bills.
  if(mode==='overdue'&&(!validDate||due>=referenceDate))continue;
  if(!rows.has(c.id))rows.set(c.id,{client:c,group,parcels:[],totalCents:0});
  const row=rows.get(c.id);row.parcels.push({...p,balanceCents:balance});row.totalCents+=balance;
 }
 const result=[...rows.values()].sort((a,b)=>compare(a.group.label,b.group.label)||compare(a.client.nome,b.client.nome)||compare(a.client.codigo,b.client.codigo));
 result.forEach(r=>r.parcels.sort((a,b)=>compare(a.vencimento||'9999',b.vencimento||'9999')||compare(a.numero,b.numero)||compare(a.id,b.id)));
 return {rows:result,municipality,mode,referenceDate,missingDates,totalCents:result.reduce((s,r)=>s+r.totalCents,0),count:result.reduce((s,r)=>s+r.parcels.length,0)};
}
function workbook(report,XLSX,scope){
 const max=report.rows.reduce((n,r)=>Math.max(n,r.parcels.length),0);
 const headers=['Código','Nome',...Array.from({length:max},(_,i)=>(i+1)+'ª parcela em aberto'),'Total em aberto (R$)','Núcleo / remessa'];
 const rows=[headers,...report.rows.map(r=>[String(r.client.codigo||''),String(r.client.nome||''),...Array.from({length:max},(_,i)=>{const p=r.parcels[i];return p?'Parcela #'+(p.numero??'—')+' | '+br(p.vencimento)+' | '+money(p.balanceCents/100):''}),r.totalCents/100,r.group.label])];
 const totalRow=Array(headers.length).fill('');totalRow[1]='TOTAL GERAL';totalRow[max+2]=report.totalCents/100;rows.push(totalRow);
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);
 ws['!cols']=[{wch:22},{wch:42},...Array.from({length:max},()=>({wch:44})),{wch:24},{wch:38}];
 ws['!autofilter']={ref:XLSX.utils.encode_range({r:0,c:0},{r:report.rows.length,c:headers.length-1})};
 for(let r=1;r<rows.length;r++)ws[XLSX.utils.encode_cell({r,c:max+2})].z='"R$" #,##0.00';
 XLSX.utils.book_append_sheet(wb,ws,'Inadimplência');
 const details=[['Código','Nome','Município','Núcleo / remessa','Parcela','Vencimento','Status','Valor previsto (R$)','Juros (R$)','Multa (R$)','Valor pago (R$)','Saldo em aberto (R$)']];
 for(const r of report.rows)for(const p of r.parcels)details.push([String(r.client.codigo||''),String(r.client.nome||''),report.municipality.nome,r.group.label,p.numero??'',br(p.vencimento),p.status,Number(p.valor_previsto)||0,Number(p.juros)||0,Number(p.multa)||0,Number(p.valor_liquidado)||0,p.balanceCents/100]);
 const ds=XLSX.utils.aoa_to_sheet(details);ds['!cols']=[22,42,28,38,12,18,18,22,18,18,22,24].map(wch=>({wch}));ds['!autofilter']={ref:ds['!ref']};
 for(let r=1;r<details.length;r++)for(let c=7;c<12;c++)ds[XLSX.utils.encode_cell({r,c})].z='"R$" #,##0.00';
 XLSX.utils.book_append_sheet(wb,ds,'Detalhamento');
 const info=[['RELATÓRIO DE INADIMPLÊNCIA — INTEGRAL'],['Município',report.municipality.nome],['Núcleo / remessa',scope||'Todos'],['Data de referência',br(report.referenceDate)],['Critério',report.mode==='overdue'?'Parcelas vencidas antes da data de referência':'Todas as parcelas em aberto, inclusive futuras'],['Clientes',report.rows.length],['Parcelas',report.count],['Total em aberto (R$)',report.totalCents/100],['Regra','Saldo = valor previsto + juros e multa cadastrados − valor pago.'],['Pagamentos','Situação atual dos pagamentos; não reconstrói saldos históricos.'],['Exclusões','Pagas, canceladas, parcelas inativas e clientes/municípios arquivados.'],['Organização','Uma linha por cliente; parcelas em ordem de vencimento.'],['Sem vencimento',report.missingDates],['Observação',report.missingDates?'Parcelas sem vencimento não entram no modo somente vencidas.':'Todos os vencimentos reconhecidos.']];
 const is=XLSX.utils.aoa_to_sheet(info);is['!cols']=[{wch:32},{wch:100}];is.B8.z='"R$" #,##0.00';XLSX.utils.book_append_sheet(wb,is,'Critérios');return wb;
}
const api={buildReport,workbook,groupFor,today};
if(typeof module==='object'&&module.exports)module.exports=api;
if(!root.document)return;
root.IntegralReceivablesDelinquency=api;
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const allowed=()=>root.IntegralRecebimentosAccess?.allowed?.()===true;
async function open(){
 if(!allowed())return alert('Relatório disponível apenas para administradores e financeiro.');
 const trigger=document.querySelector('#recebDelinquency');
 document.querySelector('#recebDelinquencyModal')?.remove();
 const d=document.createElement('div');d.id='recebDelinquencyModal';d.className='modal-backdrop';d.style.zIndex='10040';
 d.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="recebDelinquencyTitle"><header class="modal-head"><h3 id="recebDelinquencyTitle">Relatório de inadimplência</h3><button type="button" class="btn icon ghost" data-close aria-label="Fechar">×</button></header><div class="modal-body"><form class="form-grid"><div class="field"><label for="delCity">Município</label><select id="delCity" required disabled><option value="">Carregando...</option></select></div><div class="field"><label for="delGroup">Núcleo / remessa</label><select id="delGroup" disabled><option value="">Todos do município</option></select></div><div class="field"><label for="delMode">Parcelas</label><select id="delMode"><option value="overdue">Somente vencidas</option><option value="all">Todas em aberto (inclui futuras)</option></select></div><div class="field"><label for="delDate">Data de referência dos vencimentos</label><input id="delDate" type="date" required max="${today()}" value="${today()}"></div><div class="field full notice">Código, nome e uma coluna para cada parcela em aberto, com número, vencimento e saldo. O relatório considera a situação atual dos pagamentos e todo o histórico, independentemente do mês exibido na aba.</div><div id="delStatus" class="field full" role="status" aria-live="polite">Carregando municípios e grupos...</div></form></div><footer class="modal-foot"><button type="button" class="btn ghost" data-close>Fechar</button><button type="button" class="btn" id="delExport" disabled>Baixar Excel (.xlsx)</button></footer></section>`;
 document.body.appendChild(d);const q=s=>d.querySelector(s),status=q('#delStatus'),button=q('#delExport'),city=q('#delCity'),group=q('#delGroup'),mode=q('#delMode'),date=q('#delDate');
 const close=()=>{d.remove();document.removeEventListener('keydown',key);trigger?.focus()};
 const key=e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const els=[...d.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled)')],first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
 document.addEventListener('keydown',key);d.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);q('[data-close]').focus();
 try{
  const loader=root.IntegralReceivables;
  if(!loader)throw new Error('Recebimentos não carregou. Atualize a página.');
  const [municipios,clientes,remessas]=await Promise.all([loader.allRows('fin_receb_municipios','nome'),loader.allRows('fin_receb_clientes','nome'),loader.allRows('fin_receb_remessas','id')]);
  if(!d.isConnected)return;
  const active=municipios.filter(m=>m.ativo!==false).sort((a,b)=>compare(a.nome,b.nome));
  city.innerHTML='<option value="">Selecione o município</option>'+active.map(m=>`<option value="${esc(m.id)}">${esc(m.nome)}${m.uf?' / '+esc(m.uf):''}</option>`).join('');city.disabled=false;
  const update=()=>{const groups=new Map();clientes.filter(c=>c.municipio_id===city.value&&c.ativo!==false).forEach(c=>{const g=groupFor(c,remessas);groups.set(g.id,g)});group.innerHTML='<option value="">Todos do município</option>'+[...groups.values()].sort((a,b)=>compare(a.label,b.label)).map(g=>`<option value="${esc(g.id)}">${esc(g.label)}</option>`).join('');group.disabled=!city.value;button.disabled=!city.value;status.textContent=city.value?'Escolha um núcleo / remessa ou exporte todo o município.':'Selecione um município para gerar o relatório.'};
  city.onchange=update;mode.onchange=()=>{date.disabled=mode.value==='all'};update();city.focus();
  button.onclick=async()=>{
   if(!allowed())return close();if(!q('form').reportValidity())return;
   const options={municipioId:city.value,groupId:group.value,mode:mode.value,referenceDate:date.value||today()},scope=group.selectedOptions[0]?.textContent;
   button.disabled=true;city.disabled=true;group.disabled=true;mode.disabled=true;date.disabled=true;status.textContent='Consultando todas as parcelas e preparando a planilha...';
   try{
    if(!root.XLSX)throw new Error('O gerador Excel não carregou. Atualize a página e tente novamente.');
    const [freshCities,freshClients,freshGroups,parcelas]=await Promise.all([loader.allRows('fin_receb_municipios','nome'),loader.allRows('fin_receb_clientes','nome'),loader.allRows('fin_receb_remessas','id'),loader.allRows('fin_receb_parcelas','vencimento')]);
    if(!d.isConnected||!allowed())return;
    const report=buildReport({municipios:freshCities,clientes:freshClients,remessas:freshGroups,parcelas},options);
    if(!report.rows.length){status.textContent='Nenhuma parcela em aberto encontrada para os filtros selecionados.'+(report.missingDates?' Existem '+report.missingDates+' parcelas sem vencimento; use “Todas em aberto” para conferi-las.':'');return}
    const wb=workbook(report,root.XLSX,scope),slug=String(report.municipality.nome).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-');
    root.XLSX.writeFile(wb,'inadimplencia-'+slug+'-'+options.referenceDate+'.xlsx',{compression:true});
    status.textContent='Planilha gerada: '+report.rows.length+' cliente(s), '+report.count+' parcela(s), total de '+money(report.totalCents/100)+'.'+(report.missingDates?' Atenção: '+report.missingDates+' parcela(s) sem vencimento.':'');
   }catch(e){status.textContent='Não foi possível gerar o relatório: '+(e.message||e)}finally{button.disabled=false;city.disabled=false;group.disabled=false;mode.disabled=false;date.disabled=mode.value==='all'}
  };
 }catch(e){status.textContent='Não foi possível carregar o relatório: '+(e.message||e)+'. Feche e tente novamente.'}
}
api.open=open;
document.addEventListener('click',e=>{if(!e.target.closest?.('#recebDelinquency'))return;e.preventDefault();open()});
})(typeof window!=='undefined'?window:globalThis);
