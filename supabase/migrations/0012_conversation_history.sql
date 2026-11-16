-- Development rollout only. Raw messages expire; summaries have no 30-day expiry.
begin;
create function public.conversation_is_enabled() returns boolean
language sql stable security definer set search_path='' as $$
 select public.memory_is_enabled() and exists(select 1 from public.memory_consents where user_id=auth.uid() and version='2026-11-16-dev-v2');
$$;
revoke all on function public.conversation_is_enabled() from public,anon;
grant execute on function public.conversation_is_enabled() to authenticated;
create table public.conversation_batches (
  user_id uuid not null references public.members(user_id) on delete cascade,
  id uuid not null,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,id)
);
create table public.conversation_messages (
  user_id uuid not null,
  id uuid not null,
  batch_id uuid not null,
  role text not null check(role in ('user','assistant')),
  content text not null check(char_length(content) between 1 and 8000),
  created_at timestamptz not null,
  primary key(user_id,id),
  foreign key(user_id,batch_id) references public.conversation_batches(user_id,id) on delete cascade
);
create index conversation_messages_timeline on public.conversation_messages(user_id,created_at desc,id desc);
alter table public.conversation_batches enable row level security;
alter table public.conversation_messages enable row level security;
revoke all on public.conversation_batches,public.conversation_messages from anon,authenticated;
grant select on public.conversation_messages to authenticated;
create policy own_recent_messages on public.conversation_messages for select to authenticated
using(user_id=auth.uid() and created_at>now()-interval '30 days' and public.conversation_is_enabled());

create function public.save_conversation_batch(p_id uuid,p_messages jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare item jsonb; signature text; old_signature text;
begin
  if not public.conversation_is_enabled() then raise exception 'consent_required'; end if;
  if p_id is null or jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages) not between 1 and 12 or octet_length(p_messages::text)>100000 then raise exception 'invalid_messages'; end if;
  signature:=md5(p_messages::text);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select fingerprint into old_signature from public.conversation_batches where user_id=auth.uid() and id=p_id;
  if found then
    if old_signature<>signature then raise exception 'batch_conflict'; end if;
    return true;
  end if;
  insert into public.conversation_batches(user_id,id,fingerprint) values(auth.uid(),p_id,signature);
  for item in select * from jsonb_array_elements(p_messages) loop
    if item->>'role' not in ('user','assistant') or char_length(item->>'content') not between 1 and 8000
      or (item->>'at')::timestamptz<=now()-interval '30 days' or (item->>'at')::timestamptz>now()+interval '5 minutes'
      or item->>'at' is null or item->>'content' is null then raise exception 'invalid_message'; end if;
    -- Never overwrite an existing message on replay or from another tab.
    insert into public.conversation_messages(user_id,id,batch_id,role,content,created_at)
      values(auth.uid(),(item->>'id')::uuid,p_id,item->>'role',item->>'content',(item->>'at')::timestamptz);
  end loop;
  return true;
end;
$$;

create function public.list_conversation_messages(p_before timestamptz default null,p_id uuid default null,p_limit integer default 30)
returns table(id uuid,role text,content text,created_at timestamptz)
language sql stable security invoker set search_path='' as $$
 select m.id,m.role,m.content,m.created_at from public.conversation_messages m
 where m.user_id=auth.uid() and m.created_at>now()-interval '30 days'
 and (p_before is null or (m.created_at,m.id)<(p_before,p_id))
 order by m.created_at desc,m.id desc limit least(greatest(p_limit,1),51);
$$;

-- Stable per-batch key. Persistent failures retry on later authenticated activity.
create function public.pending_conversation_batches() returns table(id uuid)
language sql stable security definer set search_path='' as $$
 select b.id from public.conversation_batches b
 left join public.conversation_memories m on m.user_id=b.user_id and m.source_key=encode(sha256(convert_to('conversation:'||b.id::text,'UTF8')),'hex')
 where b.user_id=auth.uid() and public.conversation_is_enabled()
 and exists(select 1 from public.conversation_messages t where t.user_id=b.user_id and t.batch_id=b.id and t.created_at>now()-interval '30 days')
 and (m.id is null or (m.status='failed' and m.updated_at<now()-interval '30 seconds') or (m.status='pending' and m.updated_at<now()-interval '2 minutes'))
 order by b.created_at limit 2;
