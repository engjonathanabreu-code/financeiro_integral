const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const {config,pagador,b,rem,retorno,set}=require('./ailos-fixtures.cjs');
const C=require('../public/ailos-cnab');
const sql=(file)=>fs.readFileSync(path.join(__dirname,'../supabase',file),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');

async function setup(t){
 const db=new PGlite();
 t.after(()=>db.close());
 await db.exec(`
  create role anon; create role authenticated; create role service_role; create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.profiles(id uuid primary key, ativo boolean,tipo text,setor text);
  insert into public.profiles values ('${id(1)}',true,'Financeiro','Financeiro'),('${id(2)}',true,'Comercial','Comercial'),('${id(3)}',true,'Administrador','Diretoria');
  create function public.is_admin() returns boolean language sql stable as $$
    select exists(select 1 from public.profiles where id=auth.uid() and ativo and tipo='Administrador')
  $$;
  create schema financeiro_privado;
  create schema integracao_financeiro_privado;
  create table public.fin_receb_importacoes (id int);
  create table public.financeiro_contas (id int);
  create table public.financeiro_pagamentos (id int);
  create table public.financeiro_whatsapp_envios (id int);
  create table public.financeiro_estado_modulos (chave text,dados jsonb);
  create table public.fin_receb_clientes (id uuid primary key, codigo text, nome text, cpf_cnpj text, ativo boolean,municipio_id uuid,remessa_id uuid);
  create table public.fin_receb_parcelas(id uuid primary key,cliente_id uuid,numero int,vencimento date,
    valor_previsto numeric,juros numeric default 0,multa numeric default 0,nosso_numero text,documento text,
    linha_digitavel text,status text,pago_em date,valor_liquidado numeric default 0,diferenca numeric,ativo boolean,versao bigint default 1);
  create table integracao_moradores(colecao text,registro_id text,dados jsonb,referencia_id uuid);
  create table integracao_nucleos(colecao text,registro_id text,dados jsonb,referencia_id uuid);
  create table processos_kanban(id uuid,nucleo text);
  create function public.versionar() returns trigger language plpgsql as $$
  begin new.versao=old.versao+1;return new;end $$;
  create trigger versao before update on fin_receb_parcelas for each row execute function versionar();
  insert into fin_receb_clientes(id,codigo,nome,cpf_cnpj,ativo) values ('${id(10)}','10','PAGADOR TESTE','${pagador.cpf_cnpj}',true);
  insert into fin_receb_parcelas(id,cliente_id,numero,vencimento,valor_previsto,status,ativo)
    values ('${id(20)}','${id(10)}',1,current_date+10,100,'Pendente',true);
 `);
 for(const file of [
  'ailos-cobranca.sql','ailos-carnes.sql','ailos-busca-performance.sql','ailos-endereco-cliente.sql',
  'migrations/20261113191000_financeiro_perfis_recebimentos.sql',
  'migrations/20261113180935_financeiro_baixas_confirmadas.sql',
  'migrations/20261114094852_financeiro_ailos_permissoes_baixas.sql',
  'migrations/20261114151016_financeiro_ailos_artefatos_verificados.sql'
 ])await db.exec(sql(file));
 const auth=async (user,role='authenticated')=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.exec('set role '+role);
 };
 const rpc=async (acao,dados={})=>(await db.query('select financeiro_ailos($1,$2) as data',[acao,JSON.stringify(dados)])).rows[0].data;
 return {db,auth,rpc};
}

test('CNAB, códigos e nomes no servidor são idênticos aos do gerador original',async t=>{
 const {db}=await setup(t);
 const exemplos=[
   rem,
   {...rem,config:{...config,ambiente:'producao',homologado:true,nome:'Razão ÁÇ'},sequencia:42,boletos:[
     {...b,valor:250.99,pagador:{...pagador,nome:'João da Conceição',endereco:'Rua da   Praça'}},
     {...b,id:id(5),nosso_numero:'02206658000000255',documento:'INT000000255',valor:0.01,vencimento:'2026-10-30'}
   ]}
 ];
 for(const exemplo of exemplos){
  const {rows:[{out}]}=await db.query('select ailos_privado.cnab_remessa($1) as out',[JSON.stringify(exemplo)]);
  const esperado=C.remessa(exemplo);
  for(const [i,linha] of out.arquivo.split('\r\n').entries()){
   assert.equal(linha,esperado.arquivo.split('\r\n')[i],`Linha ${i+1}`);
  }
  assert.deepEqual(out,esperado);
 }
});

