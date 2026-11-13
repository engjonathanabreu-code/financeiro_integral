# Retirada por solicitante canônico — investigação em 13/11/2026

Este relatório registra o encerramento da etapa local inicial, anterior à autorização de publicação. A publicação posterior deve ser conferida pelo PR, commit, registro de migração e deploy correspondentes.

Repositório: `engjonathanabreu-code/financeiro_integral`; base `0c2a7ee66824d24e34806990781ff81c07f43d1e`; branch local `fix/viagens-validar-conversao`. Sem commit, push, PR, merge, deploy ou aplicação de migração remota. Consultados `AGENTS.md`, documentação de veículos/agendamento e auditoria de acessos. Não há `.agents/skills` neste checkout.

## Causa comprovada

As imagens fornecidas foram materializadas no workspace, verificadas como legíveis e inspecionadas visualmente. A captura mostra dois impedimentos distintos. A imagem do painel do veículo não foi usada para preencher ou registrar quilometragem.

Consultas somente leitura ao backend confirmaram duas solicitações próprias, aprovadas e vinculadas reciprocamente a viagens, para o mesmo dia e veículo. Uma possui orçamento zero e outra possui orçamento de R$ 10. Não foi concluído que são duplicatas; nenhuma foi removida, mesclada ou modificada.

Na viagem de valor positivo, o UUID do solicitante é consistente, mas `requesterLocalUserId` é nulo, `assigned` está vazio e não existe correspondência do solicitante em `usersMvp`. O perfil atual é Comercial e o setor histórico da viagem é Projetos. `employee` e `requesterName` são rótulos, não atribuição. A função de acesso legada só permite administrador, atribuição via `usersMvp` ou setor compatível. Por isso o banco retorna o impedimento de acesso. O outro pedido para antes, na validação de orçamento positivo.

A conversão anterior confiava no ID local informado no pedido ou fazia fallback por nome; sem correspondência, aprovava e gerava `assigned: []`. A tela também permitia aprovação com valor zero, embora a retirada exigisse valor positivo. Não é possível determinar somente pelo snapshot quando ou por que o setor do perfil divergiu; isso permanece uma hipótese histórica, não foi corrigido por suposição.

## Correção proposta

A migração local substitui somente `financeiro_veiculos_privado.impedimento`. Para retirada, usa a identidade canônica da própria solicitação: perfil ativo, UUID do perfil igual a `auth.uid()` e ao `requesterId`. Essa verificação ocorre após aprovação/revisão, orçamento positivo, data de hoje, veículo cadastrado e vínculo recíproco entre solicitação e viagem. A API continua carregando esses objetos do banco e obtendo o perfil autenticado no servidor.

Isso permite a retirada própria de uma aprovação válida mesmo sem o espelho em `usersMvp`. Não autoriza outro usuário pela equipe, nome, cargo ou setor. Permanecem os controles de veículo selecionado, disponibilidade, cronologia, quilometragem, foto, unicidade de uso e identidade do motorista. A função legada `acesso`, políticas, ACL e permissões dos demais módulos permanecem iguais. A migração e o rollback têm verificação do hash do corpo esperado; uma versão posterior desconhecida não deve ser sobrescrita.

No frontend, novas conversões de viagem exigem orçamento finito positivo e vínculo ativo e único por UUID em `usersMvp`. Nome e `requesterLocalUserId` não são usados para escolher a atribuição. Um cadastro sem vínculo deve ser conferido pelo administrador antes de aprovar uma nova viagem, evitando criar outra viagem sem atribuição na interface geral. A conversão fica dentro do tratamento de erro existente: falha de RPC desfaz a alteração local. Compras, orçamentos e rejeição mantêm o fluxo anterior.

## Evidências de validação

- Antes da mudança: `npm test` executou 104 testes, com 103 aprovados e uma falha no checksum legado.
- Depois: `npm test` executou 111 testes, com 110 aprovados e a mesma falha preexistente em `tests/legacy-boundary.test.cjs`. SHA calculado começa em `b880f123`; o teste espera `2c8a56cc`. Os arquivos desse teste não foram alterados.
- Sete regressões novas passaram: cinco de conversão/tela em VM e duas com funções SQL reais no PGlite. Cobrem falta de vínculo, homônimo, hint de ID adulterado, usuário inativo, identidade ambígua, zero/negativo/não finito, aprovação válida, rejeição e rollback após erro de RPC; reproduzem os dois bloqueios originais e permitem apenas a solicitação canônica de valor positivo após a migração.
- SQL sintético também verifica outro solicitante, anônimo, perfil inativo, aprovação/revisão inválida, vínculo adulterado, data futura, veículo errado, duplicidade de uso, preservação do JSON compartilhado, políticas, ACL, demais funções, proteção contra reaplicar a migração e rollback preservando uso existente.
- `npm run check`: 100 arquivos JavaScript com sintaxe válida e 84 assets locais conferidos. `git diff --check` passou. Não há lint/typecheck declarados no projeto.
- Verificação remota adicional, somente `SELECT`: a aprovação de R$ 10 satisfaz os critérios de identidade/aprovação/vínculo; a de zero não satisfaz o orçamento. A função publicada continua retornando os bloqueios anteriores: a correção não foi instalada.
- Health advisor sem alertas. Advisories preexistentes de segurança/desempenho não explicam este bloqueio nem foram alterados nesta tarefa.

O roteiro `tests/browser/veiculos-solicitante-canonico.cjs` foi preparado para desktop/celular, com rede interceptada e banco sintético. Sua execução ficou bloqueada antes de abrir página: Chromium falhou ao criar socket (`Operation not permitted`). Portanto não há resultado de QA real de navegador nem captura nova para esta mudança. Exemplo para ambiente compatível: `CHROMIUM_PATH=/usr/bin/chromium node tests/browser/veiculos-solicitante-canonico.cjs`; sem variável, usa o canal Chrome como os demais testes do repositório.

## Limites e próximos passos

Esta entrega é local. A migração não foi aplicada e nenhuma viagem real foi iniciada. A solicitação de orçamento zero continua bloqueada; a regra não foi removida nem o valor aumentado artificialmente.

A autorização canônica nova é específica da retirada. Ela não corrige cadastros nem concede acesso geral à aba Viagens, edição de despesas ou documentos. O acesso da viagem atual pelo fluxo geral e o vínculo cadastral ainda precisam de conferência administrativa separada. Novas aprovações sem correspondência canônica em `usersMvp` passam a receber orientação antes da conversão.

A validação de aprovação no frontend melhora o fluxo normal; não substitui uma autorização backend. O guard de Solicitações continua restrito ao ADM e a retirada continua validando o orçamento no banco. A ordem de persistência da aprovação e da viagem no legado continua a mesma; não foi reestruturada nesta correção.

Antes de qualquer publicação, revalidar a versão da função em uso, testar em Supabase isolado com JWT/RLS reais e completar QA de navegador. Migração: `supabase/migrations/20261113170752_financeiro_veiculos_solicitante_canonico.sql`; reversão: `supabase/rollback/financeiro_veiculos_solicitante_canonico.sql`. Aplicação e publicação dependem de autorização específica fora desta etapa. O rollback restaura a regra anterior e preserva todos os dados.
