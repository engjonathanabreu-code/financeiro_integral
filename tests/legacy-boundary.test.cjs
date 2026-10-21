const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.join(__dirname,'..'),active=fs.readFileSync(path.join(root,'public/financeiro.bundle.js'),'utf8'),tail=fs.readFileSync(path.join(root,'legacy/financeiro-bundle-inativo.js.txt'),'utf8');
test('fronteira preserva byte a byte o codigo anteriormente ativo e arquiva todo o restante original',()=>{
 const marker='/* INTEGRAL: FRONTEIRA EXPLICITA DO LEGADO INATIVO */',i=active.indexOf(marker);assert(i>0);const reconstruido=active.slice(0,i)+tail;
 // FIN-09: o hash original foi gerado num checkout Windows (CRLF); o repositório guarda LF. O conteúdo
 // é comparado com finais de linha normalizados e a referência é o blob LF de 2968315:public/financeiro.bundle.js.
 const lf=reconstruido.replace(/\r\n/g,'\n'),sha=t=>crypto.createHash('sha256').update(t).digest('hex');
 const [referencia,crlf]=fs.readFileSync(path.join(root,'legacy/bundle-original.sha256'),'utf8').trim().split(/\s+/);
 assert.equal(sha(lf),referencia);
 assert.equal(sha(lf.replace(/\n/g,'\r\n')),crlf,'mesmo conteúdo do hash registrado originalmente (CRLF)');
 assert(tail.includes('hr=function(){'));for(const version of [11,12,13,14,16,17,18,19,20]){assert(tail.includes(`SOURCE: patch-v${version}.js`));assert(!active.includes(`SOURCE: patch-v${version}.js`));}
 new vm.Script(active);
});
test('modulos canonicos e incrementos permanecem carregados depois do bundle, sem carregar o arquivo arquivado',()=>{
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');assert(html.includes('financeiro.bundle.js?v=20261014-legado-delimitado'));
 for(const file of ['financeiro-disable-legacy-rh.js','financeiro-canonical-router.js','financeiro-incrementos.js','financeiro-recebimentos.js','financeiro-plano-parcelas.mjs'])assert(html.indexOf(file)>html.indexOf('financeiro.bundle.js'));
 assert(!html.includes('financeiro-bundle-inativo'));assert(!active.includes('try{hr=')&&!active.includes('hr=function(){'));
});
