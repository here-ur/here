-- New members enter gender and birth date once, after memory consent and before meeting the character.
-- Members who joined before this migration are not asked: their rows keep basics_required = false.
-- Under-14 birth dates are refused (no legal-guardian consent flow yet). Apply to here-dev first.
begin;

alter table public.members
  add column gender text check (gender is null or gender in ('female', 'male')),
  add column birth_date date check (birth_date is null or birth_date >= date '1900-01-01'),
  add column basics_required boolean not null default false;
-- Existing rows were filled with false above. Only members inserted from now on start as required.
alter table public.members alter column basics_required set default true;

-- Returns 'ok' | 'invalid' | 'under_14' | 'not_member'. Members may correct their own values later.
-- Age follows the Korean calendar date; a 29 February birthday turns 14 on 28 February in a common year.
create function public.set_member_basics(p_gender text, p_birth_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_user is null then return 'not_member'; end if;
  if p_gender is null or p_gender not in ('female', 'male') or p_birth_date is null
    or p_birth_date < date '1900-01-01' or p_birth_date > v_today then return 'invalid'; end if;
  if (p_birth_date + interval '14 years')::date > v_today then return 'under_14'; end if;
  update public.members set gender = p_gender, birth_date = p_birth_date where user_id = v_user;
  if not found then return 'not_member'; end if;
  return 'ok';
end;
$$;

revoke all on function public.set_member_basics(text, date) from public, anon, authenticated;
grant execute on function public.set_member_basics(text, date) to authenticated;

commit;
