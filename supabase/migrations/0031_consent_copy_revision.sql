-- Editorial revision of existing conversation/memory consent; scope is unchanged.
-- Apply with the matching app release before enabling consent writes in here-dev.
-- Existing accepted versions retain their original grants and immutable event history.
begin;
update public.consent_versions set is_current = false where is_current;
insert into public.consent_versions (version, covers_memory, covers_conversation, is_current)
values ('2026-11-28-dev-v3', true, true, true);
commit;
