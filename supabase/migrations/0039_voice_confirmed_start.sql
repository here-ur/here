-- Additive, backward compatible: existing active calls keep their clock/limits.
begin;
alter table public.voice_usage_sessions add column metering_start_confirmed boolean not null default true;
create or replace function public.voice_usage_at(p_user_id uuid,p_at timestamptz) returns jsonb
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
    where s.metering_start_confirmed and s.user_id=p_user_id and s.started_at is not null and s.state in ('active','closing','closed')
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


-- started_at is a control placeholder until the server receives session.started.
-- Unconfirmed rows are excluded from usage_at, but keep the one-call lock.
create function public.prepare_voice_usage(p_id uuid,p_token text,p_provider_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.voice_usage_sessions; stamp timestamptz:=clock_timestamp();
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_provider_id is null or p_provider_id !~ '^[a-zA-Z0-9_-]{1,200}$' then return null; end if;
 select * into c from public.voice_usage_sessions where id=p_id for update;
 if not found or c.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then return null; end if;
 if c.state in ('active','closing') and c.provider_session_id=p_provider_id then
   return jsonb_build_object('deadline_at',extract(epoch from c.deadline_at),'close_requested',c.close_requested_at is not null);
 end if;
 if c.state<>'creating' then return null; end if;
 update public.voice_usage_sessions set provider_session_id=p_provider_id,started_at=stamp,
   deadline_at=stamp+interval '20 seconds',metering_start_confirmed=false,
   state=case when close_requested_at is null then 'active' else 'closing' end
 where id=p_id returning * into c;
 return jsonb_build_object('deadline_at',extract(epoch from c.deadline_at),'close_requested',c.close_requested_at is not null);
end;$$;

-- A per-worker server capability is required: the browser cannot claim startup.
create function public.confirm_voice_started(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.voice_watch_jobs; c public.voice_usage_sessions; stamp timestamptz; usage jsonb; remaining integer;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from public.voice_watch_jobs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or w.claimed_at is null or w.finished_at is not null or w.expires_at<=clock_timestamp() or w.run_until<=clock_timestamp() then return null; end if;
 select * into c from public.voice_usage_sessions where id=w.call_id for update;
 if c.state not in ('active','closing') then return null; end if;
 stamp:=clock_timestamp();
 if not c.metering_start_confirmed then
   usage:=public.voice_usage_at(c.user_id,stamp);
   remaining:=greatest(0,floor(least(300,600-(usage->'day'->>'used_seconds')::numeric,1800-(usage->'month'->>'used_seconds')::numeric)));
   if c.deadline_at<=stamp or c.close_requested_at is not null or remaining=0 or not exists(select 1 from public.members where user_id=c.user_id and withdrawn_at is null) then
     remaining:=0;
   end if;
   update public.voice_usage_sessions set metering_start_confirmed=true,started_at=stamp,
     deadline_at=stamp+make_interval(secs=>remaining),state=case when remaining=0 then 'closing' else 'active' end,
     close_requested_at=case when remaining=0 then coalesce(close_requested_at,stamp) else close_requested_at end
   where id=c.id returning * into c;
 end if;
 return jsonb_build_object('server_now',extract(epoch from stamp),'deadline_at',extract(epoch from c.deadline_at),'close_requested',c.close_requested_at is not null);
end;$$;

create function public.voice_call_status(p_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('started',s.metering_start_confirmed,'closed',s.state in ('closed','cancelled') or s.close_requested_at is not null,
   'deadline_at',extract(epoch from s.deadline_at),'server_now',extract(epoch from clock_timestamp()))
 from public.voice_usage_sessions s join public.members m on m.user_id=s.user_id
 where s.id=p_id and s.user_id=auth.uid() and m.withdrawn_at is null;
$$;
revoke all on function public.prepare_voice_usage(uuid,text,text),public.confirm_voice_started(text),public.voice_call_status(uuid) from public,anon,authenticated;
grant execute on function public.prepare_voice_usage(uuid,text,text) to anon,authenticated;
grant execute on function public.confirm_voice_started(text) to anon;
grant execute on function public.voice_call_status(uuid) to authenticated;
create or replace function public.claim_voice_watch(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.voice_watch_jobs; c public.voice_usage_sessions; stamp timestamptz:=clock_timestamp();
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from public.voice_watch_jobs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or w.claimed_at is not null or w.finished_at is not null or w.expires_at<=stamp or w.created_at<=stamp-interval '20 seconds' then return null; end if;
 select * into c from public.voice_usage_sessions where id=w.call_id;
 if c.state not in ('active','closing') then return null; end if;
 update public.voice_watch_jobs set claimed_at=stamp,run_until=stamp+interval '45 seconds',heartbeat_at=stamp where id=w.id returning * into w;
 return jsonb_build_object('call_id',c.id,'provider_session_id',c.provider_session_id,
   'awaiting_start',not c.metering_start_confirmed,'server_now',extract(epoch from stamp),'deadline_at',extract(epoch from c.deadline_at),'run_until',extract(epoch from w.run_until),
   'close_requested',c.close_requested_at is not null or not exists(select 1 from public.members where user_id=c.user_id and withdrawn_at is null));
end;$$;

create or replace function public.confirm_voice_watch_closed(p_token text,p_usage_seconds numeric) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.voice_watch_jobs; c public.voice_usage_sessions;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_usage_seconds<0 or p_usage_seconds in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then return false; end if;
 select * into w from public.voice_watch_jobs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or w.claimed_at is null or w.expires_at<=clock_timestamp() then return false; end if;
 if w.outcome='closed' then return true; end if;
 if w.finished_at is not null then return false; end if;
 select * into c from public.voice_usage_sessions where id=w.call_id for update;
 if c.state not in ('active','closing','closed','cancelled') then return false; end if;
 if c.state not in ('closed','cancelled') then
   update public.voice_usage_sessions set state=case when metering_start_confirmed then 'closed' else 'cancelled' end,ended_at=case when metering_start_confirmed then clock_timestamp() else null end,provider_usage_seconds=p_usage_seconds where id=c.id;
 end if;
 update public.voice_watch_jobs set finished_at=clock_timestamp(),outcome='closed' where id=w.id;
 return true;
end;$$;

create or replace function public.voice_call_authorized(p_id uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from public.voice_usage_sessions s join public.members m on m.user_id=s.user_id
 where s.id=p_id and s.user_id=auth.uid() and s.state='active' and s.metering_start_confirmed and s.close_requested_at is null
 and s.deadline_at>clock_timestamp() and m.withdrawn_at is null);
$$;

create or replace function public.finish_voice_observed(p_id uuid,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare c public.voice_usage_sessions;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into c from public.voice_usage_sessions where id=p_id for update;
 if not found or c.token_hash<>encode(sha256(convert_to(p_token,'UTF8')),'hex') then return false; end if;
 if c.state='cancelled' then return true; end if;
 if c.metering_start_confirmed then return public.finish_voice_usage(p_id,p_token,clock_timestamp()); end if;
 if c.state not in ('active','closing') then return false; end if;
 update public.voice_usage_sessions set state='cancelled' where id=p_id;
 return true;
end;$$;

commit;
