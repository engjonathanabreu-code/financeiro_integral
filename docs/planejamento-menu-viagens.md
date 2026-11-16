# Planejamento, menu lateral e Viagens

## Central de Solicitações em produção

A conferência usou consultas somente leitura no Supabase com as permissões de perfis existentes, conforme autorizado. A inspeção visual foi feita no Chromium com os arquivos servidos pelo deploy do commit `49c6ff5`, conferidos byte a byte com o Git. As sessões visuais usaram dados sintéticos em banco isolado, em 1.440 e 390 px para cada perfil.

| Perfil consultado | Central | Lista anterior | Referências nos pedidos | Anexos na Central |
| --- | ---: | ---: | ---: | ---: |
| ADM | 40 | 40 | 30 | 0 |
| Colaborador com pedidos | 10 próprios | 10 próprios | 7 | 0 |
| Terceiro sem pedidos | 0 | 0 | 0 | 0 |

O bucket privado da Central estava vazio. O ensaio visual confirmou a presença do botão de download no pedido sintético e a visibilidade dos vínculos por perfil. O teste HTTP real de anexos foi realizado no ensaio isolado da publicação anterior. Nenhum documento novo foi enviado a produção para esta conferência.

A inspeção também encontrou nove compras aprovadas legadas com uma única parcela identificada de forma recíproca pelo ID da conta e da solicitação. A tela publicada espera um campo explícito de parcela que não existe nessas nove solicitações. O checkout local passa a resolver o destino por reciprocidade única para perfil com acesso a Contas. Quando há referência explícita, ela tem de corresponder ao mesmo vínculo. Ambiguidade ou falta de permissão mantém o atalho indisponível.

## Inventário de Viagens e caso reportado

Foram conferidas 27 viagens, todas com IDs distintos. Foram pesquisados o mesmo ID, a mesma solicitação, a mesma identificação operacional e o mesmo destino e colaborador com datas sobrepostas. O último critério, mais amplo, também encontrou os dois registros de Lages. Nenhum grupo foi confirmado como duplicidade da mesma operação.

| Grupo | Evidência | Decisão |
| --- | --- | --- |
| Ibirama, 10/11 · `1794309753492` e `1794310957712` | Aprovações distintas. Orçamentos de R$ 0 e R$ 1. O segundo ID tem uma retirada de veículo e dois comprovantes de veículo. | Preservar os dois. |
| Presidente Getúlio, 13/11 · `1794527967831` e `1794527978494` | Aprovações distintas. Orçamentos de R$ 0 e R$ 10. O segundo ID tem uma retirada e dois comprovantes de veículo. | Preservar os dois. |
| Lages · `1794576677884` e `1794578337285` | O primeiro cobre 15/11, com aprovação, retirada e comprovante. O segundo cobre 15 a 18/11, com despesa de R$ 250 e documento vinculado. A despesa e o documento referenciam o mesmo original, localizado em `financeiro_arquivos`. | Preservar os dois. |

A presença de um original no servidor confirma o documento associado à viagem de 15 a 18/11. A informação disponível não identifica o arquivo exato da captura de tela nem o erro de armazenamento do aparelho.

O código em produção contém duas entradas para criar viagem, dependentes do perfil. Os formulários geram novo ID no envio e fecham antes de receber confirmação. Repetir a ação sob perda de resposta pode criar outra viagem. Os quatro IDs das imagens, por sua vez, correspondem a pedidos distintos, portanto não demonstram repetição do mesmo envio.

A mensagem relatada vem do diário de sincronização. O original podia entrar como base64 e preencher o armazenamento local antes de o salvamento chegar ao servidor. Essa dependência foi tratada no checkout local. A condição concreta do celular de Marcelo ainda exige reprodução ou diagnóstico nesse aparelho.

Consolidar qualquer par acima depende de evidência que resolva os conflitos de aprovação, orçamento, retirada e documentos. Antes de uma consolidação autorizada, registrar o grupo e as provas, tirar backup e validar restauração, travar IDs e revisões esperadas, testar a transferência de vínculos e manter os originais recuperáveis. Depois, comparar contagens, referências individuais e bytes dos anexos. Esta etapa manteve a produção em modo somente leitura.

