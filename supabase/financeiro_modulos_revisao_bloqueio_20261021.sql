-- PREPARADA, NÃO APLICADA. Fase B — FIN-01 (transição de clientes antigos).
-- Pré-condições: Fase A aplicada (financeiro_modulos_revisao_20261021.sql) E frontend com
-- financeiro_salvar_modulo publicado em produção. Aplicar somente com autorização explícita.
--
-- Problema: depois da Fase A, uma aba antiga (aberta antes da publicação) ainda grava o módulo
-- inteiro com UPSERT direto e pode desfazer o que outra pessoa salvou.
-- Solução: usuários comuns (papéis authenticated/anon) só gravam módulos por funções que se
-- identificam com financeiro.gravacao_autorizada: financeiro_salvar_modulo (revisão esperada),
-- financeiro_close_budget e financeiro_save_invoice_request. A aba antiga recebe erro 42501, que o
-- código antigo já trata como permanente (mostra aviso e não repete).
-- Não afeta: service_role/postgres (Edge Functions, SQL administrativo), funções SECURITY DEFINER
-- (financeiro_restore_modulo_version), leitura, RLS e guardas existentes. Integração não grava aqui.
-- Efeito sobre dados existentes: nenhum.

begin;
set local lock_timeout = '5s';

create or replace function financeiro_privado.exigir_gravacao_versionada()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- SECURITY INVOKER de propósito: dentro de funções SECURITY DEFINER (restauração de versão pelo
  -- ADM) current_user é o dono da função e a gravação continua permitida.
  if current_user in ('authenticated', 'anon')
     and coalesce(current_setting('financeiro.gravacao_autorizada', true), '') is distinct from new.chave then
    raise exception using errcode = '42501',
      message = 'Versão desatualizada do Financeiro. Recarregue a página para salvar com segurança.';
  end if;
  return new;
end $$;
revoke all on function financeiro_privado.exigir_gravacao_versionada() from public, anon, authenticated;

-- "financeiro_0_": primeira trigger BEFORE, recusa antes de qualquer transformação.
drop trigger if exists financeiro_0_exigir_versao on public.financeiro_estado_modulos;
create trigger financeiro_0_exigir_versao before insert or update on public.financeiro_estado_modulos
  for each row execute function financeiro_privado.exigir_gravacao_versionada();

commit;

-- Rollback da Fase B (reabre apenas o caminho antigo de gravação; não mexe em RLS):
--   drop trigger if exists financeiro_0_exigir_versao on public.financeiro_estado_modulos;
