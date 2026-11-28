-- Apply only to here-dev together with 0025 until the retention policy is confirmed.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('here-withdrawn-purge','17 3 * * *',$$select public.purge_withdrawn_members()$$);