test('finalização explícita gera a partir da reserva e leitura mantém o arquivo gravado',async t=>{
 const {db,auth,rpc}=await setup(t);
 await auth(id(2));
 await assert.rejects(rpc('painel'),{code:'42501'});
 await auth('','anon');
 await assert.rejects(rpc('painel'),{code:'42501'});
 await auth(id(1));
 await assert.rejects(db.query("select ailos_privado.operar_v3('painel','{}')"),{code:'42501'});
 await assert.rejects(rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0}),{code:'42501'});
 await auth(id(3));
 await rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0});
 await auth(id(1));
 await rpc('pagador',{cliente_id:id(10),pagador});
 const reserva=await rpc('preparar',{id:id(30),parcelas:[{id:id(20),versao:1}]});
 const arquivo=C.remessa(reserva);
 assert.equal((await rpc('remessa',{id:reserva.id})).arquivo,null);
 await assert.rejects(rpc('finalizar',{id:reserva.id,...arquivo}),/confirme/);
 await assert.rejects(rpc('finalizar',{id:reserva.id,confirmar:true,arquivo:arquivo.arquivo.replace('INT','ERR')}),/divergem/);
 await assert.rejects(rpc('finalizar',{id:reserva.id,confirmar:true,codigos:[{...arquivo.codigos[0],codigo_barras:'085'+ '0'.repeat(41)}]}),/divergem/);
 const pronto=await rpc('finalizar',{id:reserva.id,confirmar:true});
 assert.equal(pronto.arquivo,arquivo.arquivo);
 assert.equal((await rpc('remessa',{id:reserva.id})).arquivo,arquivo.arquivo);
 assert.deepEqual(await rpc('finalizar',{id:reserva.id,confirmar:true}),pronto);
 const saved=await rpc('remessa',{id:reserva.id});
 assert.deepEqual(saved.codigos[reserva.boletos[0].id],{
  codigo_barras:arquivo.codigos[0].codigo_barras,linha_digitavel:arquivo.codigos[0].linha_digitavel
 });
});

test('retorno deriva eventos do arquivo, exige prévia e preserva a procedência com idempotência',async t=>{
 const {db,auth,rpc}=await setup(t);
 await auth(id(1));
 await assert.rejects(rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0}),{code:'42501'});
 await auth(id(3));
 await rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0});
 await auth(id(1));
 await rpc('pagador',{cliente_id:id(10),pagador});
 const reserva=await rpc('preparar',{id:id(30),parcelas:[{id:id(20),versao:1}]});
 await rpc('finalizar',{id:reserva.id,confirmar:true});
 const arquivo=retorno(reserva,'06',7000);
 const entrada={arquivo,nome:'origem.ret',origem:'canal_homologacao'};
 const previa=await rpc('previa_retorno',entrada);
 assert.deepEqual(previa.eventos,C.retorno(arquivo,reserva.config));
 assert.equal(previa.ambiente,'homologacao');
 await assert.rejects(rpc('retorno',entrada),/Refaça a conferência/);
 await assert.rejects(rpc('retorno',{...entrada,arquivo:arquivo.replace(/\r\n/g,'\n'),revisao:previa.revisao}),/Refaça a conferência/);
 await assert.rejects(rpc('previa_retorno',{...entrada,arquivo:set(arquivo,53,57,'99999')}),/outro beneficiário/);
 await assert.rejects(rpc('previa_retorno',{...entrada,arquivo:arquivo.slice(0,-200)}),/240/);
 assert.equal((await rpc('retorno',{...entrada,revisao:previa.revisao,eventos:[]})).processados,1);
 assert.equal((await rpc('retorno',{...entrada,revisao:previa.revisao})).repetido,true);
 await db.exec('reset role');
 const {rows:[ret]}=await db.query('select hash,nome,origem,arquivo,autor,revisao_previa from ailos_privado.retornos');
 assert.deepEqual(ret,{hash:createHash('sha256').update(arquivo).digest('hex'),nome:'origem.ret',origem:'canal_homologacao',arquivo,autor:id(1),revisao_previa:previa.revisao});
 const {rows:[parcela]}=await db.query('select status,valor_liquidado::int as valor from public.fin_receb_parcelas where id=$1',[id(20)]);
 assert.deepEqual(parcela,{status:'Pendente',valor:0});
 const {rows:[ev]}=await db.query('select retorno_hash,autor,dados from ailos_privado.eventos');
 assert.deepEqual(ev,{retorno_hash:ret.hash,autor:id(1),dados:previa.eventos[0]});
});


test('configuração, reserva e retorno continuam em homologação, com proteção sobre legado comercial',async t=>{
 const {db,auth,rpc}=await setup(t);
 await auth(id(3));
 const prod={...config,ambiente:'producao',homologado:true,protocolo:'FIXTURE'};
 await assert.rejects(rpc('configurar',{config:prod,ultimo_boleto:253,ultima_remessa:0}),{code:'42501'});
 await rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0});
 await rpc('pagador',{cliente_id:id(10),pagador});
 // Simula um registro comercial legado previamente armazenado por outra versão.
 await db.exec('reset role');
 await db.query("update ailos_privado.config set dados=$1",[JSON.stringify(prod)]);
 const args={id:id(30),parcelas:[{id:id(20),versao:1}]};
 const r=(await db.query("select ailos_privado.operar_v3('preparar',$1) as data",[JSON.stringify(args)])).rows[0].data;
 await auth(id(1));
 await assert.rejects(rpc('preparar',{...args,id:id(32)}),{code:'42501'});
 await assert.rejects(rpc('finalizar',{id:r.id,confirmar:true}),{code:'42501'});
 await db.exec('reset role');
 const out=C.remessa(r);
 await db.query("select ailos_privado.operar_v3('finalizar',$1)",[JSON.stringify({id:r.id,...out})]);
 await db.query("update ailos_privado.config set dados=$1",[JSON.stringify(config)]);
 await auth(id(1));
 assert.equal((await rpc('remessa',{id:r.id})).arquivo,out.arquivo);
 await assert.rejects(rpc('preparar',args),{code:'42501'});
 await assert.rejects(rpc('finalizar',{id:r.id,confirmar:true}),{code:'42501'});
 await assert.rejects(rpc('previa_retorno',{arquivo:retorno(r),nome:'origem.ret',origem:'canal_homologacao'}),/fora da homologação/);
});

