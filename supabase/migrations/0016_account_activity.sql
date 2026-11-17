-- Account-scoped garden/library data. Raw dialogue is still governed by its 30-day policy.
create table public.activity_days (
 user_id uuid not null references public.members(user_id) on delete cascade,
 day date not null,
 stats jsonb not null,
 updated_at timestamptz not null default now(),
 primary key(user_id,day),
 check(jsonb_typeof(stats)='object')
);
create table public.activity_choices (
 user_id uuid not null references public.members(user_id) on delete cascade,
 kind text not null check(kind in ('seed','mine','ai','tried','sky')),
 day date not null,
 value jsonb not null,
 changed_at bigint not null,
 primary key(user_id,kind,day)
);
create table public.practice_events (
 user_id uuid not null references public.members(user_id) on delete cascade,
 day date not null,
 practice_id text not null check(practice_id in ('breath','good-line','water','shoulders','window','thanks','one-thing','walk')),
 action text not null check(action in ('done','later','closed')),
 primary key(user_id,day,practice_id,action)
);

alter table public.activity_days enable row level security;
alter table public.activity_choices enable row level security;
alter table public.practice_events enable row level security;
revoke all on public.activity_days,public.activity_choices,public.practice_events from anon,authenticated;
grant select on public.activity_days,public.activity_choices,public.practice_events to authenticated;
create policy own_activity_days on public.activity_days for select to authenticated using(user_id=auth.uid() and public.conversation_is_enabled());
create policy own_activity_choices on public.activity_choices for select to authenticated using(user_id=auth.uid() and public.conversation_is_enabled());
create policy own_practice_events on public.practice_events for select to authenticated using(user_id=auth.uid() and public.conversation_is_enabled());

