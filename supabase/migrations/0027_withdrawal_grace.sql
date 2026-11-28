-- Withdrawal grace period (7 days). Replaces the immediate ban from 0025.
-- Withdrawing signs out every device and marks the member; for 7 days the member can sign in again
-- and choose to cancel. After 7 days the account is banned (finalize_withdrawals, see 0028),
-- and one year after that it is purged. The one-year retention is still a draft policy.
-- Apply to here-dev first, after 0025.
begin;

-- Withdraw: mark and sign out every device. No ban yet, so the member can come back to cancel.
create or replace function public.withdraw_member() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then return 'not_member'; end if;
  update public.members set withdrawn_at = coalesce(withdrawn_at, now()) where user_id = v_user;
  if not found then return 'not_member'; end if;
  delete from auth.refresh_tokens where user_id = v_user::text;
  delete from auth.sessions where user_id = v_user;
  return 'ok';
end;
$$;

-- Cancel within the grace period. Returns 'ok' | 'expired' | 'not_withdrawn' | 'not_member'.
create function public.cancel_withdrawal() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_at timestamptz;
begin
  if v_user is null then return 'not_member'; end if;
  select withdrawn_at into v_at from public.members where user_id = v_user for update;
  if not found then return 'not_member'; end if;
  if v_at is null then return 'not_withdrawn'; end if;
  if v_at <= now() - interval '7 days' then return 'expired'; end if;
  update public.members set withdrawn_at = null where user_id = v_user;
  return 'ok';
end;
$$;
revoke all on function public.cancel_withdrawal() from public, anon, authenticated;
grant execute on function public.cancel_withdrawal() to authenticated;

-- After the grace period: ban sign-in and drop any sessions. The ban outlives the purge on purpose.
create function public.finalize_withdrawals() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(u.id), '{}') into v_ids from auth.users u join public.members m on m.user_id = u.id
    where m.withdrawn_at <= now() - interval '7 days' and (u.banned_until is null or u.banned_until <= now());
  if cardinality(v_ids) = 0 then return 0; end if;
  update auth.users set banned_until = now() + interval '100 years' where id = any(v_ids);
  delete from auth.refresh_tokens where user_id = any(select x::text from unnest(v_ids) x);
  delete from auth.sessions where user_id = any(v_ids);
  return cardinality(v_ids);
end;
$$;
revoke all on function public.finalize_withdrawals() from public, anon, authenticated;

-- Purge one year after the withdrawal became final (7 days + 1 year after withdrawing).
create or replace function public.purge_withdrawn_members() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  delete from auth.users u using public.members m
    where m.user_id = u.id and m.withdrawn_at <= now() - interval '1 year 7 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.purge_withdrawn_members() from public, anon, authenticated;

commit;
