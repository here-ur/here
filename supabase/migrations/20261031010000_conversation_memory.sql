-- Development first. No raw conversation or audio storage, no shared training dataset.
create extension if not exists vector with schema extensions;

create table public.memory_consents (
  user_id uuid primary key references public.members(user_id) on delete cascade,
  version text not null,
  privacy_accepted boolean not null check (privacy_accepted),
  sensitive_accepted boolean not null check (sensitive_accepted),
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table public.conversation_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.members(user_id) on delete cascade,
  source_key text not null check (source_key ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending' check (status in ('pending','ready','skipped','failed','deleted')),
  summary text not null default '' check (char_length(summary) <= 902),
  embedding extensions.vector(1536),
  embedding_model text not null default 'text-embedding-3-large' check (embedding_model = 'text-embedding-3-large'),
  summary_model text,
  prompt_version text,
  lease uuid not null default gen_random_uuid(),
  attempts integer not null default 1 check (attempts between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, source_key),
  check ((status = 'ready' and summary <> '' and embedding is not null)
    or (status <> 'ready' and summary = '' and embedding is null))
);
create index conversation_memories_owner_date on public.conversation_memories(user_id, created_at desc);
alter table public.memory_consents enable row level security;
alter table public.conversation_memories enable row level security;
revoke all on public.memory_consents, public.conversation_memories from public, anon, authenticated;
grant select on public.memory_consents, public.conversation_memories to authenticated;
create policy consent_self on public.memory_consents for select to authenticated using (user_id = (select auth.uid()));
create policy memory_self on public.conversation_memories for select to authenticated using (user_id = (select auth.uid()));

create function public.memory_is_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memory_consents c join public.members m on m.user_id=c.user_id
    where c.user_id=auth.uid() and c.version='2026-10-31-dev-v1'
    and c.privacy_accepted and c.sensitive_accepted and c.revoked_at is null);
$$;

create function public.accept_memory_consent(p_version text, p_privacy boolean, p_sensitive boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_version is distinct from '2026-10-31-dev-v1'
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

create function public.claim_memory(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.conversation_memories;
begin
  if auth.uid() is null or p_key is null or p_key !~ '^[0-9a-f]{64}$' then return null; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not public.memory_is_enabled() then return null; end if;
  select * into r from public.conversation_memories where user_id=auth.uid() and source_key=p_key;
  if found then
    if r.status in ('ready','skipped','deleted') or r.attempts>=3
      or (r.status='pending' and r.updated_at>now()-interval '2 minutes') then return null; end if;
    update public.conversation_memories set status='pending',attempts=attempts+1,lease=gen_random_uuid(),updated_at=now()
      where id=r.id returning * into r;
  else
    -- Serialised per-member cap. Retrieval/chat rate limits remain a separate release requirement.
    if (select count(*) from public.conversation_memories where user_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then return null; end if;
    insert into public.conversation_memories(user_id,source_key) values(auth.uid(),p_key) returning * into r;
  end if;
  return jsonb_build_object('id',r.id,'lease',r.lease);
end;
$$;

create function public.finish_memory(p_id uuid,p_lease uuid,p_summary text,p_embedding extensions.vector,p_summary_model text,p_prompt_version text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if not public.memory_is_enabled() or p_summary is null or char_length(p_summary)>902
    or char_length(p_summary_model)>100 or p_prompt_version is distinct from 'memory-v1' then return false; end if;
  if p_summary<>'' and (p_embedding is null or extensions.vector_dims(p_embedding)<>1536 or extensions.vector_norm(p_embedding)=0) then return false; end if;
  update public.conversation_memories set status=case when p_summary='' then 'skipped' else 'ready' end,
    summary=p_summary,embedding=case when p_summary='' then null else p_embedding end,
    summary_model=p_summary_model,prompt_version=p_prompt_version,updated_at=now()
    where id=p_id and user_id=auth.uid() and lease=p_lease and status='pending';
  return found;
end;
$$;

create function public.fail_memory(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_memories set status='failed',updated_at=now()
    where id=p_id and user_id=auth.uid() and lease=p_lease and status='pending';
  return found;
end;
$$;

create function public.forget_memory(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now()
    where id=p_id and user_id=auth.uid();
  return found;
end;
$$;

create function public.withdraw_memory_consent() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  update public.memory_consents set revoked_at=now() where user_id=auth.uid();
  update public.conversation_memories set status='deleted',summary='',embedding=null,updated_at=now()
    where user_id=auth.uid() and status<>'deleted';
  return true;
end;
$$;

-- Exact cosine search for the initial small dataset; indexed ANN is a later optimisation.
create function public.match_memories(p_embedding extensions.vector,p_model text)
returns table(id uuid, summary text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id,m.summary,m.created_at from public.conversation_memories m
  where m.user_id=auth.uid() and public.memory_is_enabled() and m.status='ready'
    and m.embedding_model=p_model and extensions.vector_dims(p_embedding)=1536
    and extensions.vector_norm(p_embedding)>0
    and 1-(m.embedding operator(extensions.<=>) p_embedding)>0.30
  order by m.embedding operator(extensions.<=>) p_embedding, m.created_at desc limit 5;
$$;

revoke all on function public.memory_is_enabled(),public.accept_memory_consent(text,boolean,boolean),
  public.claim_memory(text),public.finish_memory(uuid,uuid,text,extensions.vector,text,text),
  public.fail_memory(uuid,uuid),public.forget_memory(uuid),public.withdraw_memory_consent(),
  public.match_memories(extensions.vector,text) from public,anon,authenticated;
grant execute on function public.memory_is_enabled(),public.accept_memory_consent(text,boolean,boolean),
  public.claim_memory(text),public.finish_memory(uuid,uuid,text,extensions.vector,text,text),
  public.fail_memory(uuid,uuid),public.forget_memory(uuid),public.withdraw_memory_consent(),
  public.match_memories(extensions.vector,text) to authenticated;
