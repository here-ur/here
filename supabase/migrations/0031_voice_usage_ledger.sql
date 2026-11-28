-- Ledger only: the Live route stays unchanged until server-side termination is verified.
-- No provider calls, cron jobs or existing usage counters are changed by this migration.
-- A dedicated server secret authorizes issuing a per-call capability. Otherwise a
-- browser could mint its own capability and forge a provider session ID for a worker.
-- Provision its hash separately; a fresh migration cannot enable paid voice work.
create table public.voice_control_authority (
  singleton boolean primary key default true check(singleton),
  token_hash text check(token_hash ~ '^[a-f0-9]{64}$')
);
insert into public.voice_control_authority(singleton) values(true);
alter table public.voice_control_authority enable row level security;
revoke all on public.voice_control_authority from public,anon,authenticated;

create table public.voice_usage_sessions (
  id uuid primary key,
  user_id uuid not null references public.members(user_id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  state text not null check (state in ('reserved','creating','active','closing','closed','cancelled')),
  reserved_at timestamptz not null default clock_timestamp(),
  reservation_expires_at timestamptz not null,
  provider_session_id text,
  started_at timestamptz,
  deadline_at timestamptz,
  close_requested_at timestamptz,
  ended_at timestamptz,
  check (started_at is null or started_at >= reserved_at),
  check (deadline_at is null or (started_at is not null and deadline_at >= started_at and deadline_at <= started_at + interval '300 seconds')),
  check (ended_at is null or (started_at is not null and ended_at >= started_at)),
  check (state not in ('active','closing','closed') or (provider_session_id is not null and started_at is not null and deadline_at is not null)),
  check (state <> 'closed' or ended_at is not null)
);
create unique index voice_usage_one_open_call on public.voice_usage_sessions(user_id)
  where state in ('reserved','creating','active','closing');
create index voice_usage_user_time on public.voice_usage_sessions(user_id,started_at);
alter table public.voice_usage_sessions enable row level security;
revoke all on public.voice_usage_sessions from public,anon,authenticated;

-- Private clock-parameterized calculation; clients cannot supply a different clock/user.
-- Intersections split usage at Korean day/month boundaries without per-call rounding.
create function public.voice_usage_at(p_user_id uuid,p_at timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('day',p_at at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as day_start,
      date_trunc('month',p_at at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as month_start
  ), totals as (
    select coalesce(sum(greatest(0,extract(epoch from
      least(coalesce(s.ended_at,p_at),p_at) - greatest(s.started_at,b.day_start)))),0) as day_used,
      coalesce(sum(greatest(0,extract(epoch from
      least(coalesce(s.ended_at,p_at),p_at) - greatest(s.started_at,b.month_start)))),0) as month_used
    from public.voice_usage_sessions s cross join bounds b
    where s.user_id=p_user_id and s.started_at is not null and s.state in ('active','closing','closed')
      and coalesce(s.ended_at,p_at)>b.month_start and s.started_at<p_at
  )
  select jsonb_build_object('call_limit_seconds',300,
    'day',jsonb_build_object('limit_seconds',600,'used_seconds',t.day_used,
      'reset_at',extract(epoch from ((date_trunc('day',p_at at time zone 'Asia/Seoul')+interval '1 day') at time zone 'Asia/Seoul'))),
    'month',jsonb_build_object('limit_seconds',1800,'used_seconds',t.month_used,
      'reset_at',extract(epoch from ((date_trunc('month',p_at at time zone 'Asia/Seoul')+interval '1 month') at time zone 'Asia/Seoul'))),
    'active_call',exists(select 1 from public.voice_usage_sessions s where s.user_id=p_user_id
      and (s.state in ('creating','active','closing') or (s.state='reserved' and s.reservation_expires_at>p_at))))
  from bounds b cross join totals t
$$;
revoke all on function public.voice_usage_at(uuid,timestamptz) from public,anon,authenticated;

create function public.voice_usage_status() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists(select 1 from public.members where user_id=uid and withdrawn_at is null) then return null; end if;
  return public.voice_usage_at(uid,clock_timestamp());
end;
$$;

-- Only reservations that never began a provider request may expire automatically.
create function public.reserve_voice_usage(p_id uuid,p_token_hash text,p_authority_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); stamp timestamptz; usage jsonb; remaining integer; old public.voice_usage_sessions;
begin
  if uid is null or not exists(select 1 from public.members where user_id=uid and withdrawn_at is null) then raise exception 'member_required'; end if;
  if p_authority_token is null or p_authority_token !~ '^[a-f0-9]{64}$' or not exists(
    select 1 from public.voice_control_authority where token_hash=encode(sha256(convert_to(p_authority_token,'UTF8')),'hex')
  ) then return jsonb_build_object('allowed',false,'code','voice_control_unavailable'); end if;
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,31));
  stamp:=clock_timestamp();
  update public.voice_usage_sessions set state='cancelled'
    where user_id=uid and state='reserved' and reservation_expires_at<=stamp;
  select * into old from public.voice_usage_sessions where id=p_id;
  if found then
    if old.user_id<>uid or old.token_hash<>p_token_hash then raise exception 'reservation_conflict'; end if;
    -- A retry must not create a second provider session from the same reservation.
    return jsonb_build_object('allowed',old.state='reserved','code','voice_reservation_exists');
  end if;
  usage:=public.voice_usage_at(uid,stamp);
  if (usage->>'active_call')::boolean then return jsonb_build_object('allowed',false,'code','voice_call_active'); end if;
  remaining:=floor(least(300,600-(usage->'day'->>'used_seconds')::numeric,1800-(usage->'month'->>'used_seconds')::numeric));
  if remaining<1 then
    return jsonb_build_object('allowed',false,'code',case when floor(1800-(usage->'month'->>'used_seconds')::numeric)<1 then 'voice_monthly_limit' else 'voice_daily_limit' end);
  end if;
  insert into public.voice_usage_sessions(id,user_id,token_hash,state,reservation_expires_at)
    values(p_id,uid,p_token_hash,'reserved',stamp+interval '60 seconds');
  return jsonb_build_object('allowed',true,'max_seconds',remaining);
end;
$$;

-- Single-use gate immediately before the paid provider request. A crash from this
-- point leaves the account blocked for recovery, never silently opens another call.
create function public.begin_voice_usage(p_id uuid,p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare entry public.voice_usage_sessions;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
  select * into entry from public.voice_usage_sessions where id=p_id for update;
  if not found or entry.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') or entry.state<>'reserved'
    or entry.reservation_expires_at<=clock_timestamp()
    or not exists(select 1 from public.members where user_id=entry.user_id and withdrawn_at is null) then return false; end if;
  update public.voice_usage_sessions set state='creating' where id=p_id;
  return true;
end;
$$;

-- p_started_at must come from the server's provider observation, never browser input.
create function public.activate_voice_usage(p_id uuid,p_token text,p_provider_id text,p_started_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare entry public.voice_usage_sessions; usage jsonb; remaining integer;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_provider_id is null or p_provider_id !~ '^[a-zA-Z0-9_-]{1,200}$' then return null; end if;
  select * into entry from public.voice_usage_sessions where id=p_id for update;
  if not found or entry.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then return null; end if;
  if entry.state in ('active','closing') and entry.provider_session_id=p_provider_id and entry.started_at=p_started_at then
    return jsonb_build_object('deadline_at',extract(epoch from entry.deadline_at),'close_requested',entry.close_requested_at is not null);
  end if;
  if entry.state<>'creating' or p_started_at is null or p_started_at<entry.reserved_at or p_started_at>clock_timestamp() then return null; end if;
  usage:=public.voice_usage_at(entry.user_id,p_started_at);
  remaining:=greatest(0,floor(least(300,600-(usage->'day'->>'used_seconds')::numeric,1800-(usage->'month'->>'used_seconds')::numeric)));
  if remaining=0 or not exists(select 1 from public.members where user_id=entry.user_id and withdrawn_at is null) then
    entry.close_requested_at:=clock_timestamp();
  end if;
  update public.voice_usage_sessions set provider_session_id=p_provider_id,started_at=p_started_at,
    deadline_at=p_started_at+make_interval(secs=>remaining),close_requested_at=entry.close_requested_at,
    state=case when entry.close_requested_at is null then 'active' else 'closing' end
    where id=p_id returning * into entry;
  return jsonb_build_object('deadline_at',extract(epoch from entry.deadline_at),'close_requested',entry.close_requested_at is not null);
end;
$$;

-- User stop is a request, not proof of provider closure. It cannot refund usage or release the lock.
create function public.request_voice_close(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.voice_usage_sessions set close_requested_at=coalesce(close_requested_at,clock_timestamp()),
    state=case when state='reserved' then 'cancelled' when state='active' then 'closing' else state end
    where id=p_id and user_id=auth.uid() and state in ('reserved','creating','active','closing');
  return found;
end;
$$;

-- Called only with server-owned capability after session.closed. The interval is
-- actual observed duration, including overrun, rather than clamping away failures.
create function public.finish_voice_usage(p_id uuid,p_token text,p_ended_at timestamptz) returns boolean
language plpgsql security definer set search_path = '' as $$
declare entry public.voice_usage_sessions;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
  select * into entry from public.voice_usage_sessions where id=p_id for update;
  if not found or entry.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then return false; end if;
  if entry.state='closed' then return entry.ended_at=p_ended_at; end if;
  if entry.state not in ('active','closing') or p_ended_at is null or p_ended_at<entry.started_at or p_ended_at>clock_timestamp() then return false; end if;
  update public.voice_usage_sessions set ended_at=p_ended_at,state='closed' where id=p_id;
  return true;
end;
$$;

-- Only use after definite provider rejection / before a provider request. A lost
-- response or timeout is not evidence of rejection and must remain blocked.
create function public.cancel_voice_creation(p_id uuid,p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare entry public.voice_usage_sessions;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
  select * into entry from public.voice_usage_sessions where id=p_id for update;
  if not found or entry.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then return false; end if;
  if entry.state='cancelled' then return true; end if;
  if entry.state not in ('reserved','creating') then return false; end if;
  update public.voice_usage_sessions set state='cancelled' where id=p_id;
  return true;
end;
$$;

revoke all on function public.voice_usage_status(),public.reserve_voice_usage(uuid,text,text),public.request_voice_close(uuid),
  public.begin_voice_usage(uuid,text),public.activate_voice_usage(uuid,text,text,timestamptz),
  public.finish_voice_usage(uuid,text,timestamptz),public.cancel_voice_creation(uuid,text) from public,anon,authenticated;
grant execute on function public.voice_usage_status(),public.reserve_voice_usage(uuid,text,text),public.request_voice_close(uuid) to authenticated;
-- Opaque server capabilities work after a user's access token expires. As with the
-- existing memory workers, no account-wide service-role credential is needed.
grant execute on function public.begin_voice_usage(uuid,text),public.activate_voice_usage(uuid,text,text,timestamptz),
  public.finish_voice_usage(uuid,text,timestamptz),public.cancel_voice_creation(uuid,text) to anon,authenticated;
