import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {vector} from '@electric-sql/pglite-pgvector';

test('대화 DB: 계정 격리·동의·멱등 저장·커서·30일 원문 삭제 후 기억 유지',async()=>{
 const db=new PGlite({extensions:{vector}});
 const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const uuid=(i:number)=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
 const at=new Date(Date.now()-60000).toISOString();
 const val=async(sql:string,args:unknown[]=[])=> (await db.query<{v:unknown}>(sql,args)).rows[0]?.v;
 const user=async(id:string)=>{await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const accept=()=>val("select public.accept_memory_consent('2026-11-16-dev-v2',true,true) v");
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema extensions;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public,extensions to authenticated,anon;create table public.members(user_id uuid primary key);insert into public.members values('${a}'),('${b}');`);
  for(const f of ['0003_conversation_memory.sql','0005_consent_events.sql','0012_conversation_history.sql','0014_conversation_message_replay.sql','0015_conversation_summary_version.sql']) await db.exec(readFileSync(new URL('../../supabase/migrations/'+f,import.meta.url),'utf8'));
  await user(a);
  assert.equal(await val('select public.conversation_is_enabled() v'),false);
  await assert.rejects(val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(1),JSON.stringify([{id:uuid(1),role:'user',content:'차 좋아해',at}])]));
  assert.equal(await accept(),true);
  for(let i=1;i<=65;i++) await val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(i),JSON.stringify([{id:uuid(i),role:i%2?'user':'assistant',content:'가상 대화 '+i,at}])]);
  assert.equal(await val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(1),JSON.stringify([{id:uuid(1),role:'user',content:'가상 대화 1',at}])]),true);
  await assert.rejects(val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(1),JSON.stringify([{id:uuid(1),role:'user',content:'변조',at}])]));
  assert.equal(await val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(91),JSON.stringify([{id:uuid(1),role:'user',content:'가상 대화 1',at}])]),true);
  await assert.rejects(val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(92),JSON.stringify([{id:uuid(1),role:'user',content:'다른 내용',at}])]));
  let before:string|null=null,last:string|null=null;const ids:string[]=[];
  for(let i=0;i<3;i++) {const page: {rows:{id:string;created_at:string}[]}=await db.query<{id:string,created_at:string}>('select * from public.list_conversation_messages($1,$2,30)',[before,last]);ids.push(...page.rows.map(x=>x.id));before=page.rows.at(-1)?.created_at??null;last=page.rows.at(-1)?.id??null;}
  assert.equal(ids.length,65);assert.equal(new Set(ids).size,65);
  const job=await val('select public.claim_conversation_batch($1) v',[uuid(1)]) as {id:string;lease:string}|null;assert.ok(job);
  const v=JSON.stringify(Array.from({length:1536},(_,i)=>i?0:1));
  assert.equal(await val("select public.finish_memory($1,$2,'가상 대화를 나눴다.',$3::extensions.vector,'luna','conversation-v1') v",[job.id,job.lease,v]),true);
  await user(b);await accept();
  assert.equal((await db.query('select * from public.conversation_messages')).rows.length,0);
  assert.equal(await val('select public.claim_conversation_batch($1) v',[uuid(1)]),null);
  await assert.rejects(db.exec(`insert into public.conversation_messages(user_id,id,batch_id,role,content,created_at) values('${a}','${uuid(99)}','${uuid(1)}','user','forged',now())`));
  await db.exec("reset role;update public.conversation_messages set created_at=now()-interval '31 days'");
  await user(a);assert.equal((await db.query('select * from public.list_conversation_messages()')).rows.length,0);
  await assert.rejects(db.exec('select public.purge_expired_conversations()'));
  await db.exec('reset role;select public.purge_expired_conversations()');
  assert.equal(await val('select count(*)::int v from public.conversation_messages'),0);
  assert.equal(await val("select count(*)::int v from public.conversation_memories where status='ready'"),1);
  await user(a);
  await val('select public.save_conversation_batch($1,$2::jsonb) v',[uuid(90),JSON.stringify([{id:uuid(90),role:'user',content:'동의 철회 테스트',at}])]);
  await val('select public.withdraw_memory_consent() v');
  await db.exec('reset role');assert.equal(await val('select count(*)::int v from public.conversation_messages'),0);
 } finally {await db.close();}
});
