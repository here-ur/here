import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

test('context DB: isolation, capability leases, atomic merges, summary cursor, forgetting and withdrawal', async () => {
 const db = new PGlite({ extensions: { vector } });
 const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const embedding=JSON.stringify([1,...Array(1535).fill(0)]);
 const val=async(sql:string,args:unknown[]=[]) => (await db.query<{v:unknown}>(sql,args)).rows[0]?.v;
 const admin=()=>db.exec('reset role');
 const user=async(id:string)=>{ await db.exec('reset role;set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); };
 const anon=()=>db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
 const start=()=>val('select public.start_context_work() v') as Promise<{token:string;memories:{id:string}[];messages:unknown[];chat_summary:string}|null>;
 const finish=(token:string,summary:string,groups:object[]=[],discard:string[]=[])=>val('select public.finish_context_work($1,$2,$3::jsonb,$4::uuid[],$5) v',[token,summary,JSON.stringify(groups),discard,'fake-model']);
 const add=async(key:number,summary:string)=>{
  const lease=await val('select public.claim_memory($1) v',[String(key).padStart(64,'0')]) as {id:string;lease:string};
  assert.ok(lease);
  assert.equal(await val("select public.finish_memory($1,$2,$3,$4::extensions.vector,'fake','memory-v1') v",[lease.id,lease.lease,summary,embedding]),true);
  return lease.id;
 };
 const age=async()=>{await admin();await db.exec("update public.context_worker_runs set created_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute'");};
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public,extensions to authenticated,anon;create table public.members(user_id uuid primary key);insert into public.members values('${a}'),('${b}');`);
  for(const file of ['0003_conversation_memory.sql','0005_consent_events.sql','0012_conversation_history.sql','0014_conversation_message_replay.sql','0015_conversation_summary_version.sql','0018_conversation_worker.sql','0021_conversation_context.sql']) await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  await user(a);await val("select public.accept_memory_consent('2026-11-16-dev-v2',true,true) v");
  const one=await add(1,'기타를 좋아한다고 말했다'),two=await add(2,'기타가 취미라고 말했다');
  await val('select public.save_conversation_batch($1,$2::jsonb) v',[a,JSON.stringify([{id:a,role:'user',content:'기타 좋아해',at:new Date().toISOString()}])]);
  const job=(await start())!;assert.ok(job);assert.equal(job.memories.length,2);assert.equal(job.messages.length,1);
  assert.equal(await start(),null,'single active job');
  await user(b);assert.equal(await val('select public.read_chat_summary() v'),null);
  assert.equal(await finish(job.token,'타인 덮어쓰기'),false);
  await assert.rejects(db.exec('select * from public.context_worker_runs'),/permission denied/);
  await user(a);
  assert.equal(await finish(job.token,'실패',[{ids:[one,b],summary:'위조',embedding:JSON.parse(embedding)}]),false);
  assert.equal(await finish(job.token,'실패',[],[one]),false,'foreground cannot discard');
  assert.equal(await finish(job.token,'취미 대화',[{ids:[one,two],summary:'기타가 취미라고 말했다',embedding:JSON.parse(embedding)}]),true);
  assert.equal(await finish(job.token,'재전송'),false);
  assert.equal(await val('select public.read_chat_summary() v'),'취미 대화');
  assert.equal(await val("select count(*)::int v from public.conversation_memories where status='ready'"),1);
  await age();await user(a);const second=(await start())!;assert.equal(second.messages.length,0,'processed batches are not summarised again');
  // Deleting a merged source deletes its canonical descendant and invalidates outstanding work.
  assert.equal(await val('select public.forget_memory($1) v',[two]),true);
  assert.equal(await finish(second.token,'되살리기'),false);
  assert.equal(await val('select public.read_chat_summary() v'),'');
  assert.equal(await val("select count(*)::int v from public.conversation_memories where status='ready'"),0);
  await add(3,'안녕이라고 인사했다');
  await admin();const issued=(await db.query<{token:string}>('select * from public.issue_context_work()')).rows[0];assert.ok(issued);
  await anon();await assert.rejects(db.exec('select * from public.issue_context_work()'),/permission denied/);
  assert.equal(await val('select public.claim_context_work($1) v',['f'.repeat(64)]),null);
  const night=await val('select public.claim_context_work($1) v',[issued.token]) as {nightly:boolean;memories:{id:string}[]};assert.equal(night.nightly,true);
  assert.equal(await val('select public.claim_context_work($1) v',[issued.token]),null);
  assert.equal(await finish(issued.token,'',[],night.memories.map(m=>m.id)),true);
  await user(a);await add(4,'새 기억');await age();await user(a);const revoked=(await start())!;
  await val('select public.withdraw_memory_consent() v');
  assert.equal(await finish(revoked.token,'철회 후 저장'),false);
  assert.equal(await val('select public.read_chat_summary() v'),null);
  await user(a);await val("select public.accept_memory_consent('2026-11-16-dev-v2',true,true) v");
  const expired=(await start())!;await age();await user(a);assert.equal(await finish(expired.token,'만료'),false);
 } finally {await db.close();}
});
