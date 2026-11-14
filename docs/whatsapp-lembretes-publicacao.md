# Lote P0 · Lembretes financeiros por WhatsApp

## Estado conferido em 13/11/2026

O catálogo confirma sete registros históricos com estado `enviado`, a chave única `(pagamento_id, destinatario)`, uma FK do log ao espelho com `ON DELETE CASCADE` e o cron diário às 12h UTC, 9h em Brasília. O cron ativo não envia segredo dedicado. A consulta de auditoria identificou sete vencimentos em 15/11, dos quais um tem ID ausente no espelho. Revalidar essa contagem imediatamente antes da mudança. A execução do job SQL, isoladamente, não comprova entrega no WhatsApp.

A versão ativa do receptor CRM corresponde ao commit `b12d54b55f2e92be1a8c01c2346dda50504b3936` em `engjonathanabreu-code/agente-ia-integral`. O receptor antigo valida contra um hash fixo. A rotação exige publicar o receptor compatível, além de trocar os segredos. O patch foi preparado no checkout isolado do CRM, na branch `codex/rotacao-lembrete-financeiro-20261113`. A rota alternativa legada `finance-due-reminders` passa a responder HTTP 410, impedindo que contorne a reserva. Ela não consta na agenda Vercel do CRM. Nenhum endpoint mutável foi acionado durante o preparo.

## Comportamento do lote

- A Edge Function só aceita POST e valida `x-cron-secret` antes de ler dados, iniciar o cliente Supabase ou chamar o CRM. Preserva a janela de 9h a 9h20 em Brasília. O segredo de entrada é diferente do token do receptor. Telefone e credenciais são configuração protegida.
- A migration `20261113212847_financeiro_whatsapp_reserva.sql` remove a FK ao espelho e acrescenta `reservado_em`, com valor nulo nos registros preexistentes. Preserva a chave única, os IDs, campos e estados antigos e a política de leitura. As RPCs de reserva e finalização são invoker e têm execução concedida somente ao papel de serviço. Retirar o CASCADE preserva logs de contas excluídas do espelho.
- A chave da obrigação é o ID persistido em `accountPayments` mais o destinatário normalizado. O fluxo bloqueia ID ausente ou duplicado para revisão. Nem valor, nem vencimento, nem dados do espelho geram nova identidade.
- Cada POST exige reserva SQL confirmada por `INSERT ... ON CONFLICT DO NOTHING`. Uma reserva começa como `incerto`. Só a resposta positiva do CRM confirma `enviado`. Uma queda antes da confirmação, resposta perdida, timeout ou erro do provedor mantém o bloqueio. Nenhum estado histórico é regravado. O CRM registra a chave determinística nos atributos da mensagem para conciliação. A exclusão mútua é feita no banco do Financeiro antes do POST.
- Uma resposta com `ok: true` do receptor exige retorno de um ID de mensagem do Chatwoot. Isso comprova aceite da mensagem pelo Chatwoot. Confirmação de entrega deve ser verificada no canal. Os retornos e logs operacionais trazem categorias e contagens, sem conteúdo financeiro, telefone ou credenciais.

## Ordem de aplicação após autorização

1. Combine com Operações a janela e a eventual contingência de 15/11. Pause o job existente, valide que não há execução SQL nem chamadas HTTP Edge/CRM em andamento e contenha também o endpoint antigo. A contenção pode ser feita publicando primeiro o CRM seguro sem token configurado ou bloqueando a rota ativa no provedor. A pausa do cron sozinha deixa a função antiga invocável.
2. Faça backup verificável, com restauração ensaiada em ambiente isolado de acesso restrito. Compare antes/depois os IDs, estados e contagens do log e os agregados dos módulos `accountPayments`, `accountMasters` e do espelho. Confira o snapshot dos campos legados do log. Nenhum dado pessoal, token ou extrato deve ir para Git, chat ou fixture. Faça a preparação fora da janela de envio.
3. Provisione dois segredos aleatórios independentes por canal seguro, ambos com pelo menos 32 caracteres. Coloque o novo token `FINANCE_AGENT_TOKEN` no CRM e na Edge Function. Configure o mesmo `FINANCE_REMINDER_PHONE` com dígitos e código do país dos dois lados. Registre o segredo do agendador como `FINANCE_CRON_SECRET` na Edge Function e como `finance_cron_secret` no Vault. Confirme a configuração sem ler ou registrar os valores. O CRM usa o segredo novo exclusivamente e o token antigo deve permanecer revogado.
4. Aplique somente a migration versionada deste lote. Confira que a FK foi removida, o índice único e os registros antigos seguem íntegros, as RPCs existem com ACL correta e a role de serviço conserva acesso. Confira a comparação dos agregados do passo 2.
5. Publique o CRM e a Edge Function seguros. Na função do Supabase, mantenha a configuração de verificação JWT da plataforma desabilitada para este agendador com segredo dedicado. A autenticação obrigatória está no handler. Confirme versões e checksums pelo plano de controle, incluindo a rota legada desativada.
6. Com o cron pausado, aplique o script operacional `supabase/financeiro_whatsapp_agendador.sql`. Ele atualiza o comando do job, preserva o horário, exige um único segredo válido no Vault e não dispara o job. Verifique o comando por presença da referência ao Vault e do cabeçalho, sem consultar o segredo descriptografado.
7. Valide código, ACL, agregados e configuração em leitura. Ensaios de aceite, credencial inválida, falha e sucesso de envio devem usar provedor simulado e dados sintéticos em ambiente isolado. Reative o cron em sua agenda normal somente quando os dois lados, o destino, os segredos e a continuidade operacional estiverem confirmados. Não dispare lembretes em produção para verificar.
8. Após a próxima execução regular, confira a resposta HTTP em `net._http_response` dentro da retenção, os logs da Edge e a contagem de devidos e estados do log e, se necessário, concilie com o Chatwoot. Trate `incerto` como potencialmente enviado. Uma decisão de nova tentativa depende da confirmação no CRM e de autorização operacional. Preserve o registro original e sua evidência.

## Contingência e reversão

Se o lote não puder ser aplicado antes do próximo vencimento, combine a pausa do cron e o bloqueio do receptor antigo. Para voltar ao serviço, use uma revisão com autenticação explícita, segredo novo e reserva compatível. Preserve os logs existentes e as reservas novas. A reversão operacional preferida mantém as RPCs e a coluna aditiva e pausa o cron até corrigir o componente com falha. Restaurar a FK com CASCADE comprometeria logs novos sem espelho ou com espelho removido. Evite restauração integral que sobrescreva alterações posteriores ao backup.

## Testes isolados

`node --test tests/whatsapp-lembretes.test.cjs` exercita autenticação antes de acesso, duas execuções em disputa pela reserva, incompatibilidade com a FK antiga, preservação do log, timeout após aceite, falha de confirmação, perda da resposta da reserva, IDs inválidos ou duplicados, ACL e pré-condições do cron. O PGlite executa o SQL de reserva e finalização e simula as interfaces de cron e Vault.

No checkout do CRM, rode `node --test tests/finance-reminder.test.js` a partir da pasta da aplicação. O provedor simulado verifica segredo ausente, credencial inválida, destinatário e chave, seleção inequívoca de contato, aceite, falha sem retry e rejeição da rota legada sem acessar o provedor. O Deno gerenciado, o Vault e o Chatwoot reais seguem pendentes de validação do ambiente e da publicação autorizada.

Referências oficiais: [Agendamento de Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions) · [Autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth)
