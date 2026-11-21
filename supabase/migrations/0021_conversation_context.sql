-- Backend context and bounded maintenance capabilities. Apply to development first.
begin;
alter table public.conversation_memories add column reviewed_at timestamptz, add column nightly_reviewed_at timestamptz;
create table public.chat_context_state (
 user_id uuid primary key references public.members(user_id) on delete cascade,
 summary text not null default '' check(char_length(summary)<=2400),
 revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
create table public.chat_context_sources (
 user_id uuid not null, batch_id uuid not null,
 primary key(user_id,batch_id),
 foreign key(user_id,batch_id) references public.conversation_batches(user_id,id) on delete cascade
);
create table public.memory_merge_sources (
 source_id uuid not null references public.conversation_memories(id) on delete cascade,
 target_id uuid not null references public.conversation_memories(id) on delete cascade,
 primary key(source_id,target_id),check(source_id<>target_id)
);
create table public.context_worker_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.members(user_id) on delete cascade,
 token_hash text not null unique,
 nightly boolean not null default false,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '2 minutes',
 claimed_at timestamptz, completed_at timestamptz,
 revision bigint, snapshot jsonb, batch_ids uuid[],
 outcome text check(outcome in ('ready','failed','skipped'))
);
create index context_worker_owner on public.context_worker_runs(user_id,created_at desc);
alter table public.chat_context_state enable row level security;
alter table public.chat_context_sources enable row level security;
alter table public.memory_merge_sources enable row level security;
alter table public.context_worker_runs enable row level security;
revoke all on public.chat_context_state,public.chat_context_sources,public.memory_merge_sources,public.context_worker_runs from public,anon,authenticated;

create function public.read_chat_summary() returns text
language sql stable security definer set search_path='' as $$
 select summary from public.chat_context_state where user_id=auth.uid() and public.conversation_is_enabled();
$$;
create function public.context_access_revision() returns bigint
language sql stable security definer set search_path='' as $$
 select case when public.conversation_is_enabled() then coalesce((select revision from public.chat_context_state where user_id=auth.uid()),0) else null end;
$$;

-- A capability grants one bounded snapshot, not arbitrary account queries.
create function public.claim_context_work(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.context_worker_runs; s public.chat_context_state; mem jsonb; batches uuid[]; msgs jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from public.context_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if w.id is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.user_id::text,0));
 select * into w from public.context_worker_runs where id=w.id for update;
 if w.id is null or w.claimed_at is not null or w.expires_at<=now() or w.completed_at is not null
  or (auth.uid() is not null and auth.uid()<>w.user_id)
  or not exists(select 1 from public.memory_consents where user_id=w.user_id and version='2026-11-16-dev-v2' and revoked_at is null and privacy_accepted and sensitive_accepted) then return null; end if;
 insert into public.chat_context_state(user_id) values(w.user_id) on conflict do nothing;
 select * into s from public.chat_context_state where user_id=w.user_id;
 -- New/least recently reviewed memories, plus their two closest neighbours.
 with seeds as (
  select * from public.conversation_memories where user_id=w.user_id and status='ready'
   and ((not w.nightly and reviewed_at is null) or (w.nightly and (nightly_reviewed_at is null or nightly_reviewed_at<date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'))) order by reviewed_at nulls first,created_at,id limit 10
 ), ids as (
  select id from seeds union select n.id from seeds a cross join lateral (
   select b.id from public.conversation_memories b where b.user_id=w.user_id and b.status='ready' and b.id<>a.id
   order by b.embedding operator(extensions.<=>) a.embedding limit 2
  ) n
 ) select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'summary',m.summary,'created_at',m.created_at,'updated_at',m.updated_at) order by m.created_at,m.id),'[]'::jsonb)
 into mem from public.conversation_memories m join ids on ids.id=m.id;
 select coalesce(array_agg(t.id),'{}'::uuid[]) into batches from (
  select b.id from public.conversation_batches b where b.user_id=w.user_id
   and not exists(select 1 from public.chat_context_sources x where x.user_id=w.user_id and x.batch_id=b.id)
   and exists(select 1 from public.conversation_messages m where m.user_id=w.user_id and m.batch_id=b.id and m.created_at>now()-interval '30 days')
   and not exists(select 1 from public.conversation_memories m where m.user_id=w.user_id and m.status='deleted'
     and m.source_key=encode(sha256(convert_to('conversation:'||b.id::text,'UTF8')),'hex'))
  order by b.created_at,b.id limit 2
 ) t;
 select coalesce(jsonb_agg(jsonb_build_object('role',m.role,'content',m.content,'at',m.created_at) order by m.created_at,m.id),'[]'::jsonb)
 into msgs from public.conversation_messages m where m.user_id=w.user_id and m.batch_id=any(batches) and m.created_at>now()-interval '30 days';
 update public.context_worker_runs set claimed_at=now(),revision=s.revision,snapshot=mem,batch_ids=batches where id=w.id;
 return jsonb_build_object('nightly',w.nightly,'memories',mem,'messages',msgs,'chat_summary',s.summary);
