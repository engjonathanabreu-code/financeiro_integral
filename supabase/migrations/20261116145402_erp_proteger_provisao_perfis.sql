-- Publicar a Edge administrativa compatível antes desta migração.
-- Somente metadata de aplicação, gravável pelo servidor, concede perfil ativo.
begin;
set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_trigger t on t.tgfoid = p.oid
    where p.oid = 'public.handle_new_user()'::regprocedure
      and p.prosecdef and md5(p.prosrc) = '801b549dc9b7c1d82624074c95d5d9ec'
      and t.tgrelid = 'auth.users'::regclass and t.tgname = 'on_auth_user_created'
      and t.tgenabled in ('O','A')
  ) then
    raise exception 'O gatilho de criação de perfil mudou. Revalide a provisão antes de publicar.';
  end if;
end $$;

-- O Auth envia metadata administrativa depois de inserir auth.users.
-- Registra somente perfis novos, para que a atualização nunca reclassifique
-- contas preexistentes nem dependa de timestamps.
create schema erp_provisao_privado;
revoke all on schema erp_provisao_privado from public, anon, authenticated;
create table erp_provisao_privado.perfis_pendentes (
  usuario uuid primary key references auth.users(id) on delete cascade
);
alter table erp_provisao_privado.perfis_pendentes enable row level security;
revoke all on erp_provisao_privado.perfis_pendentes from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  tipo_erp text := new.raw_app_meta_data ->> 'erp_tipo';
  provisao_autorizada boolean := coalesce(
    new.raw_app_meta_data -> 'erp_provisionado' = 'true'::jsonb, false
  );
begin
  if not provisao_autorizada or tipo_erp is null or tipo_erp not in (
    'Administrador', 'Comercial', 'Projetos', 'Topografia', 'Marketing', 'Pós-protocolo'
  ) then
    tipo_erp := 'Projetos';
  end if;

  if tg_op = 'UPDATE' then
    if provisao_autorizada then
      delete from erp_provisao_privado.perfis_pendentes where usuario = new.id;
      if found then
        update public.profiles
        set tipo = tipo_erp, ativo = true,
            cpf = nullif(new.raw_user_meta_data ->> 'cpf', ''), updated_at = now()
        where id = new.id and not ativo;
      end if;
    end if;
    return new;
  end if;

  insert into public.profiles (id, nome, cpf, email, tipo, ativo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)),
    case when provisao_autorizada then nullif(new.raw_user_meta_data ->> 'cpf', '') end,
    new.email,
    tipo_erp,
    provisao_autorizada
  )
  on conflict (id) do nothing;

  if found then
    if not provisao_autorizada then
      insert into erp_provisao_privado.perfis_pendentes(usuario) values (new.id);
    end if;
  else
    update public.profiles set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_erp_provisioned
after update of raw_app_meta_data on auth.users
for each row
when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
execute function public.handle_new_user();

commit;
