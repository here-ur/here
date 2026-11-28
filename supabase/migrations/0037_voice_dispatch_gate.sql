-- Refuse paid creation before reserving when dispatch is disabled.
create or replace function public.reserve_voice_usage(p_id uuid,p_token_hash text,p_authority_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); stamp timestamptz; usage jsonb; remaining integer; old public.voice_usage_sessions;
begin
  if uid is null or not exists(select 1 from public.members where user_id=uid and withdrawn_at is null) then raise exception 'member_required'; end if;
  if p_authority_token is null or p_authority_token !~ '^[a-f0-9]{64}$' or not exists(
    select 1 from public.voice_control_authority where token_hash=encode(sha256(convert_to(p_authority_token,'UTF8')),'hex')
  ) then return jsonb_build_object('allowed',false,'code','voice_control_unavailable'); end if;
  if not exists(select 1 from public.voice_watch_config where enabled and endpoint is not null) then
    return jsonb_build_object('allowed',false,'code','voice_control_unavailable');
  end if;
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,31));
  stamp:=clock_timestamp();
  update public.voice_usage_sessions set state='cancelled'
    where user_id=uid and state='reserved' and reservation_expires_at<=stamp;
  select * into old from public.voice_usage_sessions where id=p_id;
  if found then
    if old.user_id<>uid or old.token_hash<>p_token_hash then raise exception 'reservation_conflict'; end if;
    -- A retry must not create a second provider session from the same reservation.
    return jsonb_build_object('allowed',old.state='reserved','code','voice_reservation_exists');
  end if;
  usage:=public.voice_usage_at(uid,stamp);
  if (usage->>'active_call')::boolean then return jsonb_build_object('allowed',false,'code','voice_call_active'); end if;
  remaining:=floor(least(300,600-(usage->'day'->>'used_seconds')::numeric,1800-(usage->'month'->>'used_seconds')::numeric));
  if remaining<1 then
    return jsonb_build_object('allowed',false,'code',case when floor(1800-(usage->'month'->>'used_seconds')::numeric)<1 then 'voice_monthly_limit' else 'voice_daily_limit' end);
  end if;
  insert into public.voice_usage_sessions(id,user_id,token_hash,state,reservation_expires_at)
    values(p_id,uid,p_token_hash,'reserved',stamp+interval '60 seconds');
  return jsonb_build_object('allowed',true,'max_seconds',remaining);
end;
$$;

