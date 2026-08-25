const http=require('http'),fs=require('fs'),path=require('path');
const aiAccountHandler=require('./api/ai-account');
const aiHealthHandler=require('./api/ai-health');
const root=path.join(__dirname,'public');
const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
const readJson=req=>new Promise((resolve,reject)=>{let body='';req.on('data',c=>{body+=c;if(body.length>12_000_000){const e=new Error('PAYLOAD_TOO_LARGE');e.statusCode=413;reject(e);req.destroy()}});req.on('end',()=>{try{resolve(body?JSON.parse(body):{})}catch(e){reject(e)}});req.on('error',reject)});
function vercelResponseCompat(res){
  if(typeof res.status!=='function')res.status=function(code){this.statusCode=code;return this};
  if(typeof res.json!=='function')res.json=function(data){if(!this.headersSent)this.setHeader('Content-Type','application/json; charset=utf-8');this.end(JSON.stringify(data));return this};
  return res;
}
async function aiClassify(req,res){
 if(req.method!=='POST')return json(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});
 if(!process.env.OPENAI_API_KEY)return json(res,500,{ok:false,error:'OPENAI_API_KEY_NOT_CONFIGURED'});
 try{
  const {rows=[],natures=[]}=await readJson(req);
  if(!Array.isArray(rows)||!rows.length)return json(res,400,{ok:false,error:'ROWS_REQUIRED'});
  if(rows.length>250)return json(res,400,{ok:false,error:'TOO_MANY_ROWS'});
  const allowed=(Array.isArray(natures)&&natures.length?natures:['Despesa fixa','Despesa variável','Folha e encargos','Retirada e distribuição aos sócios','Tributos','Tarifas bancárias','Receita parcelada de clientes','Receita de contratos públicos','Receita avulsa de contratos privados','Outras receitas']).map(String).filter(Boolean).slice(0,80);
  const clean=rows.map((r,i)=>({index:i,date:String(r.date||''),description:String(r.description||'').slice(0,300),reference:String(r.reference||'').slice(0,120),value:Number(r.value||0),direction:r.direction==='Entrada'?'Entrada':'Saída'}));
  const schema={type:'object',additionalProperties:false,properties:{classifications:{type:'array',items:{type:'object',additionalProperties:false,properties:{index:{type:'integer'},nature:{type:'string',enum:allowed},normalized_description:{type:'string'},confidence:{type:'integer',minimum:0,maximum:100},reason:{type:'string'}},required:['index','nature','normalized_description','confidence','reason']}}},required:['classifications']};
  const prompt=['Você é o agente financeiro interno da Integral Soluções em Engenharia.','Classifique movimentações bancárias brasileiras usando SOMENTE as naturezas fornecidas.','Prefeituras e municípios tendem a receita de contratos públicos; cobranças e boletos a receita parcelada; DARF/DAS/SIMPLES/FGTS/INSS/ISS/IRRF a tributos; tarifas bancárias a tarifas; salários e benefícios a folha; aluguel/software/seguro/contabilidade/empréstimos a despesa fixa; combustível/hotel/restaurante/locação/pedágio/material/manutenção a despesa variável.','Não invente vínculo contratual quando a descrição não permitir. Use menor confiança.','normalized_description deve ser curta e legível.',`Naturezas permitidas: ${allowed.join(' | ')}`,'Movimentações:',JSON.stringify(clean)].join('\n');
  const configured=String(process.env.OPENAI_FINANCE_MODEL||'').trim();
  const model=!configured||configured==='gpt-5.6-luna'?'gpt-5-mini':configured;
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:prompt,text:{format:{type:'json_schema',name:'integral_bank_classification',strict:true,schema}}})});
  const data=await r.json();
  if(!r.ok)return json(res,r.status,{ok:false,error:'OPENAI_ERROR',details:data?.error?.message||'Falha na OpenAI',model});
  const out=data.output_text||(data.output||[]).flatMap(i=>i.content||[]).filter(i=>i.type==='output_text').map(i=>i.text).join('');
  const parsed=JSON.parse(out||'{}');
  return json(res,200,{ok:true,model:data.model||model,...parsed});
 }catch(e){console.error('ai-classify error',e);return json(res,e.statusCode||500,{ok:false,error:e.statusCode===413?'PAYLOAD_TOO_LARGE':'INTERNAL_ERROR',details:String(e?.message||e)})}
}
async function aiAccount(req,res){
  if(req.method!=='POST')return aiAccountHandler(req,vercelResponseCompat(res));
  try{req.body=await readJson(req);return aiAccountHandler(req,vercelResponseCompat(res));}
  catch(e){return json(res,e.statusCode||400,{ok:false,error:e.statusCode===413?'PAYLOAD_TOO_LARGE':'INVALID_JSON',details:String(e?.message||e)})}
}
http.createServer((req,res)=>{
 const pathname=(req.url||'/').split('?')[0];
 if(pathname==='/api/ai-classify')return aiClassify(req,res);
 if(pathname==='/api/ai-account')return aiAccount(req,res);
 if(pathname==='/api/ai-health')return aiHealthHandler(req,vercelResponseCompat(res));
 const url=pathname==='/'?'/index.html':pathname;
 const file=path.join(root,url);
 if(!file.startsWith(root))return res.end();
 fs.readFile(file,(e,d)=>{if(e){fs.readFile(path.join(root,'index.html'),(e2,d2)=>{res.writeHead(e2?404:200,{'Content-Type':'text/html'});res.end(d2||'404')})}else{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(d)}})
}).listen(process.env.PORT||3000,()=>console.log('Integral Financeiro em http://localhost:'+(process.env.PORT||3000)));
