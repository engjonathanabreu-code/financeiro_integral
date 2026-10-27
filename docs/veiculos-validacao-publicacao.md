# Validação e plano de publicação — Veículos

Em 27/10/2026 foi recebida autorização explícita para PR, merge, publicação do módulo e aplicação da sua migração aditiva. Isso não autoriza migrações pendentes de outros módulos nem alterações em dados/permissões antigas.

## Alvos verificados antes da publicação

- GitHub: `engjonathanabreu-code/financeiro_integral`, repositório ID `1342222994`, branch de produção `main`.
- Base remota conferida: `5d287a7560343f2f701dd3160374a00f44959f0e`.
- Vercel: `financeiro-integral`, projeto `prj_Yg4ROMWPcptaSMew0sHZh60wCe5Y`, equipe `team_1IhPk56Z4cXnOWUIbwwW29Ep`.
- Produção atual: `https://financeiro-integral.vercel.app`, deploy anterior `dpl_Aouv3LKZtVkvTc6YiSBpXtjLiZwv`, READY, ligado à base `5d287a7`.
- Supabase: **ERP INTEGRAL Interno**, projeto `ycdsyilyvaxslkwbkxyo`, PostgreSQL 17.6. A configuração do frontend e das APIs aponta para esse projeto. Não é Financeiro MCL. O banco é compartilhado com outros módulos; apenas recursos novos de veículos podem ser criados.
- Conferidos no schema real: campos necessários de `profiles`, `financeiro_estado_modulos`, `financeiro_arquivos` e `storage.objects`; funções `is_admin`/`is_active_user`; guard ativo e RPC existentes de Solicitações. Recursos `financeiro_veiculos*` ainda não existiam no preflight.

## Validação adicional real

Foi localizado e reutilizado PostgreSQL **17.6** já instalado. Cluster descartável com autenticação local sem senha, exclusivamente em socket Unix privado de permissão 0700; `listen_addresses=''`. Nenhuma porta TCP, serviço remoto, conta ou credencial criada.

`scripts/test-veiculos-postgres.cjs` executou **9 cenários reais**. **4 bloqueios entre backends independentes** foram comprovados por `pg_stat_activity` e `pg_blocking_pids`: retiradas concorrentes, reenvio com mesmo UUID, devoluções concorrentes e disputa da retirada com decisão ADM em Solicitações. A segunda retirada esperou a transação e foi recusada; reenvio/devolução conservaram registros/fotos únicos.

A migração foi executada nesse PostgreSQL. Comparações antes/depois confirmaram preservação das tabelas, dados JSON, funções/grants antigos e políticas de Storage do fixture. RLS, chamadas como anônimo/inativo/colaborador/Financeiro/ADM, escrita direta, arquivos e relatos privados foram testados com a role `authenticated` real. O fluxo foi Pendente → decisão ADM pela RPC existente → conversão consistente → retirada; colaborador não conseguiu aprovar.

Evidências: [postgres-real.json](qa-veiculos/postgres-real.json). Os perfis/auth.uid e tabelas de suporte são fixtures sintéticos; esse teste não equivale a login JWT via Supabase Auth. Sem Docker/daemon ou Supabase Storage local disponível. A CLI Supabase localizada falhou ao tentar gravar telemetria fora da área permitida e não foi usada para instalar ou subir serviços. `storage.objects` no teste é fixture, não serviço HTTP; uploads/downloads HTTP reais de Storage continuam não executados. Fotos novas ficam em tabela privada via RPC, não em bucket novo.

## Integração da base remota e regressões

O rebase incorporou os PRs anteriores de parcelas, inadimplência, fronteira do legado e protocolo de engenharia. O conflito de `index.html` foi resolvido preservando os scripts anteriores e adicionando os do módulo novo.

O bundle e `patch-v8.js` permanecem **idênticos à base remota**. A navegação nova usa uma ponte no próprio módulo; não há reativação do código de RH arquivado nem edição do checksum histórico.

- 48 verificações de navegador passaram novamente na base remota, com rede interceptada, dados sintéticos e viewports 1440/834/390.
- Sintaxe: 100 arquivos JS e 84 assets locais conferidos; os três arquivos `.mjs` da base também passaram em `node --check`.
- Suíte após atualização: 99 testes, **98 passaram e 1 falhou**. Falha preexistente: `legacy-boundary.test.cjs` espera checksum `2c8a56…`, mas reconstruir os blobs da `origin/main` limpa também produz `b880f1…`. A igualdade dos arquivos ativo/arquivado com a base foi comprovada. O checksum não foi alterado para mascarar a falha. Os 13 testes novos passaram.
- Não há workflow GitHub Actions no checkout atual. Os checks remotos e o deploy Vercel serão verificados no SHA exato do PR.
- Sem configuração ESLint/TypeScript/build de bundler. Não se declara que esses checks passaram.

## Operação planejada

1. Revisar diff final, guardar evidências, confirmar a base remota e publicar somente a branch do módulo. Abrir PR; conferir SHA e checks do preview.
2. Capturar hashes/contagens agregadas dos módulos antigos, ACL/políticas e funções de autorização. Não exportar fotos, conteúdo financeiro ou dados pessoais.
3. Aplicar **somente** `supabase/financeiro_veiculos.sql`, pelo `apply_migration` do projeto `ycdsyilyvaxslkwbkxyo`, nome `financeiro_veiculos_20261027`. Nunca `db push`; não aplicar arquivos pendentes ou o rollback.
4. Conferir versão registrada, cinco tabelas/RLS/grants/RPC novos, apenas os carros Gol/HB20 como seeds, zero usos/relatos de teste; comparar hashes antigos e advisors. Sem criar viagem ou denúncia fictícia em produção.
5. Fazer merge apenas do SHA validado, aguardar READY e confirmar deploy/alias/commit esperado. QA HTTP somente leitura: assets e proteção de APIs; não fabricar dados reais nem enviar fotos ao provedor.

Riscos conhecidos: dependência da proteção existente de Solicitações (verificada e exigida pela RPC); solicitações antigas sem data/valor/conversão ficam bloqueadas; ausência de teste HTTP autenticado com sessão real; tamanho/crescimento da tabela privada de fotos deve ser acompanhado. A migração não reescreve módulos antigos nem amplia suas políticas.

## Rollback não destrutivo

Se a validação pós-migração falhar, não liberar o frontend novo. Manter as tabelas novas e evidências. `supabase/financeiro_veiculos_rollback_nao_destrutivo.sql` revoga execução somente das duas funções novas que expõem operações; não apaga nada.

Se houver falha após deploy, restaurar o alias para `dpl_Aouv3LKZtVkvTc6YiSBpXtjLiZwv` e, se necessário, bloquear as RPCs novas pelo rollback acima. Não reverter dados de Solicitações, viagens, combustível, perfis ou outros sistemas. Reativação exige revisão do problema e concessão explícita de execução somente das funções novas.

O resultado efetivo de PR/deploy/migração será registrado após confirmação das ferramentas. Este documento descreve o preflight e o plano; não é prova de publicação concluída.
