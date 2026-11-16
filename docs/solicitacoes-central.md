# Central de Solicitações do Financeiro Integral

A central substitui a apresentação da aba Solicitações. A fonte dos pedidos e das decisões continua sendo `financeiro_estado_modulos.invoiceRequests`. A aprovação inicial continua usando a transação que cria Viagem, Orçamento ou Compra e Parcela. O conteúdo aprovado e seus vínculos ficam preservados no registro de origem.

## Permissões e estados

| Perfil e situação | Ações disponíveis |
| --- | --- |
| Solicitante em pedido próprio pendente sem vínculo | Editar, cancelar ou apagar logicamente. O histórico registra o autor, a data e as alterações ou o motivo informado. |
| Solicitante em pedido próprio devolvido sem vínculo | Consultar o motivo, corrigir e reenviar para análise ou cancelar. |
| Solicitante em pedido próprio aprovado ou já vinculado | Consultar a decisão original e pedir alteração ou cancelamento para nova análise. |
| ADM em pedido pendente elegível | Iniciar a conferência, devolver com motivo, aprovar pela transação existente ou rejeitar com resposta. |
| ADM em pedido próprio ou de outro usuário autorizado | Organizar por categoria, atribuir ADM ativo, definir prioridade e prazo, comentar internamente e decidir pedidos de revisão. |
| ADM em pedido encerrado | Arquivar ou desarquivar sem alterar a decisão. Recuperar o registro quando houve exclusão lógica. |
| Outro usuário, sessão inativa ou anônimo | Sem acesso ao pedido, às ações, às notificações e aos anexos. |

A conferência explícita reserva a análise por 15 minutos. Outra pessoa pode consultar o pedido durante esse período. Alterações admitidas depois da liberação ainda exigem a revisão e a versão que o autor conferiu. Em caso de conflito, a interface mantém o rascunho para comparação.

A decisão de um pedido de alteração ou cancelamento pós-aprovação é registrada separadamente. A execução de ajustes em viagens, compras, orçamentos, lançamentos ou pagamentos segue o fluxo administrativo do módulo relacionado. A central preserva o registro aprovado até essa execução. Categorias organizacionais são criadas por ADM e reutilizadas quando o mesmo nome for enviado novamente.

As notificações são internas à aba. A leitura identifica o destinatário no servidor, e o atalho abre o pedido após verificar o acesso. Os comentários internos ficam em armazenamento privado e são omitidos pela RPC para solicitantes. O compartilhamento de um endereço da aba também exige sessão com acesso ao pedido.

## Banco, anexos e compatibilidade

- `20261116151526_financeiro_central_solicitacoes.sql` adiciona estado de tramitação, categorias, histórico e destinatários privados. A verificação da versão das funções em produção precede a instalação. O SQL conserva os corpos de envio e de revisão no esquema privado e publica funções compatíveis que aplicam as guardas atuais. A criação das estruturas é aditiva.
- `20261116151615_financeiro_solicitacoes_anexos.sql` cria um bucket privado e uma tabela privada de reservas. PDFs, PNGs e JPEGs de até 20 MB podem ser enviados nos pedidos pendentes ou devolvidos elegíveis. A confirmação verifica o vínculo, o perfil e o original registrado pelo Storage. A política autoriza download autenticado, sem assinatura de links públicos ou alteração de objetos pelo cliente. Uma repetição após perda da resposta reaproveita a reserva. O arquivo em preparação fica em memória durante a sessão da aba. Após recarregar a página, pode ser necessário selecioná-lo novamente.
- O histórico da central e o JSON aprovado ficam separados. Campos organizacionais, comentários, arquivamento e revisão pós-aprovação não reescrevem o objeto convertido. A exclusão lógica preserva também os objetos de Storage. A lista pagina a renderização no navegador e os eventos detalhados são carregados ao abrir um pedido.

## Publicação e reversão

Este lote exige autorização para modificação em produção. Antes de aplicar, conferir o SHA publicado, verificar as assinaturas e a configuração do Storage e registrar um backup novo com restauração bem-sucedida em isolamento. Comparar contagens, hashes, IDs, anexos e vínculos do ERP. Ensaiar as RPCs e o upload/download num ambiente com Storage compatível com produção.

Ordem de publicação proposta:

1. Instalar a migração da central e depois a migração de anexos.
2. Publicar a interface que usa essas RPCs e conferir o SHA no domínio.
3. Conferir o catálogo e os dados com consultas somente leitura. Validar visibilidade por perfil, aprovações históricas e vínculos de Viagens, Orçamentos e Compras. Usar dados sintéticos nas ações de gravação do ensaio.

Se for necessário reverter após uso, voltar a interface e executar o rollback de anexos seguido pelo rollback da central. Os dois scripts suspendem as operações novas e preservam o material registrado. O bucket conserva arquivos e reservas com acesso suspenso. A guarda de aprovação continua a impedir que a interface anterior aprove pedidos devolvidos, excluídos, arquivados ou cancelados. A reversão por snapshot fica reservada ao plano de recuperação com conciliação das gravações posteriores.

## Validação e situação

A base local corresponde ao merge publicado `b9697f6`. Em produção foram feitas somente consultas de leitura. O inventário registrou 40 pedidos, sendo 30 aprovados, 8 rejeitados e 2 pendentes. As duas versões novas estavam ausentes do catálogo e as quatro funções substituídas correspondiam aos hashes esperados pela migração.

Os 229 testes automatizados Node passaram. A suíte cobre regras de acesso e conflitos, conversões, anexo, compatibilidade do pedido legado, instalação aditiva e reversão. O ensaio independente em PostgreSQL 17, com duas conexões, confirmou que gravações concorrentes têm um único vencedor, a aprovação não converte parcialmente e a instalação mantém o JSON existente. A validação de navegador usa Chromium, dados sintéticos e o PostgreSQL do PGlite para as RPCs. O roteiro cobre menus, teclas de navegação, histórico, devolução, reenvio, arquivo, exclusão recuperável, notificações, preservação dos vínculos e a paginação de 51 itens. O ensaio verificou a interface em 390, 768 e 1.440 px. As capturas de 390 e 1.440 px foram inspecionadas visualmente. Também passaram oito combinações do roteiro legado de Solicitações e 16 verificações de Veículos. O teste de anexos usa as políticas SQL reais e simula o transporte de bytes do Storage; a API do Storage deve ser exercitada no ensaio que precede a publicação. [Controle de acesso do Supabase Storage](https://supabase.com/docs/guides/storage/security/access-control)

O lote está implementado na branch local `codex/evolucao-solicitacoes`, com migrações e rollback separados. A produção continua no commit anterior à central.
