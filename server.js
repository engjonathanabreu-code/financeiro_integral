const http=require('http'),fs=require('fs'),path=require('path');
const aiAccountHandler=require('./api/ai-account');
const aiClassifyHandler=require('./api/ai-classify');
const aiHealthHandler=require('./api/ai-health');
const aiReceiptHandler=require('./api/ai-receipt');
const aiVehicleHandler=require('./api/ai-vehicle');
const aiReceivablesHandler=require('./api/ai-receivables');
const integracaoFinanceiroIA=require('./api/integracao-financeiro-ia');
const agenteFinanceiro=require('./api/agente-financeiro');
const root=path.join(__dirname,'public');
const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
const readJson=req=>new Promise((resolve,reject)=>{
  let body='',tooLarge=false;
  req.setEncoding('utf8');
  req.on('data',chunk=>{
    if(tooLarge)return;
    body+=chunk;
    if(body.length<=12_000_000)return;
    tooLarge=true;
    body='';
    reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'),{statusCode:413}));
  });
  req.on('end',()=>{
    if(tooLarge)return;
    try{resolve(body?JSON.parse(body):{})}catch(error){reject(error)}
  });
  req.on('error',reject);
});
function vercelResponseCompat(res){
  if(typeof res.status!=='function')res.status=function(code){this.statusCode=code;return this};
  if(typeof res.json!=='function')res.json=function(data){if(!this.headersSent)this.setHeader('Content-Type','application/json; charset=utf-8');this.end(JSON.stringify(data));return this};
  return res;
}
async function withJsonBody(req,res,handler){
  if(req.method!=='POST')return handler(req,vercelResponseCompat(res));
  try{req.body=await readJson(req);return handler(req,vercelResponseCompat(res));}
  catch(e){return json(res,e.statusCode||400,{ok:false,error:e.statusCode===413?'PAYLOAD_TOO_LARGE':'INVALID_JSON'})}
}
async function aiAccount(req,res){return withJsonBody(req,res,aiAccountHandler)}
async function aiReceipt(req,res){return withJsonBody(req,res,aiReceiptHandler)}
async function aiReceivables(req,res){return withJsonBody(req,res,aiReceivablesHandler)}
http.createServer((req,res)=>{
 const pathname=(req.url||'/').split('?')[0];
 if(pathname==='/api/ai-classify')return withJsonBody(req,res,aiClassifyHandler);
 if(pathname==='/api/agente-financeiro')return withJsonBody(req,res,agenteFinanceiro);
 if(pathname==='/api/ai-account')return aiAccount(req,res);
 if(pathname==='/api/ai-vehicle')return withJsonBody(req,res,aiVehicleHandler);
 if(pathname==='/api/ai-receipt')return aiReceipt(req,res);
 if(pathname==='/api/integracao-financeiro-ia')return withJsonBody(req,res,integracaoFinanceiroIA);
 if(pathname==='/api/ai-receivables')return aiReceivables(req,res);
 if(pathname==='/api/ai-health')return withJsonBody(req,res,aiHealthHandler);
 const url=pathname==='/'?'/index.html':pathname;
 const file=path.join(root,url);
 if(!file.startsWith(root))return res.end();
 fs.readFile(file,(e,d)=>{if(e){fs.readFile(path.join(root,'index.html'),(e2,d2)=>{res.writeHead(e2?404:200,{'Content-Type':'text/html'});res.end(d2||'404')})}else{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(d)}})
}).listen(process.env.PORT||3000,()=>console.log('Integral Financeiro em http://localhost:'+(process.env.PORT||3000)));
