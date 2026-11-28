-- 대화 원문·기억 요약 암호화 저장 (암호화 자체는 서버의 src/lib/field-cipher.ts에서 한다)
-- 1) key_version 컬럼(0 = 암호화 전 평문)과 재전송 중복 판단용 원문 HMAC 컬럼
-- 2) 길이 검사: 평문은 기존 기준 그대로, 암호문은 base64 길이에 맞춘 기준
-- 3) 저장 함수는 key_version을 받고 읽기 함수는 돌려준다. 새 파라미터는 기본값이 평문 동작이라
--    이 마이그레이션 뒤에도 옛 코드가 그대로 동작한다. 암호화 코드를 배포하기 "전에" 적용한다.
-- 파라미터·반환 모양이 바뀌는 함수는 지우고 다시 만들며, 권한은 0003/0012/0018/0021과 똑같이 복원한다.
-- 함수 본문은 현재 DB 정의(0024 반영)를 그대로 가져와 암호화 관련 부분만 고쳤다. 0029의 작업자 함수는 건드리지 않는다.
begin;
set local lock_timeout = '5s';

-- 1) 컬럼
alter table public.conversation_messages
  add column content_key_version smallint not null default 0 check (content_key_version >= 0),
  add column content_hash text check (content_hash ~ '^[0-9a-f]{64}$');
alter table public.conversation_memories
  add column summary_key_version smallint not null default 0 check (summary_key_version >= 0);
alter table public.chat_context_state
  add column summary_key_version smallint not null default 0 check (summary_key_version >= 0);

-- 2) 길이 검사 (비운 요약 '' 은 버전과 상관없이 허용)
alter table public.conversation_messages drop constraint conversation_messages_content_check;
alter table public.conversation_messages add constraint conversation_messages_content_check check (
  (content_key_version = 0 and char_length(content) between 1 and 8000)
  or (content_key_version > 0 and char_length(content) between 40 and 44000 and content_hash is not null));
alter table public.conversation_memories drop constraint conversation_memories_summary_check;
alter table public.conversation_memories add constraint conversation_memories_summary_check check (
  summary = '' or (summary_key_version = 0 and char_length(summary) <= 902)
  or (summary_key_version > 0 and char_length(summary) between 40 and 5000));
alter table public.chat_context_state drop constraint chat_context_state_summary_check;
alter table public.chat_context_state add constraint chat_context_state_summary_check check (
  summary = '' or (summary_key_version = 0 and char_length(summary) <= 2400)
  or (summary_key_version > 0 and char_length(summary) between 40 and 13000));

-- 3) 파라미터나 반환 모양이 바뀌는 함수 (지우고 다시 만듦)
drop function public.save_conversation_batch(uuid, jsonb);
drop function public.finish_memory(uuid, uuid, text, extensions.vector, text, text);
drop function public.finish_context_work(text, text, jsonb, uuid[], text);
drop function public.read_chat_summary();
drop function public.list_conversation_messages(timestamptz, uuid, integer);
drop function public.match_memories(extensions.vector, text);
drop function public.finish_conversation_work(text, text, extensions.vector, text);

