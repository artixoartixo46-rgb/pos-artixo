-- Multi-cloud backup redundancy, destination 1: Supabase Storage.
-- A second, independent copy of the full DB export living in Storage (not just Postgres tables) -
-- protects against accidental table drops / bad migrations / RLS mistakes, since it's a separate
-- subsystem from the database itself. The backup-redundancy edge function (deployed separately)
-- writes/reads this bucket using the service role, so no public storage policy is needed - the
-- bucket stays private and is never exposed to anon/authenticated clients directly.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- Automatic daily trigger: pg_cron calls the backup-redundancy edge function once a day so the
-- redundant copy stays fresh without anyone having to remember to click a button. pg_net is what
-- lets a cron job make an outbound HTTP call from inside Postgres.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Unschedule any previous run of this job name so re-running this migration is idempotent.
select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-backup-redundancy';

-- Runs at 02:00 UTC (07:30 Sri Lanka time) every day - quiet hours for a wholesale grocery shop.
-- 'apikey'/'Authorization' just need to be a valid publishable key to pass the edge function
-- gateway (this is the same publishable key already shipped in the deployed frontend bundle, so
-- embedding it here doesn't expose anything new). The real protection is the x-backup-secret
-- header, checked inside the function itself against a value only known to this migration and
-- the function's own deploy-time secret (set separately via `supabase secrets set`).
select cron.schedule(
  'daily-backup-redundancy',
  '0 2 * * *',
  $$
  select net.http_post(
    url := 'https://mzhswztggmwdhdieatmj.supabase.co/functions/v1/backup-redundancy',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_m2jToTMhzUrTvH7OHUtj2g_j_oJHPbe',
      'Authorization', 'Bearer sb_publishable_m2jToTMhzUrTvH7OHUtj2g_j_oJHPbe',
      'x-backup-secret', '02f21ed518e690dc9fb0774e9836f2393fad78eda5cb37a6'
    ),
    body := '{}'::jsonb
  );
  $$
);
