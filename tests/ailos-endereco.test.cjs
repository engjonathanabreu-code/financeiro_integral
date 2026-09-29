const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const A=require('../public/ailos-carne'),C=require('../public/ailos-cnab'),{config,pagador}=require('./ailos-fixtures.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('endereço automático do cliente, ajustes preservados, autorização e pagador congelado',async()=>{
 const {PGlite}=await import('@electric-sql/pglite'),db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create table profiles(id uuid primary key,ativo boolean,tipo text,setor text);insert into profiles values('${id(1)}',true,'Financeiro','Financeiro'),('${id(2)}',true,'Comercial','Comercial');
 create table fin_receb_clientes(id uuid primary key,nome text,cpf_cnpj text,ativo boolean,codigo text);
 create table fin_receb_parcelas(id uuid primary key,cliente_id uuid,numero int,vencimento date,valor_previsto numeric,juros numeric default 0,multa numeric default 0,nosso_numero text,documento text,linha_digitavel text,status text,pago_em date,valor_liquidado numeric default 0,diferenca numeric default 0,ativo boolean,versao bigint default 1,unique(cliente_id,numero));
 create table integracao_moradores(colecao text,registro_id text,dados jsonb,referencia_id uuid);create table integracao_nucleos(colecao text,registro_id text,dados jsonb,referencia_id uuid);create table processos_kanban(id uuid,nucleo text);
 insert into fin_receb_clientes values('${id(10)}','JOSÉ DA SILVA','529.982.247-25',true,'CLI-010');insert into processos_kanban values('${id(90)}','Jardim Esperança');insert into integracao_nucleos values('nucleos','nuc-1','{}','${id(90)}');insert into integracao_moradores values('processos','proc-1','{"nucleoId":"nuc-1"}','${id(10)}');`);
 for(const file of ['ailos-cobranca.sql','ailos-carnes.sql','ailos-busca-performance.sql','ailos-endereco-cliente.sql'])await db.exec(fs.readFileSync(`${__dirname}/../supabase/${file}`,'utf8'));
 const login=async n=>db.exec(`reset role;select set_config('request.jwt.claim.sub','${id(n)}',false);set role authenticated`);
 const rpc=async(a,d={})=>(await db.query('select financeiro_ailos($1,$2) as data',[a,JSON.stringify(d)])).rows[0].data;
 await login(2);await assert.rejects(rpc('cliente',{id:id(10)}),/permissão/);await login(1);
 let data=await rpc('cliente',{id:id(10)});assert.equal(data.origem,'ausente');assert.equal(data.pagador.endereco,'');
 const endereco={logradouro:'Rua das Flores',numero:'123',complemento:'Casa 2',bairro:'Centro',cep:'89.010-000',municipio:'Blumenau',uf:' sc '};
 await db.exec('reset role');await db.query("update integracao_moradores set dados=jsonb_set(dados,'{endereco}',$1::jsonb)",[JSON.stringify(endereco)]);await login(1);
 data=await rpc('cliente',{id:id(10)});assert.equal(data.origem,'integracao');assert.deepEqual(data.pagador,{endereco:'Rua das Flores, 123, Casa 2',bairro:'Centro',cep:'89010000',cidade:'Blumenau',uf:'SC'});
 const imported=data.pagador;
 await rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0});
 const date=(await db.query("select (current_date+10)::text as d")).rows[0].d;
 const request={id:id(30),cliente_id:id(10),parcelas:[{valor:100,vencimento:date}],adicionar_cobrancas:false,pagador_confirmado:imported};
 await assert.rejects(rpc('preparar_carne',{...request,pagador_confirmado:{...imported,cep:'99999999'}}),/endereço mudou/);
 const r=await rpc('preparar_carne',request);assert.equal(r.boletos[0].pagador.endereco,imported.endereco);assert.ok(C.remessa(r).arquivo.includes('RUA DAS FLORES, 123, CASA 2'));
 await db.exec('reset role');await db.query("update integracao_moradores set dados=jsonb_set(dados,'{endereco,numero}','\"456\"')");await login(1);
 data=await rpc('cliente',{id:id(10)});assert.equal(data.origem,'integracao');assert.equal(data.pagador.endereco,'Rua das Flores, 456, Casa 2');assert.deepEqual(await rpc('preparar_carne',request),r);
 assert.equal((await rpc('remessa',{id:r.id})).boletos[0].pagador.endereco,imported.endereco);
 // A emissão de parcelas existentes recebe o mesmo endereço automático.
 await db.exec('reset role');await db.query("insert into fin_receb_parcelas(id,cliente_id,numero,vencimento,valor_previsto,status,ativo) values($1,$2,1,$3,100,'Pendente',true)",[id(20),id(10),date]);await login(1);
 const old=await rpc('preparar',{id:id(31),parcelas:[{id:id(20),versao:1}],pagador_confirmado:data.pagador});assert.equal(old.boletos[0].pagador.endereco,'Rua das Flores, 456, Casa 2');
 // Um endereço ajustado manualmente não é sobrescrito pelo cadastro compartilhado.
 await rpc('pagador',{cliente_id:id(10),pagador:{...imported,endereco:'RUA DE COBRANCA 99'}});data=await rpc('cliente',{id:id(10)});assert.equal(data.origem,'cobranca');assert.equal(data.pagador.endereco,'RUA DE COBRANCA 99');
 await db.exec('reset role');await db.query('delete from ailos_privado.pagadores where cliente_id=$1',[id(10)]);await db.query("update integracao_moradores set dados=jsonb_set(dados,'{endereco}','{\"numero\":\"999\",\"cep\":\"89010000\"}')");await login(1);
 data=await rpc('cliente',{id:id(10)});assert.equal(data.pagador.endereco,'');assert.equal(data.pagador.cidade,'');await assert.rejects(rpc('preparar_carne',{...request,id:id(32),pagador_confirmado:data.pagador}),/Complete o endereço/);
 }finally{await db.close();}
});
