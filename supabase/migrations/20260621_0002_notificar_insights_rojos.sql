-- CMMS autónomo · Aviso por correo de insights ROJOS del Vigilante.
--
-- El Vigilante (_gen_insights, 07:30 UTC) ya persiste su veredicto en `insights`.
-- Aquí se agrega el aviso automático: un cron a las 08:15 UTC invoca la Edge
-- Function notificar-insights (vía pg_net), que envía un correo a la gerencia de
-- cada empresa con alertas de severidad 'red' del día.
--
-- Auth cron↔función: reutiliza el secreto compartido `informe_cron_secret` del
-- Vault (ya creado por 20260614_0007) y su validador cron_secret_matches().
-- La función queda dormante hasta que exista el secreto RESEND_API_KEY.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotencia del aviso: marca cuándo se notificó cada insight para no
-- reenviar el mismo correo si el cron se reintenta dentro del día.
alter table public.insights
  add column if not exists notificado_en timestamptz;

-- Programación diaria: 08:15 UTC (tras _gen_insights 07:30 y la generación de
-- OTs de las 08:00). El apikey anon es público (va en el bundle del frontend);
-- el secreto real viaja en el header x-cron-secret.
select cron.schedule(
  'notificar-insights-rojos',
  '15 8 * * *',
  $cron$
  select net.http_post(
    url := 'https://nbsufgseirkzkmilsxcq.supabase.co/functions/v1/notificar-insights',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ic3VmZ3NlaXJremttaWxzeGNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTY2OTUsImV4cCI6MjA5NTM5MjY5NX0.adQF4VA-luvoWUxQ1lRLIkDCzBZWvsX31Xf2u7-zVDY',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'informe_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
