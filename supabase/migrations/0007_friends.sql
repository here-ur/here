-- Apply to here-dev first. Friends are members linked by an invite: people I invited and the person who invited me.
-- Friends see only the nickname each member chose and the join date. No phone number, conversation, memory or report.
alter table public.members add column display_name text
  check (display_name is null or (char_length(display_name) between 1 and 20 and display_name !~ '[[:cntrl:]]'));

create function public.set_display_name(p_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if v_user is null then return false; end if;
  if v_name is not null and (char_length(v_name) > 20 or v_name ~ '[[:cntrl:]]') then return false; end if;
  update public.members set display_name = v_name where user_id = v_user;
  return found;
end;
$$;

create function public.list_friends() returns table(display_name text, relation text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.display_name, 'invited_by_me', m.joined_at
    from public.members m
    where m.invited_by = (select auth.uid()) and m.user_id <> (select auth.uid())
  union all
  select inviter.display_name, 'invited_me', inviter.joined_at
    from public.members me
    join public.members inviter on inviter.user_id = me.invited_by
    where me.user_id = (select auth.uid()) and inviter.user_id <> me.user_id
  order by joined_at desc
$$;

revoke all on function public.set_display_name(text), public.list_friends() from public, anon, authenticated;
grant execute on function public.set_display_name(text), public.list_friends() to authenticated;