end;$$;

create function public.start_context_work() returns jsonb
language plpgsql security definer set search_path='' as $$
declare token text; job jsonb;
begin
 if auth.uid() is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not public.conversation_is_enabled() or exists(select 1 from public.context_worker_runs where user_id=auth.uid()
   and (created_at>now()-interval '5 minutes' or (completed_at is null and expires_at>now()))) then return null; end if;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.context_worker_runs(user_id,token_hash) values(auth.uid(),encode(sha256(convert_to(token,'UTF8')),'hex'));
 job:=public.claim_context_work(token);
 return job||jsonb_build_object('token',token);
end;$$;

-- All membership, snapshot, deletion and lease checks precede mutations; the finish is atomic.
create function public.finish_context_work(p_token text,p_summary text,p_groups jsonb,p_discard uuid[],p_model text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w public.context_worker_runs; item jsonb; g jsonb; ids uuid[]; used uuid[]:='{}'; target uuid; vec extensions.vector; sid uuid;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into w from public.context_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if w.id is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.user_id::text,0));
 select * into w from public.context_worker_runs where id=w.id for update;
 if w.id is null or w.claimed_at is null or w.completed_at is not null or w.expires_at<=now()
  or (auth.uid() is not null and auth.uid()<>w.user_id)
  or not exists(select 1 from public.memory_consents where user_id=w.user_id and version='2026-11-16-dev-v2' and revoked_at is null and privacy_accepted and sensitive_accepted)
  or not exists(select 1 from public.chat_context_state where user_id=w.user_id and revision=w.revision) then return false; end if;
 if p_summary is null then
  update public.context_worker_runs set completed_at=now(),outcome='failed' where id=w.id;return false;
 end if;
 if char_length(p_summary)>2400 or jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups)>10
  or p_discard is null or cardinality(p_discard)>30 or (not w.nightly and cardinality(p_discard)>0)
  or p_model is null or char_length(p_model)>100 then return false; end if;
 for item in select * from jsonb_array_elements(w.snapshot) loop
  if not exists(select 1 from public.conversation_memories where user_id=w.user_id and id=(item->>'id')::uuid and status='ready' and updated_at=(item->>'updated_at')::timestamptz) then return false; end if;
 end loop;
 -- If retention removed any source batch during generation, don't publish its summary.
 if exists(select 1 from unnest(w.batch_ids) b where not exists(select 1 from public.conversation_batches cb where cb.user_id=w.user_id and cb.id=b)) then return false; end if;
 for g in select * from jsonb_array_elements(p_groups) loop
  if jsonb_typeof(g->'ids') is distinct from 'array' or char_length(g->>'summary') not between 1 and 850 or g->>'summary' is null then return false; end if;
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(g->'ids');
  if cardinality(ids)<2 or cardinality(ids)>30 or (select count(distinct x) from unnest(ids) x)<>cardinality(ids) or used&&ids then return false; end if;
  foreach sid in array ids loop
   if not exists(select 1 from jsonb_array_elements(w.snapshot) x where (x->>'id')::uuid=sid) then return false; end if;
  end loop;
  vec:=(g->>'embedding')::extensions.vector;
  if vec is null or extensions.vector_dims(vec)<>1536 or extensions.vector_norm(vec)=0 then return false; end if;
  used:=used||ids;
 end loop;
 if used&&p_discard or (select count(distinct x) from unnest(p_discard) x)<>cardinality(p_discard) then return false; end if;
 foreach sid in array p_discard loop
  if not exists(select 1 from jsonb_array_elements(w.snapshot) x where (x->>'id')::uuid=sid) then return false; end if;
 end loop;
 for g in select * from jsonb_array_elements(p_groups) loop
  select array_agg(value::uuid) into ids from jsonb_array_elements_text(g->'ids');
  -- Keep the earliest source as the canonical row; record ancestry before clearing duplicates.
  select id into target from public.conversation_memories where id=any(ids) order by created_at,id limit 1;
  insert into public.memory_merge_sources(source_id,target_id) select x,target from unnest(ids) x where x<>target on conflict do nothing;
  update public.conversation_memories set summary=g->>'summary',embedding=(g->>'embedding')::extensions.vector,
   summary_model=p_model,prompt_version='context-merge-v1',updated_at=now() where id=target and user_id=w.user_id;
  update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now() where id=any(ids) and id<>target and user_id=w.user_id;
 end loop;
 update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now() where user_id=w.user_id and id=any(p_discard);
 update public.conversation_memories set reviewed_at=now(),nightly_reviewed_at=case when w.nightly then now() else nightly_reviewed_at end where user_id=w.user_id and id in (select (x->>'id')::uuid from jsonb_array_elements(w.snapshot) x);
 update public.chat_context_state set summary=p_summary,revision=revision+1,updated_at=now() where user_id=w.user_id;
 insert into public.chat_context_sources(user_id,batch_id) select w.user_id,x from unnest(w.batch_ids) x on conflict do nothing;
 update public.context_worker_runs set completed_at=now(),outcome='ready',snapshot=null where id=w.id;
 return true;
