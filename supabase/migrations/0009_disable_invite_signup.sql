-- Retire invite-based membership creation. Keep existing members, referrals and
-- invite records, but no client (including an old app) may redeem a signup code.
begin;

create or replace function public.redeem_invite(p_code text)
returns boolean
language sql immutable security invoker set search_path = ''
as $$ select false; $$;

create or replace function public.invite_available(p_code text)
returns boolean
language sql immutable security invoker set search_path = ''
as $$ select false; $$;

revoke all on function public.redeem_invite(text), public.invite_available(text)
  from public, anon, authenticated;

commit;
