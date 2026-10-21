// FIN-10 (completude das leituras) e FIN-13 (recuperação sem reabrir permissões).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

function paging(){const ctx={window:{}};vm.createContext(ctx);vm.runInContext(read('public/financeiro-paginacao.js'),ctx);return ctx.window.IntegralPaging}
function table(n,maxRows){
 const rows=Array.from({length:n},(_,i)=>({id:i+1,v:1}));const calls=[];
 const q={order(k){calls.push(['order',k]);return q},range(a,b){calls.push(['range',a,b]);const page=rows.slice(a,Math.min(b+1,a+maxRows));return Promise.resolve({data:page,error:null})}};
 return {build:()=>q,calls};
}

test('lê todas as linhas mesmo com limite de linhas da API menor que a página',async()=>{
 for(const [n,max] of [[11470,1000],[2500,500],[1000,1000],[0,1000],[3,1000]]){
  const t=table(n,max);const out=await paging().all(t.build);
  assert.equal(out.length,n,`${n} linhas com max_rows ${max}`);
  assert.equal(new Set(out.map(r=>r.id)).size,n,'sem repetição');
  assert.ok(t.calls.some(c=>c[0]==='order'&&c[1]==='id'),'ordem estável');
 }
});

test('erro em qualquer página interrompe em vez de devolver total parcial',async()=>{
 let n=0;const q={order(){return q},range(){n++;return Promise.resolve(n===2?{data:null,error:{message:'timeout'}}:{data:[{id:n}],error:null})}};
 await assert.rejects(paging().all(()=>q),e=>e.message==='timeout');
});

test('telas com totais de Recebimentos não leem clientes/parcelas sem paginação',()=>{
 for(const f of ['public/financeiro-recebimentos-futuro.js','public/financeiro-recebimentos-archive.js']){
  const s=read(f);
  for(const m of s.matchAll(/sb\.from\('fin_receb_(clientes|parcelas)'\)[^;]*/g))
   assert.ok(/IntegralPaging\.all\(\(\)=>\s*$/.test(s.slice(0,m.index))||/\.range\(/.test(m[0]),`${f}: ${m[0].slice(0,60)}`);
 }
 assert.match(read('public/financeiro-dre.js'),/from\('fin_receb_parcelas'\)\.select\([^)]*\)\.order\('id'\)\.range\(/);
 const html=read('public/index.html');assert.ok(html.indexOf('financeiro-paginacao.js')<html.indexOf('financeiro-recebimentos-futuro.js'));
});

test('FIN-13: nenhum SQL ou documento recomenda políticas using(true)',()=>{
 const files=[...fs.readdirSync(path.join(root,'supabase')).filter(f=>f.endsWith('.sql')).map(f=>'supabase/'+f),...fs.readdirSync(path.join(root,'docs')).filter(f=>f.endsWith('.md')).map(f=>'docs/'+f)];
 for(const f of files){
  const code=read(f).split('\n').filter(l=>!/^\s*(--|>|#)/.test(l)&&!/Não reverta/.test(l)).join('\n');
  assert.ok(!/using\s*\(\s*true\s*\)/i.test(code),`${f} contém using(true)`);
 }
});
