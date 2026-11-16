-- Add Google/Kakao member registration without changing existing login methods.
begin;

create function public.register_verified_member()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1 from auth.users u where u.id = v_user
      and (u.banned_until is null or u.banned_until <= now())
  ) then return false; end if;
  if exists (select 1 from public.members where user_id = v_user) then return true; end if;
  if not exists (
    select 1 from auth.identities i
    where i.user_id = v_user and i.provider in ('google', 'kakao')
  ) then return false; end if;

  insert into public.members (user_id) values (v_user)
    on conflict (user_id) do nothing;
  return true;
end;
$$;
revoke all on function public.register_verified_member() from public, anon;
grant execute on function public.register_verified_member() to authenticated;
commit;
