const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.join(__dirname,'..');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261113180935_financeiro_baixas_confirmadas.sql'),'utf8');

const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
const pgto='2026-01-20';
const due='2026-01-18';
const file='a'.repeat(64);
const line=(fields={})=>({nosso_numero:'1234',vencimento:due,pagamento:pgto,valor_centavos:10000,...fields});

async function setup(t){
 const db=new PGlite();
 t.after(()=>db.close());
 await db.exec(`
  create role authenticated;
  create role anon;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create function public.can_access_fin_recebimentos() returns boolean language sql stable as $$
    select auth.uid()='${id(1)}'
  $$;
  create table public.fin_receb_clientes(
    id uuid primary key, codigo text, cpf_cnpj text, ativo boolean default true
  );
  create table public.fin_receb_parcelas(
    id uuid primary key, cliente_id uuid not null references public.fin_receb_clientes(id) on delete cascade,
    numero integer not null, vencimento date not null, documento text, nosso_numero text,
    status text not null default 'Pendente', valor_previsto numeric, juros numeric default 0, multa numeric default 0, linha_digitavel text,
    versao bigint not null default 1, ativo boolean default true, pago_em date, valor_liquidado numeric default 0,
    diferenca numeric default 0
  );
  create schema ailos_privado;
  create table ailos_privado.boletos (parcela_id uuid, ambiente text, estado text);
  create function public.versionar() returns trigger language plpgsql as $$
  begin new.versao=old.versao+1; return new; end $$;
  create trigger versionar before update on public.fin_receb_parcelas for each row execute function public.versionar();
  insert into public.fin_receb_clientes(id,codigo,cpf_cnpj) values ('${id(2)}','C-001','111.222.333-44');
  insert into public.fin_receb_parcelas(id,cliente_id,numero,vencimento,valor_previsto,documento,nosso_numero)
  values ('${id(3)}','${id(2)}',1,'${due}',100,'DOC-3','123-4'),
         ('${id(4)}','${id(2)}',2,'2026-01-25',200,'DOC-4','4567'),
         ('${id(5)}','${id(2)}',3,'2026-02-25',300,'DOC-5','5678');
  insert into public.fin_receb_clientes(id,codigo,cpf_cnpj) values ('${id(7)}','C-LEGADO','98765432100');
  insert into public.fin_receb_parcelas(id,cliente_id,numero,vencimento,valor_previsto,status,pago_em,valor_liquidado)
  values ('${id(8)}','${id(7)}',1,'${due}',42,'Pago','${pgto}',42);
  grant select,insert,update,delete on public.fin_receb_parcelas to authenticated;
  grant select,delete on public.fin_receb_clientes to authenticated;
  create function public.editar_legado(p_id uuid, p_versao bigint,p_status text,p_pago numeric)
  returns void language sql security invoker set search_path='' as $$
    update public.fin_receb_parcelas set status=p_status,valor_liquidado=p_pago,
      pago_em=case when p_pago>0 then date '${pgto}' end
    where id=p_id and versao=p_versao
  $$;
  create function public.retornar_ailos_fixture(p_id uuid)
  returns void language plpgsql security definer set search_path='' as $$
  begin
    if not public.can_access_fin_recebimentos() then raise exception using errcode='42501',message='Sem acesso'; end if;
    perform financeiro_baixas_privado.abrir_escrita('ailos',null);
    update public.fin_receb_parcelas set status='Parcial',pago_em='${pgto}',valor_liquidado=80,diferenca=-20 where id=p_id;
    update ailos_privado.boletos set estado='Conferir parcial' where parcela_id=p_id;
    perform financeiro_baixas_privado.fechar_escrita();
  end $$;
 `);
 await db.exec(migration);
 const as=async (user,role='authenticated')=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  await db.exec('set role '+role);
 };
 const report=async (rows,hash=file,rev=null)=>(await db.query(
   'select financeiro_baixa_relatorio($1,$2,$3) as resultado',[hash,JSON.stringify(rows),rev]
 )).rows[0].resultado;
 const manual=(id,version,status,action,reason=null)=>db.query(
   'select financeiro_baixa_manual($1,$2,$3,$4,$5)',[id,version,status,action,reason]
 );
 await as(id(1));
 return {db,as,report,manual};
}
test('manual usa estado revisado e estorna apenas a baixa identificada com motivo',async t=>{
 const {db,as,manual}=await setup(t);
 await as(id(9));
 await assert.rejects(manual(id(3),1,'Pendente','baixar'),{code:'42501'});
 await as('','anon');
 await assert.rejects(manual(id(3),1,'Pendente','baixar'),{code:'42501'});
 await as(id(1));
 await manual(id(3),1,'Pendente','baixar');
 await assert.rejects(manual(id(3),1,'Pendente','baixar'),{code:'40001'});
 await assert.rejects(manual(id(3),2,'Pendente','baixar'),{code:'40001'});
 await assert.rejects(manual(id(3),2,'Pago','estornar',' '),/motivo/);
 await manual(id(3),2,'Pago','estornar','Registro repetido');
 await assert.rejects(manual(id(8),1,'Pago','estornar','Teste de pagamento anterior'),/legada/);
 await db.exec('reset role');
 const {rows}=await db.query('select operacao,motivo,antes->>\'status\' antes,depois->>\'status\' depois from financeiro_baixas_privado.eventos order by id');
 assert.deepEqual(rows,[
  {operacao:'manual',motivo:null,antes:'Pendente',depois:'Pago'},
  {operacao:'estorno',motivo:'Registro repetido',antes:'Pago',depois:'Pendente'}
 ]);
});

