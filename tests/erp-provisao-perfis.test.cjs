const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const migration = readFileSync(path.join(__dirname, '../supabase/migrations/20261116145402_erp_proteger_provisao_perfis.sql'), 'utf8');

// Imagem do gatilho anterior para exercitar a guarda de catálogo da migração.
const legacy = `CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tipo text;
begin
  if not exists (select 1 from public.profiles) then
    v_tipo := 'Administrador';
  else
    v_tipo := coalesce(new.raw_user_meta_data ->> 'tipo', 'Projetos');
  end if;

  if v_tipo not in (
    'Administrador',
    'Comercial',
    'Projetos',
    'Topografia',
    'Marketing',
    'Pós-protocolo'
  ) then
    v_tipo := 'Projetos';
  end if;

  insert into public.profiles (id, nome, cpf, email, tipo, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)),
    nullif(new.raw_user_meta_data ->> 'cpf', ''),
    new.email,
    v_tipo,
    true
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$function$
`;

test('provisão usa metadata de aplicação e preserva os perfis existentes', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb);
    create table public.profiles(
      id uuid primary key, nome text, cpf text, email text, tipo text, ativo boolean,
      updated_at timestamptz default now()
    );
    ${legacy};
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
    insert into public.profiles(id,nome,cpf,email,tipo,ativo) values
      ('00000000-0000-4000-8000-000000000001','Pessoa original','fixture','original@example.invalid','Administrador',true);
  `);
  const rows = async () => (await db.query('select nome,cpf,tipo,ativo,email from profiles order by id')).rows;
  const baseline = await rows();
  await db.exec(migration);
  assert.deepEqual(await rows(), baseline);

  const add = (n, own, server, email = 'fixture@example.invalid') => db.query(
    'insert into auth.users values ($1,$2,$3,$4)',
    ['00000000-0000-4000-8000-' + String(n).padStart(12, '0'), email, JSON.stringify(own), JSON.stringify(server)]
  );
  await add(2, { nome: 'Público', tipo: 'Administrador', cpf: 'fixture' }, { provider: 'email' });
  await add(3, { nome: 'ADM', tipo: 'Topografia', cpf: 'fixture' }, { erp_provisionado: true, erp_tipo: 'Administrador' });
  await add(4, { nome: 'Marcador inválido' }, { erp_provisionado: 'true', erp_tipo: 'Administrador' });
  await add(5, { nome: 'Comercial', tipo: 'Administrador' }, { erp_provisionado: true, erp_tipo: 'Comercial' });
  await add(6, { nome: 'Tipo legado desconhecido' }, { erp_provisionado: true, erp_tipo: 'Outro' });
  await add(1, { nome: 'Outro nome', cpf: 'outro', tipo: 'Comercial' }, { erp_provisionado: true, erp_tipo: 'Comercial' }, 'updated@example.invalid');

  const authorize = (n, tipo) => db.query(
    "update auth.users set raw_app_meta_data=jsonb_build_object('erp_provisionado',true,'erp_tipo',$2::text) where id=$1",
    ['00000000-0000-4000-8000-' + String(n).padStart(12, '0'), tipo]
  );
  await add(7, { nome: 'Provisionado em duas etapas', tipo: 'Administrador', cpf: 'fixture' }, { provider: 'email' });
  await authorize(7, 'Comercial');
  await authorize(7, 'Administrador');
  await authorize(1, 'Comercial');

  const after = await rows();
  assert.deepEqual(after[0], { ...baseline[0], email: 'updated@example.invalid' });
  assert.deepEqual(after.slice(1).map(p => [p.nome, p.tipo, p.ativo, p.cpf]), [
    ['Público', 'Projetos', false, null],
    ['ADM', 'Administrador', true, 'fixture'],
    ['Marcador inválido', 'Projetos', false, null],
    ['Comercial', 'Comercial', true, null],
    ['Tipo legado desconhecido', 'Projetos', true, null],
    ['Provisionado em duas etapas', 'Comercial', true, 'fixture'],
  ]);
});
