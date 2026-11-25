# Aprovação de orçamento com registros fechados — 24/11/2026

Repositório confirmado: `engjonathanabreu-code/financeiro_integral`. Branch `codex/corrigir-aprovacao-orcamento-fechado`, base publicada `97a53220e2f16a32995936c989bbc172d6c17c43`. Este lote depende de autorização específica para produção.

## Causa comprovada

A conversão de uma solicitação em orçamento usa `INSERT ... ON CONFLICT DO UPDATE` no módulo compartilhado. A guarda `financeiro_guard_budget_close` é executada antes de resolver o conflito: recebe apenas o novo orçamento e considera que os anteriores, já fechados, foram removidos. Ela levanta `40001` e reverte a transação. O PostgREST 14.5 repete esse erro indefinidamente. A atividade em produção mostrou transações de revisão reiniciando continuamente; o reparo continua pendente e sem orçamento vinculado.

O PR #31 limita a espera da interface e preserva a tentativa, mas não resolve essa causa. A fixture anterior não instalava a guarda de encerramento com um orçamento fechado. Os testes deste lote instalam a guarda real e fecham um orçamento pela RPC existente antes de tentar a conversão.

A reprodução HTTP usa PostgreSQL 17.11 e o binário oficial PostgREST 14.5, identidades fictícias, socket local e API em loopback. O pedido sintético de R$ 395 gera a repetição na base; após a fase 1 retorna HTTP 409 e continua pendente; após a fase 2 retorna HTTP 200 em aproximadamente 4 ms, preserva os orçamentos fechados e cria uma única conversão. Repetir a mesma decisão é idempotente. Nenhuma aprovação foi enviada ao pedido real.

A [orientação oficial do Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b) confirma o problema do código 40001 no PostgREST 14 e exige encerrar as conexões antigas em repetição; redefinir a função não encerra esses processos.

## Alteração

1. `20261125110649_financeiro_revisao_conflito_sem_retry.sql`: a RPC pública traduz `serialization_failure` em `PT409`, sem repetição automática da decisão. Mantém segurança, configuração e ACLs da função.
2. `20261125113632_financeiro_converter_orcamento_fechados.sql`: somente para `budgetRecords`, atualiza a linha já bloqueada com a lista completa, preservando a guarda de fechamento. Se o módulo ainda não existe, inicializa-o. Demais categorias conservam a escrita anterior. Nenhuma migration altera dados ao instalar.
3. A interface reconhece PT409 como conflito definitivo e preserva a resposta para revisão; o fluxo específico de viagens semelhantes permanece prioritário.

As migrations verificam o hash do corpo conhecido e a unicidade do trecho substituído. Uma versão divergente interrompe a instalação. Não há dependência nova nem alteração em pagamentos, anexos ou status de aprovação durante a instalação.

## Validação

- 260/260 testes Node aprovados, incluindo cinco regressões de banco com a guarda real; permissões, versão obsoleta, rejeição, inicialização, idempotência e reversão.
- Quatro cenários Chromium de recuperação aprovados; roteiro completo da Central aprovado em 1440/768/390 px. Ambos agora usam a guarda real e orçamento fechado.
- Ensaio nativo HTTP: repetição reproduzida na base; HTTP 409 na fase 1; HTTP 200 na fase 2; acessos de colaborador e anônimo recusados; registros fechados idênticos.
- `check-local.cjs`: 106 arquivos JavaScript válidos, 89 assets e 207 leitores por SHA-256; `git diff --check` aprovado. Não há scripts separados de lint ou tipos.

Para repetir o ensaio nativo, `tests/integration/solicitacoes-postgrest-fixture.cjs` exporta a fixture sintética; inicialize um PostgreSQL local vazio com essas instruções e PostgREST 14.5, roles autenticadas equivalentes e JWT de teste. `solicitacoes-postgrest.py` aceita apenas API HTTP loopback e socket local via `FINANCEIRO_TEST_DIR`, `FINANCEIRO_TEST_PORT` e `FINANCEIRO_TEST_API`. O roteiro é destrutivo somente para esse ambiente fictício e não integra o CI padrão. Requer psycopg e o segredo sintético presente no roteiro, nunca credenciais reais.

## Publicação segura e reversão

Antes de alterar produção: obter snapshot financeiro criptografado atualizado, restaurá-lo em banco local isolado e comparar contagens, SHA-256 e totais. Esse ensaio verifica dados e catálogo exportado; não representa restauração operacional completa de Auth, de todo o ERP ou dos arquivos físicos do Storage.

Snapshot de 24/11/2026 às 17:33:40 (Brasília) concluído e restaurado: **39 tabelas, 23.803 linhas**, SHA-256 e totais de parcelas iguais. O arquivo AES-256-GCM e o roteiro offline estão em `~/.codex/backups/financeiro-integral/2026-11-24-173340`, com chave em diretório separado. Nenhuma credencial de produção integra o kit de recuperação. Não foi feita cópia física nova dos anexos neste lote.

A sequência obrigatória é: instalar somente a fase 1; identificar novamente as conexões antigas da RPC por PID, início do backend, usuário e consulta; encerrar somente as tentativas em repetição confirmadas; conferir que o reparo continua pendente e sem conversão; instalar a fase 2; publicar a interface; verificar novamente os dados e a saúde da API. Não reiniciar o projeto inteiro. As tentativas antigas devem ser encerradas antes da fase 2 para impedir que uma requisição abandonada aprove o reparo ao encontrar a escrita corrigida. Não chamar a RPC de aprovação no pedido real.

O risco principal é uma tentativa antiga sobreviver e concluir depois da correção; por isso a ordem acima é obrigatória. A operação de encerramento interrompe apenas as conexões confirmadas e reverte suas transações. Qualquer divergência de dados, função ou identidade interrompe a publicação.

Rollback preferencial: `supabase/rollback/financeiro_converter_orcamento_fechados.sql`, conservando a proteção PT409 da fase 1 e todos os dados, além de retornar a interface ao deployment `dpl_3sqCXTWi2feXzf9e82eGPVdVQjiE`. A reversão opcional da fase 1 pode reintroduzir repetição e só deve ocorrer após limpar as tentativas antigas. Não restaurar tabelas para reverter este lote. A regra de revisão continua obrigatória; exceções anteriores eram exclusivas dos PRs #30 e #31.

## Aplicação em produção — 25/11/2026

As duas migrations foram aplicadas com autorização específica para cada uma e os arquivos foram renomeados para as versões registradas no Supabase: `20261125110649` (fase 1) e `20261125113632` (fase 2). O conteúdo SQL não mudou.

- Fase 1, 11:06:49 UTC: as três tentativas antigas em repetição receberam `PT409` uma vez cada e terminaram sozinhas; não foi necessário encerrar conexões. O contador de transações desfeitas ficou parado nos 39 segundos seguintes.
- Antes da fase 2: nenhuma tentativa ativa, pedido pendente e sem conversão, orçamentos idênticos.
- Fase 2, 11:36:32 UTC: os hashes dos corpos das duas funções em produção são iguais aos gerados por estas migrations na fixture de teste; ACL, dono, `security definer` e `search_path` inalterados; a guarda de fechamento não foi alterada; orçamentos idênticos (8 registros, 4 fechados). Nenhuma aprovação foi enviada ao pedido real.

Pendente: publicar a interface (merge deste PR) e a aprovação do pedido pelo usuário. As demais funções que ainda levantam `40001` em recusas de negócio, inclusive a guarda de fechamento em gravações diretas do módulo, serão tratadas em lote separado.
