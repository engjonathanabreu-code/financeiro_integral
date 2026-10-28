# Escolha do carro e retirada na data da viagem — 28/10/2026

## Diagnóstico confirmado

Base revisada: `origin/main` em `8c4bbbbc0fa99f58015cdb914152ba7fae034e4b`, repositório `engjonathanabreu-code/financeiro_integral`.

A solicitação não oferecia campo de veículo. O filtro de retirada escondia os pedidos de outras datas e mostrava a mesma mensagem para todos os impedimentos. Em consulta somente leitura, a solicitação aprovada mais recente tinha data **29/10/2026**, ainda futura em 28/10. O servidor antigo comparava a data informada da retirada com a solicitação, mas aceitava até 24 horas retroativas: a data corrente do servidor também precisa coincidir.

## Mudança

- Novas solicitações de viagem exigem Gol/HB20 e data; escolha transportada para a viagem gerada na aprovação. Compras e orçamentos continuam sem exigir carro/data.
- Solicitante pode completar somente `vehicleId` de pedido próprio, pendente ou aprovado, que ainda não possua veículo. A comparação de todos os demais campos é exata; autorização, valor, data, identidade, anexos, conversão e histórico são preservados. Alterações concorrentes usam a comparação `p_expected` existente.
- Administrador continua responsável pela aprovação. Nenhuma aprovação automática ou liberação para outro solicitante.
- Retirada exige aprovação, orçamento, conversão e acesso válidos, carro escolhido e igualdade com a data corrente do banco em `America/Sao_Paulo`; a data/hora informada também deve cair nesse dia. Retorno idempotente de um uso já existente é preservado.
- Mensagens por solicitação explicam data futura/passada, pendência de aprovação, carro ausente, orçamento ou vínculo inválido e uso já registrado. Consulta é atualizada antes de abrir a retirada.
- Cabeçalho e botão de envio permanecem acessíveis no formulário de celular.

## Banco e preservação

Migração criada com a CLI instalada (2.119.0): `supabase/migrations/20261028121955_financeiro_veiculos_agendamento.sql`.

Não há escrita em dados existentes, nova tabela, remoção de registro ou alteração de RLS. Substitui as três funções específicas e acrescenta dois auxiliares no schema privado. Mantém ACL das funções existentes. A exceção para completar carro é limitada a usuário ativo, seu próprio pedido sem carro e sem qualquer outra mudança.

Os corpos das três funções originais no banco real foram comparados ao código base por MD5: guard `2741b5b53171f3c19a570ec861222ebb`, save `fbc94cdbded6a5d900e518d9be153b85`, veículos `90b91d2c4d55b4e9193cf2d443390e05`. A migração aborta se encontrar outra versão; não sobrescreve silenciosamente uma publicação posterior.

## Validação executada

- 18 testes Node específicos de veículos/agendamento passaram com SQL executado no PGlite, incluindo autorização, outro usuário, perfil inativo, data adulterada, carro incorreto, concorrência de complemento, foto, devolução, combustível e rollback.
- Suíte geral final: **104 testes, 103 passaram e 1 falha preexistente**. A falha é o checksum legado `legacy-boundary.test.cjs`, reproduzida isoladamente com arquivos extraídos de `origin/main`: checksum calculado `b880f1…` versus esperado `2c8a56…`. Bundle, arquivo legado e checksum não foram alterados.
- Navegador com SQL real em PGlite e rede totalmente interceptada: 48 verificações do módulo em 1440/834/390 px; mais 24 verificações do fluxo novo em 1440/390 px. Formulário, bloqueio de data e retirada foram inspecionados visualmente. Evidências em `docs/qa-veiculos-agendamento/`.
- Solicitações: oito perfis passaram no teste de navegador. Corrigida no fixture a extração da função de navegação existente `isFinanceSector`, sem editar o bundle.
- Sintaxe de 100 arquivos JS e existência de 84 assets verificadas; `git diff --check` limpo.
- As chamadas de banco real foram somente leitura. Nenhuma viagem, uso, foto ou solicitação de teste foi gravada em produção. Testes de navegador usam dados sintéticos; não equivalem a login/Storage autenticado real.
- O teste opcional de PostgreSQL externo foi adaptado, mas não executado nesta sessão (servidor PostgreSQL local não disponível). Não há lint/TypeScript/build de bundler configurados.

## Publicação pendente de autorização

O `AGENTS.md` exige autorização específica para merge/deploy. O PR pode ser revisado; **esta correção ainda não foi aplicada ao banco de produção nem publicada em main**.

Alvos conferidos: Supabase **ERP INTEGRAL Interno** (`ycdsyilyvaxslkwbkxyo`), Vercel **financeiro-integral** (`prj_Yg4ROMWPcptaSMew0sHZh60wCe5Y`, equipe `team_1IhPk56Z4cXnOWUIbwwW29Ep`). Produção anterior READY: `dpl_3NsfoFiHqkNpbQvX2v8iBXm8caxE`; domínio `financeiro-integral.vercel.app`. Sem workflow GitHub Actions no checkout. Branch de produção `main`; publicar a branch de correção gera apenas preview.

Após autorização: reconferir SHA de main, três funções e dados atuais; aplicar somente esta migração ao projeto confirmado, nunca `db push`; comparar hashes/contagens, ACL/RLS e advisors; fazer merge do SHA validado; aguardar READY no commit exato e conferir assets públicos. Completar o carro de qualquer pedido real cabe ao solicitante/ADM, sem inferir Gol ou HB20.

Risco operacional: frontend e banco precisam ser atualizados em sequência; frontend novo depende do painel novo, e novos pedidos na versão antiga não possuem carro. Preparar a publicação antes de aplicar SQL e minimizar esse intervalo.

Rollback autorizado: usar `supabase/rollback/financeiro_veiculos_agendamento.sql` **junto** da reversão do frontend para a versão anterior. Restaura somente os três corpos de função, preservando dados, fotos, escolhas de carro e históricos. Não executar novamente a migração original de criação de tabelas. O rollback foi testado com dados e uso existentes.
