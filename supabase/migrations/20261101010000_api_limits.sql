-- Apply to here-dev first. Fixed per-member windows, shared by every server instance.
-- No message content, phone number, IP, token, or external provider response stored.
create table public.api_usage_windows (
  user_id uuid not null references public.members(user_id) on delete cascade,
  resource text not null check (resource in ('chat','realtime','voice_memory','home_greeting')),
  window_seconds integer not null check (window_seconds in (60,86400)),
  window_start bigint not null,
  used integer not null check (used >= 0),
  primary key(user_id,resource,window_seconds)
);
alter table public.api_usage_windows enable row level security;
revoke all on public.api_usage_windows from public,anon,authenticated;

create function public.consume_api_quota(p_resource text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  limits integer[];
  spans integer[] := array[60,86400];
  stamp bigint := floor(extract(epoch from clock_timestamp()));
  start_at bigint;
  count_used integer;
  wait_for integer := 0;
  i integer;
begin
  if uid is null or not exists(select 1 from public.members where user_id=uid) then
    return jsonb_build_object('allowed',false,'retry_after',60);
  end if;
  limits := case p_resource
    when 'chat' then array[20,200]
    when 'realtime' then array[5,60]
    when 'voice_memory' then array[60,2000]
    when 'home_greeting' then array[10,100]
    else null end;
  if limits is null then raise exception 'invalid_resource'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 8));
  for i in 1..2 loop
    start_at := (stamp / spans[i]) * spans[i];
    select used into count_used from public.api_usage_windows
      where user_id=uid and resource=p_resource and window_seconds=spans[i] and window_start=start_at;
    if coalesce(count_used,0) >= limits[i] then
      wait_for := greatest(wait_for,(start_at+spans[i]-stamp)::integer);
    end if;
  end loop;
  if wait_for > 0 then return jsonb_build_object('allowed',false,'retry_after',wait_for); end if;
  for i in 1..2 loop
    start_at := (stamp / spans[i]) * spans[i];
    insert into public.api_usage_windows(user_id,resource,window_seconds,window_start,used)
      values(uid,p_resource,spans[i],start_at,1)
    on conflict(user_id,resource,window_seconds) do update set
      used=case when public.api_usage_windows.window_start=excluded.window_start then public.api_usage_windows.used+1 else 1 end,
      window_start=excluded.window_start;
  end loop;
  return jsonb_build_object('allowed',true,'retry_after',0);
end;
$$;
revoke all on function public.consume_api_quota(text) from public,anon,authenticated;
grant execute on function public.consume_api_quota(text) to authenticated;
