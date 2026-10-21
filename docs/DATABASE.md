# Banco de dados — Financeiro Integral

Supabase "ERP INTEGRAL Interno" (`ycdsyilyvaxslkwbkxyo`), PostgreSQL 17, **compartilhado com o
Integração**. Estado de produção conferido somente por leitura de catálogo e contagens em 21/10/2026.

## Objetos do Financeiro

| Objeto | Função | Observações |
|---|---|---|
| `financeiro_estado_modulos(chave, dados, updated_by, updated_at[, revisao])` | Um JSON por módulo | RLS por módulo: `financeiro_modulo_permitido(chave)` (3 políticas permissivas redundantes) + `financeiro_modulos_excluir_somente_adm` **restritiva** (DELETE só ADM, conferido). |
| `financeiro_estado_modulos_history` | Versão anterior a cada UPDATE/DELETE | ≈185 MB / 269 linhas (inclui base64 antigo). RLS sem política (só backend). **Não substitui backup.** |
| `financeiro_arquivos` | Originais dos anexos (data URL) | 21 arquivos, todos referenciados. Leitura hoje: qualquer usuário ativo. |
| `financeiro_whatsapp_envios` | Registro dos lembretes | `UNIQUE(pagamento_id, destinatario)`; FK para `financeiro_pagamentos` ainda existe em produção. |
| `financeiro_contas`, `financeiro_pagamentos` | Tabelas relacionais de contas | Políticas `can_access_fin_recebimentos()`. |
| Gatilhos BEFORE em `financeiro_estado_modulos` (ordem alfabética) | `financeiro_a_antes_gravar` (anexos → arquivoId), `financeiro_guard_budget_close`, `financeiro_guard_invoice_requests`, `trg_..._protect_and_history` | Os lotes novos acrescentam `financeiro_0_exigir_versao`, `financeiro_b_guarda_registros`, `financeiro_z_revisao` e o AFTER `financeiro_z_sinal`. |

Compartilhados com o Integração (não alterados): `profiles`, Auth, `fin_receb_clientes/municipios/parcelas/remessas/importacoes`,
`integracao_revisoes`, `integracao_financeiro_*` (RPCs e lembretes de recebimentos).

## Migrations preparadas neste lote (NENHUMA aplicada)

Todas usam `begin … commit`, `lock_timeout = 5s` e são idempotentes. Testadas em PGlite e, a Fase A,
também em PostgreSQL 16 real com sessões simultâneas.

### 1. `financeiro_modulos_revisao_20261021.sql` — Fase A (FIN-01/02)
- **Problema:** dois salvamentos simultâneos retornavam sucesso e um sobrescrevia o outro.
- **Objetos:** coluna `revisao`; gatilhos `financeiro_z_revisao`, `financeiro_z_sinal`; tabela `financeiro_modulos_sinal` (+ publicação Realtime); RPC `financeiro_salvar_modulo`; redefinição de `financeiro_close_budget` e `financeiro_save_invoice_request` (corpo idêntico ao de produção + `set_config` de identificação).
- **Integração:** nenhuma dependência.
- **Pré-condições:** backup verificado; `financeiro_privado` existente (migration de 05/10).
- **Efeito nos dados:** nenhum valor de `dados` muda; `revisao = 1` em todas as linhas; `updated_by` passa a ser definido pelo banco.
- **Bloqueio/duração:** `ADD COLUMN` com default constante é só metadado (ACCESS EXCLUSIVE breve); 37 linhas. `ALTER PUBLICATION` breve.
- **Clientes antigos:** continuam funcionando (UPSERT direto); suas gravações também sobem a revisão, então clientes novos as detectam. **Ainda podem sobrescrever** — fechado pela Fase B.
- **Verificação:** consultas no fim do arquivo (revisões não nulas; sinal para todas as chaves; lista de gatilhos).
- **Recuperação:** `drop trigger financeiro_z_sinal, financeiro_z_revisao`; `alter publication supabase_realtime drop table financeiro_modulos_sinal`; manter a coluna (aditiva). As funções de fechamento/solicitação podem ficar (o `set_config` é inofensivo).

