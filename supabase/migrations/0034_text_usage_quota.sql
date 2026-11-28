-- New product allowance starts at zero. Historical shared API counters stay intact.
-- A server-generated capability owns each reservation; it is never sent to the browser.
create table public.text_usage_requests (
  user_id uuid not null references public.members(user_id) on delete cascade,
  id uuid not null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  usage_day date not null,
  state text not null default 'pending' check (state in ('pending','completed','failed')),
  expires_at timestamptz not null,
  primary key(user_id,id)
);
create index text_usage_requests_day on public.text_usage_requests(user_id,usage_day);
alter table public.text_usage_requests enable row level security;
revoke all on public.text_usage_requests from public,anon,authenticated;

create function public.text_usage_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  stamp timestamptz := clock_timestamp();
  today date := (stamp at time zone 'Asia/Seoul')::date;
  completed integer;
  reserved integer;
begin
  if uid is null or not exists(select 1 from public.members where user_id=uid and withdrawn_at is null) then return null; end if;
  select count(*) filter(where state='completed'),
    count(*) filter(where state='pending' and expires_at>stamp)
    into completed,reserved from public.text_usage_requests where user_id=uid and usage_day=today;
  return jsonb_build_object('limit',40,'used',completed,'reserved',reserved,
    'reset_at',extract(epoch from ((today+1)::timestamp at time zone 'Asia/Seoul'))::bigint);
end;
$$;

-- Current/previous day retention is enforced on reservation; status does not mutate usage.

create function public.reserve_text_usage(p_id uuid,p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  stamp timestamptz := clock_timestamp();
  today date := (stamp at time zone 'Asia/Seoul')::date;
  s jsonb;
  previous public.text_usage_requests%rowtype;
begin
  if uid is null or not exists(select 1 from public.members where user_id=uid and withdrawn_at is null) then raise exception 'member_required'; end if;
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,30));
  -- Only current/previous Korean day metadata is needed; no conversation content is stored.
  delete from public.text_usage_requests where user_id=uid and usage_day<today-1 and expires_at<stamp;
  select * into previous from public.text_usage_requests where user_id=uid and id=p_id;
  if found then
    if previous.token_hash<>p_token_hash then raise exception 'reservation_conflict'; end if;
    return jsonb_build_object('allowed',previous.state='pending' and previous.expires_at>stamp,'retry_after',1);
  end if;
  s := public.text_usage_status();
  if (s->>'used')::integer + (s->>'reserved')::integer >= 40 then
    return jsonb_build_object('allowed',false,'retry_after',
      case when (s->>'used')::integer>=40 then greatest(1,(s->>'reset_at')::bigint-floor(extract(epoch from stamp))::bigint) else 5 end,
      'code',case when (s->>'used')::integer>=40 then 'text_daily_limit' else 'text_in_progress' end);
  end if;
  -- Longer than /api/chat's hard 120s route duration and its 45s provider timeout.
  insert into public.text_usage_requests(user_id,id,token_hash,usage_day,expires_at)
    values(uid,p_id,p_token_hash,today,stamp+interval '180 seconds');
  return jsonb_build_object('allowed',true,'retry_after',0);
end;
$$;

create function public.finish_text_usage(p_id uuid,p_token text,p_success boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  entry public.text_usage_requests%rowtype;
  target text := case when p_success then 'completed' else 'failed' end;
begin
  if uid is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_success is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,30));
  select * into entry from public.text_usage_requests where user_id=uid and id=p_id;
  if not found or entry.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then return false; end if;
  if entry.state<>'pending' then return entry.state=target; end if;
  if entry.expires_at<=clock_timestamp() then return false; end if;
  update public.text_usage_requests set state=target where user_id=uid and id=p_id;
  return true;
end;
$$;

revoke all on function public.text_usage_status() from public,anon,authenticated;
revoke all on function public.reserve_text_usage(uuid,text) from public,anon,authenticated;
revoke all on function public.finish_text_usage(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.text_usage_status() to authenticated;
grant execute on function public.reserve_text_usage(uuid,text) to authenticated;
grant execute on function public.finish_text_usage(uuid,text,boolean) to authenticated;

-- Text requests have a separate burst guard. Auxiliary chat calls keep their old guard.
alter table public.api_usage_windows drop constraint api_usage_windows_resource_check;
alter table public.api_usage_windows add constraint api_usage_windows_resource_check
  check(resource in ('chat','realtime','voice_memory','home_greeting','text_request'));
create or replace function public.api_quota_limits(p_resource text) returns integer[]
language sql immutable set search_path = '' as $$
  select case p_resource
    when 'chat' then array[20,200]
    when 'text_request' then array[20,2147483647]
    when 'realtime' then array[5,60]
    when 'voice_memory' then array[60,2000]
    when 'home_greeting' then array[10,100]
    else null end
$$;
