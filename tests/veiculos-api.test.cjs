const {test}=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/ai-vehicle');const {foto}=require('./veiculos-fixtures.cjs');
const realFetch=global.fetch;let profile,provider;
const res=()=>({statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return this}});
test.beforeEach(()=>{profile={id:'test',tipo:'Projetos',ativo:true};provider=0;process.env.OPENAI_API_KEY='fixture-only';global.fetch=async(url,opts)=>{
 if(String(url).includes('/auth/v1/user'))return {ok:true,json:async()=>({id:'test'})};
 if(String(url).includes('/rest/v1/profiles'))return {ok:true,json:async()=>[profile]};
 if(String(url).includes('/rpc/'))return {ok:true,json:async()=>({admin:true,veiculos:[],usos:[],despesas:[],relatos:[]})};
 if(String(url).startsWith('https://api.openai.com/')){provider++;return {ok:true,json:async()=>({output_text:JSON.stringify({odometer:null,notes:'Foto ilegível'})})}}
 throw Error('unexpected external request');
}});
test.afterEach(()=>{global.fetch=realFetch;delete process.env.OPENAI_API_KEY});
const call=async(body,headers={authorization:'Bearer fixture'})=>{const r=res();await handler({method:'POST',headers,body},r);return r};
test('IA veículo: autenticação e separação ADM/colaborador antes de acessar fornecedor',async()=>{
 assert.equal((await call({image:foto.dataUrl},{})).statusCode,401);
 assert.equal((await call({mode:'analysis'})).statusCode,403);assert.equal(provider,0);
 profile.ativo=false;assert.equal((await call({image:foto.dataUrl})).statusCode,403);
});
test('IA veículo: foto ilegível continua nula e exige revisão humana',async()=>{
 const r=await call({image:foto.dataUrl});assert.equal(r.statusCode,200);assert.equal(r.body.odometer,null);assert.equal(r.body.reviewRequired,true);assert.equal(provider,1);
});
test('IA veículo: valida tamanho, MIME e assinatura antes do fornecedor',async()=>{
 for(const image of ['data:image/svg+xml;base64,AA==','data:image/png;base64,YWJjZGVmZ2hpamts','data:image/png;base64,'+'A'.repeat(5600001)])assert.equal((await call({image})).statusCode,400);
 assert.equal(provider,0);
});
test('IA veículo: falha do fornecedor não produz dado nem altera registros',async()=>{
 const previous=global.fetch;global.fetch=async(u,o)=>String(u).includes('openai.com')?{ok:false}:previous(u,o);
 const r=await call({image:foto.dataUrl});assert.equal(r.statusCode,503);assert.equal(r.body.odometer,undefined);
});
test('IA veículo: análise consulta evidência no banco com JWT existente e só para ADM',async()=>{
 profile.tipo='Administrador';const previous=global.fetch;
 global.fetch=async(u,o)=>String(u).includes('openai.com')?{ok:true,json:async()=>({output_text:JSON.stringify({observations:[],gaps:['Sem dados'],questions:[]})})}:previous(u,o);
 const r=await call({mode:'analysis',usos:[{km:999999}]});assert.equal(r.statusCode,200);assert.deepEqual(r.body.gaps,['Sem dados']);
});
