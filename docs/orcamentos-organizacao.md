# Organização de Orçamentos

Base `ace1e9e` (main, PR28). Referência confirmada: PR25, commit `7f1a1bf`, central de Solicitações com filtros, resumos e ações. Esta mudança adapta apenas a camada de consulta; não replica estados de aprovação, categorias ou exclusão.

- Busca por nome, setor e plano, indiferente a acentos/maiúsculas.
- Filtros por aberto/fechado, setor e consumo; botão para limpar e vazio explícito.
- Critérios preservados em memória ao abrir detalhe e voltar; reiniciados se identidade/perfil/setor mudar. Não persiste informações no servidor ou localStorage.
- Indicadores do recorte: quantidade, limites, gastos e abertos no limite/acima. A comparação usa centavos, mas não modifica valores de origem, estornos ou cálculos de gravação. Limites não positivos ficam separados; não se inventa percentagem ou limiar de alerta.
- Gastos somam todo o histórico por budgetId, como o detalhe V9. Só são projetados IDs de cards que o renderer original já tornou acessíveis. Não há nova regra de acesso.
- Card continua sendo o atalho clicável e acessível por teclado/mobile para detalhes/histórico. Sem menu redundante. Edição e fechamento continuam nos fluxos existentes; fechados não recebem atalhos de escrita.

Arquitetura: `financeiro-budgets-organizacao.js` decora `budgets()` depois de `financeiro-lifecycle.js`, sem substituir renderer, handlers ou política. CSS próprio limitado à organização. `index.html` carrega os dois assets. Nenhuma mudança em API, dados, SQL ou integrações.

Verificação: `npm run check` (assets, sintaxe, leitores) é o equivalente de build deste projeto estático; não há script build/lint/types. `npm test` cobre a suíte Node e as funções puras novas. Runner `tests/browser/budgets-organizacao.cjs` usa V9/ciclo reais com fixtures e bloqueio total de rede externa. O executor desta mudança não conseguiu iniciar Chromium: socket Unix não permitido, inclusive na execução elevada; portanto teste de navegador/visual NÃO foi aprovado aqui e precisa rodar no QA independente. Exemplo: `NODE_PATH=<dependências Playwright> node tests/browser/budgets-organizacao.cjs`.

Rollback: retirar os dois novos assets do index/restaurar commit anterior; não há migração ou dados a reverter. Nenhum push/PR/deploy foi feito nesta etapa.
