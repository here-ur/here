-- Email -> OTP -> choose password. Apply with the new login UI.
begin;

drop trigger if exists register_phone_member_after_auth on auth.users;
drop function if exists public.register_phone_member();

-- The initial OTP-generated hash is not a chosen password. Register only when
-- an already email-verified account changes its password via Auth.
create function public.register_email_member()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.email_confirmed_at is not null
    and nullif(new.email, '') is not null
    and new.email_confirmed_at is not null
    and new.email is not distinct from old.email
    and (new.banned_until is null or new.banned_until <= now())
    and nullif(new.encrypted_password, '') is not null
    and new.encrypted_password is distinct from old.encrypted_password then
    insert into public.members (user_id) values (new.id)
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.register_email_member() from public, anon, authenticated;
create trigger register_email_member_after_auth
  after update of encrypted_password on auth.users
  for each row execute function public.register_email_member();

commit;
