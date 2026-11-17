-- Apply only to here-dev after deploying /api/internal/conversation-worker.
-- No private message content or reusable service key in outgoing HTTP requests.
begin;
create extension if not exists pg_net with schema extensions;
-- Extension internals may have permissive defaults; tokens must never be browser-readable.
revoke all on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all sequences in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
create function public.dispatch_conversation_work() returns integer
language plpgsql security definer set search_path='' as $$
declare job record; request bigint; dispatched integer:=0;
begin
 for job in select * from public.issue_conversation_work() loop
  select net.http_post(
   url:='https://here-dev.vercel.app/api/internal/conversation-worker',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||job.token),
   body:='{}'::jsonb,timeout_milliseconds:=60000) into request;
  update public.conversation_worker_runs set request_id=request where id=job.run_id;
  dispatched:=dispatched+1;
 end loop;
 return dispatched;
end;$$;
revoke all on function public.dispatch_conversation_work() from public,anon,authenticated;
select cron.schedule('here-conversation-worker','*/5 * * * *','select public.dispatch_conversation_work()');
commit;
