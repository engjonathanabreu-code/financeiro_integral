/* Servidor real, somente HTTP local e chamadas sem autenticação. */
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),path=require('node:path');
const port=31927,base=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),OPENAI_API_KEY:''},stdio:['ignore','pipe','pipe']});
(async()=>{try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error(`Servidor encerrou: ${code}`)));setTimeout(()=>reject(Error('Servidor não iniciou')),5000).unref()});
 for(const url of ['/','/financeiro-veiculos.js','/financeiro-veiculos.css','/financeiro-veiculos-metrics.js']){const r=await fetch(base+url);assert.equal(r.status,200);assert.ok((await r.text()).length>100)}
 const r=await fetch(base+'/api/ai-vehicle',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);assert.equal((await r.json()).error,'UNAUTHENTICATED');
 assert.equal((await fetch(base+'/api/ai-vehicle')).status,405);
 console.log('Servidor real: HTML e 3 assets OK; API recusa sessão ausente (401) e método incorreto (405).');
 }finally{child.kill()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
