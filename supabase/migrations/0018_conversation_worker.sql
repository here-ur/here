-- Development only. Bounded retries shared by foreground and background processing.
begin;
alter table public.conversation_memories drop constraint conversation_memories_attempts_check;
alter table public.conversation_memories add constraint conversation_memories_attempts_check check(attempts between 1 and 5);
create function public.conversation_retry_due(p_status text,p_attempts integer,p_updated timestamptz)
returns boolean language sql stable set search_path='' as $$
 select p_status is null or (p_attempts<5 and (
 (p_status='pending' and p_updated<=now()-interval '2 minutes') or
 (p_status='failed' and p_updated<=now()-case p_attempts when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '30 minutes' else interval '2 hours' end)));
$$;
revoke all on function public.conversation_retry_due(text,integer,timestamptz) from public,anon,authenticated;
create or replace function public.pending_conversation_batches() returns table(id uuid)
language sql stable security definer set search_path='' as $$
 select b.id from public.conversation_batches b
 left join public.conversation_memories m on m.user_id=b.user_id and m.source_key=encode(sha256(convert_to('conversation:'||b.id::text,'UTF8')),'hex')
 where b.user_id=auth.uid() and public.conversation_is_enabled()
 and exists(select 1 from public.conversation_messages t where t.user_id=b.user_id and t.batch_id=b.id and t.created_at>now()-interval '30 days')
 and public.conversation_retry_due(m.status,m.attempts,m.updated_at)
 order by b.created_at,b.id limit 2;
$$;
create or replace function public.claim_conversation_batch(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.conversation_memories; entries jsonb; context_entries jsonb; first_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not public.conversation_is_enabled() then return null; end if;
 select jsonb_agg(jsonb_build_object('role',role,'content',content) order by created_at,id) into entries
 from public.conversation_messages where user_id=auth.uid() and batch_id=p_id and created_at>now()-interval '30 days';
 if entries is null then return null; end if;
 select * into r from public.conversation_memories where user_id=auth.uid() and source_key=encode(sha256(convert_to('conversation:'||p_id::text,'UTF8')),'hex');
 if found then
   if not public.conversation_retry_due(r.status,r.attempts,r.updated_at) then return null; end if;
   update public.conversation_memories set status='pending',lease=gen_random_uuid(),attempts=attempts+1,updated_at=now() where id=r.id returning * into r;
 else
   insert into public.conversation_memories(user_id,source_key) values(auth.uid(),encode(sha256(convert_to('conversation:'||p_id::text,'UTF8')),'hex')) returning * into r;
 end if;
 select min(created_at) into first_at from public.conversation_messages where user_id=auth.uid() and batch_id=p_id;
 select jsonb_agg(jsonb_build_object('role',t.role,'content',t.content) order by t.created_at,t.id) into context_entries
 from (select * from public.conversation_messages where user_id=auth.uid() and batch_id<>p_id and created_at<first_at and created_at>now()-interval '30 days' order by created_at desc,id desc limit 2) t;
 return jsonb_build_object('id',r.id,'lease',r.lease,'messages',entries,'context',coalesce(context_entries,'[]'::jsonb));
end;
$$;

-- Each dispatch grants a single batch for two minutes, never an account-wide service credential.
create table public.conversation_worker_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 batch_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 minutes',
 claimed_at timestamptz,
 memory_id uuid,
 memory_lease uuid,
 completed_at timestamptz,
 outcome text check(outcome in ('ready','failed','skipped')),
 request_id bigint,
 foreign key(user_id,batch_id) references public.conversation_batches(user_id,id) on delete cascade
);
create index conversation_worker_batch on public.conversation_worker_runs(user_id,batch_id,expires_at);
alter table public.conversation_worker_runs enable row level security;
revoke all on public.conversation_worker_runs from public,anon,authenticated;

