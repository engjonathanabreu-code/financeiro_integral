-- PREPARADA, NÃO APLICADA. FIN-04 — leitura de anexos condicionada ao registro de negócio.
-- Aplicar somente com autorização explícita. Antes, rode a consulta de conferência do fim deste
-- arquivo (somente leitura) e compare com o que cada perfil vê hoje na interface.
--
-- Problema: a política financeiro_arquivos_ler liberava todos os originais para qualquer usuário
-- ativo do ERP (inclusive quem não usa o Financeiro), sem vínculo com viagem, orçamento ou documento.
-- Além disso, o catálogo de produção tem privilégios a mais (anon/authenticated com escrita na
-- tabela; EXECUTE para PUBLIC/anon em funções), divergentes da migration de 05/10/2026.
-- Solução: a leitura passa a exigir acesso ao registro que referencia o arquivo, com a mesma regra
-- da interface vigente (5d287a7):
--   * ADM: todos.
--   * Quem enviou o arquivo (criado_por): o próprio arquivo (cobre o intervalo entre envio e salvamento).
--   * docs: ADM e Financeiro (tela de Documentos Fiscais).
--   * tripExpenses/tripDocuments: viagem visível — atribuído (assigned) ou mesmo setor (profiles.tipo,
--     comparação sem diferenciar maiúsculas); Financeiro só por atribuição direta (patch-v26:19,
--     financeiro-finance-sector-access.js:14-15,23).
--   * budgetExpenses: orçamento visível — assignedDirect/assigned ou mesmo setor (bundle:535-540).
-- O id local de atribuição é hashId(profiles.id) (bundle:304), conferido em produção em 21/10/2026:
-- 15 de 15 usuários locais seguem essa regra e nenhuma atribuição aponta para usuário inexistente.
-- Nada é apagado nem movido: os originais continuam em financeiro_arquivos.

begin;
set local lock_timeout = '5s';

create or replace function financeiro_privado.id_local(p_id uuid)
returns bigint language plpgsql immutable set search_path = '' as $$
declare h bigint := 0; s text := p_id::text; i int;
begin
  for i in 1..length(s) loop h := (h * 31 + ascii(substr(s, i, 1))) % 4294967296; end loop;
  return case when h = 0 then 1 else h end;
end $$;

create or replace function public.financeiro_pode_ler_arquivo(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare eu uuid := auth.uid(); p record; meu text; financeiro boolean; alvo jsonb;
begin
  if eu is null or p_id is null then return false; end if;
  select pr.tipo, pr.setor, pr.ativo into p from public.profiles pr where pr.id = eu;
  if not found or p.ativo is not true then return false; end if;
  if p.tipo = 'Administrador' then return true; end if;
  if exists (select 1 from public.financeiro_arquivos a where a.id = p_id and a.criado_por = eu) then return true; end if;
  alvo := jsonb_build_object('id', p_id::text);
  meu := financeiro_privado.id_local(eu)::text;
  financeiro := p.tipo = 'Financeiro' or lower(trim(coalesce(p.setor, ''))) = 'financeiro';

  if financeiro and exists (
    select 1 from public.financeiro_estado_modulos m, jsonb_array_elements(m.dados) d
     where m.chave = 'docs' and jsonb_typeof(m.dados) = 'array' and jsonb_path_exists(d, '$.** ? (@ == $id)', alvo)) then
    return true;
  end if;

  if exists (
    select 1
      from public.financeiro_estado_modulos m, jsonb_array_elements(m.dados) x,
           public.financeiro_estado_modulos mt, jsonb_array_elements(mt.dados) t
     where m.chave in ('tripExpenses', 'tripDocuments') and jsonb_typeof(m.dados) = 'array'
       and mt.chave = 'trips' and jsonb_typeof(mt.dados) = 'array'
       and t->>'id' = x->>'tripId'
       and jsonb_path_exists(x, '$.** ? (@ == $id)', alvo)
       and (
         exists (select 1 from jsonb_array_elements_text(case when financeiro and jsonb_typeof(t->'assignedDirect') = 'array' then t->'assignedDirect'
                                                              when jsonb_typeof(t->'assigned') = 'array' then t->'assigned' else '[]' end) a where a = meu)
         or (not financeiro and coalesce(t->>'sector', '') <> '' and lower(t->>'sector') = lower(coalesce(p.tipo, '')))
       )) then
    return true;
  end if;

  if exists (
    select 1
      from public.financeiro_estado_modulos m, jsonb_array_elements(m.dados) x,
           public.financeiro_estado_modulos mb, jsonb_array_elements(mb.dados) b
     where m.chave = 'budgetExpenses' and jsonb_typeof(m.dados) = 'array'
       and mb.chave = 'budgetRecords' and jsonb_typeof(mb.dados) = 'array'
       and b->>'id' = x->>'budgetId'
       and jsonb_path_exists(x, '$.** ? (@ == $id)', alvo)
       and (
         exists (select 1 from jsonb_array_elements_text(case when financeiro then coalesce(b->'assignedDirect', b->'assigned', '[]')
                                                              else coalesce(b->'assigned', '[]') end) a where a = meu)
         or (not financeiro and coalesce(b->>'sector', '') <> ''
             and lower(trim(b->>'sector')) = lower(trim(coalesce(p.tipo, ''))))
       )) then
    return true;
  end if;
  return false;
end $$;
revoke all on function public.financeiro_pode_ler_arquivo(uuid) from public, anon;
grant execute on function public.financeiro_pode_ler_arquivo(uuid) to authenticated;
revoke all on function financeiro_privado.id_local(uuid) from public, anon, authenticated;

alter policy financeiro_arquivos_ler on public.financeiro_arquivos
  using (public.financeiro_pode_ler_arquivo(id));

-- Privilégios voltam ao que a migration de 05/10/2026 definiu (drift encontrado no catálogo).
revoke all on public.financeiro_arquivos from anon;
revoke insert, update, delete, truncate, references, trigger on public.financeiro_arquivos from authenticated;
grant select on public.financeiro_arquivos to authenticated;
revoke execute on function public.financeiro_guardar_arquivo(text, text) from public, anon;
revoke execute on function public.financeiro_modulo_permitido(text) from public, anon;
revoke execute on function public.financeiro_estado_modulos_protect_and_history() from public, anon, authenticated;

commit;

-- Conferência antes de aplicar (somente leitura; não mostra conteúdo): quantos arquivos cada
-- perfil ativo leria pela regra nova. Compare com o que a interface mostra a cada perfil.
--   select pr.tipo, count(*) filter (where <regra nova com pr.id no lugar de auth.uid()>) ...
-- Use a função depois de criada numa branch/cópia:
--   select pr.tipo, (select count(*) from public.financeiro_arquivos a
--     where set_config('request.jwt.claim.sub', pr.id::text, true) is not null
--       and public.financeiro_pode_ler_arquivo(a.id)) from public.profiles pr where pr.ativo;
-- Rollback (sem voltar a "qualquer usuário ativo" em produção sem decisão explícita):
--   o rollback técnico é recriar a política anterior (using is_active_user()); ver docs/DEPLOYMENT.md.
