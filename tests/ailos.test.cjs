const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../public/ailos-cnab');
const {config,pagador,b,rem,retorno,set}=require('./ailos-fixtures.cjs');
test('segmento P usa código 0 para isenção de desconto em todos os títulos e ambientes',()=>{
 const boletos=[b,{...b,id:'00000000-0000-4000-8000-000000000006',nosso_numero:'02206658000000255',documento:'INT000000255',valor:250}];
 for(const ambiente of ['homologacao','producao']){
  const out=C.remessa({...rem,config:{...config,ambiente,homologado:true},boletos});
  const rows=out.arquivo.split('\r\n');assert.equal(rows.pop(),'');
  for(const row of rows)assert.equal(Buffer.byteLength(row),240);
  const segmentos=rows.filter(row=>row[7]==='3'&&row[13]==='P');assert.equal(segmentos.length,2);
  for(const row of segmentos){assert.equal(row[141],'0');assert.equal(row.slice(142,150),'00000000');assert.equal(row.slice(150,165),'000000000000000');assert.equal(row[117],'3');}
  assert.equal(rows.at(-2).slice(23,29),'000002');assert.equal(Number(rows.at(-2).slice(29,46)),35000);
  for(const [i,codigo] of out.codigos.entries())assert.deepEqual(codigo,{id:boletos[i].id,...C.boleto({...config,ambiente,homologado:true},boletos[i])});
 }
});
test('fator muda em 22/02/2025; módulo 10 e identificação',()=>{assert.equal(C.factor('2025-02-21'),'9999');assert.equal(C.factor('2025-02-22'),'1000');assert.equal(C.factor('2025-02-23'),'1001');assert.equal(C.mod10('085900000'),2);assert(C.documentValid(config.cpf_cnpj));assert(C.documentValid(pagador.cpf_cnpj));assert(!C.documentValid('11111111111'));assert.throws(()=>C.factor('2026-02-30'));});
test('CNAB 240 exato, CRLF, convenio à esquerda e nosso número com três espaços',()=>{const out=C.remessa(rem),rows=out.arquivo.split('\r\n');assert.equal(rows.pop(),'');assert.equal(rows.length,6);for(const l of rows)assert.equal(Buffer.byteLength(l),240);assert.equal(rows[0].slice(32,52),'010001              ');assert.equal(rows[0].slice(52,58),'001015');assert.equal(rows[0].slice(163,166),'084');assert.equal(rows[1].slice(13,16),'043');assert.equal(rows[2].slice(37,57),b.nosso_numero+'   ');assert.equal(rows[2].slice(223,227),'2000');assert.equal(rows[4].slice(17,23),'000004');assert.equal(rows[5].slice(23,29),'000006');const k=out.codigos[0];assert.equal(k.codigo_barras.length,44);assert.equal(k.linha_digitavel.length,47);assert.equal(k.codigo_barras.slice(19),config.convenio+b.nosso_numero+'01');});
test('valida campos, valor, caracteres, identidade e produção sem homologação',()=>{assert.throws(()=>C.remessa({...rem,config:{...config,ambiente:'producao'}}),/homologar/);assert.throws(()=>C.remessa({...rem,boletos:[b,b]}),/duplicado/);assert.throws(()=>C.boleto(config,{...b,valor:1.001}));assert.throws(()=>C.boleto(config,{...b,pagador:{...pagador,nome:'A'.repeat(41)}}));assert.throws(()=>C.boleto(config,{...b,pagador:{...pagador,cpf_cnpj:config.cpf_cnpj}}),/mesma pessoa/);assert.throws(()=>C.alpha('A\nB',40));});
test('retorno T/U distingue valor pago de crédito líquido e recusa truncamento/conta errada',()=>{const text=retorno(),[e]=C.retorno(text,config);assert.equal(e.pago_centavos,10000);assert.equal(e.liquido_centavos,9800);assert.equal(e.nosso_numero,b.nosso_numero);assert.throws(()=>C.retorno(text.slice(0,-300),config));assert.throws(()=>C.retorno(text,{...config,conta:'1234567'}),/outro/);const rows=text.split('\r\n');rows[3]=set(rows[3],16,17,'02');assert.throws(()=>C.retorno(rows.join('\r\n'),config),/incompatível/);});
test('código 2 de 5 intercalado tem alternância, início e fim',()=>{const widths=C.bars(C.boleto(config,b).codigo_barras);assert.deepEqual(widths.slice(0,4),[1,1,1,1]);assert.deepEqual(widths.slice(-3),[3,1,1]);assert.equal(widths.length,227);});

test('endereço permite 15 caracteres, normaliza espaços e identifica campo longo',()=>{
 const p={endereco:' RUA TESTE  10 ',bairro:'  VALADA  S. PAULO\u00a0',cidade:' BLUMENAU ',cep:'89.010-000',uf:' sc '};
 const out=C.address(p);assert.equal(out.bairro,'VALADA S. PAULO');assert.equal(out.endereco,'RUA TESTE 10');assert.equal(out.cep,'89010000');assert.equal(out.uf,'SC');assert.equal(C.alpha(p.bairro,15),'VALADA S. PAULO');
 assert.throws(()=>C.address({...p,bairro:'VALADA SAO PAULO'}),e=>e.field==='bairro'&&e.message.startsWith('Bairro:'));
 assert.throws(()=>C.address({...p,cidade:'CIDADE COM NOME LONGO'}),e=>e.field==='cidade');
});
