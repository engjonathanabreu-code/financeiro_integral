const test=require('node:test'),assert=require('node:assert/strict');
test('plano compartilhado: valores explícitos e preservação de baixas e boletos',async()=>{
 const {linhasDoPlano,prepararPlano}=await import('../public/plano-parcelas.mjs');
 const parcelas=[{id:'paga',status:'Pago',valor_liquidado:100,versao:2},{id:'boleto',protegida:true,versao:1},{id:'livre',status:'Pendente',versao:1,valor_previsto:100,vencimento:'2026-11-01'}];
 const linhas=linhasDoPlano(parcelas,2);assert.equal(linhas[0].id,'livre');assert.equal(linhas[1].valor_previsto,'');assert.throws(()=>prepararPlano(parcelas,linhas,'Conferência de teste'));
 linhas[1]={vencimento:'2026-12-01',valor_previsto:125.50};const plano=prepararPlano(parcelas,linhas,'Conferência de teste');assert.equal(plano.totalNovoCentavos,22550);assert.equal(plano.protegidas.length,2);assert.throws(()=>prepararPlano(parcelas,[{...linhas[0],id:'paga'}],'Conferência de teste'));assert.equal(parcelas.length,3);
});
