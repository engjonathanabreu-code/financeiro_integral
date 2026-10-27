# Controle de veículos — entrega local

Registro da etapa local, em 27/10/2026. O estado posterior de validação/publicação será registrado em `veiculos-validacao-publicacao.md`. Nesta etapa não houve PR, push, merge, deploy, comunicação externa, criação de credencial ou migração externa. O SQL foi executado somente em bancos PGlite descartáveis com dados sintéticos.

## Repositório e isolamento

- Origem confirmada por checkout, remote e histórico: `engjonathanabreu-code/financeiro_integral`, checkout original em `/Users/jonathandaviddeabreu/Documents/GitHub/financeiro_integral`.
- É distinto de `engjonathanabreu-code/integracao` e de `Financeiro_MCL`.
- Base local: `dcad69a` (auditoria de acessos). Não foi feita consulta a estado remoto de produção.
- Cópia Git independente, sem hardlinks, em `financeiro-integral-veiculos`; branch `feat/controle-veiculos-local`. Checkout original permaneceu limpo.
- Consultados `memory_summary.md`, documentação de auditoria, testes, design system e instruções locais. O checkout não contém `AGENTS.md` ou `.agents/skills`. O `AGENTS.md` da memória do projeto apenas protege fontes sincronizadas; nenhuma foi editada.

## Aprovação existente reutilizada

A fonte é **Solicitações**, não o campo `trips.status` nem um orçamento setorial arbitrário.

Evidências no código existente:

- `public/financeiro-invoices.js`: categoria `trip`, `estimatedValue`, `neededAt`, decisão `Aprovada` e conversão para `db.trips` com `convertedId`, `invoiceRequestId` e `plannedAmount`.
- `supabase/financeiro_solicitacoes_permissoes.sql`: trigger `financeiro_guard_invoice_requests` impede que colaboradores aprovem ou alterem solicitações; `financeiro_save_invoice_request` serializa a decisão do ADM.
- `trips.status='Aprovada'` isolado não comprova aprovação do orçamento. Não é utilizado como autorização.

**Não existe segunda aprovação no módulo novo.** Não se modificam solicitações, viagens, orçamentos, seus estados ou permissões. A proposta inicial de aprovação separada foi removida após localizar o fluxo canônico.

A retirada exige solicitação própria da categoria viagem, aprovada, valor positivo, auditoria de revisão, data necessária igual à data da retirada em `America/Sao_Paulo`, conversão consistente nos dois sentidos e acesso já existente à viagem. Solicitação sem data/valor/conversão válida fica bloqueada. Nenhum registro antigo é convertido automaticamente. Uma solicitação atende um uso não cancelado; cancelamento antes de circulação permite reutilizá-la. Motorista é o solicitante autenticado; não se transfere autorização implicitamente a outra pessoa da equipe.

O SQL verifica a presença do guard de aprovação existente antes de criar recursos e a cada retirada. Se a proteção não estiver instalada/ativa, falha fechada. Verificar o schema real em ambiente de homologação continua necessário; nenhum banco remoto foi inspecionado nesta tarefa.

## Comportamento implementado

- Aba Veículos para perfis autenticados ativos; Gol e HB20, disponibilidade, meus usos e relatos.
- Retirada com identidade do servidor, data/hora, destino, km, foto original e solicitação aprovada. Devolução com km/foto e distância real.
- Transação com bloqueio de linha do carro e índice parcial impede dois usos abertos. Datas, km regressiva/NaN, foto ausente e alterações indevidas são recusadas no banco.
- Reenvios usam o mesmo UUID de operação. Cancelamento justificado por até 15 minutos preserva registro e foto; se houve deslocamento, deve-se devolver.
- Fotos próprias ficam em tabela nova privada, fora do JSON compartilhado e dos arquivos de acesso amplo do legado. Até 4 MB, JPEG/PNG/WebP, assinatura conferida e nome normalizado. Sem URL pública; leitura exige dono do uso/autor do relato ou ADM. Não há concessão de escrita direta ao cliente.
- Relatos exigem descrição e 1–3 fotos, vistos por autor e ADM. Associação ao uso anterior só ocorre no início da própria retirada e é explicitamente temporal, sem atribuir responsabilidade. Não há publicação para outros colaboradores nem acusação automática.
- Combustível é cadastrado no fluxo existente de Viagens e depois vinculado. A nova aba não cria lançamento financeiro nem copia despesa. Banco confere viagem, período, original existente, snapshot revisado e unicidade do identificador/original. Mudança no lançamento exige nova revisão; ele é excluído dos custos até lá.
- IA de recibos reutiliza `IntegralTripDocuments` e `/api/ai-receipt`. Nova leitura do painel e análise administrativa usam a mesma OpenAI/modelo/configuração do Financeiro; não há fornecedor novo. Foto ilegível resulta em `null`. Confirmação humana obrigatória; falhas preservam o preenchimento manual. IA do painel aceita até 3 MB para respeitar o limite do corpo da API; original do registro aceita 4 MB.
- Métricas usam centavos e distância registrada. Custo/km considera somente combustível vinculado, não custo total do veículo. Sem comprovante não é exibido custo zero como evidência. Sem km não há divisão. Consumo só aparece em ciclos declarados de tanque cheio na saída e chegada, com todos abastecimentos/litros revisados; a declaração não é verificação física independente.
- Painel administrativo, histórico geral e análise IA só para ADM. O perfil Financeiro continua sem poderes de ADM.
- Cores/tipografia/tokens do `financeiro-design-system.css`, componentes existentes, foco e diálogo nativo, alvos de toque de 44 px e layout sem overflow em 390/834/1440 px.

