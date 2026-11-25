-- Launch hardening (before MVP). Schema-only: no app code depends on the renamed objects.
-- 1) Indexes for FK/cleanup queries
-- 2) Server receive time on messages
-- 3) Consent versions in one table + memory_consents -> privacy_consents
-- 4) members.display_name -> nickname (function outputs keep the display_name field name)
begin;
set local lock_timeout = '5s';

-- 1) Indexes
create index conversation_messages_batch on public.conversation_messages (user_id, batch_id);
create index conversation_messages_expiry on public.conversation_messages (created_at);
create index friendships_created_by on public.friendships (created_by);
create index friend_invite_acceptances_user on public.friend_invite_acceptances (user_id);
create index members_invited_by on public.members (invited_by) where invited_by is not null;
create index memory_merge_sources_target on public.memory_merge_sources (target_id);

-- 2) Server-side receive time; created_at stays the client time used for ordering
alter table public.conversation_messages add column received_at timestamptz not null default now();

-- 3) Consent versions
create table public.consent_versions (
  version text primary key check (char_length(version) between 1 and 50),
  covers_memory boolean not null,        -- allows personal memory summaries
  covers_conversation boolean not null,  -- allows storing raw conversations for 30 days
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (not covers_conversation or covers_memory)
);
-- Exactly one version is offered to new consents.
create unique index consent_versions_one_current on public.consent_versions (is_current) where is_current;
alter table public.consent_versions enable row level security;
revoke all on public.consent_versions from public, anon, authenticated;

insert into public.consent_versions (version, covers_memory, covers_conversation, is_current) values
  ('2026-10-31-dev-v1', true, false, false),
  ('2026-11-16-dev-v2', true, true,  true);

create function public.current_consent_version() returns text
language sql stable security definer set search_path = '' as $$
  select version from public.consent_versions where is_current;
$$;
revoke all on function public.current_consent_version() from public, anon, authenticated;

alter table public.memory_consents rename to privacy_consents;
alter table public.memory_consent_events rename to privacy_consent_events;
alter table public.privacy_consents
  add constraint privacy_consents_version_fkey foreign key (version) references public.consent_versions (version);
alter table public.privacy_consent_events
  add constraint privacy_consent_events_version_fkey foreign key (version) references public.consent_versions (version);

-- 4) Nickname
alter table public.members rename column display_name to nickname;
alter table public.members rename constraint members_display_name_check to members_nickname_check;

-- Functions: table renames are not propagated into function bodies, so recreate every function that names them.

create or replace function public.memory_is_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.privacy_consents c
    join public.members m on m.user_id = c.user_id
    join public.consent_versions v on v.version = c.version and v.covers_memory
    where c.user_id = auth.uid()
      and c.privacy_accepted and c.sensitive_accepted and c.revoked_at is null);
$$;

