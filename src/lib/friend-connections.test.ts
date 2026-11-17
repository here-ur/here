import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {friendCode,friendInviteUrl,parseConnections,parseInvitation} from './friend-connections.ts';

test('friend link parsing accepts only opaque codes and never navigates to pasted origins',()=>{
 const code='a'.repeat(32);
 assert.equal(friendCode(friendInviteUrl('https://here-dev.vercel.app',code)),code);
 assert.equal(friendCode(' '+code+' '),code);
 for(const bad of ['javascript:alert(1)','https://example.com/?friend=x','a'.repeat(31),'../friends']) assert.equal(friendCode(bad),null);
 assert.throws(()=>friendInviteUrl('https://here-dev.vercel.app','../'));
 assert.throws(()=>parseInvitation({code,remaining:4,expires_at:'2026-11-20'}));
 assert.throws(()=>parseConnections([{}]));
});

test('friend DB: SNS acceptance, mutual visibility, retries, slots, expiry, revocation, removal and legacy preservation',async()=>{
 const db=new PGlite();const ids=Array.from({length:7},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
 const [a,b,c,d,e,f,g]=ids;
 const user=async(id:string)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);};
 const val=async(sql:string,args:unknown[]=[])=> (await db.query<{v:unknown}>(sql,args)).rows[0]?.v;
 const create=async()=>await val('select public.create_friend_invite() v') as {code:string;remaining:number};
 const accept=(code:string)=>val('select public.accept_friend_invite($1) v',[code]);
 const details=(code:string)=>val('select public.friend_invite_details($1) v',[code]);
 const list=()=>db.query<{friend_id:string;display_name:string|null}>('select * from public.list_friend_connections()');
 try {
  await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;
   create table public.members(user_id uuid primary key,invited_by uuid references public.members(user_id),joined_at timestamptz not null default now());
   alter table public.members enable row level security;grant select on public.members to authenticated;create policy own_members on public.members for select to authenticated using(user_id=auth.uid());`);
  for(const id of ids) await db.query('insert into public.members(user_id) values($1)',[id]);
  await db.query('update public.members set invited_by=$1 where user_id=$2',[f,g]);
  for(const file of ['0007_friends.sql','0017_friend_connections.sql']) await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
  await user(a);await val("select public.set_display_name('가상 친구 A') v");const invite=await create();assert.equal(invite.remaining,3);
  assert.equal((await create()).code,invite.code);assert.equal(await accept(invite.code),'self');
  assert.equal((await list()).rows.length,0);
  await user(b);assert.equal((await details(invite.code) as {display_name:string}).display_name,'가상 친구 A');
  assert.equal((await list()).rows.length,0,'preview must not create relationship');
  assert.equal(await accept(invite.code),'accepted');assert.equal(await accept(invite.code),'already_friends');
  assert.deepEqual((await list()).rows.map(x=>x.friend_id),[a]);
  await user(a);assert.deepEqual((await list()).rows.map(x=>x.friend_id),[b]);assert.equal((await create()).remaining,2);
  await user(c);assert.equal((await list()).rows.length,0);assert.equal((await db.query('select * from public.friendships')).rows.length,0);
  for(const table of ['friend_invites','friend_invite_acceptances']) await assert.rejects(db.exec('select * from public.'+table),/permission denied/);
  await assert.rejects(db.query('insert into public.friendships values($1,$2,$1,now())',[a,c]),/permission denied/);
  assert.equal(await val('select public.revoke_friend_invite($1) v',[invite.code]),false);
  assert.equal(await accept(invite.code),'accepted');await user(d);assert.equal(await accept(invite.code),'accepted');
  await user(e);assert.equal(await accept(invite.code),'invalid');assert.equal(await details(invite.code),null);
  await user(a);const next=await create();assert.notEqual(next.code,invite.code);assert.equal(next.remaining,3);
  await val('select public.revoke_friend_invite($1) v',[next.code]);await user(e);assert.equal(await accept(next.code),'invalid');
  await user(a);const expired=await create();await db.exec('reset role');await db.query("update public.friend_invites set expires_at=now()-interval '1 minute' where code=$1",[expired.code]);await user(e);assert.equal(await accept(expired.code),'invalid');
  await user(b);assert.equal(await val('select public.remove_friend_connection($1) v',[a]),true);assert.equal(await accept(invite.code),'used');assert.equal((await list()).rows.length,0);
  await user(a);assert.equal((await list()).rows.length,2);
  await user(f);assert.equal((await list()).rows[0].friend_id,g);await val('select public.remove_friend_connection($1) v',[g]);assert.equal((await db.query('select * from public.list_friends()')).rows.length,0);
  await user(g);assert.equal((await list()).rows.length,0);
  await user('');await assert.rejects(create(),/member_required/);assert.equal((await list()).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(list(),/permission denied/);await assert.rejects(accept(invite.code),/permission denied/);
 } finally {await db.close();}
});