## Implementação integrada e validação

A frente de Planejamento manteve a aba existente, com entradas e saídas previstas e registradas, vencidos, concentração de vencimentos, filtros, calendário, agrupamentos, cenários e exportação. A revisão contábil e de dados verificou o risco de somar a baixa e o extrato sem uma referência comum. Contas, Recebimentos e Caixa são apresentados sem agregar os mesmos movimentos entre fontes. O painel calcula movimentação líquida em centavos, com entradas menos saídas. O saldo em aberto usa o valor registrado, abatendo o valor liquidado quando disponível. A base consultada contém 40 contas marcadas como pagas, 25 delas sem data de pagamento. O realizado por data de pagamento exige data. A base também carece de saldo inicial conciliado. Cenários e filtros favoritos ficam guardados no navegador por ADM. [Fontes, fórmulas e limites](planejamento-financeiro.md)

A frente de interface reaproveitou os destinos, permissões e handlers do menu para criar a navegação lateral no celular, com foco contido e devolvido ao conteúdo, toque fora para fechar, indicação da seção atual e áreas seguras. A frente de Viagens unificou o formulário, guardou a identidade da operação e condicionou a confirmação ao servidor. A RPC serializa gravações, conserva o mesmo ID após resposta perdida e compara a versão esperada em edições. O upload usa um caminho determinístico no Storage. O rascunho guarda bytes e metadados em IndexedDB quando necessário, incluindo o caso verificado no WebKit após recarga. O cliente antigo permanece compatível na transição e só recebe a garantia do novo identificador ao atualizar a interface.

A consolidação foi exercitada em memória com anexos, despesas, pagamentos e reversão. O verificador em `scripts/viagens-consolidacao-dry-run.cjs` exige evidência, preserva o original no resultado do ensaio e bloqueia aprovações, usos de veículos, referências desconhecidas, versões conflitantes e gastos ambíguos. O verificador não aplica alterações. Os três grupos consultados em produção ficaram fora da consolidação.

- 238 testes automatizados Node, verificação de sintaxe de 106 scripts, 89 ativos locais e integridade dos leitores.
- Planejamento em Chromium a 1.440, 820 e 390 px, com conferência dos arquivos CSV, XLSX e PDF gerados sob os filtros, além de categorias, calendário, paginação e cenários.
- Menu no Chromium com iPhone e Android emulados em retrato e paisagem, além de computador e tablet. No WebKit, iPhone emulado em ambas as orientações, além de computador e tablet.
- Viagens em Chromium e WebKit a 390 px, com toque duplo, resposta perdida, recarga com quota bloqueada, PDF selecionado offline e retomada com um único vínculo. A API de Storage foi simulada no navegador e as permissões foram testadas separadamente no banco isolado.
- Regressões de Veículos, Consultor e Central de Solicitações em navegador. As capturas representam dados sintéticos. A validação do aparelho físico de Marcelo permanece pendente.

## Publicação e reversão

A produção foi conferida no merge `49c6ff5`. As mudanças deste lote estão na branch local `codex/planejamento-menu-viagens`. Para publicar Viagens, a migração aditiva `20261116165100_financeiro_viagens_persistencia.sql` cria o registro de idempotência e a RPC e amplia a guarda do Storage para o subdiretório de Viagens já no envio, antes do vínculo definitivo à despesa. A versão atual da guarda e as RPCs existentes foram conferidas por leitura no catálogo de produção.

A migração afeta salvamento de Viagens e a política de leitura de documentos. Antes de produção, registrar um backup novo, validar a restauração isolada e exercitar o upload na API real do Storage com fixture. Aplicar a migração antes de publicar a interface, conferir o SHA do deploy e comparar dados, vínculos e objetos. Para reverter, voltar a interface e revogar o acesso client à nova RPC com o script preparado. A reversão preserva os recibos de operação e a proteção dos anexos enviados. Nenhuma consolidação real integra este lote.