end;$$;

-- User deletion follows the merge ancestry and invalidates cached summaries/in-flight jobs.
create or replace function public.forget_memory(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare ok boolean;
begin
 if auth.uid() is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not exists(select 1 from public.conversation_memories where user_id=auth.uid() and id=p_id) then return false; end if;
 with recursive targets(id) as (
  select p_id union select l.target_id from public.memory_merge_sources l join targets t on t.id=l.source_id
 ) update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now() where user_id=auth.uid() and id in(select id from targets);
 ok:=found;
 insert into public.chat_context_state(user_id,summary,revision) values(auth.uid(),'',1)
 on conflict(user_id) do update set summary='',revision=public.chat_context_state.revision+1,updated_at=now();
 delete from public.context_worker_runs where user_id=auth.uid();
 return ok;
end;$$;
create function public.erase_context_on_withdrawal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.revoked_at is not null then
  delete from public.chat_context_state where user_id=new.user_id;
  delete from public.context_worker_runs where user_id=new.user_id;
  delete from public.chat_context_sources where user_id=new.user_id;
 end if;
 return new;
end;$$;
create trigger erase_context_on_withdrawal after update of revoked_at on public.memory_consents for each row execute function public.erase_context_on_withdrawal();

-- Repeated dispatch during the KST night window drains the member queue, two jobs at a time.
create function public.issue_context_work() returns table(token text)
language plpgsql security definer set search_path='' as $$
declare u record; secret text;
begin
 perform pg_advisory_xact_lock(187134,21);
 delete from public.context_worker_runs where created_at<now()-interval '7 days';
 for u in select c.user_id from public.memory_consents c join public.members m on m.user_id=c.user_id
 where c.version='2026-11-16-dev-v2' and c.revoked_at is null and c.privacy_accepted and c.sensitive_accepted
  and not exists(select 1 from public.context_worker_runs w where w.user_id=c.user_id and w.completed_at is null and w.expires_at>now())
  and (select count(*) from public.context_worker_runs w where w.user_id=c.user_id and w.nightly and (w.outcome='failed' or (w.completed_at is null and w.expires_at<=now())) and w.created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')<3
  and (exists(select 1 from public.conversation_memories cm where cm.user_id=c.user_id and cm.status='ready'
    and (cm.nightly_reviewed_at is null or cm.nightly_reviewed_at<date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'))
   or exists(select 1 from public.conversation_batches cb where cb.user_id=c.user_id
    and not exists(select 1 from public.chat_context_sources cs where cs.user_id=c.user_id and cs.batch_id=cb.id)
    and exists(select 1 from public.conversation_messages msg where msg.user_id=c.user_id and msg.batch_id=cb.id and msg.created_at>now()-interval '30 days')
    and not exists(select 1 from public.conversation_memories cm where cm.user_id=c.user_id and cm.status='deleted' and cm.source_key=encode(sha256(convert_to('conversation:'||cb.id::text,'UTF8')),'hex'))))
 order by c.user_id limit 2
 loop
  perform pg_advisory_xact_lock(hashtextextended(u.user_id::text,0));
  secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.context_worker_runs(user_id,token_hash,nightly) values(u.user_id,encode(sha256(convert_to(secret,'UTF8')),'hex'),true);
  return query select secret;
 end loop;
end;$$;
revoke all on function public.context_access_revision(),public.read_chat_summary(),public.start_context_work(),public.claim_context_work(text),public.finish_context_work(text,text,jsonb,uuid[],text),public.issue_context_work(),public.erase_context_on_withdrawal() from public,anon,authenticated;
grant execute on function public.context_access_revision(),public.read_chat_summary(),public.start_context_work() to authenticated;
grant execute on function public.claim_context_work(text),public.finish_context_work(text,text,jsonb,uuid[],text) to anon,authenticated;
commit;
