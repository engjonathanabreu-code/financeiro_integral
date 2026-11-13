-- Operação separada da migration do log. Aplicar somente após autorização,
-- com o job pausado, a função segura publicada e o segredo novo já provisionado.
begin;
do $$
declare
  reminder_job bigint;
  job_active boolean;
begin
  select jobid, active into strict reminder_job, job_active
    from cron.job
   where jobname = 'finance-whatsapp-reminders-daily';

  if job_active then
    raise exception 'Pause o agendador antes de trocar a configuração.';
  end if;
  if not (select count(*)=1 and coalesce(bool_and(length(decrypted_secret) >= 32),false)
          from vault.decrypted_secrets where name='finance_cron_secret') then
    raise exception 'O Vault precisa ter exatamente um segredo de agendamento válido.';
  end if;

  perform cron.alter_job(reminder_job, command := $job$
    select net.http_post(
      url := 'https://ycdsyilyvaxslkwbkxyo.supabase.co/functions/v1/finance-whatsapp-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          select min(decrypted_secret)
          from vault.decrypted_secrets
          where name = 'finance_cron_secret'
          having count(*)=1 and bool_and(length(decrypted_secret) >= 32)
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    )
  $job$);
end
$$;
commit;
