const test=require('node:test'),assert=require('node:assert/strict');
const handlers=['ai-receipt','ai-account','ai-receivables','ai-classify','ai-health'];
function res(){return{statusCode:200,body:null,headers:{},setHeader(k,v){this.headers[k]=v},status(c){this.statusCode=c;return this},json(b){this.body=b;return this}}}
const realFetch=global.fetch;
test.afterEach(()=>{global.fetch=realFetch;delete process.env.OPENAI_API_KEY});

test('rotas de IA recusam chamadas sem sessão e nunca chegam à OpenAI',async()=>{
 process.env.OPENAI_API_KEY='sk-test';let openai=0;
 global.fetch=async url=>{if(String(url).includes('openai.com'))openai++;return{ok:false,json:async()=>({})}};
 for(const name of handlers){
  const h=require(`../api/${name}.js`),r=res();
  await h({method:name==='ai-health'?'GET':'POST',headers:{},body:{image:'data:image/png;base64,AA',rows:[{}],file:'data:application/pdf;base64,AA'}},r);
  assert.equal(r.statusCode,401,name);
 }
 assert.equal(openai,0);
});

test('perfil precisa estar ativo e, nas rotas do Financeiro, ser ADM ou Financeiro',async()=>{
 process.env.OPENAI_API_KEY='sk-test';let profile={id:'u',tipo:'Comercial',setor:'Comercial',ativo:true},openai=0;
 global.fetch=async url=>{url=String(url);if(url.includes('/auth/v1/user'))return{ok:true,json:async()=>({id:'u'})};if(url.includes('/rest/v1/profiles'))return{ok:true,json:async()=>[profile]};if(url.includes('openai.com')){openai++;return{ok:false,status:500,json:async()=>({error:{message:'stub'}})}}return{ok:false,json:async()=>({})}};
 const call=async(name,headers={authorization:'Bearer x'})=>{const r=res();await require(`../api/${name}.js`)({method:'POST',headers,body:{rows:[{description:'x'}],file:'data:application/pdf;base64,AA',image:'data:image/png;base64,AA'}},r);return r.statusCode};
 assert.equal(await call('ai-account'),403);assert.equal(await call('ai-receivables'),403);assert.equal(await call('ai-classify'),403);
 assert.notEqual(await call('ai-receipt'),403,'colaborador usa leitura de comprovantes');
 profile={...profile,tipo:'Financeiro',setor:'Financeiro'};assert.notEqual(await call('ai-account'),403);
 profile={...profile,ativo:false};assert.equal(await call('ai-receipt'),403);
 assert.equal(await call('ai-receipt',{authorization:'Bearer x',origin:'https://outro.site',host:'financeiro-integral.vercel.app'}),403);
 assert.ok(openai>=2);
});
