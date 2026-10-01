# Agente Financeiro e encerramentos

Implementação no repositório `engjonathanabreu-code/financeiro_integral`.

Orçamentos abertos podem ser fechados por ADM com confirmação. A RPC bloqueia a linha compartilhada, compara a versão integral do orçamento, acrescenta status, data, autor e histórico; só depois da confirmação do banco a interface muda. A seção inferior conserva acesso aos gastos e histórico. Uma gravação antiga não pode remover o encerramento. O formato existente e permissões de outros módulos permanecem.

Viagens concluídas são separadas da tabela ativa, na mesma tela; os botões Abrir, documentos, despesas e permissões por setor/atribuição continuam nas duas seções. Nenhum registro é removido para agrupá-las.

O botão flutuante com cabeça triangular verde abre o chat lateral. A navegação Agente Financeiro fica abaixo de Gerar boletos. Ambos exigem ADM. Há sete prompts, seleção de período, objetivo financeiro opcional, histórico de conversa em memória e detalhamento dos indicadores usados. Sair/trocar usuário apaga a conversa e cancela pedidos pendentes.

## Backend

`POST /api/agente-financeiro` valida token no Supabase Auth e perfil ativo do servidor; dados enviados pelo navegador não compõem os indicadores. A RPC `financeiro_consultor_base` também exige ADM e usa SECURITY INVOKER, com as políticas existentes. Não há chave service_role, escrita por IA ou envio de arquivos, CPF e dados bancários ao modelo. Os indicadores são agregados no servidor, com parcelas paginadas, período, bases, limitações e dados observados separados de projeções.

Os totais de fluxo de caixa, recebimentos, contas, orçamento, viagens e planejamento são bases distintas. Não são somados indiscriminadamente. A comparação usa um período anterior de igual duração. Atrasos representam o saldo atual de parcelas vencidas, sem reconstrução histórica. Orçamentos e contagem de viagens representam posição atual. Meta em unidades, faturamento contábil, margem e caixa final dependem de premissas adicionais; o agente deve solicitá-las. Folha futura e DRE não são calculadas nesta primeira base; a interface informa isso expressamente.

Configuração: reutiliza `OPENAI_API_KEY`; `OPENAI_CONSULTOR_MODEL` opcional, padrão `gpt-5-mini`. Sem chave, retorna indicadores reais e explica que a conversa com IA não está configurada. O modelo recebe regras contra números inventados e instruções presentes nos dados. Toda resposta generativa ainda exige interpretação humana.

SQL aditivo: `supabase/financeiro_consultor.sql`, aplicado ao projeto ERP `ycdsyilyvaxslkwbkxyo` em 01/10/2026. As funções novas não concedem acesso a anônimos. O gatilho protege também chamadas REST diretas e UPSERT.

## Validação

- Suite Node: testes existentes de boletos/carnês, importação, arquivos e navegação mais testes de cálculos, API e PostgreSQL.
- PostgreSQL local: ADM, funcionário, ADM inativo, anônimo, status falsificado, exclusão/renomeação de módulo, conflito de versão, gravação antiga e histórico preservado.
- Supabase real: ADM fecha orçamento e consulta base; funcionário recebe bloqueio na RPC e alteração REST direta. Transação integralmente revertida: nenhum orçamento real ficou fechado pelo teste.
- Navegador isolado em 1440 e 390 px: confirmação/cancelamento/erro ao fechar, dados persistidos, grupos ativos/encerrados, consulta, permissões, posição da navegação, chat, envio de análise, fechamento por Escape e limites do painel.
- Provedor IA simulado nos testes: valida conteúdo e tratamento de falha; nenhuma chamada real ao modelo foi validada neste ambiente.

Execução: `npm test` e `node tests/browser/consultor.cjs` (Playwright disponível; `BROWSER_CHANNEL=msedge` por padrão). A nova página e API ficam disponíveis após publicação da branch. Não houve merge automático em main.

## Revisão de publicação em 01/10/2026

O encerramento agora aguarda gravações pendentes e interrompe a operação se elas falharem. A resposta do servidor é reconciliada com as alterações locais feitas durante a chamada, preservando novos orçamentos e registros remotos. Conflitos no mesmo campo mantêm as duas versões, interrompem o envio automático do módulo e mostram aviso para revisão.

O total de Fluxo de Caixa do consultor acompanha a tela: lançamentos manuais/importados, contas pagas e gastos de orçamentos, com os ajustes do Fluxo e sem duplicar registros derivados legados. Há regressões específicas para sincronização concorrente e essa composição.

A suite Node foi executada novamente na revisão. O teste real mínimo do provedor pelo endpoint existente ai-health respondeu conectado (sem enviar dados financeiros). A sessão administrativa no navegador de publicação não está autenticada; a conversa integral com dados reais permanece dependente de login. A repetição da suite Playwright neste ambiente foi impedida pela restrição de criação de processo/socket do Chromium; os 26 testes mencionados acima correspondem à validação anterior da implementação.

## Versão 2 — consultor especialista, PDF e gráficos (01/10/2026)

**Comportamento.** O agente fala como um diretor financeiro em reunião com o sócio: começa pela conclusão, sustenta com números da base e fecha com o próximo passo. Ajusta o tamanho da resposta à pergunta, usa Markdown leve (negrito, listas, tabelas) e faz no máximo uma pergunta de volta quando falta premissa. As regras de integridade continuam (nada inventado, observado x estimativa, sem somar bases duplicadas, dados cadastrados tratados como não confiáveis).

**Tela.** Ao abrir, carrega só os indicadores (`mode: 'indicadores'`, sem IA) e mostra quatro cartões e uma saudação escrita a partir dos números, com o gráfico de entradas e saídas. No início do mês (dias 1–5) o período padrão é o mês anterior fechado; há atalhos de período. As respostas chegam em tempo real (streaming NDJSON), com até 2 gráficos escolhidos pelo agente e desenhados com os dados reais. Ícone `bot` na barra lateral; estilos com os tokens do design system (claro/escuro).

**PDF.** "Relatório PDF" pede um relatório estruturado (`mode: 'relatorio'`, JSON schema estrito) e monta no navegador com jsPDF: capa com mensagem-chave e indicadores, resumo executivo, diagnóstico, gráficos vetoriais, recomendações, riscos, próximos passos, DRE, maiores saídas, fontes e limitações. Cada resposta do chat também pode virar PDF. Sem IA, o PDF sai com uma leitura automática dos números.

**Desempenho.** Base e parcelas são lidas em paralelo (páginas de parcelas em lotes de 4) e reaproveitadas por 2 minutos por usuário/sessão (`refresh: true` força nova leitura). Chat com `reasoning.effort: low`; relatório com `medium` (só em modelos gpt-5/o*).

**Dados.** A base ganhou séries mensais (fluxo, recebimentos, planejamento), composição por natureza, DRE gerencial com as mesmas regras da aba DRE (`public/financeiro-dre-shared.js`, usado no navegador e no servidor) e indicadores (margem de caixa, médias, variações, inadimplência do período). As maiores saídas, com descrições, vão para a tela e o PDF, mas não para a IA.

**Validação.** `tests/consultor-agente-v2.test.cjs` cobre séries/DRE/indicadores, marcador de gráficos, modos indicadores/relatório, cache e streaming. Os 8 testes do consultor (4 antigos e 4 novos) passaram num navegador com o mesmo código CommonJS; nesta máquina não há Node, então `npm test` deve ser rodado no CI ou em outra máquina. O teste Playwright foi ajustado aos novos atalhos (que já enviam a pergunta).
