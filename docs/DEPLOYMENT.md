# Publicação, recuperação e rollback — Financeiro Integral

Nada deste documento foi executado em produção. Cada passo marcado 🔒 exige autorização explícita
para aquela ação.

## Como o código chega à produção (conferido em 21/10/2026)

- Vercel, projeto `financeiro-integral`, integração Git: **push/merge em `main` publica em
  produção** (`financeiro-integral.vercel.app`). Outras branches geram *preview* (protegido por SSO
  da Vercel) — o preview usa o **mesmo Supabase de produção**: não use preview para editar dados.
- Não há CI antes deste lote. `.github/workflows/ci.yml` (testes em PR e na `main`) só verifica.
- Proteção de branch proposta (🔒 configurar no GitHub): `main` exige PR, 1 aprovação e a
  verificação obrigatória `testes`; bloquear push direto e force-push.

## Backup e restauração (pré-requisito de qualquer lote de banco) 🔒

O histórico `financeiro_estado_modulos_history` **não é backup** (mesmo banco, sem política de retenção).

1. Confirmar no painel do Supabase o backup diário/PITR do projeto e a data do último ponto.
2. Exportar, antes de cada lote, as tabelas afetadas para armazenamento seguro fora do projeto:
   `pg_dump --data-only -t public.financeiro_estado_modulos -t public.financeiro_arquivos -t public.financeiro_whatsapp_envios -t public.financeiro_contas -t public.financeiro_pagamentos`
   (contém dados pessoais e financeiros: guardar com acesso restrito; nunca em repositório, chat ou log).
3. **Testar a restauração** no projeto `erp_backup` (ou branch do Supabase) e conferir contagens e
   `md5(dados::text)` por chave contra a origem.
4. Registrar a hora do backup; o rollback de dados usa esse ponto.

## Ordem de implantação proposta

| # | Passo | Depende de | Risco | Rollback |
|---|---|---|---|---|
| 1 | Revisar e aprovar o PR (CI verde) | — | — | — |
| 2 🔒 | Backup + restauração testada | — | — | — |
| 3 🔒 | Aplicar **Fase A** `financeiro_modulos_revisao_20261021.sql` | 2 | baixo (aditiva; clientes antigos seguem) | ver DATABASE.md §1 |
| 4 | Conferir por leitura: consultas do fim da Fase A (revisões, sinais, gatilhos) | 3 | — | — |
| 5 🔒 | Merge do PR em `main` (publica o frontend) | 3 | médio (persistência nova) | *Instant Rollback* da Vercel para o deploy anterior (`dpl_Aouv3LKZtVkvTc6YiSBpXtjLiZwv`); o cliente antigo funciona com a Fase A |
| 6 | Monitorar 24–48 h (abaixo) | 5 | — | — |
| 7 🔒 | Aplicar **Fase B** (bloqueio de abas antigas), fora do horário de pico | 5, 6 | baixo; abas antigas veem "Versão desatualizada" | `drop trigger financeiro_0_exigir_versao` |
| 8 🔒 | Aplicar FIN-03 `financeiro_guarda_registros_20261021.sql` | 3 | médio: fluxo legítimo não previsto pode ser recusado (aparece como "não foi salva", com rascunho preservado) | `drop trigger financeiro_b_guarda_registros` |
| 9 🔒 | Aplicar FIN-04 `financeiro_anexos_acesso_20261021.sql` após rodar a conferência por perfil | 3 | médio: perfil deixa de abrir anexo que via | política anterior (decisão explícita) |
| 10 🔒 | WhatsApp, **antes de 15/11/2026**: (a) rotacionar token do CRM com o serviço receptor; (b) criar `finance_cron_secret` no Vault e os segredos da função (`FINANCE_AGENT_TOKEN`, `FINANCE_CRON_SECRET`, `FINANCE_REMINDER_PHONE`); (c) aplicar `financeiro_whatsapp_reserva_20261021.sql`; (d) publicar a Edge Function; (e) aplicar `financeiro_whatsapp_agendador_20261021.sql` — (d) e (e) fora de 09:00–09:20 | — | médio | republicar a versão anterior da função **sem** o token antigo (já rotacionado) |
| 11 🔒 | Proteção da branch `main` e verificação obrigatória | 1 | baixo | desfazer no GitHub |
| 12 🔒 | Auth: proteção contra senha vazada (afeta ERP e Integração) | comunicação | baixo | desligar no painel |

Clientes antigos: o HTML é servido sem cache, então quem recarrega recebe a versão nova. Abas
abertas antes do passo 5 continuam com o código antigo até recarregar; o passo 7 impede que
sobrescrevam dados. O aviso antigo pede para "atualizar a página"; ao recarregar, a versão nova não
recupera edições não salvas da aba antiga — faça o passo 7 em horário de pouco uso e avise a equipe.

## Monitoramento (após 5, 7, 8, 9, 10)

- Supabase → Logs (Postgres): erros `42501` com "Versão desatualizada", "Somente ADM…",
  "Orçamento fechado…"; `FINANCEIRO_PROTECAO`.
- Revisões: `select chave, revisao, atualizado_em from public.financeiro_modulos_sinal order by atualizado_em desc;`
- Volume de conflitos: não sai do navegador (ficam em `localStorage` por usuário) — pedir à equipe que
  reporte o aviso "Conflito".
- Vercel → Runtime errors das rotas `/api/ai-*` (códigos `OPENAI_TIMEOUT`, `OPENAI_INCOMPLETE`).
- WhatsApp: `select status, count(*) from public.financeiro_whatsapp_envios group by 1;` — qualquer
  `incerto` deve ser conferido no CRM antes de reenviar manualmente.

## Rollback não reabre vulnerabilidades

Nenhum rollback deste documento recria políticas abertas a qualquer usuário nem devolve credenciais ao código.
Para voltar dados de um módulo, use o backup do passo 2 (ou `financeiro_restore_modulo_version`,
somente ADM, para uma versão específica), sempre conferindo antes com o responsável.
