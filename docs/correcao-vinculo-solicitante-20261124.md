# Aprovação com solicitante ausente do espelho financeiro — 24/11/2026

Repositório confirmado: `engjonathanabreu-code/financeiro_integral`. Base: `ace1e9e1f30062db95586bb5f04eb91d47df3a57` (merge do PR #28). Branch: `codex/corrigir-vinculo-aprovacao-viagem`. Migração aplicada em produção após autorização, backup e restauração validados. O histórico versionado acompanha o [PR #30](https://github.com/engjonathanabreu-code/financeiro_integral/pull/30).

## Diagnóstico comprovado

A consulta somente leitura no ERP Integral Interno (`ycdsyilyvaxslkwbkxyo`) localizou o pedido `d477f994-f893-45d1-baa2-352d9d8f088c`, de Lorena, para reunião em Benedito Novo. O pedido continua pendente, com data necessária em 26/11/2026, veículo Gol e orçamento de R$ 60,00. Nenhuma viagem está vinculada a esse pedido. Lorena possui perfil ativo, mas não existe registro com seu UUID em `financeiro_estado_modulos.usersMvp`. Outro perfil ativo também está ausente desse espelho.

A conversão de viagem/orçamento exige um único usuário financeiro ativo associado pelo UUID do perfil ERP. O corpo efetivo de `financeiro_solicitacoes_privado.financeiro_revisar_solicitacao(text,jsonb,boolean,text)` tem MD5 `9a8914a4bb2e818992bea380e6ac555d`, igual à base versionada. O erro foi reproduzido com o mesmo tipo de ausência no banco isolado. A edição da data ou do veículo não é sua causa. Não foi comprovado por que o espelho deixou de receber esses perfis. A sincronização manual existente adiciona perfis faltantes; a aprovação não a executava.

## Correção

A migração `20261124191435_financeiro_vinculo_solicitante_aprovacao.sql`, criada com a CLI instalada, adiciona uma função privada chamada apenas no ponto de conversão original de viagens e orçamentos. Quando não existe vínculo com o UUID do perfil ativo, cria o espelho usando o mesmo ID numérico determinístico do login/sincronização. Nome, e-mail, setor e papel vêm do perfil; não aceita hint de identidade do cliente. O cadastro não cria uma conta de autenticação nem muda o perfil ERP.

A escrita do espelho e a aprovação pertencem à mesma transação. O módulo de usuários fica bloqueado durante a resolução; um erro posterior desfaz também o vínculo recém-criado. Cadastros existentes preservam IDs e conteúdo. Vínculos duplicados, inativos, IDs em colisão ou cadastro local sem UUID com o mesmo e-mail continuam exigindo conferência administrativa. Homônimos não determinam atribuição. Não há sincronização geral de perfis nem reativação automática de usuários.

A função auxiliar usa `security invoker`, `search_path` vazio e não concede acesso direto a `public`, `anon` ou `authenticated`. O ponto de entrada continua exigindo ADM ativo. As funções públicas da Central, a guarda de viagens semelhantes, RLS, ACLs e demais fluxos permanecem iguais. A instalação verifica o hash da função original antes de alterá-la. Não há mudança de interface ou dependência nova no projeto.

## Validação

- `node --test --test-concurrency=2 tests/*.test.js tests/*.test.cjs`: **252/252 aprovados**, incluindo 13 testes novos.
- Regressões novas: erro anterior reproduzido; edição pela RPC atual da Central; aprovação pelo ADM; orçamento e viagem atribuídos pelo UUID; ID existente preservado; duas solicitações do mesmo perfil sem duplicação; retry após resposta perdida; perfil inativo; colaborador/Financeiro/anônimo sem aprovação; vínculo duplicado ou inativo; colisão numérica; cadastro legado; módulo inválido ou ausente; homônimo; erro posterior com rollback integral; conferência de viagens semelhantes mantida; instalação e reversão protegidas contra função desconhecida.
- `tests/browser/solicitacoes-central.cjs`: **aprovado** no Chromium com RPCs reais no PGlite e rede externa bloqueada. Fluxo novo em **1440 e 390 px**: pedido editado de HB20/data 25 para Gol/data 26, aprovação, perda simulada da resposta, reconfirmação e prova de um único espelho e uma única viagem. O roteiro existente também passou em 1440/768/390 px. Sem erros JavaScript ou transbordamento horizontal; capturas finais inspecionadas.
- `node scripts/check-local.cjs`: **106 JavaScript**, **89 assets** e **207 arquivos de leitores por SHA-256** conferidos. Não há script separado de lint ou tipos no `package.json`.
- `git diff --check`: aprovado.
- Supabase: health sem alertas. Advisories de segurança/desempenho já existentes foram consultados; sua correção está fora deste escopo. Logs PostgreSQL consultados entre 13:40 e 14:10 UTC não retornaram a mensagem; o diagnóstico é sustentado pelos dados e pela reprodução SQL.

Os testes usam dados sintéticos e PostgreSQL do PGlite, não um login real de Lorena nem aparelho físico. O transporte RPC/Storage no navegador é simulado. A aprovação real permanece pendente para o administrador concluir depois da instalação. As evidências locais estão em `output/financeiro-vinculo-solicitante-20261124` no workspace desta tarefa.

## Publicação e reversão

A aplicação remota foi autorizada pelo responsável, conforme `AGENTS.md`, condicionada a backup e validação da restauração antes da instalação. A alteração efetiva é no banco; o frontend atual já consome a mesma RPC. Não é necessário um novo comportamento de interface para desbloquear o pedido.

Após autorização: revalidar o hash da função; obter backup atual e validar restauração isolada; registrar contagens/hashes dos módulos e a definição/ACL das funções; publicar a alteração pelo fluxo de revisão/CI; aplicar somente a nova migração e conferir assinatura, ACL e dados sem efetuar aprovação real. A instalação cria a função privada e altera uma função existente, sem editar pedidos, viagens ou usuários. O espelho faltante só será gravado na próxima aprovação válida feita pelo ADM.

Risco principal: criar a atribuição do solicitante errado. O vínculo por UUID ativo e a recusa de cadastros ambíguos reduzem esse risco; não se usa aproximação por nome. O backup e a revalidação prévia precisam ser atuais no momento da aplicação, pois a produção continua recebendo gravações.

O rollback `supabase/rollback/financeiro_vinculo_solicitante_aprovacao.sql` restaura o corpo original apenas se a versão corrigida corresponder ao esperado. Remove a função auxiliar e conserva todos os usuários, viagens, solicitações e históricos já gravados. O ensaio confirmou preservação dos dados, definições e ACLs após reversão. Voltar a função antiga fará novos perfis sem espelho receberem novamente o bloqueio, sem desfazer aprovações válidas anteriores.

## Aplicação autorizada e evidências de recuperação

Em 24/11/2026, o responsável autorizou publicar e aplicar a correção, exigindo backup/restauração antes e preservação da solicitação pendente. Autorizou também uma exceção de revisão somente para o PR #30, com CI obrigatório mantido e restauração imediata da exigência após o merge, e o uso temporário da credencial apenas para copiar os anexos originais.

O snapshot consistente de **24/11/2026 às 16:05:47 (Brasília)** contém **39 tabelas e 23.790 linhas**: dados financeiros, perfis, histórico, tabelas privadas e metadados de Storage. Exportação binária criptografada com AES-GCM; chave em diretório privado separado do arquivo. A restauração em PostgreSQL 17 local conferiu todas as contagens e SHA-256 dos fluxos binários, além dos totais das parcelas. As definições de funções, constraints, colunas, enums, políticas e triggers estão preservadas no catálogo criptografado. Não é um backup completo dos demais módulos do ERP ou de toda a autenticação Supabase.

Foram copiados **87 originais financeiros do Storage (339.470.816 bytes)**, com recuperação individual dos arquivos criptografados e comparação por SHA-256. IDs, caminhos, versões, tamanhos e timestamps normalizados do inventário permaneceram iguais. A credencial foi usada em memória durante o download; não foi salva nem exibida. O bloqueio inicial da revisão automática foi resolvido pela autorização específica do responsável.

O ensaio sobre o banco restaurado reproduziu o erro anterior. Depois da migração, a cópia local do próprio pedido de Lorena foi aprovada com Gol, 26/11/2026, R$ 60 e um único vínculo pelo UUID, em transação local revertida. A reversão SQL restaurou o hash original e preservou os módulos. Esse ensaio não executou aprovação remota.

A migração foi aplicada pelo conector Supabase como `20261124191435_financeiro_vinculo_solicitante_aprovacao`. O nome do arquivo e as referências de teste foram reconciliados com o catálogo efetivo, sem alterar o SQL ou reaplicar a migração. A checagem de ACL confirmou a RPC acessível a usuários autenticados, bloqueada para anônimos, e a auxiliar privada sem execução direta para ambos.

O backup e os relatórios privados estão em `output/backup-financeiro-vinculo-20261124/`, ignorado pelo Git. São cópias criptografadas locais; não foi configurada rotina recorrente de backup nesta tarefa. A chave necessária à recuperação deve ser preservada junto ao responsável, separada dos arquivos criptografados.

A verificação imediatamente posterior à instalação confirmou **39 tabelas e 23.790 linhas com os mesmos hashes**, políticas e ACLs existentes iguais e somente as duas mudanças esperadas em funções (auxiliar nova e ponto de resolução de identidade). O pedido de Lorena permanece **Pendente**, sem `convertedId` e sem viagem vinculada.