-- One transaction and account lock: retries, overlapping browser imports and multiple devices are safe.
-- at=0 is legacy import: it can fill a missing choice, never replace a newer server choice.
create function public.sync_account_activity(p_days jsonb default '[]',p_choices jsonb default '[]',p_practices jsonb default '[]') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); item jsonb; d date; old jsonb; stamp bigint; v_kind text; v_value jsonb; cutoff date:=(now() at time zone 'Asia/Seoul')::date-365; result jsonb;
begin
 if uid is null or not public.conversation_is_enabled() then raise exception 'consent_required'; end if;
 if not exists(select 1 from public.members where user_id=uid) then raise exception 'member_required'; end if;
 if jsonb_typeof(p_days) is distinct from 'array' or jsonb_typeof(p_choices) is distinct from 'array' or jsonb_typeof(p_practices) is distinct from 'array'
 or jsonb_array_length(p_days)>366 or jsonb_array_length(p_choices)>2000 or jsonb_array_length(p_practices)>9000
 or octet_length(p_days::text)+octet_length(p_choices::text)+octet_length(p_practices::text)>1500000 then raise exception 'invalid_activity'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,16));
 for item in select * from jsonb_array_elements(p_days) loop
  d:=(item->>'date')::date;
  if d is null or d>(now() at time zone 'Asia/Seoul')::date then raise exception 'invalid_day'; end if;
  if d<cutoff then continue; end if;
  if jsonb_typeof(item->'hours') is distinct from 'array' or jsonb_array_length(item->'hours')<>24
   or jsonb_typeof(item->'words') is distinct from 'object' or length((item->'words')::text)>2000
   or jsonb_typeof(item->'crisis') is distinct from 'boolean'
   or coalesce((item->>'said')::integer,-1) not between 0 and 1000000
   or coalesce((item->>'replies')::integer,-1) not between 0 and 1000000
   or exists(select 1 from jsonb_array_elements_text(item->'hours') n where n::integer not between 0 and 1000000)
   or exists(select 1 from jsonb_each_text(item->'words') w where length(w.key)>20 or w.value::integer not between 0 and 1000000)
   then raise exception 'invalid_stats'; end if;
  -- Only statistics belong here; user/AI choices have their own independently merged rows.
  item:=jsonb_build_object('date',d,'said',item->'said','replies',item->'replies','hours',item->'hours','words',item->'words','crisis',item->'crisis');
  select stats into old from public.activity_days where user_id=uid and day=d;
  if old is not null and (old->>'said')::integer+(old->>'replies')::integer>(item->>'said')::integer+(item->>'replies')::integer then
   item:=old||jsonb_build_object('crisis',(old->>'crisis')::boolean or (item->>'crisis')::boolean);
  elsif old is not null then item:=item||jsonb_build_object('crisis',(old->>'crisis')::boolean or (item->>'crisis')::boolean); end if;
  if (item->>'crisis')::boolean then item:=item||'{"words":{}}'; end if;
  insert into public.activity_days values(uid,d,item,now()) on conflict(user_id,day) do update set stats=excluded.stats,updated_at=excluded.updated_at;
 end loop;
 for item in select * from jsonb_array_elements(p_choices) loop
  v_kind:=item->>'kind'; d:=(item->>'day')::date; v_value:=item->'value';
  if v_kind is null or v_kind not in ('seed','mine','ai','tried','sky') or d is null or v_value is null then raise exception 'invalid_choice'; end if;
  if v_kind='sky' then d:='1970-01-01'; elsif d<cutoff then continue; elsif d>(now() at time zone 'Asia/Seoul')::date then raise exception 'invalid_day'; end if;
  if v_kind='seed' and (jsonb_typeof(v_value)<>'string' or v_value#>>'{}' not in ('tasty','laugh','weekend','song','walk','friend','work-small','place','morning','pet','rest-best','thanks'))
   or v_kind='mine' and v_value<>'null' and (jsonb_typeof(v_value)<>'string' or v_value#>>'{}' not in ('sunny','cozy','cloudy','rain','thunder','wind'))
   or v_kind='ai' and v_value<>'null' and (jsonb_typeof(v_value)<>'string' or v_value#>>'{}' not in ('sunny','cozy','cloudy','rain','thunder','wind','none'))
   or v_kind='sky' and v_value not in ('"on"','"off"')
   or v_kind='tried' and (jsonb_typeof(v_value)<>'number' or (v_value#>>'{}')::numeric<0 or (v_value#>>'{}')::numeric>extract(epoch from now())*1000+300000)
   then raise exception 'invalid_value'; end if;
  stamp:=(item->>'at')::bigint;
  if stamp is null or stamp<0 or stamp>extract(epoch from now())*1000+300000 then raise exception 'invalid_clock'; end if;
  insert into public.activity_choices values(uid,v_kind,d,v_value,stamp)
   on conflict(user_id,kind,day) do update set value=excluded.value,changed_at=excluded.changed_at
   where excluded.changed_at>activity_choices.changed_at;
 end loop;
 for item in select * from jsonb_array_elements(p_practices) loop
  d:=(item->>'day')::date;
  if d is null or d>(now() at time zone 'Asia/Seoul')::date then raise exception 'invalid_day'; end if;
  if d<cutoff then continue; end if;
  insert into public.practice_events values(uid,d,item->>'id',item->>'action') on conflict do nothing;
 end loop;
 delete from public.activity_days where user_id=uid and day<cutoff;
 delete from public.activity_choices where user_id=uid and kind<>'sky' and day<cutoff;
 delete from public.practice_events where user_id=uid and day<cutoff;
 select jsonb_build_object(
  'days',coalesce((select jsonb_agg(stats order by day) from public.activity_days where user_id=uid),'[]'),
  'choices',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'day',day,'value',value,'at',changed_at)) from public.activity_choices where user_id=uid),'[]'),
  'practices',coalesce((select jsonb_agg(jsonb_build_object('day',day,'id',practice_id,'action',action)) from public.practice_events where user_id=uid),'[]')
 ) into result;
 return result;
end;
$$;
revoke all on function public.sync_account_activity(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.sync_account_activity(jsonb,jsonb,jsonb) to authenticated;

create function public.erase_activity_on_withdrawal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.revoked_at is not null then
  delete from public.activity_days where user_id=new.user_id;
  delete from public.activity_choices where user_id=new.user_id;
  delete from public.practice_events where user_id=new.user_id;
 end if;
 return new;
end;
$$;
create trigger erase_activity_on_withdrawal after update of revoked_at on public.memory_consents for each row execute function public.erase_activity_on_withdrawal();
revoke all on function public.erase_activity_on_withdrawal() from public,anon,authenticated;

create function public.purge_expired_activity() returns void language sql security definer set search_path='' as $$
 delete from public.activity_days where day<(now() at time zone 'Asia/Seoul')::date-365;
 delete from public.activity_choices where kind<>'sky' and day<(now() at time zone 'Asia/Seoul')::date-365;
 delete from public.practice_events where day<(now() at time zone 'Asia/Seoul')::date-365;
$$;
revoke all on function public.purge_expired_activity() from public,anon,authenticated;
-- pg_cron is already installed in the development project. Tests without the extension skip only scheduling.
do $$begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute $cron$select cron.schedule('here-activity-retention','15 0 * * *','select public.purge_expired_activity()')$cron$;
 end if;
end$$;