test('prevê sem gravar, recusa valor divergente e não redireciona importação repetida',async t=>{
 const {db,report}=await setup(t);
 const rows=[line(),line({nosso_numero:null,codigo_processo:'C-001',vencimento:'2026-01-21'}),line({nosso_numero:'4567',vencimento:'2026-01-25',valor_centavos:21000})];
 const preview=await report(rows);
 assert.deepEqual(preview.linhas.map(x=>x.situacao),['confirmavel','sem_titulo','valor_divergente']);
 const antes=await report([line()]);
 assert.equal(antes.linhas[0].situacao,'confirmavel');
 await assert.rejects(report([line({valor_centavos:9900})],file,preview.revisao),{code:'40001'});
 assert.deepEqual(await report(rows,file,preview.revisao),{aplicadas:1,repetido:false});
 assert.deepEqual(await report(rows,file,preview.revisao),{aplicadas:1,repetido:true});
 assert.deepEqual(await report([line({nosso_numero:'4567',vencimento:'2026-01-25',valor_centavos:20000})]),{
  aplicadas:1,repetido:true,linhas:[]
 });
 const outro=await report(rows,'b'.repeat(64));
 assert.deepEqual(outro.linhas.map(x=>x.situacao),['registrado','sem_titulo','valor_divergente']);
 await db.exec('reset role');
 const {rows: status}=await db.query('select numero,status,valor_liquidado::integer valor from public.fin_receb_parcelas where cliente_id=$1 order by numero',[id(2)]);
 assert.deepEqual(status,[{numero:1,status:'Pago',valor:100},{numero:2,status:'Pendente',valor:0},{numero:3,status:'Pendente',valor:0}]);
});

test('arquivo ambíguo ou com referência contraditória fica para revisão',async t=>{
 const {db,as,report}=await setup(t);
 assert.equal((await report([line({documento:'DOC-4'})])).linhas[0].situacao,'sem_titulo');
 const repeated=await report([line(),line({nosso_numero:null,cpf_cnpj:'11122233344'})]);
 assert.deepEqual(repeated.linhas.map(x=>x.situacao),['linhas_repetidas','linhas_repetidas']);
 assert.equal((await report([line({vencimento:'2026-02-31'})])).linhas[0].situacao,'dados_invalidos');
 await db.exec(`reset role; insert into public.fin_receb_clientes(id,codigo,cpf_cnpj) values ('${id(6)}','C-002','11122233344')`);
 await as(id(1));
 assert.equal((await report([line({nosso_numero:null,cpf_cnpj:'11122233344'})])).linhas[0].situacao,'sem_titulo');
 await as(id(9));
 await assert.rejects(report([line()]),{code:'42501'});
});

