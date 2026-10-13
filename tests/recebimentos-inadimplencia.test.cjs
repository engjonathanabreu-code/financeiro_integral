const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildReport,groupFor,workbook,today}=require('../public/financeiro-recebimentos-inadimplencia.js');
const base=()=>({municipios:[{id:'m1',nome:'Ibirama'},{id:'m2',nome:'Rio do Sul'},{id:'off',nome:'Arquivado',ativo:false}],remessas:[{id:'r1',municipio_id:'m1',codigo:'IBI01',nome:'Centro'},{id:'r2',municipio_id:'m1',codigo:'IBI02',nome:'Interior'}],clientes:[{id:'a',municipio_id:'m1',remessa_id:'r1',codigo:'IBI01_0001A',nome:'Ana'},{id:'b',municipio_id:'m1',remessa_id:'r2',codigo:'IBI02_0002',nome:'Bruno'},{id:'c',municipio_id:'m2',nome:'Carla'},{id:'d',municipio_id:'m1',ativo:false,nome:'Arquivado'}],parcelas:[]});
const p=(id,extra={})=>({id,cliente_id:'a',numero:1,vencimento:'2026-10-12',status:'Pendente',valor_previsto:100,...extra});
const opts={municipioId:'m1',referenceDate:'2026-10-13'};
test('vencidas por data, excluindo hoje, futuro, pagas, canceladas e inativas',()=>{
 const d=base();d.parcelas=[p('ok'),p('hoje',{vencimento:'2026-10-13'}),p('futuro',{vencimento:'2027-02-01',status:'Inadimplente'}),p('pago',{status:'Pago'}),p('cancelado',{status:'Cancelado'}),p('inativo',{ativo:false}),p('arquivado',{cliente_id:'d'}),p('outro-municipio',{cliente_id:'c'})];
 const r=buildReport(d,opts);assert.equal(r.count,1);assert.equal(r.totalCents,10000);
});
test('saldo parcial considera juros e multa cadastrados sem duplicar o pago',()=>{
 const d=base();d.parcelas=[p('parcial',{status:'Parcial',valor_previsto:'100.10',juros:'2.20',multa:'1.30',valor_liquidado:'40.05'}),p('zerada',{status:'Parcial',valor_liquidado:100}),p('credito',{valor_liquidado:110})];
 const r=buildReport(d,opts);assert.equal(r.count,1);assert.equal(r.totalCents,6355);
});
test('filtro de núcleo/remessa e municipio, sem juntar nomes iguais',()=>{
 const d=base();d.remessas[1].nome='Centro';d.parcelas=[p('a'),p('b',{cliente_id:'b'}),p('c',{cliente_id:'c'})];
 assert.deepEqual(buildReport(d,{...opts,groupId:'r2'}).rows.map(r=>r.client.id),['b']);
 assert.equal(buildReport(d,opts).count,2);
});
test('fallback pelo código é restrito ao município e mantém sufixos do cliente',()=>{
 const d=base();const c={...d.clientes[0],remessa_id:null};assert.equal(groupFor(c,d.remessas).id,'r1');
 assert.equal(groupFor({...c,municipio_id:'m2'},d.remessas).id,'codigo:IBI01');
 assert.equal(groupFor({...c,codigo:''},d.remessas).id,'sem-remessa');
});
test('todas em aberto inclui futuro e sem data, ordena parcelas e preserva duplicatas de número',()=>{
 const d=base();d.parcelas=[p('futuro',{vencimento:'2028-07-15'}),p('sem-data',{vencimento:null}),p('antes',{vencimento:'2025-07-15'})];
 const r=buildReport(d,{...opts,mode:'all'});assert.equal(r.count,3);assert.equal(r.missingDates,1);assert.deepEqual(r.rows[0].parcels.map(p=>p.id),['antes','futuro','sem-data']);assert.equal(buildReport(d,opts).count,1);
});
test('não limita ao mês da aba nem a 1000 registros',()=>{
 const d=base();d.parcelas=Array.from({length:1505},(_,i)=>p(String(i),{numero:i+1}));assert.equal(buildReport(d,opts).count,1505);
});
test('município arquivado é recusado e seleção vazia não exporta dados',()=>{
 assert.throws(()=>buildReport(base(),{...opts,municipioId:'off'}));assert.throws(()=>buildReport(base(),{...opts,municipioId:''}));assert.equal(buildReport(base(),opts).rows.length,0);assert.match(today(),/^\d{4}-\d{2}-\d{2}$/);
});
test('planilha mantém código e nome como texto e totais/detalhes como números',()=>{
 const encode_cell=({r,c})=>{let col='',n=c+1;while(n){n--;col=String.fromCharCode(65+n%26)+col;n=Math.floor(n/26)}return col+(r+1)};
 const XLSX={utils:{encode_cell,encode_range:(s,e)=>encode_cell(s)+':'+encode_cell(e),book_new:()=>({Sheets:{},SheetNames:[]}),book_append_sheet:(w,s,n)=>{w.Sheets[n]=s;w.SheetNames.push(n)},aoa_to_sheet:rows=>{const s={};rows.forEach((row,r)=>row.forEach((v,c)=>{s[encode_cell({r,c})]={v,t:typeof v==='number'?'n':'s'}}));s['!ref']='A1:'+encode_cell({r:rows.length-1,c:Math.max(...rows.map(r=>r.length))-1});return s}}};
 const d=base();d.clientes[0].codigo='000012A';d.clientes[0].nome='=HYPERLINK("https://example.com")';d.parcelas=[p('a')];
 const w=workbook(buildReport(d,opts),XLSX,'Todos');assert.equal(w.SheetNames.length,3);const s=w.Sheets['Inadimplência'];assert.equal(s.A2.v,'000012A');assert.equal(s.B2.t,'s');assert.equal(s.B2.f,undefined);assert.equal(s.D2.v,100);assert.equal(s.D3.v,100);assert.match(s.C2.v,/12\/10\/2026/);assert.equal(w.Sheets.Detalhamento.L2.v,100);assert.equal(s['!autofilter'].ref,'A1:E2');
});
