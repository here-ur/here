-- Workers skip withdrawn members (review on PR #52).
-- Withdrawal was only checked at the API entry (requireMember), so the cron workers kept picking
-- withdrawn members: the nightly context maintenance called the AI for them every night during the
-- one-year retention, and the conversation worker could still summarise their pending batches.
-- Copies of the 0024 definitions with one condition added each. Apply to here-dev after 0024 and 0025.
begin;

CREATE OR REPLACE FUNCTION public.issue_conversation_work()
 RETURNS TABLE(run_id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b record; secret text; rid uuid;
begin
 perform pg_advisory_xact_lock(187134,18);
 delete from public.conversation_worker_runs where created_at<now()-interval '7 days';
 update public.conversation_memories set status='failed' where status='pending' and attempts>=5 and updated_at<=now()-interval '2 minutes';
 for b in
  select cb.user_id,cb.id from public.conversation_batches cb
  join public.members u on u.user_id=cb.user_id and u.withdrawn_at is null -- 0029: skip withdrawn members
  join public.privacy_consents c on c.user_id=cb.user_id and exists(select 1 from public.consent_versions v where v.version=c.version and v.covers_conversation) and c.privacy_accepted and c.sensitive_accepted and c.revoked_at is null
  left join public.conversation_memories m on m.user_id=cb.user_id and m.source_key=encode(sha256(convert_to('conversation:'||cb.id::text,'UTF8')),'hex')
  where public.conversation_retry_due(m.status,m.attempts,m.updated_at)
   and exists(select 1 from public.conversation_messages t where t.user_id=cb.user_id and t.batch_id=cb.id and t.created_at>now()-interval '30 days')
   and (select count(*) from public.conversation_worker_runs w where w.user_id=cb.user_id and w.batch_id=cb.id)<12
   and not exists(select 1 from public.conversation_worker_runs w where w.user_id=cb.user_id and w.batch_id=cb.id and w.expires_at>now())
  order by coalesce((select max(w.created_at) from public.conversation_worker_runs w where w.user_id=cb.user_id and w.batch_id=cb.id),cb.created_at),cb.user_id,cb.id limit 2
 loop
  secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.conversation_worker_runs(user_id,batch_id,token_hash)
   values(b.user_id,b.id,encode(sha256(convert_to(secret,'UTF8')),'hex')) returning id into rid;
  return query select rid,secret;
 end loop;
end;$function$;

CREATE OR REPLACE FUNCTION public.issue_context_work()
 RETURNS TABLE(token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u record; secret text;
begin
 perform pg_advisory_xact_lock(187134,21);
 delete from public.context_worker_runs where created_at<now()-interval '7 days';
 for u in select c.user_id from public.privacy_consents c join public.members m on m.user_id=c.user_id and m.withdrawn_at is null -- 0029: skip withdrawn members
 where exists(select 1 from public.consent_versions v where v.version=c.version and v.covers_conversation) and c.revoked_at is null and c.privacy_accepted and c.sensitive_accepted
  and not exists(select 1 from public.context_worker_runs w where w.user_id=c.user_id and w.completed_at is null and w.expires_at>now())
  and (select count(*) from public.context_worker_runs w where w.user_id=c.user_id and w.nightly and (w.outcome='failed' or (w.completed_at is null and w.expires_at<=now())) and w.created_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')<3
  and (exists(select 1 from public.conversation_memories cm where cm.user_id=c.user_id and cm.status='ready'
    and (cm.nightly_reviewed_at is null or cm.nightly_reviewed_at<date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'))
   or exists(select 1 from public.conversation_batches cb where cb.user_id=c.user_id
    and not exists(select 1 from public.chat_context_sources cs where cs.user_id=c.user_id and cs.batch_id=cb.id)
    and exists(select 1 from public.conversation_messages msg where msg.user_id=c.user_id and msg.batch_id=cb.id and msg.created_at>now()-interval '30 days')
    and not exists(select 1 from public.conversation_memories cm where cm.user_id=c.user_id and cm.status='deleted' and cm.source_key=encode(sha256(convert_to('conversation:'||cb.id::text,'UTF8')),'hex'))))
 order by c.user_id limit 2
 loop
  perform pg_advisory_xact_lock(hashtextextended(u.user_id::text,0));
  secret:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.context_worker_runs(user_id,token_hash,nightly) values(u.user_id,encode(sha256(convert_to(secret,'UTF8')),'hex'),true);
  return query select secret;
 end loop;
end;$function$;

commit;