test('aceite, rejeição, arquivo fora de ordem e reexportação preservam trilha e estado',async t=>{
 const {db,auth,rpc}=await setup(t);
 await auth(id(3));
 await rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0});
 await auth(id(1));
 await rpc('pagador',{cliente_id:id(10),pagador});
 const r=await rpc('preparar',{id:id(30),parcelas:[{id:id(20),versao:1}]});
 await rpc('finalizar',{id:r.id,confirmar:true});
 const conferir=async (occ,date,paid=200)=>{
  const rows=retorno(r,occ,paid).split('\r\n');
  rows[3]=set(rows[3],138,145,date);
  const entrada={arquivo:rows.join('\r\n'),nome:'retorno.ret',origem:'canal_homologacao'};
  const p=await rpc('previa_retorno',entrada);
  return { ...entrada,revisao:p.revisao };
 };
 const registro=await conferir('02','27092026');
 const previaAntiga=await conferir('03','29092026');
 assert.equal((await rpc('retorno',registro)).processados,1);
 assert.equal((await rpc('painel')).boletos[0].estado,'Registrado');
 await assert.rejects(rpc('retorno',previaAntiga),/Refaça a conferência/);
 const rejeicao=await conferir('03','29092026');
 assert.equal((await rpc('retorno',rejeicao)).processados,1);
 assert.equal((await rpc('painel')).boletos[0].estado,'Rejeitado');
 await assert.rejects(conferir('02','28092026'),/fora de ordem/);
 assert.equal((await rpc('retorno',registro)).repetido,true);
 const reexportado={...registro,arquivo:registro.arquivo.replace(/\r\n/g,'\n')};
 const nova=await rpc('previa_retorno',reexportado);
 assert.equal((await rpc('retorno',{...reexportado,revisao:nova.revisao})).processados,0);
 assert.equal((await rpc('painel')).boletos[0].estado,'Rejeitado');
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from ailos_privado.eventos where retorno_hash is not null')).rows[0].n,2);
 const {rows:[p]}=await db.query('select status,valor_liquidado::int pago from fin_receb_parcelas where id=$1',[id(20)]);
 assert.deepEqual(p,{status:'Pendente',pago:0});
});

test('uma falha ao registrar o retorno reverte tudo e permite repetir a confirmação',async t=>{
 const {db,auth,rpc}=await setup(t);
 await auth(id(3));
 await rpc('configurar',{config,ultimo_boleto:253,ultima_remessa:0});
 await auth(id(1));
 await rpc('pagador',{cliente_id:id(10),pagador});
 const r=await rpc('preparar_carne',{id:id(30),cliente_id:id(10),parcelas:[{valor:100,vencimento:
  (await db.query("select (current_date+20)::text d")).rows[0].d}]});
 await rpc('finalizar',{id:r.id,confirmar:true});
 const entrada={arquivo:retorno(r,'06',7000),origem:'canal_homologacao',nome:'teste.ret'};
 const p=await rpc('previa_retorno',entrada);
 await db.exec(`reset role;
  create function public.falhar_trilha() returns trigger language plpgsql as $$begin
    raise exception 'Falha sintética de trilha';
  end$$;
  create trigger falhar before insert on ailos_privado.retornos for each row execute function public.falhar_trilha()
 `);
 await auth(id(1));
 await assert.rejects(rpc('retorno',{...entrada,revisao:p.revisao}),/Falha sintética/);
 assert.equal((await rpc('painel')).boletos[0].estado,'Gerado');
 await db.exec('reset role; drop trigger falhar on ailos_privado.retornos');
 assert.equal((await db.query('select count(*)::int n from ailos_privado.eventos')).rows[0].n,0);
 await auth(id(1));
 assert.equal((await rpc('retorno',{...entrada,revisao:p.revisao})).processados,1);
 assert.equal((await rpc('painel')).boletos[0].estado,'Conferir parcial');

 await db.exec('reset role');
 const before=(await db.query('select * from ailos_privado.retornos')).rows;
 await db.exec(sql('rollback/financeiro_ailos_artefatos_verificados.sql'));
 assert.deepEqual((await db.query('select * from ailos_privado.retornos')).rows,before);
 assert.equal((await db.query('select count(*)::int n from ailos_privado.eventos where retorno_hash is not null')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from fin_receb_parcelas')).rows[0].n,1);
 await auth(id(3));
 await assert.rejects(rpc('configurar',{config:{...config,ambiente:'producao'},ultimo_boleto:255,ultima_remessa:1}),{code:'42501'});
});
