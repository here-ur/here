-- Read the account's stored context before opening a Live connection.
begin;
create function public.read_live_context() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when public.conversation_is_enabled() then jsonb_build_object(
  'chat_summary', coalesce((select summary from public.chat_context_state where user_id=auth.uid()),''),
  'retrieved_memories', coalesce((select jsonb_agg(jsonb_build_object('summary',m.summary,'at',m.created_at) order by m.created_at desc,m.id desc)
    from (select id,summary,created_at from public.conversation_memories where user_id=auth.uid() and status='ready' order by created_at desc,id desc limit 5) m),'[]'::jsonb),
  'recent_messages', coalesce((select jsonb_agg(jsonb_build_object('role',m.role,'content',m.content) order by m.created_at,m.id)
    from (select id,role,content,created_at from public.conversation_messages m where user_id=auth.uid() and created_at>now()-interval '30 days'
      and not exists(select 1 from public.conversation_memories cm where cm.user_id=auth.uid() and cm.status='deleted'
        and cm.source_key=encode(sha256(convert_to('conversation:'||m.batch_id::text,'UTF8')),'hex'))
      order by created_at desc,id desc limit 8) m),'[]'::jsonb)
 ) else null end;
$$;
revoke all on function public.read_live_context() from public,anon,authenticated;
grant execute on function public.read_live_context() to authenticated;
commit;
