-- Phone ID -> SMS verification -> password. SMS signup creates a temporary
-- random password hash, so mere hash presence must NEVER grant membership.
begin;

create function public.register_phone_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.phone_confirmed_at is not null
    and nullif(new.phone, '') is not null
    and new.phone_confirmed_at is not null
    and new.phone is not distinct from old.phone
    and nullif(new.encrypted_password, '') is not null
    and new.encrypted_password is distinct from old.encrypted_password then
    insert into public.members (user_id) values (new.id)
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.register_phone_member() from public, anon, authenticated;

create trigger register_phone_member_after_auth
  after update of encrypted_password on auth.users
  for each row execute function public.register_phone_member();

-- No backfill: pre-existing hashes may also be SMS-generated temporary values.
-- Pending accounts resume password setup. Existing members/referrals stay intact.

commit;
