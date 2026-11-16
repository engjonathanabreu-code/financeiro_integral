const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const third='00000000-0000-4000-8000-000000000003';

function op(n){return '90000000-0000-4000-8000-'+String(n).padStart(12,'0')}
const fields={city:'Ibirama',project:'Vistoria',start:'2026-11-10',end:'2026-11-10',
  employee:'Pessoa sintética',sector:'Projetos',status:'Planejada',assigned:[]};

async function fixture(){
  const db=new PGlite();
  await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.profiles(id uuid primary key,nome text,tipo text,ativo boolean);
      insert into public.profiles values ('${owner}','Pessoa sintética','Projetos',true),
         ('${other}','ADM sintético','Administrador',true),('${third}','Terceiro','Administrativo',true);
      create table public.financeiro_estado_modulos(chave text primary key,dados jsonb,revisao bigint);
      insert into public.financeiro_estado_modulos values ('trips','[]',1);
      create schema financeiro_privado;
      create function public.financeiro_modulo_permitido(text) returns boolean language sql as
        $$select $1='trips'$$;
      create function public.financeiro_storage_permitido(text,boolean) returns boolean language sql as
        $$select split_part($1,'/',2) in ('financeiro-fiscal','financeiro-analise')$$;
      create function financeiro_privado.pode_ver_registro(text,jsonb,public.profiles) returns boolean language sql as
        $$select $3.tipo='Administrador' or $2->>'sector'=$3.tipo$$;
      create function financeiro_privado.validar_registro(text,jsonb,jsonb,public.profiles) returns jsonb language plpgsql as
        $$begin
          if $3->>'status'='Aprovada' and ($2 is null or $2->>'status' is distinct from 'Aprovada')
             then raise exception using errcode='42501'; end if;
          return $3;
        end$$;
      create function financeiro_privado.filtrar_registros(text,jsonb,public.profiles) returns jsonb language sql as
        $$select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements($2) x
            where financeiro_privado.pode_ver_registro($1,x,$3)$$;
      create function public.financeiro_salvar_modulo(text,jsonb,bigint) returns jsonb language plpgsql as
        $$begin
        update public.financeiro_estado_modulos set dados=$2,revisao=revisao+1 where chave=$1 and revisao=$3;
        return jsonb_build_object('status',case when found then 'salvo' else 'conflito' end);
        end$$;
      create function public.financeiro_salvar_modulo_visivel(text,jsonb,bigint) returns jsonb language sql as
    $$select public.financeiro_salvar_modulo($1,
      (select coalesce(jsonb_agg(x),'[]')
       from public.financeiro_estado_modulos m
       cross join lateral jsonb_array_elements(m.dados) x
       join public.profiles p on p.id=auth.uid()
       where m.chave=$1 and not financeiro_privado.pode_ver_registro($1,x,p))||$2,$3)$$;
  `);
  await db.exec(readFileSync('supabase/migrations/20261116165100_financeiro_viagens_persistencia.sql','utf8'));
  return db;
}

test('one trip per operation, allows independent similar trips and rejects stale or unauthorized edits',async()=>{
  const db=await fixture();
  const change=async(actor,n,id,data,expected=null)=>{
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
    const response=await db.query('select public.financeiro_salvar_viagem($1,$2,$3,$4) result',
      [op(n),id,JSON.stringify(data),expected===null?null:JSON.stringify(expected)]);
    return response.rows[0].result;
  };
  try{
    const first=await change(owner,1,'ida',fields);
    assert.equal(first.status,'salvo');
    assert.equal((await change(owner,1,'ida',fields)).repetido,true);
    await assert.rejects(change(owner,1,'outro-id',fields),{code:'22023'});
    const another=await change(owner,2,'volta',fields);
    assert.equal(another.status,'salvo');
    await assert.rejects(change(third,3,'ida',fields,first.viagem),{code:'42501'});
    const updated=await change(other,4,'ida',{...fields,report:'Relatório novo'},first.viagem);
    assert.equal(updated.viagem.report,'Relatório novo');
    const conflict=await change(other,5,'ida',{...fields,report:'Relatório obsoleto'},first.viagem);
    assert.equal(conflict.status,'conflito');
    assert.equal(conflict.viagem.report,'Relatório novo');
    assert.equal((await change(owner,1,'ida',fields)).viagem.report,'Relatório novo');
    const {dados,revisao}=(await db.query("select dados,revisao::int from public.financeiro_estado_modulos where chave='trips'")).rows[0];
    assert.deepEqual(dados.map(t=>t.id),['ida','volta']);
    assert.equal(revisao,4);
    const {protegido}=(await db.query("select public.financeiro_storage_permitido('actor/financeiro-viagens/file',true) protegido")).rows[0];
    assert.ok(protegido);
  }finally{await db.close()}
});
