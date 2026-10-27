/* Este projeto serve public/ diretamente: verificação de sintaxe e assets, sem transpilar. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
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
for(const name of ['financeiro.bundle.js','patch-v8.js'])assert.ok(fs.readFileSync(path.join(root,'public',name),'utf8').includes("['budgets','trips','invoices','vehicles'].includes"),`${name}: guarda de acesso sem vehicles`);
assert.ok(html.indexOf('financeiro-veiculos-metrics.js')<html.indexOf('financeiro-veiculos.js'));
console.log(`${checked} arquivos JavaScript com sintaxe válida; ${assets} assets locais conferidos.`);
