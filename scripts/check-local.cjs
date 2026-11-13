/* Este projeto serve public/ diretamente: verificação de sintaxe e assets, sem transpilar. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=path.join(__dirname,'..');let checked=0;
for(const dir of ['api','lib','public'])for(const name of fs.readdirSync(path.join(root,dir))){
 if(!name.endsWith('.js'))continue;
 new vm.Script(fs.readFileSync(path.join(root,dir,name),'utf8'),{filename:`${dir}/${name}`});checked++;
}
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');let assets=0;
for(const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g)){
 const file=match[1];if(/^(https?:|data:|#)/.test(file))continue;
 assert.ok(fs.existsSync(path.join(root,'public',file)),`Asset ausente: ${file}`);assets++;
}
assert.ok(fs.readFileSync(path.join(root,'public/financeiro-veiculos.js'),'utf8').includes('__vehicleShell'),'Ponte de navegação nova ausente');
assert.ok(html.indexOf('financeiro-veiculos-metrics.js')<html.indexOf('financeiro-veiculos.js'));
console.log(`${checked} arquivos JavaScript com sintaxe válida; ${assets} assets locais conferidos.`);

const manifest=fs.readFileSync(path.join(root,'docs/leitores-integridade.sha256'),'utf8').trim().split(/\r?\n/);
const readers=new Set();
for(const line of manifest){
 const match=/^([a-f0-9]{64})  (public\/vendor\/[^\r\n]+)$/.exec(line);
 assert.ok(match,'Entrada inválida no manifesto dos leitores');
 const [,expected,file]=match;
 assert.ok(!readers.has(file),`Entrada duplicada no manifesto: ${file}`);
 const actual=createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 assert.equal(actual,expected,`Integridade do leitor: ${file}`);
 readers.add(file);
}
const vendorRoot=path.join(root,'public/vendor');
const readerAssets=fs.readdirSync(vendorRoot,{recursive:true,withFileTypes:true})
 .filter(entry=>entry.isFile())
 .map(entry=>path.relative(root,path.join(entry.parentPath||entry.path,entry.name)).split(path.sep).join('/'));
assert.deepEqual([...readers].sort(),readerAssets.sort(),'O manifesto deve cobrir todos os arquivos dos leitores');
console.log(`${readers.size} arquivos dos leitores conferidos por SHA-256.`);
