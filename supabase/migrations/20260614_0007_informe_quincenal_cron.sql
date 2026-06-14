-- CMMS autónomo · Informe Ejecutivo quincenal — disparo nocturno (día 1 y 15).
--
-- pg_cron no puede llamar HTTP directo → usa pg_net para invocar la Edge Function
-- informe-ejecutivo-cron. La autenticación cron↔función es un secreto compartido
-- guardado en Vault: el cron lo lee y lo pasa por header; la función lo valida con
-- cron_secret_matches() (devuelve boolean, jamás expone el valor). Así no se maneja
-- la service role key ni se expone nada, y no requiere acción del usuario.

create extension if not exists pg_net;

-- Secreto compartido (generado una sola vez; si ya existe, no se toca).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'informe_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text, 'informe_cron_secret', 'Auth cron -> informe-ejecutivo-cron');
  end if;
end $$;

-- Validador sin filtración: la Edge Function (service role) compara el header.
create or replace function public.cron_secret_matches(p text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'informe_cron_secret' and decrypted_secret = p
  );
$$;
revoke execute on function public.cron_secret_matches(text) from public, anon, authenticated;
grant  execute on function public.cron_secret_matches(text) to service_role;

-- Programación quincenal: día 1 y 15, 09:00 UTC. El apikey anon es público
-- (va en el bundle del frontend); el secreto real va en el header x-cron-secret.
select cron.schedule(
  'informe-ejecutivo-quincenal',
  '0 9 1,15 * *',
  $cron$
  select net.http_post(
    url := 'https://nbsufgseirkzkmilsxcq.supabase.co/functions/v1/informe-ejecutivo-cron',
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
