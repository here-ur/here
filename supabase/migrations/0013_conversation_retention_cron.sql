-- Apply only to here-dev together with 0012. Do not delete long-term summaries.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('here-conversation-retention','*/10 * * * *',$$select public.purge_expired_conversations()$$);
