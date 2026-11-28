-- Preserve Vercel preview protection. Store only a Vault reference in private config.
begin;
alter table public.voice_watch_config add column bypass_secret_id uuid;
create function public.voice_watch_headers(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare bypass text; sid uuid; headers jsonb;
begin
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||p_token);
  select bypass_secret_id into sid from public.voice_watch_config where enabled;
  if sid is not null then
    select decrypted_secret into bypass from vault.decrypted_secrets where id=sid;
    if bypass is null or length(bypass)=0 then raise exception 'voice_watch_protection_unavailable'; end if;
    headers:=headers||jsonb_build_object('x-vercel-protection-bypass',bypass);
  end if;
  return headers;
end;$$;
revoke all on function public.voice_watch_headers(text) from public,anon,authenticated;

create or replace function public.dispatch_voice_watches() returns integer
language plpgsql security definer set search_path='' as $$
declare target text; job record; dispatched integer:=0;
begin
  select endpoint into target from public.voice_watch_config where enabled;
  if target is null then return 0; end if;
  for job in select * from public.issue_voice_watch_jobs() loop
    perform net.http_post(url:=target,
      headers:=public.voice_watch_headers(job.token),
      body:='{}'::jsonb,timeout_milliseconds:=90000);
    dispatched:=dispatched+1;
  end loop;
  return dispatched;
end;$$;
revoke all on function public.dispatch_voice_watches() from public,anon,authenticated;

-- Initial dispatch uses a server-owned per-call capability, never a browser token.
-- The session API must await voice_watch_ready before handing SDP to the caller.
create or replace function public.start_voice_watch(p_id uuid,p_token text) returns boolean
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
      headers:=public.voice_watch_headers(job->>'token'),
      body:='{}'::jsonb,timeout_milliseconds:=90000);
  end if;
  return true;
end;$$;

commit;
