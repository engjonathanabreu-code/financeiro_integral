# Arquitetura — Financeiro Integral

Estado conferido em 21/10/2026 sobre o commit de produção `5d287a7` e a branch `claude/dreamy-hypatia-wni1mg`.
O README descreve o protótipo inicial; este documento descreve o sistema atual.

## Camadas

| Camada | Onde | Observações |
|---|---|---|
| Interface | `public/` (HTML + scripts clássicos, sem framework) | `index.html` carrega ~70 scripts em ordem fixa; vence o último que sobrescreve uma função global. |
| Rotas serverless | `api/*.js` (Vercel) | IA (OpenAI) e Agente Financeiro. Autenticação por `lib/auth.js` (sessão do Supabase do ERP). |
| Código compartilhado | `lib/` | `auth.js`, `ai-file.js`, `financial-consultant.js`, `openai-responses.js` (FIN-12). |
| Banco | Supabase "ERP INTEGRAL Interno" (compartilhado com o Integração) | SQL versionado em `supabase/*.sql`; veja `docs/DATABASE.md`. |
| Automação | `supabase/functions/finance-whatsapp-reminders` | Edge Function chamada por pg_cron/pg_net. |
| Servidor local | `server.js` | Só desenvolvimento; reproduz parte das rotas (inclui uma cópia antiga de `ai-classify`). Em produção valem os arquivos de `api/`. |

## Persistência dos módulos (FIN-01, FIN-02, FIN-14, FIN-16)

Os dados de viagens, orçamentos, documentos, contas, fluxo de caixa, RH etc. ficam em
`public.financeiro_estado_modulos` (uma linha por módulo, `dados jsonb`). O navegador mantém o
objeto global `db` e o arquivo `public/financeiro-cloud-storage.js` sincroniza com o servidor.

```
 tela altera db ──save()──▶ cloudSave ──▶ pushChanged
                                            │  para cada módulo alterado:
                                            │  financeiro_salvar_modulo(chave, dados, revisão esperada)
                                            │    ├─ "salvo": revisão nova; snapshot = versão gravada
                                            │    └─ "conflito": servidor devolve a versão atual →
                                            │        mescla em três vias (base × local × servidor) → tenta de novo
 Realtime (financeiro_modulos_sinal) ┐      │
 foco / reconexão / a cada 30 s ─────┴─▶ refresh: compara revisões, busca só os módulos novos,
                                          mescla com edições locais pendentes, renderiza
                                          (adiado enquanto houver modal aberto ou campo em edição)
```

Regras:
- `snapshot[k]` é sempre a última versão **confirmada pelo servidor**; `db[k]` = servidor + edições locais pendentes.
- Mesmo campo alterado nos dois lados: fica o valor salvo no servidor; o local vai para a lista de
  conflitos (`integral_fin_conflitos_v2:<uid>`), o indicador mostra "Conflito" e a pessoa escolhe
  "Reaplicar minha versão" ou "Manter a do servidor". Exclusão × edição mantém o registro e avisa.
- Nenhuma operação é considerada salva sem resposta explícita `salvo` do servidor.
- Rascunhos não confirmados: `integral_fin_pendente_v2:<uid>` com a base em que foram feitos;
  reaplicados pela mesma mescla depois de recarregar, reconectar ou entrar de novo.
- Cache por identidade: `integral_fin_v1` passa a ter dono (`integral_fin_v1_dono`); cache de outra
  pessoa nunca entra na mescla nem cria módulos; logout/troca de usuário limpa memória e cache.
- Sem a migration de revisão aplicada, o cliente detecta (`42703`/`PGRST202`) e usa o caminho antigo.
- Orçamento: o fechamento continua pela RPC `financeiro_close_budget`, serializado com os salvamentos.
- Solicitações (`invoiceRequests`) continuam pela RPC `financeiro_save_invoice_request`.

## Ordem de carregamento e sobrescritas (FIN-17)

`financeiro.bundle.js` contém `app.js` e `patch-v2`…`patch-v10` ativos até o marcador
`/* INTEGRAL: FRONTEIRA EXPLICITA DO LEGADO INATIVO */`; o restante original está em
`legacy/financeiro-bundle-inativo.js.txt` (não carregado; integridade conferida por teste).

Carregados à parte, nesta ordem (resumo de `public/index.html`): bibliotecas de CDN → leitores
seguros → upload de arquivos → configuração → projetos ERP/solicitações → **bundle** → mês atual,
bloqueio do RH legado, **persistência**, `patch-v33`, sincronização ERP, planejamento, `patch-v24/25/20/29/30`,
painel, documentos de viagem, `patch-v26/31/27/28`, revisão fiscal, fluxo de caixa, `patch-v32` →
**paginação** → Recebimentos (10 arquivos) → Ailos/boletos → DRE → roteador canônico, sessão,
acessos por setor, edição atribuída, navegação, realtime de Recebimentos, incrementos, ciclo de
vida de orçamento, Consultor, inadimplência, plano de parcelas (módulo ES).

Sobrescritas ativas (o último vence):
- `save`: bundle → `financeiro-cloud-storage.js` → `patch-v33` (envio imediato) → `financeiro-incrementos.js`.
- `render`: bundle → projetos ERP / solicitações (instalados por `setTimeout`) → `financeiro-canonical-router.js` → `financeiro-consultor.js`.
- `trips`: `patch-v26` → `financeiro-finance-sector-access.js`. `budgets`: `financeiro-finance-sector-access.js` → `financeiro-lifecycle.js`.
- `hr`: `financeiro-disable-legacy-rh.js` (ponte) → `patch-v20.js`.
- `#importClients`: a implementação ativa é `financeiro-recebimentos-prefixos.js` (captura no documento).

Arquivos presentes mas não carregados: `patch-v11`–`v14`, `v16`–`v19`, `v21`, `v21-expense`,
`v22-planning`, `app.js`, `financeiro-stability.js`, `financeiro-targeted-ui.js`,
`financeiro-dashboard-final-fix.js`, `financeiro-rh-route-guard.js`,
`financeiro-recebimentos-import-fix.js`, `editor-plano-parcelas.mjs`, `plano-parcelas.mjs`.
Não foram removidos: a remoção depende de confirmação de que nenhum fluxo os referencia fora do
`index.html` e deve ser feita em lote próprio, com teste de caracterização (FIN-17).

## Recebimentos (FIN-10)

`financeiro-recebimentos.js` lê municípios, clientes (≈11,5 mil) e parcelas (≈7,7 mil) inteiros,
paginados, e filtra no navegador. Futuro, Arquivados e DRE passaram a usar
`window.IntegralPaging.all` (ordem por `id`, termina só em página vazia). A carga completa a cada
renderização continua: reduzi-la exige agregação no servidor (RPC por período/município) com
conferência dos totais, o que fica como próximo lote (ver `docs/SECURITY.md`/`CHANGELOG.md`).

## Integração

O Integração não lê nem grava `financeiro_estado_modulos`, `financeiro_arquivos` nem
`financeiro_whatsapp_envios` (verificado por busca no repositório `integracao`). Objetos
compartilhados: `profiles`, Auth, `fin_receb_*`, `integracao_revisoes` e as funções
`integracao_financeiro_*`. Nenhum deles é alterado por este lote.