A revisão da base remota encontrou a correção existente da fronteira do bundle legado (PR #10). Essa correção deve ser preservada ao integrar o módulo. O bundle e seu arquivo-fonte de guarda permanecem byte a byte como na base remota. A navegação de Veículos usa uma ponte no próprio módulo e não reativa o RH legado.

## Validação e evidências

| Verificação | Resultado |
|---|---|
| Suíte original antes das mudanças | 75/75 passaram |
| Suíte completa final, Node 24.21.0 | 88/88 passaram |
| Sintaxe de JavaScript e referências locais do HTML | 99 arquivos e 82 assets válidos |
| QA Chrome → RPC → PGlite com migração real | 48 verificações passaram |
| Perfis no QA | colaborador, Financeiro e ADM |
| Viewports | 1440, 834 e 390 px, sem overflow |
| Servidor Node real | HTML, JS/CSS e nova API: 200/401/405 esperados |
| `git diff --check` | passou |
| Revisão de RLS, funções, uploads, navegação e preservação do JSON existente | concluída localmente |

Os testes cobrem orçamento pendente/rejeitado/de categoria errada/sem valor, acesso de outro usuário e inativo, guard ausente, cronologia, km regressiva/NaN, distância zero, chamadas concorrentes concorrendo pelo mesmo carro, reenvio, duplicidade de comprovante, arquivo inválido/grande, rollback de foto, falha de IA, cancelamento e navegação. A suíte compara o JSON legado antes/depois das operações do módulo.

Capturas: [celular](qa-veiculos/colaborador-390.png), [retirada iPad](qa-veiculos/retirada-834.png), [ADM desktop](qa-veiculos/administrador-1440.png). Todas usam imagem sintética de um pixel e identidades fictícias. Relatório automatizado: [browser-result.json](qa-veiculos/browser-result.json).

Comandos reproduzíveis com Node e dependências do projeto:

```sh
node scripts/check-local.cjs
node --test tests/*.test.js tests/*.test.cjs
node tests/browser/veiculos.cjs
node scripts/smoke-veiculos.cjs
```

Nesta máquina, Node e PGlite já disponíveis foram reutilizados via links locais ignorados por Git (`.tools/`, `node_modules/`). O QA utilizou o driver Playwright já instalado no ambiente Python e Chrome local; o repositório já tem testes de navegador que requerem Playwright, mas ele não está declarado no lockfile. Para repetir o QA em outra máquina é preciso disponibilizar Playwright e Chrome. Não foram instaladas dependências ou alterado o lockfile nesta tarefa.

Não executados: ESLint (sem configuração/dependência), typecheck TypeScript (projeto JavaScript, sem `tsconfig`), build de bundler (não existe; `public/` é servido diretamente), Supabase CLI/advisors (CLI indisponível), Postgres externo com duas sessões reais, Safari/iOS físico e integração real OpenAI/Supabase. `check` valida sintaxe/assets, não substitui lint semântico. As chamadas concorrentes do PGlite compartilham uma conexão; índice e transação foram exercitados, mas o teste não prova comportamento operacional de duas sessões PostgreSQL independentes.

Os erros intermediários de SQL (alias ambíguo), origem HTTP do fixture, referência `hr`, destaque duplo e overflow foram corrigidos. Não há check final conhecido falhando.

## Migração proposta e passos restantes

`supabase/financeiro_veiculos.sql` cria somente cinco tabelas novas, índices, RLS e funções novas. Não altera políticas ou dados antigos. O arquivo segue o padrão SQL do repositório; não foi registrado por CLI porque a CLI não está disponível. Não deve ser aplicado automaticamente.

Para uma publicação futura, após autorização específica:

1. Revisar o código local e conferir a correspondência com a versão que será publicada. Fazer backup e validar o guard existente de Solicitações e as tabelas de anexos no ambiente de homologação.
2. Registrar a migração pelo procedimento oficial do projeto e testá-la em Supabase isolado, com JWTs de teste, RLS/Storage reais e disputa de duas sessões. Confirmar solicitações aprovadas com data e conversão válida; corrigir inconsistências pelo fluxo existente, sem importação automática.
3. Validar limites/tamanho de payload, crescimento da tabela privada de fotos e plano de retenção/backups. Validar a integração IA já existente com imagens sintéticas, sem fotos reais nesta homologação inicial.
4. Conferir Safari/iPad/iPhone e o ciclo completo com criação e aprovação na aba Solicitações, comprovante no fluxo atual de Viagens e vínculo em Veículos.
5. Só então pedir/obter autorização para PR, publicação e aplicação da migração. Rollback do frontend pode ocultar a aba; preservar as tabelas novas e evidências, sem apagar histórico.

Sem bloqueio de implementação local pendente. Publicação, migração remota e testes reais externos permanecem deliberadamente não executados e sem aprovação.
