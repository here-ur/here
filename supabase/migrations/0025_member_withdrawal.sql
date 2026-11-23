-- Member withdrawal: mark the member, block sign-in, keep data for one year, then purge.
-- The one-year retention is a draft policy (purpose/legal basis not confirmed by the team or legal yet).
-- Withdrawn accounts cannot sign in or sign up again with the same account until the purge.
-- Apply to here-dev first. The purge schedule lives in 0026 (pg_cron).
begin;

alter table public.members add column withdrawn_at timestamptz;

-- Deleting an auth user must not be blocked by an old invite redemption.
alter table public.invite_codes drop constraint if exists invite_codes_redeemed_by_fkey;
alter table public.invite_codes add constraint invite_codes_redeemed_by_fkey
  foreign key (redeemed_by) references auth.users(id) on delete set null;

-- Returns 'ok' | 'not_member'. Calling it again keeps the first withdrawal time.
-- The ban outlives the purge on purpose: if the purge ever stops, the account still cannot sign in.
create function public.withdraw_member() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then return 'not_member'; end if;
  update public.members set withdrawn_at = coalesce(withdrawn_at, now()) where user_id = v_user;
  if not found then return 'not_member'; end if;
  update auth.users set banned_until = now() + interval '100 years' where id = v_user;
  -- Signs out every device: refresh tokens die with their sessions, and access tokens with a removed session are refused.
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;
  return 'ok';
end;
$$;
revoke all on function public.withdraw_member() from public, anon, authenticated;
grant execute on function public.withdraw_member() to authenticated;

-- Deleting the auth user cascades to members and every table keyed by the member.
create function public.purge_withdrawn_members() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  delete from auth.users u using public.members m
    where m.user_id = u.id and m.withdrawn_at <= now() - interval '1 year';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_withdrawn_members() from public, anon, authenticated;

commit;
