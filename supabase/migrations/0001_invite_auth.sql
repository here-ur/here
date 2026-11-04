-- 초대코드를 인증된 전화번호의 계정에 한 번만 연결한다.
create extension if not exists pgcrypto with schema extensions;

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  invited_by uuid references public.members(user_id) on delete set null,
  joined_at timestamptz not null default now()
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  inviter_id uuid references public.members(user_id) on delete set null,
  redeemed_by uuid unique references auth.users(id),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

create index invite_codes_inviter_id_idx on public.invite_codes(inviter_id);

alter table public.members enable row level security;
alter table public.invite_codes enable row level security;
revoke all on public.members, public.invite_codes from anon, authenticated;
grant select on public.members to authenticated;

create policy members_read_self on public.members
  for select to authenticated using (user_id = (select auth.uid()));

create function public.invite_available(p_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_code ~ '^[0-9A-F]{16}$' and exists (
    select 1 from public.invite_codes
    where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
      and redeemed_by is null
  );
$$;

create function public.redeem_invite(p_code text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_inviter uuid;
begin
  if v_user is null or p_code !~ '^[0-9A-F]{16}$' then return false; end if;
  if not exists (
    select 1 from auth.users
    where id = v_user and phone_confirmed_at is not null
  ) then return false; end if;
  if exists (select 1 from public.members where user_id = v_user) then return true; end if;

  update public.invite_codes
    set redeemed_by = v_user, redeemed_at = now()
    where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
      and redeemed_by is null
    returning inviter_id into v_inviter;
  if not found then return false; end if;

  insert into public.members (user_id, invited_by) values (v_user, v_inviter);
  return true;
end;
$$;

create function public.create_invite_code()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text;
begin
  if v_user is null or not exists (select 1 from public.members where user_id = v_user) then
    raise exception 'membership_required';
  end if;
  v_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));
  insert into public.invite_codes (code_hash, inviter_id)
    values (encode(extensions.digest(v_code, 'sha256'), 'hex'), v_user);
  return v_code;
end;
$$;

-- 첫 초대코드는 대시보드 SQL Editor에서 발급한다. 앱 사용자에게는 실행을 허용하지 않는다.
create function public.bootstrap_invite_code()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := upper(encode(extensions.gen_random_bytes(8), 'hex'));
begin
  insert into public.invite_codes (code_hash)
    values (encode(extensions.digest(v_code, 'sha256'), 'hex'));
  return v_code;
end;
$$;

revoke all on function public.invite_available(text), public.redeem_invite(text), public.create_invite_code(), public.bootstrap_invite_code() from public, anon, authenticated;
grant execute on function public.invite_available(text) to anon, authenticated;
grant execute on function public.redeem_invite(text), public.create_invite_code() to authenticated;
