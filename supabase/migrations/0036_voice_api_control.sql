-- Use the database clock for paid request start and cleanup observations.
create function public.begin_voice_request(p_id uuid,p_token text) returns timestamptz
language plpgsql security definer set search_path='' as $$
begin
 if public.begin_voice_usage(p_id,p_token) then return clock_timestamp(); end if;
 return null;
end;$$;
create function public.finish_voice_observed(p_id uuid,p_token text) returns boolean
language sql security definer set search_path='' as $$
 select public.finish_voice_usage(p_id,p_token,clock_timestamp());
$$;
create function public.voice_call_authorized(p_id uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(select 1 from public.voice_usage_sessions s join public.members m on m.user_id=s.user_id
 where s.id=p_id and s.user_id=auth.uid() and s.state='active' and s.close_requested_at is null
 and s.deadline_at>clock_timestamp() and m.withdrawn_at is null);
$$;
revoke all on function public.begin_voice_request(uuid,text),public.finish_voice_observed(uuid,text),public.voice_call_authorized(uuid) from public,anon,authenticated;
grant execute on function public.begin_voice_request(uuid,text),public.finish_voice_observed(uuid,text) to anon,authenticated;
grant execute on function public.voice_call_authorized(uuid) to authenticated;
