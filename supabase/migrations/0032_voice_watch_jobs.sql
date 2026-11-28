-- Durable, per-call worker capabilities. No cron or HTTP traffic is enabled here.
create table public.voice_watch_jobs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.voice_usage_sessions(id) on delete cascade,
  token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '90 seconds',
  claimed_at timestamptz,
  run_until timestamptz,
  attached_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  outcome text check(outcome in ('closed','handoff','failed'))
);
create index voice_watch_by_call on public.voice_watch_jobs(call_id,created_at);
alter table public.voice_watch_jobs enable row level security;
revoke all on public.voice_watch_jobs from public,anon,authenticated;
alter table public.voice_usage_sessions add column provider_usage_seconds numeric check(provider_usage_seconds>=0);

-- Private issuer. At most one unclaimed job or one healthy successor is issued per call.
create function public.issue_voice_watch(p_call_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare secret text; jid uuid; stamp timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_call_id::text,32));
 if not exists(select 1 from public.voice_usage_sessions where id=p_call_id and state in ('active','closing')) then return null; end if;
 if exists(select 1 from public.voice_watch_jobs where call_id=p_call_id and finished_at is null and expires_at>stamp and (
   (claimed_at is null and created_at>stamp-interval '20 seconds') or
   (claimed_at is not null and run_until>stamp+interval '25 seconds'
    and coalesce(heartbeat_at,claimed_at)>stamp-interval '10 seconds')
 )) then return null; end if;
 secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.voice_watch_jobs(call_id,token_hash) values(p_call_id,encode(sha256(convert_to(secret,'UTF8')),'hex')) returning id into jid;
 return jsonb_build_object('id',jid,'token',secret);
end;$$;
revoke all on function public.issue_voice_watch(uuid) from public,anon,authenticated;

create function public.issue_voice_watch_jobs() returns table(id uuid,token text)
language plpgsql security definer set search_path='' as $$
declare c record; job jsonb; issued integer:=0;
begin
 perform pg_advisory_xact_lock(187134,32);
 -- Closed call worker capabilities have no further value after expiry.
 delete from public.voice_watch_jobs w using public.voice_usage_sessions s
   where w.call_id=s.id and s.state in ('closed','cancelled') and w.expires_at<clock_timestamp()-interval '1 day';
 for c in select s.id from public.voice_usage_sessions s where s.state in ('active','closing')
   order by s.deadline_at,s.id loop
   job:=public.issue_voice_watch(c.id);
   if job is not null then
     return query select (job->>'id')::uuid,job->>'token';
     issued:=issued+1; if issued>=20 then exit; end if;
   end if;
 end loop;
end;$$;
revoke all on function public.issue_voice_watch_jobs() from public,anon,authenticated;

create function public.claim_voice_watch(p_token text) returns jsonb
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
   'server_now',extract(epoch from stamp),'deadline_at',extract(epoch from c.deadline_at),'run_until',extract(epoch from w.run_until),
   'close_requested',c.close_requested_at is not null or not exists(select 1 from public.members where user_id=c.user_id and withdrawn_at is null));
end;$$;

-- Heartbeat only while the provider socket is connected. Never extends this worker's lifetime.
create function public.voice_watch_heartbeat(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.voice_watch_jobs; c public.voice_usage_sessions; stamp timestamptz:=clock_timestamp();
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from public.voice_watch_jobs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or w.claimed_at is null or w.finished_at is not null or w.expires_at<=stamp or w.run_until<=stamp then return null; end if;
 select * into c from public.voice_usage_sessions where id=w.call_id;
 if c.state not in ('active','closing') then return jsonb_build_object('closed',true); end if;
 update public.voice_watch_jobs set attached_at=coalesce(attached_at,stamp),heartbeat_at=stamp where id=w.id;
 return jsonb_build_object('closed',false,'close_requested',c.close_requested_at is not null or c.deadline_at<=stamp
   or not exists(select 1 from public.members where user_id=c.user_id and withdrawn_at is null));
end;$$;

-- Final usage is for provider reconciliation; account allowance follows the server-observed interval.
create function public.confirm_voice_watch_closed(p_token text,p_usage_seconds numeric) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.voice_watch_jobs; c public.voice_usage_sessions;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_usage_seconds<0 or p_usage_seconds in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric) then return false; end if;
 select * into w from public.voice_watch_jobs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or w.claimed_at is null or w.expires_at<=clock_timestamp() then return false; end if;
 if w.outcome='closed' then return true; end if;
 if w.finished_at is not null then return false; end if;
 select * into c from public.voice_usage_sessions where id=w.call_id for update;
 if c.state not in ('active','closing','closed') then return false; end if;
 if c.state<>'closed' then
   update public.voice_usage_sessions set state='closed',ended_at=clock_timestamp(),provider_usage_seconds=p_usage_seconds where id=c.id;
 end if;
 update public.voice_watch_jobs set finished_at=clock_timestamp(),outcome='closed' where id=w.id;
 return true;
end;$$;

-- Atomically verify a connected successor before allowing this observer to leave.
create function public.handoff_voice_watch(p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.voice_watch_jobs; stamp timestamptz:=clock_timestamp();
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into w from public.voice_watch_jobs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or w.claimed_at is null or w.finished_at is not null or w.expires_at<=stamp then return false; end if;
 if not exists(select 1 from public.voice_watch_jobs n where n.call_id=w.call_id and n.id<>w.id and n.claimed_at>w.claimed_at
   and n.finished_at is null and n.attached_at is not null and n.heartbeat_at>stamp-interval '10 seconds' and n.run_until>stamp+interval '10 seconds') then return false; end if;
 update public.voice_watch_jobs set finished_at=stamp,outcome='handoff' where id=w.id;
 return true;
end;$$;

-- Failed observers request closure but must not mark the provider session closed.
create function public.fail_voice_watch(p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.voice_watch_jobs;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into w from public.voice_watch_jobs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or w.claimed_at is null or w.finished_at is not null or w.expires_at<=clock_timestamp() then return false; end if;
 update public.voice_usage_sessions set state='closing',close_requested_at=coalesce(close_requested_at,clock_timestamp())
   where id=w.call_id and state in ('active','closing');
 update public.voice_watch_jobs set finished_at=clock_timestamp(),outcome='failed' where id=w.id;
 return true;
end;$$;
revoke all on function public.claim_voice_watch(text),public.voice_watch_heartbeat(text),public.confirm_voice_watch_closed(text,numeric),
 public.handoff_voice_watch(text),public.fail_voice_watch(text) from public,anon,authenticated;
grant execute on function public.claim_voice_watch(text),public.voice_watch_heartbeat(text),public.confirm_voice_watch_closed(text,numeric),
 public.handoff_voice_watch(text),public.fail_voice_watch(text) to anon;
