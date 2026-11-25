# Confirmação de decisões na Central de Solicitações — 24/11/2026

Atualização posterior: a causa da espera persistente foi reproduzida com a guarda real de orçamentos fechados e PostgREST 14.5. Consulte [diagnóstico e correção do conflito](aprovacao-orcamento-fechado-20261124.md). As conclusões abaixo registram a investigação anterior; o limite de espera do PR #31 não resolveu a falha no banco.

Repositório: `engjonathanabreu-code/financeiro_integral`. Base publicada `5db6bf5e93262faa1256e6e2fafab20bf4071ce1`. Branch: `codex/corrigir-confirmacao-solicitacoes`. Correção de interface, sem migração ou gravação remota nesta etapa.

## Diagnóstico e limites

Consulta somente leitura confirmou que o pedido **Conserto sensor ABS do Gol**, categoria orçamento, R$ 395,00, permanece pendente, sem orçamento convertido nem evento de aprovação. O solicitante possui um vínculo financeiro ativo e único. A situação é diferente da falta de vínculo corrigida no PR #30. A descrição do solicitante e a resposta preenchida declaram pagamento, mas esse texto não comprova baixa financeira e não foi usado para alterar pagamentos.

A captura mostra a tentativa preservada e os botões desabilitados. Na versão publicada, a aprovação aguarda `auth.getUser()` e a RPC sem prazo de conclusão. Se qualquer uma dessas promessas não terminar, `finally` não é alcançado e a tela permanece ocupada. O travamento foi reproduzido em Chromium: a autenticação simulada não responde e, mesmo avançando 35 segundos, o botão continua desabilitado. Os logs de produção consultados não mostram uma aprovação deste pedido. As chamadas de revisão concluídas às 16:32 e 16:38 (Brasília) correspondem a decisões de outros pedidos; a consulta de atividade não mostrou bloqueio persistente de banco. A origem exata da espera na sessão real do usuário não foi capturada; não foi inferido que o backend recusou a aprovação.

O orçamento de reparo sintético com o mesmo tipo, data e valor foi aprovado pela RPC SQL real no PGlite em 8 ms. Portanto, os testes disponíveis não reproduzem uma recusa da conversão de orçamento por esses campos.

## Alteração

A interface limita a validação da sessão a 10 segundos e a espera pela decisão a 20 segundos. No prazo excedido, libera o botão, conserva o texto e o payload original, informa a falta de confirmação e permite reconfirmar a mesma decisão. A RPC recebe `AbortSignal` quando o cliente oferece esse modificador; abortar a requisição não é tratado como prova de rollback do servidor. Uma resposta atrasada não atualiza a lista nem dispara uma escrita depois que a validação da sessão expirou. A repetição usa a idempotência já existente na RPC, com a mesma versão esperada, decisão e resposta. [Referência oficial do modificador AbortSignal](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal).

A indicação de andamento passa a dizer **Confirmando decisão…**. O aviso de erro permanece visível no modal após o alerta. As leituras da Central iniciadas antes da aprovação são invalidadas para não devolverem o cartão a um estado antigo. O comportamento de sessão diferente, as permissões e as guardas SQL permanecem iguais. Não há aprovação automática em timeout nem rotina de reenvio em segundo plano. A correção não redefine o cliente de autenticação, não limpa o armazenamento do navegador e não muda status de pagamentos.

Arquivos alterados: `public/financeiro-invoices.js`; `tests/invoice-conversion.test.cjs`; `tests/browser/solicitacoes-central.cjs`; novo roteiro `tests/browser/solicitacoes-confirmacao.cjs`; este relatório. O roteiro existente exporta seus helpers e mantém a execução direta por `require.main`.

## Validação

Resultado final: **255/255 testes Node aprovados**, incluindo três regressões novas; quatro cenários novos de Chromium aprovados; roteiro completo da Central aprovado; `check-local.cjs` conferiu 106 arquivos JavaScript, 89 assets e 207 leitores por SHA-256. `git diff --check` passou. Não há lint ou checagem de tipos separados no package.json. O teste de reprodução falhou na base e passou após a correção. As três regressões Node novas cobrem autenticação sem resposta e resposta tardia, RPC abortada com repetição idêntica, e falha síncrona com limpeza do prazo. Os cenários de navegador usam RPCs SQL reais no PGlite e rede externa bloqueada, com dados sintéticos:

1. Autenticação não conclui: o botão é liberado, o texto permanece e a resolução tardia não envia uma aprovação. Após recuperar a sessão, confirma um único orçamento.
2. Aprovação gravada, resposta retida: prazo libera a tela, o sinal é abortado e a repetição idêntica confirma o resultado sem duplicar o orçamento. O retorno tardio não reescreve a lista.
3. Rejeição gravada, resposta retida: a repetição mantém a mesma decisão e não cria orçamento.
4. Uma leitura antiga da Central chega depois da aprovação: o cartão continua aprovado.

Foram exercitadas larguras de 390 e 1440 px no roteiro novo. O roteiro completo da Central cobre também 768 px, permissões, anexos simulados, edição, devolução, revisão, paginação e conferência de viagens semelhantes. Os testes não usam a conta real do usuário, um aparelho físico ou a rede que apresentou a espera. A correção garante uma espera limitada e recuperação segura; a causa de um eventual travamento interno do SDK ou da rede real ainda pode exigir investigação adicional se persistir.

## Publicação e reversão

A alteração está preparada para revisão e depende de autorização específica para produção conforme `AGENTS.md`. Um novo deploy basta, sem SQL remoto. O risco principal é uma operação concluir no servidor depois de a interface deixar de receber sua resposta; por isso a decisão continua preservada e somente a mesma tentativa pode ser repetida. A validação de identidade e a transação/idempotência do servidor continuam sendo obrigatórias.

A reversão consiste em voltar o deployment anterior do Financeiro (`dpl_CJzvchhwKCscU8VDgYGxQb7xhv7X`, commit `5db6bf5`) ou reverter apenas esta mudança de interface. Nenhuma tabela, arquivo original, aprovação ou vínculo deve ser restaurado para reverter este lote. A exigência de revisão da branch principal continua vigente; qualquer exceção precisa ser específica para o novo PR, mantendo o CI obrigatório e restaurando a regra logo após o merge.
