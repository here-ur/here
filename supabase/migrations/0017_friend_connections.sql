-- SNS accounts use explicit friend invitations, independently of signup attribution.
create table public.friendships (
 user_low uuid not null references public.members(user_id) on delete cascade,
 user_high uuid not null references public.members(user_id) on delete cascade,
 created_by uuid not null references public.members(user_id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_low,user_high),
 check(user_low<user_high),check(created_by in(user_low,user_high))
);
create index friendships_high on public.friendships(user_high,created_at desc);
create table public.friend_invites (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.members(user_id) on delete cascade,
 code text not null unique default replace(gen_random_uuid()::text,'-',''),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 revoked_at timestamptz,
 use_count integer not null default 0 check(use_count between 0 and 3)
);
create index friend_invites_owner on public.friend_invites(owner_id,created_at desc);
create table public.friend_invite_acceptances (
 invite_id uuid not null references public.friend_invites(id) on delete cascade,
 user_id uuid not null references public.members(user_id) on delete cascade,
 accepted_at timestamptz not null default now(),
 primary key(invite_id,user_id)
);
alter table public.friendships enable row level security;
alter table public.friend_invites enable row level security;
alter table public.friend_invite_acceptances enable row level security;
revoke all on public.friendships,public.friend_invites,public.friend_invite_acceptances from public,anon,authenticated;
grant select on public.friendships to authenticated;
create policy own_friendships on public.friendships for select to authenticated using(auth.uid() in(user_low,user_high));
-- Tokens and redemption history are available only through narrowly scoped RPCs, never table reads.
-- Preserve previously visible invite-linked friends once; future removals never consult invited_by.
insert into public.friendships(user_low,user_high,created_by,created_at)
select least(m.user_id,m.invited_by),greatest(m.user_id,m.invited_by),m.invited_by,m.joined_at
from public.members m where m.invited_by is not null and m.invited_by<>m.user_id
on conflict do nothing;

create function public.list_friend_connections() returns table(friend_id uuid,display_name text,connected_at timestamptz)
language sql stable security definer set search_path='' as $$
 select m.user_id,m.display_name,f.created_at from public.friendships f
 join public.members m on m.user_id=case when f.user_low=auth.uid() then f.user_high else f.user_low end
 where auth.uid() in(f.user_low,f.user_high) order by f.created_at desc,m.user_id
$$;
-- Compatibility for already-open old clients, without resurrecting removed legacy relationships.
create or replace function public.list_friends() returns table(display_name text,relation text,joined_at timestamptz)
language sql stable security definer set search_path='' as $$
 select m.display_name,case when f.created_by=auth.uid() then 'invited_by_me' else 'invited_me' end,m.joined_at
 from public.friendships f join public.members m on m.user_id=case when f.user_low=auth.uid() then f.user_high else f.user_low end
 where auth.uid() in(f.user_low,f.user_high) order by m.joined_at desc
$$;

create function public.create_friend_invite() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invitation public.friend_invites;
begin
 if uid is null or not exists(select 1 from public.members where user_id=uid) then raise exception 'member_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,17));
 select * into invitation from public.friend_invites where owner_id=uid and revoked_at is null and expires_at>now() and use_count<3 order by created_at desc limit 1;
 if invitation.id is null then
  if (select count(*) from public.friend_invites where owner_id=uid and created_at>now()-interval '1 day')>=10 then raise exception 'invite_rate_limit'; end if;
  insert into public.friend_invites(owner_id) values(uid) returning * into invitation;
 end if;
 return jsonb_build_object('code',invitation.code,'expires_at',invitation.expires_at,'remaining',3-invitation.use_count);
end;$$;

create function public.friend_invite_details(p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invitation public.friend_invites;
begin
 if uid is null or not exists(select 1 from public.members where user_id=uid) then raise exception 'member_required'; end if;
 if p_code is null or p_code!~'^[a-f0-9]{32}$' then return null; end if;
 select * into invitation from public.friend_invites where code=p_code and revoked_at is null and expires_at>now();
 if invitation.id is null then return null; end if;
 if exists(select 1 from public.friendships where user_low=least(uid,invitation.owner_id) and user_high=greatest(uid,invitation.owner_id)) then
  return jsonb_build_object('status','already_friends');
 end if;
 if exists(select 1 from public.friend_invite_acceptances where invite_id=invitation.id and user_id=uid) or invitation.use_count>=3 then return null; end if;
 return jsonb_build_object('status',case when uid=invitation.owner_id then 'self' else 'available' end,
  'display_name',(select display_name from public.members where user_id=invitation.owner_id),'expires_at',invitation.expires_at);
end;$$;

create function public.accept_friend_invite(p_code text) returns text
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invitation public.friend_invites; changed integer;
begin
 if uid is null or not exists(select 1 from public.members where user_id=uid) then raise exception 'member_required'; end if;
 if p_code is null or p_code!~'^[a-f0-9]{32}$' then return 'invalid'; end if;
 -- One invite lock serializes its remaining slots across recipients and server instances.
 select * into invitation from public.friend_invites where code=p_code for update;
 if invitation.id is null or invitation.revoked_at is not null or invitation.expires_at<=now() then return 'invalid'; end if;
 if uid=invitation.owner_id then return 'self'; end if;
 -- Lock the pair as well: crossed invitations create one relationship and consume one slot.
 perform pg_advisory_xact_lock(hashtextextended(least(uid,invitation.owner_id)::text||greatest(uid,invitation.owner_id)::text,18));
 if exists(select 1 from public.friendships where user_low=least(uid,invitation.owner_id) and user_high=greatest(uid,invitation.owner_id)) then return 'already_friends'; end if;
 if exists(select 1 from public.friend_invite_acceptances where invite_id=invitation.id and user_id=uid) then return 'used'; end if;
 if invitation.use_count>=3 then return 'invalid'; end if;
 insert into public.friendships(user_low,user_high,created_by) values(least(uid,invitation.owner_id),greatest(uid,invitation.owner_id),invitation.owner_id) on conflict do nothing;
 get diagnostics changed=row_count;
 if changed=0 then return 'already_friends'; end if;
 insert into public.friend_invite_acceptances(invite_id,user_id) values(invitation.id,uid);
 update public.friend_invites set use_count=use_count+1 where id=invitation.id;
 return 'accepted';
end;$$;

create function public.revoke_friend_invite(p_code text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.friend_invites set revoked_at=coalesce(revoked_at,now()) where code=p_code and owner_id=auth.uid();
 return found;
end;$$;
create function public.remove_friend_connection(p_friend uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or p_friend is null or uid=p_friend then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(least(uid,p_friend)::text||greatest(uid,p_friend)::text,18));
 delete from public.friendships where user_low=least(uid,p_friend) and user_high=greatest(uid,p_friend);
 return found;
end;$$;
revoke all on function public.list_friend_connections(),public.create_friend_invite(),public.friend_invite_details(text),public.accept_friend_invite(text),public.revoke_friend_invite(text),public.remove_friend_connection(uuid) from public,anon,authenticated;
grant execute on function public.list_friend_connections(),public.create_friend_invite(),public.friend_invite_details(text),public.accept_friend_invite(text),public.revoke_friend_invite(text),public.remove_friend_connection(uuid) to authenticated;
