-- PREPARADA, NÃO APLICADA. FIN-06 — agendador autenticado do lembrete WhatsApp.
-- Ordem (cada passo com autorização): 1) criar o segredo no Vault e o mesmo valor em
-- FINANCE_CRON_SECRET da Edge Function (fora do repositório; nunca registrar o valor);
-- 2) aplicar financeiro_whatsapp_reserva_20261021.sql; 3) publicar a Edge Function nova;
-- 4) aplicar este arquivo. Entre 3 e 4 a chamada do agendador recebe 401 e nada é enviado — faça
-- os passos 3 e 4 fora da janela 09:00–09:20 (horário de Brasília).
--
-- Criação do segredo (exemplo; gere o valor fora do chat e do repositório):
--   select vault.create_secret('<valor aleatório de 32+ bytes>', 'finance_cron_secret', 'Agendador finance-whatsapp-reminders');

do $$
declare job bigint;
begin
  select jobid into job from cron.job where jobname = 'finance-whatsapp-reminders-daily';
  if job is null then raise exception 'Agendamento finance-whatsapp-reminders-daily não encontrado.'; end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'finance_cron_secret') then
    raise exception 'Crie o segredo finance_cron_secret no Vault antes de alterar o agendamento.';
  end if;
  perform cron.alter_job(job, command := $cmd$
    select net.http_post(
      url := 'https://ycdsyilyvaxslkwbkxyo.supabase.co/functions/v1/finance-whatsapp-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'finance_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000)
  $cmd$);
end $$;

-- Rollback: cron.alter_job com o comando anterior (sem cabeçalho) só faz sentido junto com o
-- rollback da Edge Function; a função nova recusa chamadas sem segredo (401) e não envia nada.
