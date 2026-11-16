-- Server persists chat before replying; client outbox may safely replay those exact IDs.
create or replace function public.save_conversation_batch(p_id uuid,p_messages jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare item jsonb; signature text; old_signature text;
begin
  if not public.conversation_is_enabled() then raise exception 'consent_required'; end if;
  if p_id is null or jsonb_typeof(p_messages)<>'array' or jsonb_array_length(p_messages) not between 1 and 12 or octet_length(p_messages::text)>100000 then raise exception 'invalid_messages'; end if;
  signature:=md5(p_messages::text);
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select fingerprint into old_signature from public.conversation_batches where user_id=auth.uid() and id=p_id;
  if found then
    if old_signature<>signature then raise exception 'batch_conflict'; end if;
    return true;
  end if;
  insert into public.conversation_batches(user_id,id,fingerprint) values(auth.uid(),p_id,signature);
  for item in select * from jsonb_array_elements(p_messages) loop
    if item->>'role' not in ('user','assistant') or char_length(item->>'content') not between 1 and 8000
      or (item->>'at')::timestamptz<=now()-interval '30 days' or (item->>'at')::timestamptz>now()+interval '5 minutes'
      or item->>'at' is null or item->>'content' is null then raise exception 'invalid_message'; end if;
    -- Never overwrite an existing message on replay or from another tab.
    insert into public.conversation_messages(user_id,id,batch_id,role,content,created_at)
      values(auth.uid(),(item->>'id')::uuid,p_id,item->>'role',item->>'content',(item->>'at')::timestamptz) on conflict(user_id,id) do nothing;
    if not found and exists(select 1 from public.conversation_messages m where m.user_id=auth.uid() and m.id=(item->>'id')::uuid
      and (m.role is distinct from item->>'role' or m.content is distinct from item->>'content' or m.created_at is distinct from (item->>'at')::timestamptz)) then raise exception 'message_conflict'; end if;
  end loop;
  return true;
end;
$$;

