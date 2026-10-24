-- Scheduled Edge Function calls: pg_cron starts them, pg_net sends the HTTP request.
-- The functions URL and the shared cron secret live only in Vault (SETUP.md step "Vault"), never here:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'daily_functions_url');
--   select vault.create_secret('<the CRON_SECRET function secret>', 'daily_cron_secret');
-- Until both exist, every job logs a warning and sends nothing.
--
-- pg_cron runs in UTC. The game runs on America/New_York, so each reminder slot fires at both of its
-- possible UTC hours (EDT and EST) and the remind function keeps only the run that matches New York time.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_function(fn text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
  request_id bigint;
begin
  if fn not in ('day-close', 'remind') then
    raise exception 'Unknown scheduled function: %', fn;
  end if;
  select decrypted_secret into base from vault.decrypted_secrets where name = 'daily_functions_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'daily_cron_secret';
  if base is null or secret is null then
    raise warning 'Daily cron: Vault secrets daily_functions_url and daily_cron_secret are not set; % skipped', fn;
    return null;
  end if;
  select net.http_post(
    url := rtrim(base, '/') || '/' || fn,
    body := jsonb_build_object('source', 'cron'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-daily-cron', secret),
    timeout_milliseconds := 30000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.invoke_function(text) from public, anon, authenticated;

-- day-close: hourly. Closes every finished day (22:00 New York) and opens today (05:00); idempotent.
select cron.schedule('daily-day-close', '5 * * * *', $$select private.invoke_function('day-close')$$);

-- remind: the in-page reminder slots (app/daily.js): 19:00 and 21:15 evening, 07:30 morning, New York time.
select cron.schedule('daily-remind-evening', '0 23,0 * * *', $$select private.invoke_function('remind')$$);
select cron.schedule('daily-remind-last-call', '15 1,2 * * *', $$select private.invoke_function('remind')$$);
select cron.schedule('daily-remind-morning', '30 11,12 * * *', $$select private.invoke_function('remind')$$);