test('lote revalida a prévia e desfaz todas as baixas se a segunda falhar',async t=>{
 const {db,as,report}=await setup(t);
 const rows=[line(),line({nosso_numero:'4567',vencimento:'2026-01-25',valor_centavos:20000})];
 const before=await report(rows);
 await db.exec(`reset role; update public.fin_receb_parcelas set juros=1 where id='${id(4)}'`);
 await as(id(1));
 await assert.rejects(report(rows,file,before.revisao),{code:'40001'});
 await db.exec(`
  reset role;
  update public.fin_receb_parcelas set juros=0 where id='${id(4)}';
  create function public.falhar_parcela() returns trigger language plpgsql as $$
  begin
    if new.id='${id(4)}' and new.status='Pago' then raise exception 'Falha de teste'; end if;
    return new;
  end $$;
  create trigger falhar_parcela before update on public.fin_receb_parcelas for each row execute function public.falhar_parcela();
 `);
 await as(id(1));
 const preview=await report(rows);
 assert.equal(preview.linhas.filter(x=>x.situacao==='confirmavel').length,2);
 await assert.rejects(report(rows,file,preview.revisao),/Falha de teste/);
 await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int n from public.fin_receb_parcelas where status='Pago' and cliente_id=$1",[id(2)])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from financeiro_baixas_privado.eventos')).rows[0].n,0);
});

test('Ailos registra liquidação inicial e a protege do editor, relatório e estorno manual',async t=>{
 const {db,as,report,manual}=await setup(t);
 await db.exec(`reset role; insert into ailos_privado.boletos values ('${id(3)}','producao','Registrado')`);
 await as(id(1));
 assert.equal((await report([line()])).linhas[0].situacao,'retorno_ailos');
 await assert.rejects(manual(id(3),1,'Pendente','baixar'),/Ailos/);
 await db.query('select public.retornar_ailos_fixture($1)',[id(3)]);
 assert.equal((await db.query('select origem_baixa from fin_receb_parcelas where id=$1',[id(3)])).rows[0].origem_baixa,'ailos');
 await assert.rejects(db.query("update public.fin_receb_parcelas set status='Pendente' where id=$1",[id(3)]),{code:'42501'});
 await assert.rejects(db.query('update public.fin_receb_parcelas set numero=9 where id=$1',[id(3)]),{code:'42501'});
});

test('valor comprovado abaixo do título registra apenas o parcial e preserva o saldo',async t=>{
 const {db,report}=await setup(t);
 const rows=[line({valor_centavos:5000})];
 const preview=await report(rows);
 assert.equal(preview.linhas[0].situacao,'parcial_confirmavel');
 assert.equal(preview.linhas[0].total,100);
 await report(rows,file,preview.revisao);
 assert.equal((await report(rows,'b'.repeat(64))).linhas[0].situacao,'registrado');
 assert.equal((await report([line({valor_centavos:5001})],'c'.repeat(64))).linhas[0].situacao,'situacao_divergente');
 await db.exec('reset role');
 const {rows: status}=await db.query('select numero,status,valor_previsto::integer previsto,valor_liquidado::integer pago,diferenca::integer from public.fin_receb_parcelas where cliente_id=$1 order by numero limit 2',[id(2)]);
 assert.deepEqual(status,[{numero:1,status:'Parcial',previsto:100,pago:50,diferenca:-50},{numero:2,status:'Pendente',previsto:200,pago:0,diferenca:0}]);
});


test('descontos informados e valores de desconto inválidos ficam fora de qualquer baixa',async t=>{
 const {db,report}=await setup(t);
 const rows=[line({valor_centavos:5000,desconto_centavos:5000}),line({desconto_centavos:'-1'}),
  line({nosso_numero:'4567',vencimento:'2026-01-25',valor_centavos:10000})];
 const preview=await report(rows);
 assert.deepEqual(preview.linhas.map(x=>x.situacao),['desconto_revisao','dados_invalidos','parcial_confirmavel']);
 assert.equal((await report(rows,file,preview.revisao)).aplicadas,1);
 await db.exec('reset role');
 const {rows:[primeira,segunda]}=await db.query('select status,origem_baixa from fin_receb_parcelas where id in ($1,$2) order by id',[id(3),id(4)]);
 assert.deepEqual(primeira,{status:'Pendente',origem_baixa:null});
 assert.deepEqual(segunda,{status:'Parcial',origem_baixa:'relatorio'});
});

