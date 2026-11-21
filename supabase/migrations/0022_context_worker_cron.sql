-- Deploy the endpoint and apply 0021 on here-dev first. Uses the existing pg_net/cron setup.
begin;
create function public.dispatch_context_work() returns integer
language plpgsql security definer set search_path='' as $$
declare job record; dispatched integer:=0;
begin
 for job in select * from public.issue_context_work() loop
  perform net.http_post(url:='https://here-dev.vercel.app/api/internal/context-worker',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||job.token),
   body:='{}'::jsonb,timeout_milliseconds:=60000);
  dispatched:=dispatched+1;
 end loop;
 return dispatched;
end;$$;
revoke all on function public.dispatch_context_work() from public,anon,authenticated;
-- UTC 18:00–20:55 = Asia/Seoul 03:00–05:55. At most two members per dispatch.
select cron.schedule('here-context-maintenance','*/5 18-20 * * *','select public.dispatch_context_work()');
commit;
