-- PREPARADA, NÃO APLICADA. FIN-03 — permissões por registro e ação no banco.
-- Aplicar somente com autorização explícita, depois da Fase A (financeiro_modulos_revisao_20261021.sql).
--
-- Problema: a RLS de financeiro_estado_modulos decide só por módulo. Qualquer usuário ativo com
-- acesso a Viagens/Orçamentos/Documentos grava o array inteiro e consegue, por chamada direta,
-- aprovar viagem, mudar responsáveis, excluir despesas, alterar orçamentos e gastos de orçamento
-- fechado — ações que a interface reserva ao ADM.
-- Solução: reproduzir no banco SOMENTE as regras comprovadas no código vigente (5d287a7), para quem
-- não é ADM. Regras ambíguas (visibilidade por setor/atribuição, "Concluir" viagem, dono de despesa)
-- não são aplicadas aqui e estão listadas em docs/SECURITY.md para decisão.
--   trips          : não-ADM não exclui viagem (patch-v26:82-87), não aprova (patch-v26:25, v31:19)
--                    e não altera "assigned" de viagem existente (v31:18-20; ADM em v26:24, bundle:468).
--   tripExpenses   : não-ADM não exclui despesa (botão só ADM, patch-v26:82).
--   tripDocuments  : não-ADM não exclui documento (só em cascata da exclusão do ADM, patch-v26).
--   budgetRecords  : não-ADM não cria, altera nem exclui orçamento (bundle:547-560; patch-v8:24-28).
--   budgetExpenses : não-ADM não exclui gasto (bundle:593/597) nem cria/altera gasto de orçamento
--                    fechado (financeiro-lifecycle.js:19-24), exceto o vínculo fiscalDocId gravado
--                    automaticamente por patch-v6-sync (bundle:279-292).
--   docs           : quem não é ADM nem Financeiro só inclui documentos (patch-v6-sync); alterar ou
--                    excluir é da tela de Documentos (ADM e Financeiro).
-- Preserva: leitura e acesso por módulo (RLS atual), regras do Integração (não grava estes módulos),
-- service role/administração (auth.uid() nulo) e ADM. Efeito sobre dados existentes: nenhum.

begin;
set local lock_timeout = '5s';

create or replace function financeiro_privado.ids_removidos(antigo jsonb, novo jsonb)
returns setof text language sql immutable set search_path = '' as $$
  select a->>'id' from jsonb_array_elements(coalesce(antigo,'[]')) a
   where jsonb_typeof(a) = 'object' and coalesce(a->>'id','') <> ''
     and not exists (select 1 from jsonb_array_elements(coalesce(novo,'[]')) n where n->>'id' = a->>'id');
$$;

create or replace function financeiro_privado.guardar_registros()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  anterior jsonb; item jsonb; antes jsonb; fechados text[];
begin
  if new.chave not in ('trips','tripExpenses','tripDocuments','budgetRecords','budgetExpenses','docs') then return new; end if;
  if auth.uid() is null or public.is_admin() then return new; end if;
  if jsonb_typeof(new.dados) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Módulo deve ser uma lista.';
  end if;
  if tg_op = 'UPDATE' then anterior := old.dados;
  else select m.dados into anterior from public.financeiro_estado_modulos m where m.chave = new.chave; end if;
  anterior := coalesce(anterior, '[]'::jsonb);

  if new.chave = 'trips' then
    if exists (select financeiro_privado.ids_removidos(anterior, new.dados)) then
      raise exception using errcode = '42501', message = 'Somente ADM pode excluir viagens.';
    end if;
    for item in select value from jsonb_array_elements(new.dados) loop
      select value into antes from jsonb_array_elements(anterior) where value->>'id' = item->>'id';
      if item->>'status' = 'Aprovada' and (antes is null or antes->>'status' is distinct from 'Aprovada') then
        raise exception using errcode = '42501', message = 'Somente ADM pode aprovar viagens.';
      end if;
      if antes is not null and antes->'assigned' is distinct from item->'assigned' then
        raise exception using errcode = '42501', message = 'Somente ADM pode alterar os responsáveis da viagem.';
      end if;
    end loop;

  elsif new.chave in ('tripExpenses','tripDocuments') then
    if exists (select financeiro_privado.ids_removidos(anterior, new.dados)) then
      raise exception using errcode = '42501', message = 'Somente ADM pode excluir despesas e documentos de viagem.';
    end if;

  elsif new.chave = 'budgetRecords' then
    if new.dados is distinct from anterior then
      raise exception using errcode = '42501', message = 'Somente ADM pode criar, alterar ou excluir orçamentos.';
    end if;

  elsif new.chave = 'budgetExpenses' then
    if exists (select financeiro_privado.ids_removidos(anterior, new.dados)) then
      raise exception using errcode = '42501', message = 'Somente ADM pode excluir gastos de orçamento.';
    end if;
    select coalesce(array_agg(b->>'id'), '{}') into fechados
      from public.financeiro_estado_modulos m, jsonb_array_elements(m.dados) b
     where m.chave = 'budgetRecords' and b->>'status' = 'Fechado';
    for item in select value from jsonb_array_elements(new.dados) where value->>'budgetId' = any(fechados) loop
      select value into antes from jsonb_array_elements(anterior) where value->>'id' = item->>'id';
      if antes is null or (item - 'fiscalDocId') is distinct from (antes - 'fiscalDocId') then
        raise exception using errcode = '42501', message = 'Orçamento fechado: gastos não podem ser incluídos ou alterados.';
      end if;
    end loop;
    -- Um gasto também não pode ser movido para dentro de um orçamento fechado.
    for item in select value from jsonb_array_elements(anterior) loop
      select value into antes from jsonb_array_elements(new.dados) where value->>'id' = item->>'id';
      if antes is not null and item->>'budgetId' = any(fechados) and antes->>'budgetId' is distinct from item->>'budgetId' then
        raise exception using errcode = '42501', message = 'Orçamento fechado: gastos não podem ser incluídos ou alterados.';
      end if;
    end loop;

  elsif new.chave = 'docs' then
    -- financeiro_modulo_permitido('cashflow') = ADM ou setor Financeiro (regra vigente de Contas).
    if not public.financeiro_modulo_permitido('cashflow') then
      if exists (select 1 from jsonb_array_elements(anterior) a
                  where not exists (select 1 from jsonb_array_elements(new.dados) n where n = a)) then
        raise exception using errcode = '42501', message = 'Somente Financeiro ou ADM pode alterar ou excluir documentos fiscais.';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function financeiro_privado.guardar_registros() from public, anon, authenticated;
revoke all on function financeiro_privado.ids_removidos(jsonb, jsonb) from public, anon, authenticated;

-- "financeiro_b_": depois da conversão de anexos (financeiro_a_*), antes da revisão (financeiro_z_*).
drop trigger if exists financeiro_b_guarda_registros on public.financeiro_estado_modulos;
create trigger financeiro_b_guarda_registros before insert or update on public.financeiro_estado_modulos
  for each row execute function financeiro_privado.guardar_registros();

commit;

-- Rollback (não reabre nada além do que existia antes):
--   drop trigger if exists financeiro_b_guarda_registros on public.financeiro_estado_modulos;
