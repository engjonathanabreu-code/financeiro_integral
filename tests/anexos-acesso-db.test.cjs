// FIN-04: leitura de anexo exige acesso ao registro de negócio (dados sintéticos).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {setup,login,id,ADM,STAFF,FIN,INATIVO}=require('./financeiro-db-fixture.cjs');
const sql=f=>fs.readFileSync(path.join(__dirname,'../supabase',f),'utf8');
// Mesmo cálculo do bundle (financeiro.bundle.js:304).
const hashId=s=>{let h=0;for(const c of String(s||''))h=(h*31+c.charCodeAt(0))>>>0;return h||1};
const file=n=>'data:text/plain;base64,'+Buffer.from('arquivo '+n).toString('base64');

test('anexos: ADM, enviado por mim, documento fiscal (Financeiro), viagem visível por setor ou atribuição',async()=>{
 const db=await setup();
 try{
  await db.exec(sql('auditoria_acessos_20261005.sql'));await db.exec(sql('financeiro_anexos_acesso_20261021.sql'));
  assert.equal(Number((await db.query('select financeiro_privado.id_local($1)::text v',[id(STAFF)])).rows[0].v),hashId(id(STAFF)),'id local igual ao do navegador');
  await login(db,ADM);
  const up=async n=>(await db.query('select financeiro_guardar_arquivo($1,$2) id',[file(n),n+'.txt'])).rows[0].id;
  const f={doc:await up('doc'),setor:await up('setor'),outro:await up('outro'),atrib:await up('atrib'),fin:await up('fin'),orc:await up('orc')};
  const mods={
   trips:[{id:1,sector:'comercial',assigned:[]},{id:2,sector:'Projetos',assigned:[]},{id:3,sector:'Projetos',assigned:[hashId(id(STAFF)),hashId(id(FIN))]},{id:4,sector:'Financeiro',assigned:[]}],
   tripExpenses:[{id:10,tripId:1,file:{name:'a',arquivoId:f.setor}},{id:11,tripId:2,file:{name:'b',arquivoId:f.outro}},{id:13,tripId:4,file:{name:'d',arquivoId:f.fin}}],
   tripDocuments:[{id:12,tripId:3,expenseId:99,file:{name:'c',arquivoId:f.atrib}}],
   docs:[{id:20,name:'nf',arquivoId:f.doc}],
   budgetRecords:[{id:'b1',sector:'Comercial',assigned:[],assignedDirect:[]},{id:'b2',sector:'Outro',assigned:null,assignedDirect:{x:1}}],
   budgetExpenses:[{id:30,budgetId:'b1',file:{name:'o',arquivoId:f.orc}},{id:31,budgetId:'b2',file:{name:'p',arquivoId:f.orc}}]   // b2: responsáveis em formato inválido não derrubam a consulta
  };
  await db.exec('reset role');
  for(const [k,v] of Object.entries(mods))await db.query('insert into financeiro_estado_modulos(chave,dados,updated_at) values($1,$2,now())',[k,JSON.stringify(v)]);
  const visible=async n=>{await login(db,n);return new Set((await db.query('select nome from financeiro_arquivos')).rows.map(r=>r.nome.replace('.txt','')))};
  assert.deepEqual([...await visible(ADM)].sort(),['atrib','doc','fin','orc','outro','setor']);
  assert.deepEqual([...await visible(STAFF)].sort(),['atrib','orc','setor'],'colaborador: setor (sem diferenciar maiúsculas) ou atribuição');
  assert.deepEqual([...await visible(FIN)].sort(),['atrib','doc'],'Financeiro: documentos fiscais e só viagens atribuídas diretamente');
  assert.deepEqual([...await visible(INATIVO)],[]);
  await login(db,STAFF);
  const mine=(await db.query('select financeiro_guardar_arquivo($1,$2) id',[file('meu'),'meu.txt'])).rows[0].id;
  assert.equal((await db.query('select conteudo from financeiro_arquivos where id=$1',[mine])).rows[0].conteudo,file('meu'),'quem enviou lê antes do módulo ser salvo');
  assert.equal((await db.query('select conteudo from financeiro_arquivos where id=$1',[f.doc])).rows.length,0,'leitura direta por id também é filtrada');
  await assert.rejects(db.query(`insert into financeiro_arquivos(sha256,conteudo) values('x','data:,1')`),/permission denied/);
  await login(db,null);await assert.rejects(db.query('select id from financeiro_arquivos'),/permission denied/);
  await assert.rejects(db.query('select financeiro_pode_ler_arquivo($1)',[f.doc]),/permission denied/);
 }finally{await db.close()}
});
