import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

test('worker DB: offline processing, capability isolation, retries, leases, consent, forgetting and retention',async()=>{
 const db=new PGlite({extensions:{vector}});
 const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const uuid=(i:number)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
 const val=async(sql:string,args:unknown[]=[])=> (await db.query<{v:unknown}>(sql,args)).rows[0]?.v;
 const admin=()=>db.exec('reset role');
 const user=async(id:string)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const anon=()=>db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
 const add=async(id:number)=>val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(id),JSON.stringify([{id:uuid(id),role:'user',content:'가상 대화 '+id,at:new Date(Date.now()-60000).toISOString()}])]);
 const issue=async()=>{await admin();return (await db.query<{run_id:string;token:string}>('select * from public.issue_conversation_work()')).rows;};
 const claim=(token:string)=>val('select public.claim_conversation_work($1) v',[token]);
 const finish=(token:string,summary:string|null)=>val('select public.finish_conversation_work($1,$2,$3::extensions.vector,$4) v',[token,summary,summary?JSON.stringify(Array.from({length:1536},(_,i)=>i?0:1)):null,'luna']);
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public,extensions to authenticated,anon;create table public.members(user_id uuid primary key);insert into public.members values('${a}'),('${b}');`);
  for(const f of ['0003_conversation_memory.sql','0005_consent_events.sql','0012_conversation_history.sql','0014_conversation_message_replay.sql','0015_conversation_summary_version.sql','0018_conversation_worker.sql']) await db.exec(readFileSync(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
  await user(a);await val("select public.accept_memory_consent('2026-11-16-dev-v2',true,true) v");await add(1);
  const [one]=await issue();assert.ok(one);assert.equal((await issue()).length,0,'no duplicate dispatch');
  await anon();await assert.rejects(db.exec('select * from public.conversation_worker_runs'),/permission denied/);await assert.rejects(db.exec('select * from public.issue_conversation_work()'),/permission denied/);
  assert.equal(await claim('f'.repeat(64)),null);assert.equal(await finish('f'.repeat(64),'forged'),false);
  const job=await claim(one.token) as {id:string;lease:string;messages:{content:string}[]};assert.equal(job.messages[0].content,'가상 대화 1');
  assert.equal(await val('select auth.uid() v'),null,'scoped uid restored');assert.equal(await claim(one.token),null,'one claim only');
  await user(b);await assert.rejects(claim(one.token),/permission denied/);assert.equal((await db.query('select * from public.conversation_memories')).rows.length,0);
  await anon();assert.equal(await finish(one.token,'가상 대화 요약'),true);assert.equal(await finish(one.token,'overwrite'),false);
  await admin();assert.equal(await val("select status v from public.conversation_memories where id=$1",[job.id]),'ready');

  // Foreground shares the same backoff and finite attempt limit.
  await user(a);await add(2);const first=await val('select public.claim_conversation_batch($1) v',[uuid(2)]) as {id:string;lease:string};
  await val('select public.fail_memory($1,$2) v',[first.id,first.lease]);
  assert.equal(await val('select public.claim_conversation_batch($1) v',[uuid(2)]),null);
  for(let attempt=2;attempt<=5;attempt++) {
   await admin();await db.query("update public.conversation_memories set updated_at=now()-interval '3 hours' where id=$1",[first.id]);
   await user(a);const next=await val('select public.claim_conversation_batch($1) v',[uuid(2)]) as {id:string;lease:string};assert.ok(next);await val('select public.fail_memory($1,$2) v',[next.id,next.lease]);
  }
  await admin();await db.query("update public.conversation_memories set updated_at=now()-interval '3 hours' where id=$1",[first.id]);
  await user(a);assert.equal(await val('select public.claim_conversation_batch($1) v',[uuid(2)]),null);assert.equal((await issue()).length,0);

  // Crash recovery: expired token cannot finalize; a new lease supersedes the old one.
  await user(a);await add(3);let [run]=await issue();await anon();const crashed=await claim(run.token) as {id:string;lease:string};
  await admin();await db.exec("update public.conversation_worker_runs set expires_at=now()-interval '1 minute'");await db.query("update public.conversation_memories set updated_at=now()-interval '3 minutes' where id=$1",[crashed.id]);
  const [recovery]=await issue();await anon();assert.ok(await claim(recovery.token));assert.equal(await finish(run.token,'stale'),false);assert.equal(await finish(recovery.token,'복구 요약'),true);

  // Forgetting and withdrawal cannot resurrect a memory, even during generation.
  await user(a);await add(4);[run]=await issue();await anon();const forgotten=await claim(run.token) as {id:string};await user(a);await val('select public.forget_memory($1) v',[forgotten.id]);await anon();assert.equal(await finish(run.token,'resurrect'),false);
  await user(a);await add(5);[run]=await issue();await anon();assert.ok(await claim(run.token));await user(a);await val('select public.withdraw_memory_consent() v');await anon();assert.equal(await finish(run.token,'withdrawn'),false);assert.equal((await issue()).length,0);
  await user(a);await val("select public.accept_memory_consent('2026-11-16-dev-v2',true,true) v");await add(6);
  await admin();await db.exec("update public.conversation_messages set created_at=now()-interval '31 days'");assert.equal((await issue()).length,0);await db.exec('select public.purge_expired_conversations()');assert.equal(await val('select count(*)::int v from public.conversation_worker_runs'),0);
 } finally {await db.close();}
});
