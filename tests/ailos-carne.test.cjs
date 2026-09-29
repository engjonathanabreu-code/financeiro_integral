const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const A=require('../public/ailos-carne'),C=require('../public/ailos-cnab'),{config,pagador}=require('./ailos-fixtures.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('carnê: vencimentos iguais e mensais, fim de mês, ano bissexto e valores',()=>{
 const a=A.plano({quantidade:3,valor:123.45,vencimento:'2028-01-31',periodicidade:'mensal'});assert.deepEqual(a.map(x=>x.vencimento),['2028-01-31','2028-02-29','2028-03-31']);
 assert.equal(new Set(A.plano({quantidade:500,valor:100,vencimento:'2026-10-10',periodicidade:'igual'}).map(x=>x.vencimento)).size,1);
 for(const p of [{quantidade:0},{quantidade:501},{quantidade:1.5},{valor:0},{valor:1.001},{vencimento:'2026-02-30'},{periodicidade:'semanal'}])assert.throws(()=>A.plano({quantidade:3,valor:100,vencimento:'2026-10-10',periodicidade:'igual',...p}));
});
test('carnê transacional, busca completa, homologação isolada e retorno no mesmo cliente',async()=>{
 const {PGlite}=await import('@electric-sql/pglite'),db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create table profiles(id uuid primary key,ativo boolean,tipo text,setor text);insert into profiles values('${id(1)}',true,'Financeiro','Financeiro'),('${id(2)}',true,'Comercial','Comercial');
 create table fin_receb_clientes(id uuid primary key,nome text,cpf_cnpj text,ativo boolean,codigo text);
 create table fin_receb_parcelas(id uuid primary key,cliente_id uuid,numero int,vencimento date,valor_previsto numeric,juros numeric default 0,multa numeric default 0,nosso_numero text,documento text,linha_digitavel text,status text,pago_em date,valor_liquidado numeric default 0,diferenca numeric default 0,ativo boolean,versao bigint default 1,unique(cliente_id,numero));
 create table integracao_moradores(colecao text,registro_id text,dados jsonb,referencia_id uuid);create table integracao_nucleos(colecao text,registro_id text,dados jsonb,referencia_id uuid);create table processos_kanban(id uuid,nucleo text);
 insert into fin_receb_clientes values('${id(10)}','JOSÉ DA SILVA','529.982.247-25',true,'CLI-010');insert into processos_kanban values('${id(90)}','Jardim Esperança');insert into integracao_nucleos values('nucleos','nuc-1','{}','${id(90)}');insert into integracao_moradores values('processos','proc-1','{"nucleoId":"nuc-1"}','${id(10)}');`);
 for(const file of ['ailos-cobranca.sql','ailos-carnes.sql','ailos-busca-performance.sql'])await db.exec(fs.readFileSync(`${__dirname}/../supabase/${file}`,'utf8'));
 const login=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated`);
 const rpc=async(a,d={})=>(await db.query('select financeiro_ailos($1,$2) as data',[a,JSON.stringify(d)])).rows[0].data;
 await login(2);await assert.rejects(rpc('buscar_clientes',{busca:'jose'}),/permissão/);await assert.rejects(rpc('preparar_carne'),/permissão/);await login(1);
 for(const busca of ['jose','JOSÉ','52998224725','529.982.247-25','CLI-010','esperanca']){const r=await rpc('buscar_clientes',{busca});assert.equal(r.total,1,busca);assert.equal(r.clientes[0].id,id(10));assert.equal(r.clientes[0].nucleo,'Jardim Esperança');}
 assert.equal((await rpc('buscar_clientes',{busca:'%_'})).total,0);
 await rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0});await rpc('pagador',{cliente_id:id(10),pagador});
 const date=(await db.query("select (current_date+10)::text as d")).rows[0].d;
 const request={id:id(30),cliente_id:id(10),parcelas:Array.from({length:3},()=>({valor:100,vencimento:date})),adicionar_cobrancas:false};
 let r=await rpc('preparar_carne',request);assert.deepEqual(await rpc('preparar_carne',request),r);await assert.rejects(rpc('preparar_carne',{...request,parcelas:[{valor:99,vencimento:date}]}),/outro pedido/);
 let out=C.remessa(r);assert.equal(new Set(out.codigos.map(b=>b.codigo_barras)).size,3);await rpc('finalizar',{id:r.id,...out});assert.equal((await rpc('cliente',{id:id(10)})).parcelas.length,0);
 await rpc('configurar',{config:{...config,ambiente:'producao',homologado:true,protocolo:'TESTE'},ultimo_boleto:256,ultima_remessa:1});r=await rpc('preparar_carne',{...request,id:id(31)});out=C.remessa(r);
 await assert.rejects(rpc('finalizar',{id:r.id,...out,codigos:out.codigos.map((b,i)=>i===2?{...b,codigo_barras:'bad'}:b)}),/inválido/);assert.equal((await rpc('cliente',{id:id(10)})).parcelas.length,0);
 await rpc('finalizar',{id:r.id,...out});await rpc('finalizar',{id:r.id,...out});let ps=(await rpc('cliente',{id:id(10)})).parcelas;assert.equal(ps.length,3);assert.deepEqual(ps.map(p=>p.numero),[1,2,3]);assert.ok(ps.every(p=>p.cliente_id===id(10)&&p.valor_previsto===100&&p.vencimento===date));assert.equal(new Set(ps.map(p=>p.nosso_numero)).size,3);
 await assert.rejects(rpc('preparar_carne',{...request,id:id(32)}),/adicionar novas cobranças/);
 const today=(await db.query('select current_date::text as d')).rows[0].d,b=r.boletos[1];
 await rpc('retorno',{hash:'a'.repeat(64),nome:'retorno.ret',ambiente:'producao',eventos:[{nosso_numero:b.nosso_numero,documento:b.documento,cpf_cnpj:pagador.cpf_cnpj,valor_centavos:10000,vencimento:date,pago_centavos:10000,liquido_centavos:9800,data:today,credito:today,ocorrencia:'06',motivos:'0000000000'}]});
 ps=(await rpc('cliente',{id:id(10)})).parcelas;assert.equal(ps.filter(p=>p.status==='Pago').length,1);assert.equal(ps.find(p=>p.id===b.parcela_id).valor_liquidado,100);
 await assert.rejects(rpc('preparar_carne',{...request,id:id(33),adicionar_cobrancas:true,parcelas:[{valor:-1,vencimento:date}]}),/valores/);
 }finally{await db.close();}
});