-- Admin/cron only. Locks prevent two dispatchers from issuing concurrent tokens for one batch.
create function public.issue_conversation_work() returns table(run_id uuid,token text)
language plpgsql security definer set search_path='' as $$
declare b record; secret text; rid uuid;
begin
 perform pg_advisory_xact_lock(187134,18);
 delete from public.conversation_worker_runs where created_at<now()-interval '7 days';
 update public.conversation_memories set status='failed' where status='pending' and attempts>=5 and updated_at<=now()-interval '2 minutes';
 for b in
  select cb.user_id,cb.id from public.conversation_batches cb
  join public.members u on u.user_id=cb.user_id
  join public.memory_consents c on c.user_id=cb.user_id and c.version='2026-11-16-dev-v2' and c.privacy_accepted and c.sensitive_accepted and c.revoked_at is null
  left join public.conversation_memories m on m.user_id=cb.user_id and m.source_key=encode(sha256(convert_to('conversation:'||cb.id::text,'UTF8')),'hex')
  where public.conversation_retry_due(m.status,m.attempts,m.updated_at)
   and exists(select 1 from public.conversation_messages t where t.user_id=cb.user_id and t.batch_id=cb.id and t.created_at>now()-interval '30 days')
   and (select count(*) from public.conversation_worker_runs w where w.user_id=cb.user_id and w.batch_id=cb.id)<12
   and not exists(select 1 from public.conversation_worker_runs w where w.user_id=cb.user_id and w.batch_id=cb.id and w.expires_at>now())
  order by coalesce((select max(w.created_at) from public.conversation_worker_runs w where w.user_id=cb.user_id and w.batch_id=cb.id),cb.created_at),cb.user_id,cb.id limit 2
 loop
  secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.conversation_worker_runs(user_id,batch_id,token_hash)
   values(b.user_id,b.id,encode(sha256(convert_to(secret,'UTF8')),'hex')) returning id into rid;
  return query select rid,secret;
 end loop;
end;$$;
revoke all on function public.issue_conversation_work() from public,anon,authenticated;

-- A public API key alone cannot read anything. A valid single-use dispatch capability is mandatory.
create function public.claim_conversation_work(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.conversation_worker_runs; job jsonb; previous_uid text:=current_setting('request.jwt.claim.sub',true);
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from public.conversation_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if w.id is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.user_id::text,0));
 select * into w from public.conversation_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if w.id is null or w.claimed_at is not null or w.expires_at<=now() then return null; end if;
 update public.conversation_worker_runs set claimed_at=now() where id=w.id;
 perform set_config('request.jwt.claim.sub',w.user_id::text,true);
 job:=public.claim_conversation_batch(w.batch_id);
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
 if job is null then
  update public.conversation_worker_runs set completed_at=now(),outcome='skipped' where id=w.id;
 else
  update public.conversation_worker_runs set memory_id=(job->>'id')::uuid,memory_lease=(job->>'lease')::uuid where id=w.id;
 end if;
 return job;
end;$$;
create function public.finish_conversation_work(p_token text,p_summary text,p_embedding extensions.vector,p_model text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.conversation_worker_runs; ok boolean; previous_uid text:=current_setting('request.jwt.claim.sub',true);
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into w from public.conversation_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if w.id is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.user_id::text,0));
 select * into w from public.conversation_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if w.id is null or w.memory_id is null or w.completed_at is not null or w.expires_at<=now() then return false; end if;
 perform set_config('request.jwt.claim.sub',w.user_id::text,true);
 if p_summary is null then ok:=public.fail_memory(w.memory_id,w.memory_lease);
 else ok:=public.finish_memory(w.memory_id,w.memory_lease,p_summary,p_embedding,p_model,'conversation-v1'); end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
 update public.conversation_worker_runs set completed_at=now(),outcome=case when not ok then 'skipped' when p_summary is null then 'failed' else 'ready' end where id=w.id;
 return ok;
end;$$;
revoke all on function public.claim_conversation_work(text),public.finish_conversation_work(text,text,extensions.vector,text) from public,anon,authenticated;
grant execute on function public.claim_conversation_work(text),public.finish_conversation_work(text,text,extensions.vector,text) to anon;
commit;
