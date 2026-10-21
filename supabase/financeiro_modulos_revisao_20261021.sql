-- PREPARADA, NÃO APLICADA. Fase A (aditiva) — FIN-01 e FIN-02 da auditoria de 20/10/2026.
-- Aplicar somente com autorização explícita, depois de backup verificado (ver docs/DEPLOYMENT.md).
--
-- Problema: o navegador lia o módulo, mesclava e gravava com UPSERT. Dois salvamentos simultâneos
-- liam a mesma versão e o segundo apagava o primeiro, ambos com "sucesso".
-- Solução: cada módulo ganha uma revisão controlada pelo banco; a gravação nova só acontece se a
-- revisão esperada ainda for a atual (compare-and-swap atômico). Em conflito, o servidor devolve a
-- versão atual para o navegador reconciliar e tentar de novo. Um sinal leve por módulo avisa os
-- outros usuários (Realtime) sem transmitir o conteúdo financeiro.
--
-- Efeito sobre dados existentes: nenhum valor de "dados" é alterado. Coluna nova com default
-- constante (sem reescrita da tabela no PostgreSQL 11+). Clientes antigos continuam gravando como
-- antes; suas gravações também incrementam a revisão. A Fase B (arquivo *_bloqueio_*) impede, depois
-- da publicação do frontend novo, que clientes antigos sobrescrevam por fora da função versionada.
-- Integração: não lê nem grava financeiro_estado_modulos (verificado no repositório em 21/10/2026);
-- integracao_revisoes e suas funções não são tocadas.

begin;
set local lock_timeout = '5s';

-- 1) Revisão por módulo ---------------------------------------------------------------------
alter table public.financeiro_estado_modulos add column if not exists revisao bigint not null default 1;
comment on column public.financeiro_estado_modulos.revisao is
  'Revisão do módulo, incrementada pelo banco a cada mudança de dados. Usada no salvamento com versão esperada.';

create or replace function financeiro_privado.revisar_modulo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Autor registrado pelo banco: antes vinha do navegador e podia ser qualquer valor.
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  if tg_op = 'INSERT' then
    new.revisao := 1;
  elsif new.dados is distinct from old.dados or new.chave is distinct from old.chave then
    new.revisao := old.revisao + 1;
  else
    new.revisao := old.revisao;  -- o cliente nunca escolhe a revisão
  end if;
  return new;
end $$;
revoke all on function financeiro_privado.revisar_modulo() from public, anon, authenticated;

-- "financeiro_z_": roda depois de financeiro_a_antes_gravar (que troca anexos por arquivoId) e das
-- guardas de orçamento/solicitações, e antes do histórico (trg_*), pela ordem alfabética.
drop trigger if exists financeiro_z_revisao on public.financeiro_estado_modulos;
create trigger financeiro_z_revisao before insert or update on public.financeiro_estado_modulos
  for each row execute function financeiro_privado.revisar_modulo();

-- 2) Sinal leve para os outros usuários (sem conteúdo) ---------------------------------------
create table if not exists public.financeiro_modulos_sinal(
  chave text primary key,
  revisao bigint not null,
  atualizado_em timestamptz not null default now()
);
comment on table public.financeiro_modulos_sinal is
  'Revisão atual de cada módulo do Financeiro, publicada no Realtime. Não contém dados financeiros.';
alter table public.financeiro_modulos_sinal enable row level security;
revoke all on public.financeiro_modulos_sinal from public, anon, authenticated;
grant select on public.financeiro_modulos_sinal to authenticated;
drop policy if exists financeiro_modulos_sinal_ler on public.financeiro_modulos_sinal;
-- Mesmo alcance do módulo: quem não vê RH não recebe nem a revisão de RH.
create policy financeiro_modulos_sinal_ler on public.financeiro_modulos_sinal for select to authenticated
  using ((select public.financeiro_modulo_permitido(chave)));

insert into public.financeiro_modulos_sinal(chave, revisao, atualizado_em)
  select chave, revisao, updated_at from public.financeiro_estado_modulos
  on conflict (chave) do nothing;

create or replace function financeiro_privado.sinalizar_modulo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.financeiro_modulos_sinal where chave = old.chave;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.revisao = old.revisao and new.chave = old.chave then return null; end if;
  insert into public.financeiro_modulos_sinal(chave, revisao, atualizado_em)
    values (new.chave, new.revisao, clock_timestamp())
    on conflict (chave) do update set revisao = excluded.revisao, atualizado_em = excluded.atualizado_em;
  return null;
end $$;
revoke all on function financeiro_privado.sinalizar_modulo() from public, anon, authenticated;

drop trigger if exists financeiro_z_sinal on public.financeiro_estado_modulos;
create trigger financeiro_z_sinal after insert or update or delete on public.financeiro_estado_modulos
  for each row execute function financeiro_privado.sinalizar_modulo();

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'financeiro_modulos_sinal') then
    alter publication supabase_realtime add table public.financeiro_modulos_sinal;
  end if;
end $$;

