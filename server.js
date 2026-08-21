const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'public');
const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml'};
http.createServer((req,res)=>{const url=req.url==='/'?'/index.html':req.url.split('?')[0];let file=path.join(root,url);if(!file.startsWith(root))return res.end();fs.readFile(file,(e,d)=>{if(e){fs.readFile(path.join(root,'index.html'),(e2,d2)=>{res.writeHead(e2?404:200,{'Content-Type':'text/html'});res.end(d2||'404')})}else{res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(d)}})}).listen(process.env.PORT||3000,()=>console.log('Integral Financeiro em http://localhost:'+(process.env.PORT||3000)));
