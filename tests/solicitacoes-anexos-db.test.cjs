const {readFileSync}=require('node:fs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');

const migration=readFileSync('supabase/migrations/20261116151615_financeiro_solicitacoes_anexos.sql','utf8');
const rollback=readFileSync('supabase/rollback/financeiro_solicitacoes_anexos.sql','utf8');
const owner='11111111-1111-4111-8111-111111111111';
const outsider='22222222-2222-4222-8222-222222222222';
const administrator='33333333-3333-4333-8333-333333333333';
const file='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const another='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const bucket='financeiro-solicitacoes';
const request='legado"2026';
const objectPath=owner+'/'+file;

test('Anexos validam vínculo, autor, original, estado, retry e acesso ao objeto', async () => {
  const db=new PGlite();
  const query=async (sql,args)=>(await db.query(sql,args)).rows;
  const session=async (id,role='authenticated')=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    await db.exec('set role '+role);
  };
  const reserve=(id=file,name='Despesa.pdf',mime='application/pdf',size=25)=>
    query('select public.financeiro_reservar_anexo_solicitacao($1,$2,$3,$4,$5) as a',[request,id,name,mime,size]);
  const confirm=(id=file)=>query('select public.financeiro_confirmar_anexo_solicitacao($1,$2) as a',[request,id]);
  const list=()=>query('select public.financeiro_listar_anexos_solicitacao($1) as a',[request]);
  const storageNames=()=>query('select name from storage.objects where bucket_id=$1 order by name',[bucket]);
  const operation=(name)=>query("select set_config('storage.operation',$1,false)",[name]);
  try{
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema storage;
      create schema financeiro_solicitacoes_privado;
      grant usage on schema auth,storage to anon,authenticated;
      create function storage.allow_any_operation(text[]) returns boolean language sql stable as
        $$select coalesce(current_setting('storage.operation',true)=any($1),false)$$;
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to anon,authenticated;
      create policy ampla on storage.objects for all to anon,authenticated using (true) with check (true);
      create table public.financeiro_estado_modulos(chave text primary key,dados jsonb);
      insert into public.financeiro_estado_modulos values ('invoiceRequests','[]');
      create table public.pedidos_teste(id text primary key,proprietario uuid,aberto boolean,apagado boolean);
      create table public.eventos_teste(id text,tipo text,nome text);
      create function financeiro_solicitacoes_privado.pode_acessar(p_id text,p_anexar boolean)
      returns boolean language sql stable as $$
        select exists(select 1 from public.pedidos_teste where id=p_id and not apagado
         and (proprietario=auth.uid() or auth.uid()='${administrator}') and (not p_anexar or aberto))
      $$;
      create function financeiro_solicitacoes_privado.registrar_evento(text,text,text,jsonb,boolean,uuid,text)
      returns void language sql as $$insert into public.eventos_teste values ($1,$2,$3)$$;
    `);
    await query('insert into public.pedidos_teste values ($1,$2,true,false)',[request,owner]);
    await db.exec(migration);
    await operation('object.get_authenticated');

    await session(owner);
    await assert.rejects(reserve(another,'../confidencial.pdf'),{code:'22023'});
    await assert.rejects(reserve(another,'script.html','text/html'),{code:'22023'});
    await assert.rejects(reserve(another,'grande.pdf','application/pdf',20*1024*1024+1),{code:'22023'});
    const [{a:reserved}]=await reserve();
    assert.equal(reserved.path,objectPath);
    assert.equal(reserved.confirmedAt,null);
    assert.deepEqual(await reserve(),[{a:reserved}]);
    await assert.rejects(reserve(file,'outro.pdf'),{code:'22023'});
    await assert.rejects(confirm(),{code:'22023'});
    await assert.rejects(query('insert into storage.objects values ($1,$2,$3)',[bucket,owner+'/'+another,{}]),{code:'42501'});

    await session(outsider);
    await assert.rejects(reserve(),{code:'42501'});
    await assert.rejects(list(),{code:'42501'});
    await assert.rejects(query('insert into storage.objects values ($1,$2,$3)',[bucket,objectPath,{}]),{code:'42501'});

    await session(owner);
    await query('insert into storage.objects values ($1,$2,$3)',[bucket,objectPath,{size:25,mimetype:'application/pdf'}]);
    assert.deepEqual(await storageNames(),[]);
    const [{a:confirmed}]=await confirm();
    assert.ok(confirmed.confirmedAt);
    assert.deepEqual(await confirm(),[{a:confirmed}]);
    assert.deepEqual(await list(),[{a:[confirmed]}]);
    assert.deepEqual(await storageNames(),[{name:objectPath}]);
    await operation('object.get_authenticated_info');
    assert.deepEqual(await storageNames(),[{name:objectPath}]);
    await operation('object.sign');
    assert.deepEqual(await storageNames(),[]);
    await operation('object.get_authenticated');
    assert.deepEqual(await query('delete from storage.objects where bucket_id=$1 returning name',[bucket]),[]);
    assert.deepEqual(await query('update storage.objects set name=name where bucket_id=$1 returning name',[bucket]),[]);

    await session(administrator);
    assert.deepEqual(await list(),[{a:[confirmed]}]);
    assert.deepEqual(await storageNames(),[{name:objectPath}]);
    await assert.rejects(confirm(),{code:'42501'});

    await session(outsider);
    assert.deepEqual(await storageNames(),[]);
    await session('','anon');
    assert.deepEqual(await storageNames(),[]);
    await assert.rejects(list(),{code:'42501'});

    await db.exec('reset role');
    assert.deepEqual(await query('select tipo from public.eventos_teste'),[{tipo:'attach'}]);
    await query('update public.pedidos_teste set aberto=false where id=$1',[request]);
    await session(owner);
    await assert.rejects(reserve(another),{code:'42501'});
    assert.deepEqual(await reserve(),[{a:confirmed}]);
    await db.exec('reset role');
    await query('update public.pedidos_teste set apagado=true where id=$1',[request]);
    await session(owner);
    await assert.rejects(list(),{code:'42501'});
    assert.deepEqual(await storageNames(),[]);

    await db.exec('reset role');
    await db.exec(rollback);
    assert.deepEqual(await storageNames(),[{name:objectPath}]);
    assert.equal((await query('select count(*)::integer n from financeiro_anexos_solicitacoes_privado.anexos'))[0].n,1);
    await session(owner);
    assert.deepEqual(await storageNames(),[]);
    await db.exec('reset role');
    await db.exec(migration);
    await query('update public.pedidos_teste set apagado=false where id=$1',[request]);
    await session(owner);
    assert.deepEqual(await list(),[{a:[confirmed]}]);
  }finally{
    await db.close();
  }
});