-- 3) Salvamento com versão esperada ----------------------------------------------------------
-- SECURITY INVOKER: a RLS por módulo (financeiro_modulo_permitido) e todas as guardas continuam
-- valendo exatamente como no UPSERT direto. p_revisao nulo = criar módulo que ainda não existe.
create or replace function public.financeiro_salvar_modulo(p_chave text, p_dados jsonb, p_revisao bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r record; gravou boolean;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Entre novamente para salvar.'; end if;
  if coalesce(p_chave, '') = '' or p_dados is null then
    raise exception using errcode = '22023', message = 'Módulo ou conteúdo inválido.';
  end if;
  perform set_config('financeiro.gravacao_autorizada', p_chave, true);
  if p_revisao is null then
    insert into public.financeiro_estado_modulos(chave, dados, updated_by, updated_at)
      values (p_chave, p_dados, auth.uid(), now())
      on conflict (chave) do nothing
      returning revisao, dados into r;
  else
    update public.financeiro_estado_modulos
       set dados = p_dados, updated_by = auth.uid(), updated_at = now()
     where chave = p_chave and revisao = p_revisao
     returning revisao, dados into r;
  end if;
  gravou := found;
  perform set_config('financeiro.gravacao_autorizada', '', true);
  if gravou then
    return jsonb_build_object('status', 'salvo', 'revisao', r.revisao, 'dados', r.dados);
  end if;
  select m.revisao, m.dados into r from public.financeiro_estado_modulos m where m.chave = p_chave;
  if not found then
    raise exception using errcode = '42501', message = 'Módulo inexistente ou sem permissão de acesso.';
  end if;
  -- Outra pessoa salvou antes: nada foi gravado. O navegador mescla sobre esta versão e tenta de novo.
  return jsonb_build_object('status', 'conflito', 'revisao', r.revisao, 'dados', r.dados);
end $$;
revoke all on function public.financeiro_salvar_modulo(text, jsonb, bigint) from public, anon;
grant execute on function public.financeiro_salvar_modulo(text, jsonb, bigint) to authenticated;

-- 4) Funções de escrita já existentes passam a se identificar (prepara a Fase B) --------------
-- Corpo idêntico ao vigente em produção em 21/10/2026, acrescido apenas do set_config.
create or replace function public.financeiro_close_budget(p_id text, p_expected jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare items jsonb; b jsonb; result jsonb; closed jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception using errcode='42501',message='Somente ADM pode fechar orçamentos.'; end if;
 perform set_config('financeiro.gravacao_autorizada','budgetRecords',true);
 select dados into items from public.financeiro_estado_modulos where chave='budgetRecords' for update;
 select value into b from jsonb_array_elements(coalesce(items,'[]')) where value->>'id'=p_id;
 if b is null or b->>'status'='Fechado' or b->>'active'='false' then raise exception using errcode='22023',message='Orçamento inexistente ou já encerrado.'; end if;
 if b is distinct from p_expected then raise exception using errcode='40001',message='O orçamento mudou. Atualize a tela e confira antes de fechar.'; end if;
 closed:=b||jsonb_build_object('status','Fechado','closedAt',now(),'closedBy',auth.uid(),'history',coalesce(b->'history','[]')||jsonb_build_array(jsonb_build_object('at',now(),'action','Orçamento fechado','by',auth.uid())));
 select jsonb_agg(case when value->>'id'=p_id then closed else value end order by ord) into result from jsonb_array_elements(items) with ordinality as x(value,ord);
 update public.financeiro_estado_modulos set dados=result,updated_by=auth.uid(),updated_at=now() where chave='budgetRecords';
 perform set_config('financeiro.gravacao_autorizada','',true);
 return result;
end $$;

create or replace function public.financeiro_save_invoice_request(p_request jsonb, p_expected jsonb default null)
returns jsonb language plpgsql set search_path = '' as $$
declare
  current_requests jsonb;
  existing jsonb;
  result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Autenticação necessária.'; end if;
  perform set_config('financeiro.gravacao_autorizada','invoiceRequests',true);
  insert into public.financeiro_estado_modulos(chave,dados,updated_by)
    select 'invoiceRequests','[]'::jsonb,auth.uid() where not exists (select 1 from public.financeiro_estado_modulos where chave='invoiceRequests') on conflict (chave) do nothing;
  select dados into current_requests from public.financeiro_estado_modulos where chave='invoiceRequests' for update;
  select value into existing from jsonb_array_elements(current_requests) where value->>'id'=p_request->>'id';
  if p_expected is null then
    if existing is not null then raise exception 'Solicitação já existe.'; end if;
    result := current_requests || jsonb_build_array(p_request);
  else
    if not public.is_admin() then raise exception using errcode='42501',message='Somente ADM pode aprovar ou rejeitar.'; end if;
    if existing is distinct from p_expected then raise exception 'Solicitação atualizada por outro usuário. Reabra a solicitação.'; end if;
    select jsonb_agg(case when value->>'id'=p_request->>'id' then p_request else value end order by ord)
      into result from jsonb_array_elements(current_requests) with ordinality as a(value,ord);
  end if;
  update public.financeiro_estado_modulos set dados=result,updated_by=auth.uid(),updated_at=now() where chave='invoiceRequests';
  perform set_config('financeiro.gravacao_autorizada','',true);
  return result;
end;
$$;

commit;

-- Verificações posteriores (somente leitura):
--   select count(*) filter (where revisao is null) from public.financeiro_estado_modulos;          -- 0
--   select count(*) from public.financeiro_estado_modulos m left join public.financeiro_modulos_sinal s using (chave) where s.chave is null; -- 0
--   select tgname from pg_trigger where tgrelid='public.financeiro_estado_modulos'::regclass and not tgisinternal order by 1;
-- Recuperação (sem reabrir permissões): ver docs/DEPLOYMENT.md, seção "Rollback da Fase A".
