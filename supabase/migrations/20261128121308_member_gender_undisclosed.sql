-- Explicit opt-out is distinct from an unanswered (null) gender.
begin;
alter table public.members drop constraint members_gender_check;
alter table public.members add constraint members_gender_check
  check (gender is null or gender in ('female', 'male', 'undisclosed'));

create or replace function public.set_member_basics(p_gender text, p_birth_date date) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if v_user is null then return 'not_member'; end if;
  if p_gender is null or p_gender not in ('female', 'male', 'undisclosed') or p_birth_date is null
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