create or replace function public.conversation_is_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.memory_is_enabled() and exists (
    select 1 from public.privacy_consents c
    join public.consent_versions v on v.version = c.version and v.covers_conversation
    where c.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.accept_memory_consent(p_version text, p_privacy boolean, p_sensitive boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or p_version is null or p_version is distinct from public.current_consent_version()
    or p_privacy is distinct from true or p_sensitive is distinct from true
    or not exists(select 1 from public.members where user_id=auth.uid()) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  insert into public.privacy_consents(user_id,version,privacy_accepted,sensitive_accepted)
    values(auth.uid(),p_version,true,true)
    on conflict(user_id) do update set version=excluded.version, privacy_accepted=true,
      sensitive_accepted=true,accepted_at=now(),revoked_at=null
    where public.privacy_consents.version<>excluded.version or public.privacy_consents.revoked_at is not null;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.withdraw_memory_consent()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  update public.privacy_consents set revoked_at=now() where user_id=auth.uid();
  update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now()
    where user_id=auth.uid() and status<>'deleted';
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_memory_consent_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare kind text;
begin
  if TG_OP='INSERT' then
    kind := case when new.revoked_at is null then 'accepted' else 'revoked' end;
  elsif old.revoked_at is null and new.revoked_at is not null then
    kind := 'revoked';
  elsif new.revoked_at is null and (old.revoked_at is not null
    or old.version is distinct from new.version
    or old.privacy_accepted is distinct from new.privacy_accepted
    or old.sensitive_accepted is distinct from new.sensitive_accepted) then
    kind := 'accepted';
  else return new;
  end if;
  insert into public.privacy_consent_events(user_id,event_type,version,privacy_accepted,sensitive_accepted,accepted_at,revoked_at)
    values(new.user_id,kind,new.version,new.privacy_accepted,new.sensitive_accepted,new.accepted_at,new.revoked_at);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.issue_conversation_work()
 RETURNS TABLE(run_id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b record; secret text; rid uuid;
begin
 perform pg_advisory_xact_lock(187134,18);
 delete from public.conversation_worker_runs where created_at<now()-interval '7 days';
 update public.conversation_memories set status='failed' where status='pending' and attempts>=5 and updated_at<=now()-interval '2 minutes';
 for b in
  select cb.user_id,cb.id from public.conversation_batches cb
  join public.members u on u.user_id=cb.user_id
  join public.privacy_consents c on c.user_id=cb.user_id and exists(select 1 from public.consent_versions v where v.version=c.version and v.covers_conversation) and c.privacy_accepted and c.sensitive_accepted and c.revoked_at is null
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
end;$function$;

CREATE OR REPLACE FUNCTION public.claim_context_work(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.context_worker_runs; s public.chat_context_state; mem jsonb; batches uuid[]; msgs jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into w from public.context_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if w.id is null then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.user_id::text,0));
 select * into w from public.context_worker_runs where id=w.id for update;
 if w.id is null or w.claimed_at is not null or w.expires_at<=now() or w.completed_at is not null
  or (auth.uid() is not null and auth.uid()<>w.user_id)
  or not exists(select 1 from public.privacy_consents where user_id=w.user_id and exists(select 1 from public.consent_versions v where v.version=privacy_consents.version and v.covers_conversation) and revoked_at is null and privacy_accepted and sensitive_accepted) then return null; end if;
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
end;$function$;

CREATE OR REPLACE FUNCTION public.finish_context_work(p_token text, p_summary text, p_groups jsonb, p_discard uuid[], p_model text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.context_worker_runs; item jsonb; g jsonb; ids uuid[]; used uuid[]:='{}'; target uuid; vec extensions.vector; sid uuid;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into w from public.context_worker_runs where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if w.id is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(w.user_id::text,0));
 select * into w from public.context_worker_runs where id=w.id for update;
 if w.id is null or w.claimed_at is null or w.completed_at is not null or w.expires_at<=now()
  or (auth.uid() is not null and auth.uid()<>w.user_id)
  or not exists(select 1 from public.privacy_consents where user_id=w.user_id and exists(select 1 from public.consent_versions v where v.version=privacy_consents.version and v.covers_conversation) and revoked_at is null and privacy_accepted and sensitive_accepted)
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
end;$function$;

CREATE OR REPLACE FUNCTION public.issue_context_work()
 RETURNS TABLE(token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u record; secret text;
begin
 perform pg_advisory_xact_lock(187134,21);
 delete from public.context_worker_runs where created_at<now()-interval '7 days';
 for u in select c.user_id from public.privacy_consents c join public.members m on m.user_id=c.user_id
 where exists(select 1 from public.consent_versions v where v.version=c.version and v.covers_conversation) and c.revoked_at is null and c.privacy_accepted and c.sensitive_accepted
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
end;$function$;

CREATE OR REPLACE FUNCTION public.set_display_name(p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_user is null then return false; end if;
  if v_name is not null and (char_length(v_name) > 20 or v_name ~ '[[:cntrl:]]') then return false; end if;
  update public.members set nickname = v_name where user_id = v_user;
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_friend_connections()
 RETURNS TABLE(friend_id uuid, display_name text, connected_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select m.user_id,m.nickname,f.created_at from public.friendships f
 join public.members m on m.user_id=case when f.user_low=auth.uid() then f.user_high else f.user_low end
 where auth.uid() in(f.user_low,f.user_high) order by f.created_at desc,m.user_id
$function$;

CREATE OR REPLACE FUNCTION public.list_friends()
 RETURNS TABLE(display_name text, relation text, joined_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select m.nickname,case when f.created_by=auth.uid() then 'invited_by_me' else 'invited_me' end,m.joined_at
 from public.friendships f join public.members m on m.user_id=case when f.user_low=auth.uid() then f.user_high else f.user_low end
 where auth.uid() in(f.user_low,f.user_high) order by m.joined_at desc
$function$;

CREATE OR REPLACE FUNCTION public.friend_invite_details(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); invitation public.friend_invites;
begin
 if uid is null or not exists(select 1 from public.members where user_id=uid) then raise exception 'member_required'; end if;
 if p_code is null or p_code!~'^[a-f0-9]{32}$' then return null; end if;
 select * into invitation from public.friend_invites where code=p_code and revoked_at is null and expires_at>now();
 if invitation.id is null then return null; end if;
 if exists(select 1 from public.friendships where user_low=least(uid,invitation.owner_id) and user_high=greatest(uid,invitation.owner_id)) then
  return jsonb_build_object('status','already_friends');
 end if;
 if exists(select 1 from public.friend_invite_acceptances where invite_id=invitation.id and user_id=uid) or invitation.use_count>=3 then return null; end if;
 return jsonb_build_object('status',case when uid=invitation.owner_id then 'self' else 'available' end,
  'display_name',(select nickname from public.members where user_id=invitation.owner_id),'expires_at',invitation.expires_at);
end;$function$;

commit;

-- Rollback (manual, development only):
-- begin;
--   restore the 13 function bodies from 0003, 0005, 0007, 0012, 0017, 0018, 0021;
--   alter table public.members rename constraint members_nickname_check to members_display_name_check;
--   alter table public.members rename column nickname to display_name;
--   alter table public.privacy_consent_events drop constraint privacy_consent_events_version_fkey;
--   alter table public.privacy_consents drop constraint privacy_consents_version_fkey;
--   alter table public.privacy_consent_events rename to memory_consent_events;
--   alter table public.privacy_consents rename to memory_consents;
--   drop function public.current_consent_version();
--   drop table public.consent_versions;
--   alter table public.conversation_messages drop column received_at;   -- destructive
--   drop index public.conversation_messages_batch, public.conversation_messages_expiry,
--     public.friendships_created_by, public.friend_invite_acceptances_user,
--     public.members_invited_by, public.memory_merge_sources_target;
-- commit;
