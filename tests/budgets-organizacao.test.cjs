const test=require('node:test'),assert=require('node:assert/strict');
const {project,matches}=require('../public/financeiro-budgets-organizacao.js');
const filters={search:'',scope:'all',sector:'',consumption:''};
test('busca sem acentos, setor e situação não alteram registros',()=>{
 const b={id:1,name:'Ação São José',sector:'Projetos',erpPlan:'Revisão 2026',limit:100,status:'Fechado'},before=JSON.stringify(b),p=project(b,120);
 for(const search of ['acao','SAO JOSE','revisao 2026','projetos'])assert.ok(matches(p,{...filters,search}));
 assert.equal(matches(p,{...filters,scope:'open'}),false);
 assert.equal(matches(p,{...filters,scope:'closed'}),true);
 assert.equal(matches(p,{...filters,sector:'Financeiro'}),false);
 assert.equal(JSON.stringify(b),before);
});
test('zero, limite exato, acima e negativos não geram divisão infinita',()=>{
 assert.equal(project({limit:0},0).consumption,'without-limit');
 assert.equal(project({limit:0},50).available,-50);
 assert.equal(project({limit:100},100).consumption,'at-limit');
 assert.equal(project({limit:100},101).consumption,'exceeded');
 assert.equal(project({limit:100},0).consumption,'available');
 assert.equal(project({limit:-5},0).consumption,'without-limit');
 assert.equal(project({limit:'invalid'},'invalid').spent,0);
});
test('resumo só projeta IDs previamente autorizados e inclui todos os gastos como detalhe V9',()=>{
 const {visibleItems}=require('../public/financeiro-budgets-organizacao.js');
 const records=[{id:1,limit:100},{id:2,limit:999999}],expenses=[{budgetId:1,value:10,date:'2020-01-01'},{budgetId:'1',value:20},{budgetId:2,value:999999}];
 const before=JSON.stringify({records,expenses});
 const items=visibleItems(records,expenses,['1']);
 assert.equal(items.size,1);assert.equal(items.get('1').spent,30);assert.equal(items.has('2'),false);
 assert.equal(visibleItems(records,expenses,[]).size,0);
 assert.equal(JSON.stringify({records,expenses}),before);
});
test('comparação em centavos evita falso excesso binário e preserva estornos líquidos',()=>{
 assert.equal(project({limit:0.3},0.1+0.2).consumption,'at-limit');
 assert.equal(project({limit:0.3},0.31).consumption,'exceeded');
 const {visibleItems}=require('../public/financeiro-budgets-organizacao.js');
 const p=visibleItems([{id:1,limit:100}],[{budgetId:1,value:120},{budgetId:1,value:-30}],['1']).get('1');
 assert.equal(p.spent,90);assert.equal(p.available,10);assert.equal(p.consumption,'available');
});
