# Planejamento Financeiro

A aba Planejamento usa as fontes autorizadas do ERP, mantém o cadastro de previsões manuais e limita a consulta a administradores. O painel analítico consulta Recebimentos por páginas sob a sessão do ERP e usa os módulos financeiros que o aplicativo já carregou. Atualizar dados no painel refaz a consulta de parcelas. O retrato dos contratos usa a última sincronização do ERP registrada no sistema.

| Visão | Fonte e critério |
| --- | --- |
| Contas e Recebimentos | Contas usa as parcelas do módulo e seus cadastros. Recebimentos usa as parcelas ativas de clientes e municípios ativos. O previsto de Recebimentos soma principal, juros e multa registrados. O saldo em aberto subtrai o valor liquidado das parcelas abertas. Contas usa o valor cadastrado ou, se houver baixa parcial com valor informado, a diferença. |
| Extratos e lançamentos próprios do Caixa | Movimentos registrados até hoje. As rotinas existentes de Caixa recompõem agrupamentos históricos íntegros e reconhecem repetições inequívocas de extrato. Registros derivados de Contas e Orçamentos têm origem própria. Transferências internas explicitamente identificadas e identidades bancárias conflitantes ficam fora da série. |
| Contratos do ERP | Retrato das parcelas abertas da última sincronização, com valor contratual quando disponível e saldo informado pelo ERP. O retrato atual omite a data de pagamento e oferece a visão de previsão e saldo em aberto. |
| Previsões manuais | Usa a entrada, o valor total, os vencimentos e a cadência cadastrados. Mantém o dia informado e ajusta ao último dia válido nos meses mais curtos. Arredonda em centavos e distribui o resíduo entre as parcelas. |
| Folha projetada | Usa o valor contratual vigente para os cadastros ativos no mês. A data do primeiro dia indica a referência mensal. |

Valores de Contas em situação paga só entram no realizado com data de pagamento registrada. Baixas de Recebimentos entram no dia de pagamento com o valor liquidado, inclusive baixas parciais. A evidência exibida distingue baixa declarada, retorno bancário e correspondência com extrato quando há referência, direção, data e valor coincidentes. Os dados de estorno são tratados conforme a posição atual da parcela e as origens registradas. A consulta histórica pode mudar depois de novas baixas. Vencidos representam o saldo atual dos títulos em aberto com vencimento anterior a hoje e dentro dos filtros.

A diferença e a movimentação líquida são calculadas por entradas menos saídas em centavos. A comparação anterior usa o período imediatamente anterior com a mesma duração. O sistema preserva visões próprias quando as fontes podem representar os mesmos valores. A base analisada não oferece saldo inicial conciliado para calcular saldo bancário final. Datas de competência informadas só por mês entram no mês indicado.

Os cenários simulam percentuais, deslocamento de datas e ocorrências mensais hipotéticas sobre o saldo aberto com vencimento a partir de hoje. Valores de entrada e saída, composição, lista, calendário e exportação se referem à fonte e aos filtros da visão. Cenários e favoritos ficam no navegador por administrador. Arquivar um cenário permite recuperá-lo. Os arquivos selecionados pelo usuário incluem o contexto de período, fonte, filtros e data de geração. O PDF do detalhamento aceita até 1.500 itens por arquivo.

A fila de lançamento mostra o identificador original em um detalhe de leitura. Quando a origem está disponível na navegação atual, o detalhe também encaminha à aba correspondente. Os filtros de centro de custo, cliente, categoria e demais dimensões aparecem à medida que os dados da fonte oferecem esses campos.

O painel não exige migração. Para reverter, restaurar a versão anterior dos dois arquivos canônicos e retirar os dois scripts do painel da lista de ativos do site. As preferências do navegador usam uma chave própria.
