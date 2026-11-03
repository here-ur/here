-- Personal-memory consent audit only. Not permission for shared-model training.
-- Existing state is explicitly a snapshot, not reconstructed historical consent.
create table public.memory_consent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.members(user_id) on delete cascade,
  event_type text not null check (event_type in ('snapshot','accepted','revoked')),
  version text not null,
  privacy_accepted boolean not null,
  sensitive_accepted boolean not null,
  accepted_at timestamptz not null,
  revoked_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp()
);
create index memory_consent_events_owner_date on public.memory_consent_events(user_id,recorded_at desc);
alter table public.memory_consent_events enable row level security;
revoke all on public.memory_consent_events from public,anon,authenticated;
grant select on public.memory_consent_events to authenticated;
create policy consent_events_self on public.memory_consent_events for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.memory_consent_events(user_id,event_type,version,privacy_accepted,sensitive_accepted,accepted_at,revoked_at)
  select user_id,'snapshot',version,privacy_accepted,sensitive_accepted,accepted_at,revoked_at from public.memory_consents;

create function public.record_memory_consent_event() returns trigger
language plpgsql security definer set search_path = '' as $$
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
  insert into public.memory_consent_events(user_id,event_type,version,privacy_accepted,sensitive_accepted,accepted_at,revoked_at)
    values(new.user_id,kind,new.version,new.privacy_accepted,new.sensitive_accepted,new.accepted_at,new.revoked_at);
  return new;
end;
$$;
revoke all on function public.record_memory_consent_event() from public,anon,authenticated;
create trigger memory_consent_audit after insert or update on public.memory_consents
  for each row execute function public.record_memory_consent_event();
