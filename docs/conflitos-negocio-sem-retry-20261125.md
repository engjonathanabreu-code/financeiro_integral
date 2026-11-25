# Conflitos de regra de negócio sem repetição automática — 25/11/2026

Repositório confirmado: `engjonathanabreu-code/financeiro_integral`. Branch `correcao/conflitos-negocio-sem-retry`, base `caf7fc4` (merge do PR #32). Lote preparado localmente; nada foi publicado nem aplicado em produção, e cada etapa depende de autorização específica.

## Causa

O PostgREST 14.5 repete indefinidamente qualquer transação que termine com SQLSTATE `40001`. O PR #32 ([aprovação com orçamento fechado](aprovacao-orcamento-fechado-20261124.md)) corrigiu a revisão de solicitações. Outras dez funções do Financeiro usam `errcode='40001'` em recusas determinísticas (versão desatualizada, prévia vencida, orçamento fechado): repetir a chamada nunca muda o resultado, então a requisição pode ficar presa no mesmo laço.

Na tela, `financeiro-cloud-storage.js` não tratava `40001` nem `PT409` como recusa definitiva. A recusa da guarda de fechamento em uma gravação de módulo caía em nova tentativa a cada 5 s, sem aviso.

## Alteração

1. **Telas** (commit próprio): `PT409` passa a ser tratado como o conflito de versão já reconhecido por `40001`, nos dois códigos ao mesmo tempo.
   - `financeiro-invoices.js`: edição de solicitação, lista de recusas definitivas e modal de ações. Na aprovação de viagem, `PT409` com `details` em JSON (`conferencia` e `pedidos`) continua significando viagem semelhante e tem prioridade; sem esses detalhes é conflito de versão.
   - `financeiro-boletos.js`: importação de retorno pede nova prévia.
   - `financeiro-cloud-storage.js`: os dois códigos entram em `permanentError`. O módulo recusado fica bloqueado com o aviso e a opção de descartar a alteração local; os demais módulos continuam sendo salvos.
2. **Migration** `20261125140644_financeiro_conflitos_negocio_sem_retry.sql` (o prefixo será trocado pela versão registrada ao aplicar): para cada função, confere a existência, o `md5(prosrc)` conhecido e o número de ocorrências do literal `'40001'`, e recria a função a partir de `pg_get_functiondef` trocando apenas esse literal por `'PT409'`. Mensagens, lógica, ACL, dono, `security definer`, `search_path` e dados não mudam. Uma função ausente ou divergente interrompe tudo.

| Função | `md5(prosrc)` antes | Ocorrências |
| --- | --- | --- |
| `public.financeiro_acao_solicitacao(text,integer,text,jsonb,uuid,jsonb)` | `bf7d1881b1f8aabb485b96393108189e` | 2 |
| `public.financeiro_ailos(text,jsonb)` | `c48823e089d2b35836d233647ed23e29` | 1 |
| `public.financeiro_arquivar_conta_pagamento(text,text,jsonb,jsonb)` | `cccd411611d089da1e2f49dbd3121dbc` | 2 |
| `public.financeiro_baixa_manual(uuid,bigint,text,text,text)` | `261bc8b68e36352b0cbed53173ffd42f` | 1 |
| `public.financeiro_baixa_relatorio(text,jsonb,text)` | `bc1c4a92614ee1304bfe2d27312d78ac` | 2 |
| `public.financeiro_close_budget(text,jsonb)` | `5e2f5013e97a939146412a490de706b9` | 1 |
| `public.financeiro_guard_budget_close()` (gatilho) | `a6cf3b1f8acbc8804b5073a3a6adcba4` | 1 |
| `public.financeiro_restore_modulo_version(text,bigint,bigint)` | `1b812f19103b31968587aa7306124bf9` | 2 |
| `public.financeiro_salvar_viagem(uuid,text,jsonb,jsonb)` | `43299c96d2d45aaf8430c814ca20253a` | 1 |
| `financeiro_solicitacoes_privado.financeiro_save_invoice_request(jsonb,jsonb)` | `ecb49987f05d318c8461b71a563250c0` | 1 |

As duas funções `financeiro_revisar_solicitacao` do PR #32 não são alteradas: os `40001` que restam nelas já são convertidos em `PT409` pela fase 1, e seus rollbacks conferem o hash atual.

## Ordem de publicação

Publicar a tela primeiro e aplicar a migration depois.

- **Tela nova com banco anterior**: nada muda. `40001` continua reconhecido; `PT409` só chega pela revisão, como hoje.
- **Tela nova com banco corrigido**: as recusas chegam como HTTP 409 com `code` `PT409` e a mesma mensagem, e a tela mostra o conflito.
- **Ordem inversa (banco corrigido com tela anterior)**: também funciona, sem risco para os dados e sem repetição no servidor, mas com aviso pior. A tela anterior mostra a mensagem do servidor sem o tratamento de conflito (a tentativa fica disponível para reenvio manual, que será recusado de novo) e a gravação de módulos repete o envio a cada 5 s, agora recebendo 409 imediato. Por isso a tela vai primeiro.

Antes de aplicar a migration: confirmar que o papel que aplica é dono, ou membro do dono, de cada função (`financeiro_close_budget` pertence a um papel dedicado); sem isso a instalação falha inteira, sem alterar nada. Conferir as conexões ativas antes e depois: uma requisição presa em repetição recebe `PT409` na tentativa seguinte e termina, como ocorreu na fase 1 do PR #32. Não reiniciar o projeto.

## Validação executada

- 269/269 testes Node aprovados (260 da base e 9 novos); `check-local.cjs`: 106 arquivos JavaScript, 89 assets e 207 leitores por SHA-256; `git diff --check` aprovado. Não há scripts de lint ou tipos.
- As dez definições geradas pelo SQL do repositório têm o `md5(prosrc)` da tabela acima.
- `conflitos-negocio-db.test.cjs` executa a migration e o rollback como estão, em PGlite. Em três ambientes com as dependências reais, as mesmas chamadas são recusadas com `40001` antes, `PT409` com mensagem idêntica depois e `40001` após a reversão; `prosrc` muda só no literal; ACL, dono, `security definer`, configuração, demais funções, gatilhos e o conteúdo de todas as tabelas ficam iguais; reaplicar e reverter duas vezes falham sem alterar nada; a guarda de fechamento continua recusando reabertura, perda de histórico e upsert parcial; as funções de revisão mantêm o hash e os rollbacks do PR #32 continuam aplicando. Um quarto teste confirma que função ausente ou divergente interrompe instalação e reversão sem alterar as demais.
- `conflitos-negocio-telas.test.cjs`, `invoice-conversion.test.cjs` e `sincronizacao-modulos.test.cjs` cobrem os dois códigos em cada ponto da tela e a distinção entre viagem semelhante e conflito de versão.

Limites: cada ambiente de teste tem só parte do esquema; as funções que faltam são criadas a partir do SQL do repositório com `check_function_bodies` desligado na sessão e servem apenas à conferência de hash e à substituição. `financeiro_salvar_viagem` não teve a recusa exercitada, porque depende de uma gravação concorrente; o mesmo vale para a segunda ocorrência de `financeiro_restore_modulo_version` e de `financeiro_baixa_relatorio`. Não houve ensaio com PostgREST nem com PostgreSQL nativo neste lote, e os roteiros Chromium (`tests/browser/`) não foram executados; `ailos-verificado.cjs` foi ajustado para usar um código em cada largura.

## Reversão

`supabase/rollback/financeiro_conflitos_negocio_sem_retry.sql` confere que cada função está exatamente na versão corrigida e devolve o literal `'40001'`, restaurando `prosrc` idêntico ao original; qualquer divergência interrompe tudo. Reverter reintroduz a repetição indefinida dessas recusas. A tela não precisa ser revertida: ela aceita os dois códigos. Não restaurar tabelas para reverter este lote.

## Aplicação em produção — 25/11/2026

A tela foi publicada primeiro (merge do PR #33) e a migration foi aplicada em seguida, com autorização específica. O arquivo foi renomeado para a versão registrada no Supabase (`20261125140644`); o SQL não mudou. Conferido no banco após a aplicação: as dez funções sem o literal `'40001'`, com a quantidade esperada de `'PT409'` e corpo igual ao original com o literal trocado; dono, ACL, `security definer` e `search_path` inalterados; guarda de fechamento ativa; orçamentos idênticos; as duas funções de revisão do PR #32 com os mesmos hashes.
