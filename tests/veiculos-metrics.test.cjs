const {test}=require('node:test'),assert=require('node:assert/strict');
const {metrics}=require('../public/financeiro-veiculos-metrics');
const u={id:'a',estado:'devolvido',km_inicial:100,km_final:200,tanque_inicial_cheio:true,ciclo_confirmado:true};
const d={uso_id:'a',centavos:20000,atual:true,litros:20};
test('km e custo/km são determinísticos; consumo só em ciclo completo e revisado',()=>{
 assert.deepEqual(metrics([u],[d]),{km:100,centavos:20000,litros:20,custoKm:2,consumo:5,pendentes:0,semDistancia:0});
 for(const change of [{tanque_inicial_cheio:false},{ciclo_confirmado:false}])assert.equal(metrics([{...u,...change}],[d]).consumo,null);
 assert.equal(metrics([u],[{...d,litros:null}]).consumo,null);
 assert.equal(metrics([u],[{...d,atual:false}]).centavos,0);
 assert.equal(metrics([u],[{...d,atual:false}]).consumo,null);
});
test('distância zero, cancelamentos, uso aberto e km regressiva não produzem estatísticas falsas',()=>{
 const zero=metrics([{...u,km_final:100}],[d]);assert.equal(zero.custoKm,null);assert.equal(zero.consumo,null);assert.equal(zero.semDistancia,1);
 for(const change of [{estado:'cancelado'},{estado:'aberto'},{km_final:99}])assert.equal(metrics([{...u,...change}],[d]).km,0);
 assert.equal(metrics([],[]).custoKm,null);
 assert.equal(metrics([u],[]).custoKm,null,'sem comprovante não representa custo zero comprovado');
});
