-- Apply only to here-dev together with 0027. Bans withdrawals whose 7-day grace period ended.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('here-withdrawal-finalize','7 * * * *',$$select public.finalize_withdrawals()$$);