$$;
create function public.claim_conversation_batch(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.conversation_memories; entries jsonb; context_entries jsonb; first_at timestamptz;
begin
 if not public.conversation_is_enabled() then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select jsonb_agg(jsonb_build_object('role',role,'content',content) order by created_at,id) into entries
 from public.conversation_messages where user_id=auth.uid() and batch_id=p_id and created_at>now()-interval '30 days';
 if entries is null then return null; end if;
 select * into r from public.conversation_memories where user_id=auth.uid() and source_key=encode(sha256(convert_to('conversation:'||p_id::text,'UTF8')),'hex');
 if found then
   if r.status in ('ready','skipped','deleted') or (r.status='pending' and r.updated_at>now()-interval '2 minutes') then return null; end if;
   update public.conversation_memories set status='pending',lease=gen_random_uuid(),attempts=least(attempts+1,3),updated_at=now() where id=r.id returning * into r;
 else
   insert into public.conversation_memories(user_id,source_key) values(auth.uid(),encode(sha256(convert_to('conversation:'||p_id::text,'UTF8')),'hex')) returning * into r;
 end if;
 select min(created_at) into first_at from public.conversation_messages where user_id=auth.uid() and batch_id=p_id;
 select jsonb_agg(jsonb_build_object('role',t.role,'content',t.content) order by t.created_at,t.id) into context_entries
 from (select * from public.conversation_messages where user_id=auth.uid() and batch_id<>p_id and created_at<first_at and created_at>now()-interval '30 days' order by created_at desc,id desc limit 2) t;
 return jsonb_build_object('id',r.id,'lease',r.lease,'messages',entries,'context',coalesce(context_entries,'[]'::jsonb));
end;
$$;

create function public.purge_expired_conversations() returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.conversation_messages where created_at<=now()-interval '30 days';
 delete from public.conversation_batches b where not exists(select 1 from public.conversation_messages m where m.user_id=b.user_id and m.batch_id=b.id);
end;
$$;
-- Revoking memory consent also removes stored original text; consent event logic stays intact.
create function public.erase_conversation_on_withdrawal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.revoked_at is not null then delete from public.conversation_batches where user_id=new.user_id; end if;
 return new;
end;
$$;
create trigger erase_conversation_on_withdrawal after update of revoked_at on public.memory_consents
for each row execute function public.erase_conversation_on_withdrawal();
revoke all on function public.save_conversation_batch(uuid,jsonb),public.list_conversation_messages(timestamptz,uuid,integer),public.pending_conversation_batches(),public.claim_conversation_batch(uuid),public.purge_expired_conversations(),public.erase_conversation_on_withdrawal() from public,anon,authenticated;
grant execute on function public.save_conversation_batch(uuid,jsonb),public.list_conversation_messages(timestamptz,uuid,integer),public.pending_conversation_batches(),public.claim_conversation_batch(uuid) to authenticated;
create or replace function public.memory_is_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memory_consents c join public.members m on m.user_id=c.user_id
    where c.user_id=auth.uid() and c.version in ('2026-10-31-dev-v1','2026-11-16-dev-v2')
    and c.privacy_accepted and c.sensitive_accepted and c.revoked_at is null);
$$;

create or replace function public.accept_memory_consent(p_version text, p_privacy boolean, p_sensitive boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_version is null or p_version not in ('2026-10-31-dev-v1','2026-11-16-dev-v2')
    or p_privacy is distinct from true or p_sensitive is distinct from true
    or not exists(select 1 from public.members where user_id=auth.uid()) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  insert into public.memory_consents(user_id,version,privacy_accepted,sensitive_accepted)
    values(auth.uid(),p_version,true,true)
    on conflict(user_id) do update set version=excluded.version, privacy_accepted=true,
      sensitive_accepted=true,accepted_at=now(),revoked_at=null
    where public.memory_consents.version<>excluded.version or public.memory_consents.revoked_at is not null;
  return true;
end;
$$;


commit;
