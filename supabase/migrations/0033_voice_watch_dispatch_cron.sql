-- No paid calls are enabled by this migration. Configure a verified development
-- endpoint and enable dispatch only after deploying the worker and testing it.
begin;
create table public.voice_watch_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  endpoint text check(endpoint ~ '^https://[a-zA-Z0-9-]+\.vercel\.app/api/internal/voice-watch$'),
  check(not enabled or endpoint is not null)
);
insert into public.voice_watch_config(singleton) values(true);
alter table public.voice_watch_config enable row level security;
revoke all on public.voice_watch_config from public,anon,authenticated;

create function public.dispatch_voice_watches() returns integer
language plpgsql security definer set search_path='' as $$
declare target text; job record; dispatched integer:=0;
begin
  select endpoint into target from public.voice_watch_config where enabled;
  if target is null then return 0; end if;
  for job in select * from public.issue_voice_watch_jobs() loop
    perform net.http_post(url:=target,
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||job.token),
      body:='{}'::jsonb,timeout_milliseconds:=90000);
    dispatched:=dispatched+1;
  end loop;
  return dispatched;
end;$$;
revoke all on function public.dispatch_voice_watches() from public,anon,authenticated;

-- Initial dispatch uses a server-owned per-call capability, never a browser token.
-- The session API must await voice_watch_ready before handing SDP to the caller.
create function public.start_voice_watch(p_id uuid,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare target text; job jsonb;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or not exists(
    select 1 from public.voice_usage_sessions where id=p_id and state in ('active','closing')
      and token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
  ) then return false; end if;
  select endpoint into target from public.voice_watch_config where enabled;
  if target is null then return false; end if;
  job:=public.issue_voice_watch(p_id);
  if job is not null then
    perform net.http_post(url:=target,
      headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(job->>'token')),
      body:='{}'::jsonb,timeout_milliseconds:=90000);
  end if;
  return true;
end;$$;

create function public.voice_watch_ready(p_id uuid,p_token text) returns boolean
language sql security definer set search_path='' as $$
  select p_token ~ '^[a-f0-9]{64}$' and exists(
    select 1 from public.voice_usage_sessions s join public.voice_watch_jobs w on w.call_id=s.id
    where s.id=p_id and s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and s.state='active' and s.close_requested_at is null and s.deadline_at>clock_timestamp()
      and w.finished_at is null and w.attached_at is not null
      and w.heartbeat_at>clock_timestamp()-interval '5 seconds'
      and w.run_until>clock_timestamp()+interval '10 seconds'
  );
$$;
revoke all on function public.start_voice_watch(uuid,text),public.voice_watch_ready(uuid,text) from public,anon,authenticated;
grant execute on function public.start_voice_watch(uuid,text),public.voice_watch_ready(uuid,text) to anon,authenticated;

-- An idle or disabled installation sends no HTTP requests. Existing jobs are untouched.
select cron.schedule('here-voice-watch','10 seconds','select public.dispatch_voice_watches()');
commit;