test('escritores legados não criam, apagam ou escondem baixa por update, importação ou cascade',async t=>{
 const {db,manual}=await setup(t);
 await assert.rejects(db.query("select public.editar_legado($1,1,'Pago',100)",[id(3)]),{code:'42501'});
 await assert.rejects(db.query("insert into fin_receb_parcelas(id,cliente_id,numero,vencimento,status) values ($1,$2,99,$3,'Pago')",[id(6),id(2),due]),{code:'42501'});
 await assert.rejects(db.query("select financeiro_baixas_privado.abrir_escrita('manual',$1)",[id(3)]),{code:'42501'});
 await db.query("select set_config('financeiro_baixa.canal','manual',false)");
 await assert.rejects(db.query("select public.editar_legado($1,1,'Pago',100)",[id(3)]),{code:'42501'});
 await manual(id(3),1,'Pendente','baixar');
 assert.equal((await db.query('select origem_baixa from fin_receb_parcelas where id=$1',[id(3)])).rows[0].origem_baixa,'manual');
 for(const command of [
  'update fin_receb_parcelas set ativo=false where id=$1',
  'update fin_receb_parcelas set valor_previsto=10 where id=$1',
  'update fin_receb_parcelas set origem_baixa=null where id=$1',
  'delete from fin_receb_parcelas where id=$1'
 ])await assert.rejects(db.query(command,[id(3)]),{code:'42501'});
 await assert.rejects(db.query('delete from fin_receb_clientes where id=$1',[id(7)]),{code:'42501'});
 assert.equal((await db.query('select origem_baixa from fin_receb_parcelas where id=$1',[id(8)])).rows[0].origem_baixa,null);
 await db.query("update fin_receb_parcelas set status='Inadimplente' where id=$1",[id(4)]);
});

test('nova parcela com a mesma referência invalida revisão e a confirmação não grava',async t=>{
 const {db,report}=await setup(t);
 const rows=[line()];
 const preview=await report(rows);
 await db.query("insert into fin_receb_parcelas(id,cliente_id,numero,vencimento,valor_previsto,nosso_numero) values ($1,$2,99,$3,100,'123-4')",[id(6),id(2),due]);
 await assert.rejects(report(rows,file,preview.revisao),{code:'40001'});
 assert.equal((await report(rows)).linhas[0].situacao,'ambiguo');
});

test('duas confirmações da mesma prévia reutilizam o resultado e deixam um evento',async t=>{
 const {db,report}=await setup(t);
 const rows=[line()];
 const preview=await report(rows);
 const resultados=await Promise.all([report(rows,file,preview.revisao),report(rows,file,preview.revisao)]);
 assert.deepEqual(resultados,[{aplicadas:1,repetido:false},{aplicadas:1,repetido:true}]);
 await db.exec('reset role');
 const {rows:[resultado]}=await db.query('select count(*)::int quantidade from financeiro_baixas_privado.eventos');
 assert.equal(resultado.quantidade,1);
});

test('fachada Ailos mantém busca e carnês, preserva homologação e bloqueia entrada direta', async t=>{
 const {db,as}=await setup(t);
 await db.exec(`reset role;
  grant usage on schema ailos_privado to authenticated;
  create function public.is_admin() returns boolean language sql as $$select false$$;
  create function ailos_privado.operar(acao text,dados jsonb) returns jsonb language sql as $$select dados$$;
  create function ailos_privado.operar_v2(acao text,dados jsonb) returns jsonb language sql as $$select dados$$;
  create function ailos_privado.operar_v3(acao text,dados jsonb) returns jsonb language sql as $$
   select jsonb_build_object('acao',acao,'canal',(select canal from financeiro_baixas_privado.escritas))
  $$;`);
 const compatibility=fs.readFileSync(path.join(root,'supabase/migrations/20261114094852_financeiro_ailos_permissoes_baixas.sql'),'utf8');
 await db.exec(compatibility);
 await as(id(1));
 const call=async (action,data={})=>(await db.query('select financeiro_ailos($1,$2) as resultado',[action,JSON.stringify(data)])).rows[0].resultado;
 for(const action of ['cliente','preparar_carne','buscar'])assert.deepEqual(await call(action),{acao:action,canal:null});
 assert.deepEqual(await call('retorno',{ambiente:'homologacao'}),{acao:'retorno',canal:'ailos'});
 await assert.rejects(call('retorno',{ambiente:'producao'}),{code:'42501'});
 await assert.rejects(call('configurar'),{code:'42501'});
 await assert.rejects(db.query("select ailos_privado.operar_v3('painel','{}')"),{code:'42501'});
 await db.exec('reset role; create or replace function public.is_admin() returns boolean language sql as $$select true$$');
 await as(id(1));
 await assert.rejects(call('configurar',{config:{ambiente:'producao'}}),{code:'42501'});
 assert.deepEqual(await call('configurar',{config:{ambiente:'homologacao'}}),{acao:'configurar',canal:null});
 await as(id(9));
 await assert.rejects(call('cliente'),{code:'42501'});
});