### 2. `financeiro_modulos_revisao_bloqueio_20261021.sql` — Fase B (FIN-01)
- **Problema:** abas abertas antes da publicação ainda gravam o módulo inteiro.
- **Objetos:** gatilho `financeiro_0_exigir_versao` (INVOKER): papéis `authenticated/anon` só gravam via funções que se identificam.
- **Pré-condições:** Fase A aplicada e frontend novo publicado.
- **Efeito:** aba antiga recebe 42501 "Versão desatualizada…" (o código antigo trata como erro permanente e não repete); service role, SQL administrativo e restauração do ADM seguem.
- **Recuperação:** `drop trigger financeiro_0_exigir_versao`.

### 3. `financeiro_guarda_registros_20261021.sql` (FIN-03)
- Regras por registro/ação para quem não é ADM, somente as comprovadas no código (lista no cabeçalho do arquivo e em `docs/SECURITY.md`).
- **Pré-condições:** Fase A. **Efeito:** nenhum dado alterado. **Recuperação:** `drop trigger financeiro_b_guarda_registros`.

### 4. `financeiro_anexos_acesso_20261021.sql` (FIN-04)
- Leitura de anexo condicionada ao registro que o referencia; corrige privilégios divergentes (drift) do catálogo.
- **Impacto medido (leitura em produção):** hoje os 16 perfis ativos não-ADM leem os 21 originais; pela regra nova: Comercial ≈10, Financeiro 7, Projetos/Topografia 2, demais 0; ADM 21.
- **Recuperação:** `alter policy financeiro_arquivos_ler … using ((select public.is_active_user()))` (reabre o comportamento anterior; só com decisão explícita).

### 5. `financeiro_whatsapp_reserva_20261021.sql` (FIN-06/07)
- Remove a FK que quebraria o registro em 15/11/2026; colunas `tentativa`, `atualizado_em`; `CHECK` de status; funções `financeiro_whatsapp_reservar/finalizar/marcar_incertos` (service role); revoga escrita de `authenticated`.
- **Pré-condições:** existentes só `status='enviado'` (5 linhas, conferido). **Recuperação:** a FK não deve voltar (era o defeito); funções podem ser removidas junto com o rollback da Edge Function.

### 6. `financeiro_whatsapp_agendador_20261021.sql` (FIN-06)
- Agendamento passa a enviar `x-cron-secret` lido do Vault e `timeout_milliseconds`.
- **Pré-condições:** segredo `finance_cron_secret` no Vault e `FINANCE_CRON_SECRET` na função (mesmo valor, fora do repositório).

## Índices e avisos (FIN-18)

Avisos conferidos pelos advisors em 21/10/2026: FKs sem índice (`fin_receb_parcelas.importacao_id`,
`fin_receb_remessas.municipio_id`, `financeiro_contas.criado_por`, `financeiro_estado_modulos.updated_by`…),
índices não usados (`fin_receb_clientes_cpf_idx`, `fin_receb_parcelas_nosso_numero_idx`…), políticas
permissivas redundantes. **Nenhum índice foi criado nem removido**: as tabelas do Financeiro são
pequenas (37 módulos; 7,7 mil parcelas) e a decisão exige `EXPLAIN (ANALYZE, BUFFERS)` das
consultas reais da tela de Recebimentos, a fazer numa cópia (projeto `erp_backup` ou branch).

## Consultas de conferência (somente leitura)

FIN-15 — parcelas pagas com valor zero (contagem, sem dados pessoais):

```sql
select count(*) filter (where status = 'Pago' and coalesce(valor_liquidado, 0) = 0 and ativo) as pago_zero_ativas,
       count(*) filter (where status = 'Pendente' and coalesce(valor_previsto, 0) = 0 and ativo) as pendente_previsto_zero
  from public.fin_receb_parcelas;
```

Resultado em 21/10/2026: 1 parcela ativa "Pago" com liquidado e previsto 0 (baixa manual, sem
importação/documento/nosso número); 46 pendentes ativas com previsto 0. Não há campo de motivo da
baixa — isenção, baixa administrativa e erro são indistinguíveis. Nenhum registro foi alterado.
