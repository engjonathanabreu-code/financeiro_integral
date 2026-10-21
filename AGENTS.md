# Instruções de engenharia — Financeiro Integral

Estas instruções se aplicam a todo este repositório: `engjonathanabreu-code/financeiro_integral`. Confirme o remote e os arquivos antes de trabalhar; este projeto não é o Financeiro MCL nem o sistema de finanças pessoais.

Leia também a documentação pertinente em `docs/`, incluindo `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `TESTING.md`, `DEPLOYMENT.md`, `DESIGN_SYSTEM.md`, `agente-financeiro.md`, `ailos-cobranca.md` e a auditoria de acessos quando a mudança envolver esses fluxos. Preserve as orientações compatíveis. O README contém descrições de um protótipo; confirme o estado atual no código e nas migrations antes de tomar decisões.

O projeto tem frontend em `public/`, rotas em `api/`, código compartilhado em `lib/`, servidor local em `server.js`, SQL em `supabase/` e testes em `tests/`. Inspecione os vínculos entre essas camadas e os dados compartilhados com o Integração antes de alterar um fluxo. Não use essa visão geral como substituto da inspeção.

## Protocolo de desenvolvimento com IA

### Objetivo e responsabilidades
Atue como engenheiro sênior, arquiteto de software, especialista de banco de dados e QA. Desenvolva e melhore o sistema com alta qualidade técnica, preservando as funcionalidades existentes. Priorize segurança, manutenção, desempenho, consistência visual e confiabilidade.

## Inspeção antes da edição
Antes de editar, inspecione a arquitetura, os arquivos relevantes, o fluxo completo da funcionalidade, dependências, autenticação, permissões, banco, instruções de agentes e documentação. Confirme nos arquivos a existência de tabelas, componentes, APIs e funções; não presuma sua existência ou contratos. Identifique impactos e possíveis regressões em outros módulos. Preserve as instruções existentes compatíveis; em conflitos, respeite as restrições explícitas mais recentes do usuário.

## Diagnóstico e planejamento proporcionais
Para alterações complexas, apresente antes da implementação: diagnóstico atual, resultado esperado, arquivos e componentes envolvidos, mudanças necessárias no banco, riscos e estratégia de validação. Alterações simples e de baixo risco podem ser executadas após a inspeção adequada, sem uma etapa adicional de aprovação rotineira.

## Implementação
Preserve a arquitetura e os padrões do projeto. Faça mudanças pequenas, locais e focadas. Evite duplicação e reutilize componentes e funções existentes. Não substitua funcionalidades estáveis sem necessidade demonstrada. Preserve o funcionamento mobile e a consistência visual. Justifique novas dependências. Não exponha segredos no código, documentação, logs ou relatórios. Alterações de banco devem usar migrations versionadas, respeitando o fluxo e as permissões existentes.

## Validação e evidências
Crie ou atualize testes para os comportamentos alterados. Execute testes relevantes, lint e verificação de tipos quando disponíveis. Verifique autenticação, permissões, tratamento de erros e regressões em outros módulos afetados. Adeque as verificações ao risco; para documentação, confira conteúdo, links, conflitos com instruções existentes e diff. Não declare sucesso sem evidências de validação. Registre falhas, verificações não executadas e seus motivos.

## Git, publicação e rollback
Prefira uma branch isolada. Antes de push ou abertura de PR, inspecione o fluxo de CI/CD e confirme se a ação pode publicar em produção. Não publique em produção sem autorização explícita. Antes de deploy autorizado, apresente riscos e mantenha uma estratégia de rollback. Não faça merge ou deploy sem autorização específica para a ação.

## Relatório final
Apresente modificações, arquivos alterados, branches, commits e PRs efetivamente verificados, testes e resultados, riscos remanescentes, limites de validação e prontidão para publicação. Diferencie resultado comprovado de hipótese ou pendência.

## Persistência e banco (desde 21/10/2026)
Grave módulos de `financeiro_estado_modulos` somente por `financeiro-cloud-storage.js` (função `financeiro_salvar_modulo`, com revisão esperada); não introduza `upsert` direto nem resolva conflitos sobrescrevendo um dos lados. Migrations ficam em `supabase/*.sql` com cabeçalho de problema, efeito, pré-condições e rollback; a situação de cada uma (preparada × aplicada) está em `docs/DATABASE.md`. Nenhum rollback pode recriar políticas abertas a qualquer usuário.

## Comandos de validação existentes

`npm test` executa a suíte Node (inclui testes de banco em PGlite e, se houver PostgreSQL local, um teste de concorrência real); `npm run test:ailos` é o recorte de cobrança. O CI (`.github/workflows/ci.yml`) roda `npm test` em PRs. Confira `package.json` e os próprios testes antes de executar, incluindo dependências e eventuais integrações. Não há scripts de lint ou tipos declarados no package.json inspecionado; registre essa ausência e verifique novamente se o projeto evoluir. Para mudanças só de documentação, revise o diff e use `git diff --check`, sem afirmar validação de comportamento da aplicação.