CREATE OR REPLACE FUNCTION public.save_conversation_batch(p_id uuid, p_messages jsonb, p_fingerprint text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare item jsonb; signature text; old_signature text; v smallint; h text;
begin
  if not public.conversation_is_enabled() then raise exception 'consent_required'; end if;
  if p_id is null or jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages) not between 1 and 12 or octet_length(p_messages::text)>160000
    or (p_fingerprint is not null and p_fingerprint !~ '^[0-9a-f]{64}$') then raise exception 'invalid_messages'; end if;
  -- 암호문은 암호화할 때마다 달라지므로 새 코드는 원문 HMAC 지문을 보낸다. 옛 코드는 기존 md5를 쓴다.
  signature:=coalesce(p_fingerprint, md5(p_messages::text));
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select fingerprint into old_signature from public.conversation_batches where user_id=auth.uid() and id=p_id;
  if found then
    -- 0030 이전 배치는 md5(32자) 지문이라 새 HMAC 지문과 비교할 수 없다. 이미 저장된 배치이므로 덮어쓰지 않고 성공으로 본다.
    if old_signature<>signature and not (p_fingerprint is not null and char_length(old_signature)=32) then raise exception 'batch_conflict'; end if;
    return true;
  end if;
  insert into public.conversation_batches(user_id,id,fingerprint) values(auth.uid(),p_id,signature);
  for item in select * from jsonb_array_elements(p_messages) loop
    v:=coalesce((item->>'key_version')::smallint,0); h:=item->>'hash';
    if item->>'role' not in ('user','assistant') or v<0 or (h is not null and h !~ '^[0-9a-f]{64}$')
      or (v=0 and char_length(item->>'content') not between 1 and 8000) or (v>0 and (h is null or char_length(item->>'content') not between 40 and 44000))
      or (item->>'at')::timestamptz<=now()-interval '30 days' or (item->>'at')::timestamptz>now()+interval '5 minutes'
      or item->>'at' is null or item->>'content' is null then raise exception 'invalid_message'; end if;
    -- Never overwrite an existing message on replay or from another tab.
    insert into public.conversation_messages(user_id,id,batch_id,role,content,created_at,content_key_version,content_hash)
      values(auth.uid(),(item->>'id')::uuid,p_id,item->>'role',item->>'content',(item->>'at')::timestamptz,v,h) on conflict(user_id,id) do nothing;
    if not found and exists(select 1 from public.conversation_messages m where m.user_id=auth.uid() and m.id=(item->>'id')::uuid
      and (m.role is distinct from item->>'role' or (case when h is not null then m.content_hash is not null and m.content_hash is distinct from h else m.content is distinct from item->>'content' end) or m.created_at is distinct from (item->>'at')::timestamptz)) then raise exception 'message_conflict'; end if;
  end loop;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_memory(p_id uuid, p_lease uuid, p_summary text, p_embedding extensions.vector, p_summary_model text, p_prompt_version text, p_summary_key_version smallint DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not public.memory_is_enabled() or p_summary is null or p_summary_key_version is null or p_summary_key_version<0
    or (p_summary_key_version=0 and char_length(p_summary)>902) or (p_summary_key_version>0 and p_summary<>'' and char_length(p_summary) not between 40 and 5000)
    or char_length(p_summary_model)>100 or (p_prompt_version is null or p_prompt_version not in ('memory-v1','conversation-v1')) then return false; end if;
  if p_summary<>'' and (p_embedding is null or extensions.vector_dims(p_embedding)<>1536 or extensions.vector_norm(p_embedding)=0) then return false; end if;
  update public.conversation_memories set status=case when p_summary='' then 'skipped' else 'ready' end,
    summary=p_summary,summary_key_version=case when p_summary='' then 0 else p_summary_key_version end,embedding=case when p_summary='' then null else p_embedding end,
    summary_model=p_summary_model,prompt_version=p_prompt_version,updated_at=now()
    where id=p_id and user_id=auth.uid() and lease=p_lease and status='pending';
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finish_context_work(p_token text, p_summary text, p_groups jsonb, p_discard uuid[], p_model text, p_summary_key_version smallint DEFAULT 0)
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
 if p_summary_key_version is null or p_summary_key_version<0
  or (p_summary_key_version=0 and char_length(p_summary)>2400) or (p_summary_key_version>0 and p_summary<>'' and char_length(p_summary) not between 40 and 13000) or jsonb_typeof(p_groups) is distinct from 'array' or jsonb_array_length(p_groups)>10
  or p_discard is null or cardinality(p_discard)>30 or (not w.nightly and cardinality(p_discard)>0)
  or p_model is null or char_length(p_model)>100 then return false; end if;
 for item in select * from jsonb_array_elements(w.snapshot) loop
  if not exists(select 1 from public.conversation_memories where user_id=w.user_id and id=(item->>'id')::uuid and status='ready' and updated_at=(item->>'updated_at')::timestamptz) then return false; end if;
 end loop;
 -- If retention removed any source batch during generation, don't publish its summary.
 if exists(select 1 from unnest(w.batch_ids) b where not exists(select 1 from public.conversation_batches cb where cb.user_id=w.user_id and cb.id=b)) then return false; end if;
 for g in select * from jsonb_array_elements(p_groups) loop
  if jsonb_typeof(g->'ids') is distinct from 'array' or g->>'summary' is null or coalesce((g->>'summary_key_version')::smallint,0)<0
   or (coalesce((g->>'summary_key_version')::smallint,0)=0 and char_length(g->>'summary') not between 1 and 850)
   or (coalesce((g->>'summary_key_version')::smallint,0)>0 and char_length(g->>'summary') not between 40 and 5000) then return false; end if;
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
  update public.conversation_memories set summary=g->>'summary',summary_key_version=coalesce((g->>'summary_key_version')::smallint,0),embedding=(g->>'embedding')::extensions.vector,
   summary_model=p_model,prompt_version='context-merge-v1',updated_at=now() where id=target and user_id=w.user_id;
  update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now() where id=any(ids) and id<>target and user_id=w.user_id;
 end loop;
 update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now() where user_id=w.user_id and id=any(p_discard);
 update public.conversation_memories set reviewed_at=now(),nightly_reviewed_at=case when w.nightly then now() else nightly_reviewed_at end where user_id=w.user_id and id in (select (x->>'id')::uuid from jsonb_array_elements(w.snapshot) x);
 update public.chat_context_state set summary=p_summary,summary_key_version=case when p_summary='' then 0 else p_summary_key_version end,revision=revision+1,updated_at=now() where user_id=w.user_id;
 insert into public.chat_context_sources(user_id,batch_id) select w.user_id,x from unnest(w.batch_ids) x on conflict do nothing;
 update public.context_worker_runs set completed_at=now(),outcome='ready',snapshot=null where id=w.id;
 return true;
end;$function$;

CREATE OR REPLACE FUNCTION public.read_chat_summary()
 RETURNS TABLE(summary text, summary_key_version smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select c.summary,c.summary_key_version from public.chat_context_state c where c.user_id=auth.uid() and public.conversation_is_enabled();
$function$;

CREATE OR REPLACE FUNCTION public.list_conversation_messages(p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30)
 RETURNS TABLE(id uuid, role text, content text, created_at timestamp with time zone, content_key_version smallint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select m.id,m.role,m.content,m.created_at,m.content_key_version from public.conversation_messages m
 where m.user_id=auth.uid() and m.created_at>now()-interval '30 days'
 and (p_before is null or (m.created_at,m.id)<(p_before,p_id))
 order by m.created_at desc,m.id desc limit least(greatest(p_limit,1),51);
$function$;

CREATE OR REPLACE FUNCTION public.match_memories(p_embedding extensions.vector, p_model text)
 RETURNS TABLE(id uuid, summary text, created_at timestamp with time zone, summary_key_version smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.id,m.summary,m.created_at,m.summary_key_version from public.conversation_memories m
  where m.user_id=auth.uid() and public.memory_is_enabled() and m.status='ready'
    and m.embedding_model=p_model and extensions.vector_dims(p_embedding)=1536
    and extensions.vector_norm(p_embedding)>0
    and 1-(m.embedding operator(extensions.<=>) p_embedding)>0.30
  order by m.embedding operator(extensions.<=>) p_embedding, m.created_at desc limit 5;
$function$;

CREATE OR REPLACE FUNCTION public.finish_conversation_work(p_token text, p_summary text, p_embedding extensions.vector, p_model text, p_summary_key_version smallint DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 else ok:=public.finish_memory(w.memory_id,w.memory_lease,p_summary,p_embedding,p_model,'conversation-v1',p_summary_key_version); end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
 update public.conversation_worker_runs set completed_at=now(),outcome=case when not ok then 'skipped' when p_summary is null then 'failed' else 'ready' end where id=w.id;
 return ok;
end;$function$;

-- 4) JSON 필드만 추가되는 함수 (작업자용 user_id 포함)
CREATE OR REPLACE FUNCTION public.claim_conversation_batch(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.conversation_memories; entries jsonb; context_entries jsonb; first_at timestamptz;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if not public.conversation_is_enabled() then return null; end if;
 select jsonb_agg(jsonb_build_object('role',role,'content',content,'content_key_version',content_key_version) order by created_at,id) into entries
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
 select jsonb_agg(jsonb_build_object('role',t.role,'content',t.content,'content_key_version',t.content_key_version) order by t.created_at,t.id) into context_entries
 from (select * from public.conversation_messages where user_id=auth.uid() and batch_id<>p_id and created_at<first_at and created_at>now()-interval '30 days' order by created_at desc,id desc limit 2) t;
 return jsonb_build_object('user_id',auth.uid(),'id',r.id,'lease',r.lease,'messages',entries,'context',coalesce(context_entries,'[]'::jsonb));
end;
$function$;

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
 ) select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'summary',m.summary,'summary_key_version',m.summary_key_version,'created_at',m.created_at,'updated_at',m.updated_at) order by m.created_at,m.id),'[]'::jsonb)
 into mem from public.conversation_memories m join ids on ids.id=m.id;
 select coalesce(array_agg(t.id),'{}'::uuid[]) into batches from (
  select b.id from public.conversation_batches b where b.user_id=w.user_id
   and not exists(select 1 from public.chat_context_sources x where x.user_id=w.user_id and x.batch_id=b.id)
   and exists(select 1 from public.conversation_messages m where m.user_id=w.user_id and m.batch_id=b.id and m.created_at>now()-interval '30 days')
   and not exists(select 1 from public.conversation_memories m where m.user_id=w.user_id and m.status='deleted'
     and m.source_key=encode(sha256(convert_to('conversation:'||b.id::text,'UTF8')),'hex'))
  order by b.created_at,b.id limit 2
 ) t;
 select coalesce(jsonb_agg(jsonb_build_object('role',m.role,'content',m.content,'content_key_version',m.content_key_version,'at',m.created_at) order by m.created_at,m.id),'[]'::jsonb)
 into msgs from public.conversation_messages m where m.user_id=w.user_id and m.batch_id=any(batches) and m.created_at>now()-interval '30 days';
 update public.context_worker_runs set claimed_at=now(),revision=s.revision,snapshot=mem,batch_ids=batches where id=w.id;
 return jsonb_build_object('user_id',w.user_id,'nightly',w.nightly,'memories',mem,'messages',msgs,'chat_summary',s.summary,'chat_summary_key_version',s.summary_key_version);
end;$function$;

CREATE OR REPLACE FUNCTION public.read_live_context()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when public.conversation_is_enabled() then jsonb_build_object(
  'chat_summary', coalesce((select summary from public.chat_context_state where user_id=auth.uid()),''),
  'chat_summary_key_version', coalesce((select summary_key_version from public.chat_context_state where user_id=auth.uid()),0),
  'retrieved_memories', coalesce((select jsonb_agg(jsonb_build_object('summary',m.summary,'summary_key_version',m.summary_key_version,'at',m.created_at) order by m.created_at desc,m.id desc)
    from (select id,summary,summary_key_version,created_at from public.conversation_memories where user_id=auth.uid() and status='ready' order by created_at desc,id desc limit 5) m),'[]'::jsonb),
  'recent_messages', coalesce((select jsonb_agg(jsonb_build_object('role',m.role,'content',m.content,'content_key_version',m.content_key_version) order by m.created_at,m.id)
    from (select id,role,content,content_key_version,created_at from public.conversation_messages m where user_id=auth.uid() and created_at>now()-interval '30 days'
      and not exists(select 1 from public.conversation_memories cm where cm.user_id=auth.uid() and cm.status='deleted'
        and cm.source_key=encode(sha256(convert_to('conversation:'||m.batch_id::text,'UTF8')),'hex'))
      order by created_at desc,id desc limit 8) m),'[]'::jsonb)
 ) else null end;
$function$;

-- 권한 (지우기 전과 동일)
revoke all on function public.save_conversation_batch(uuid,jsonb,text), public.finish_memory(uuid,uuid,text,extensions.vector,text,text,smallint),
  public.finish_context_work(text,text,jsonb,uuid[],text,smallint), public.read_chat_summary(),
  public.list_conversation_messages(timestamptz,uuid,integer), public.match_memories(extensions.vector,text) from public, anon, authenticated;
grant execute on function public.save_conversation_batch(uuid,jsonb,text), public.finish_memory(uuid,uuid,text,extensions.vector,text,text,smallint),
  public.read_chat_summary(), public.list_conversation_messages(timestamptz,uuid,integer), public.match_memories(extensions.vector,text) to authenticated;
grant execute on function public.finish_context_work(text,text,jsonb,uuid[],text,smallint) to anon, authenticated;
revoke all on function public.finish_conversation_work(text,text,extensions.vector,text,smallint) from public, anon, authenticated;
grant execute on function public.finish_conversation_work(text,text,extensions.vector,text,smallint) to anon;

notify pgrst, 'reload schema';
commit;

-- 되돌리기 (개발 DB에서, 모든 행이 아직 key_version 0일 때만):
-- 새 함수를 지우고 0003/0012/0014/0018/0021/0023/0024의 정의를 다시 실행한 뒤, 예전 길이 검사를 복원하고
-- key_version 컬럼 3개와 content_hash를 지운다.
