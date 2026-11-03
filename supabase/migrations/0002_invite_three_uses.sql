-- 기존 초대코드는 이미 사용한 1명을 포함해 최대 3명이 사용할 수 있다.
begin;

alter table public.invite_codes
  add column max_uses integer not null default 3,
  add column used_count integer not null default 0;

-- 기존 redeemed_by는 첫 사용자를 뜻한다. 이미 사용한 코드는 1회로 이관한다.
update public.invite_codes
  set used_count = 1
  where redeemed_by is not null;

alter table public.invite_codes
  add constraint invite_codes_use_limit check (
    max_uses between 1 and 3 and used_count between 0 and max_uses
  );

create or replace function public.invite_available(p_code text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(p_code ~ '^[0-9A-F]{16}$' and exists (
    select 1 from public.invite_codes
    where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
      and used_count < max_uses
  ), false);
$$;

create or replace function public.redeem_invite(p_code text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_inviter uuid;
begin
  if v_user is null or p_code !~ '^[0-9A-F]{16}$' then return false; end if;

  -- 같은 사용자의 동시 요청을 직렬화해 사용 횟수가 두 번 차감되지 않게 한다.
  perform 1 from auth.users
    where id = v_user and phone_confirmed_at is not null
    for update;
  if not found then return false; end if;
  if exists (select 1 from public.members where user_id = v_user) then return true; end if;

  -- 이 행의 동시 갱신은 DB가 직렬화한다. 남은 횟수가 없으면 갱신되지 않는다.
  update public.invite_codes
    set used_count = used_count + 1,
        redeemed_by = coalesce(redeemed_by, v_user),
        redeemed_at = coalesce(redeemed_at, now())
    where code_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
      and used_count < max_uses
    returning inviter_id into v_inviter;
  if not found then return false; end if;

  insert into public.members (user_id, invited_by) values (v_user, v_inviter);
  return true;
end;
$$;

commit;
