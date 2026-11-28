import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withTextQuota } from './text-quota.ts';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    create table public.members(user_id uuid primary key,withdrawn_at timestamptz);
    insert into public.members(user_id) values('${a}'),('${b}');`);
  for (const name of ['0004_api_limits.sql', '0006_api_quota_status.sql', '0034_text_usage_quota.sql']) {
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
  }
  const user = async (uid: string) => { await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]); };
  const value = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ v: T }>(sql, args)).rows[0].v;
  const status = () => value<{ limit: number; used: number; reserved: number; reset_at: number }>('select public.text_usage_status() v');
  const reserve = async () => {
    const id = randomUUID(), token = randomBytes(32).toString('hex');
    const result = await value<{ allowed: boolean; code?: string }>('select public.reserve_text_usage($1,$2) v', [id, createHash('sha256').update(token).digest('hex')]);
    return { id, token, ...result };
  };
  const finish = (r: { id: string; token: string }, success: boolean) => value<boolean>('select public.finish_text_usage($1,$2,$3) v', [r.id,r.token,success]);
  await user(a);
  return { db, user, value, status, reserve, finish };
}

test('KST 40회: 예약·성공·실패·중복 확정·한도 거절과 계정 격리', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.status(), { limit: 40, used: 0, reserved: 0, reset_at: (await f.status()).reset_at });
    assert.equal((await f.status()).reset_at % 86400, 54000, 'KST midnight is 15:00 UTC');
    const first = await f.reserve();
    assert.equal(first.allowed, true);
    assert.equal((await f.status()).reserved, 1);
    assert.equal(await f.finish(first, false), true);
    assert.equal((await f.status()).used, 0);
    assert.equal((await f.status()).reserved, 0);
    const reservations = await Promise.all(Array.from({ length: 41 }, f.reserve));
    assert.equal(reservations.filter(r => r.allowed).length, 40);
    assert.equal(reservations[40].code, 'text_in_progress');
    for (const r of reservations.slice(0,40)) {
      assert.equal(await f.finish(r, true), true);
      assert.equal(await f.finish(r, true), true);
      assert.equal(await f.finish(r, false), false, 'committed success cannot be refunded');
    }
    assert.equal((await f.status()).used, 40);
    assert.equal((await f.reserve()).code, 'text_daily_limit');
    await f.user(b);
    assert.equal((await f.status()).used, 0);
    assert.equal(await f.finish(reservations[0], false), false);
    assert.equal((await f.reserve()).allowed, true);
    await f.user('');
    assert.equal(await f.value('select public.text_usage_status() v'), null);
    await assert.rejects(f.reserve(), /member_required/);
  } finally { await f.db.close(); }
});

test('client cannot read reservation capabilities, forge finalization, or alter old/shared counters', async () => {
  const f = await fixture();
  try {
    await f.value("select public.consume_api_quota('chat') v");
    assert.equal((await f.status()).used, 0, 'auxiliary requests do not consume text allowance');
    const r = await f.reserve();
    assert.equal(await f.finish({ ...r, token: '0'.repeat(64) }, false), false);
    assert.equal((await f.status()).reserved, 1);
    await assert.rejects(f.db.query('select * from public.text_usage_requests'), /permission denied/);
    await assert.rejects(f.db.query('delete from public.text_usage_requests'), /permission denied/);
    await f.db.exec('reset role; set role anon');
    await assert.rejects(f.reserve(), /permission denied/);
    await assert.rejects(f.finish(r, false), /permission denied/);
    await f.db.exec('reset role');
    await f.db.query('update public.members set withdrawn_at=now() where user_id=$1', [a]);
    await f.user(a);
    await assert.rejects(f.reserve(), /member_required/);
  } finally { await f.db.close(); }
});

test('expired reservations release capacity; previous KST day does not reduce today', async () => {
  const f = await fixture();
  try {
    const r = await f.reserve();
    await f.db.exec('reset role');
    await f.db.query("update public.text_usage_requests set expires_at=now()-interval '1 second' where id=$1", [r.id]);
    await f.user(a);
    assert.equal((await f.status()).reserved, 0);
    assert.equal(await f.finish(r, true), false);
    const done = await f.reserve();
    await f.finish(done, true);
    await f.db.exec('reset role');
    await f.db.query("update public.text_usage_requests set usage_day=(now() at time zone 'Asia/Seoul')::date-1 where id=$1", [done.id]);
    await f.user(a);
    assert.equal((await f.status()).used, 0);
  } finally { await f.db.close(); }
});

test('server wrapper charges only valid successful replies and never exposes capability', async () => {
  for (const [response, expected] of [[Response.json({reply:'answer'}),true], [Response.json({error:'provider'}, {status:502}),false], [Response.json({reply:''}),false]] as const) {
    const calls: Array<{name:string;args:Record<string,unknown>}> = [];
    const client = { rpc(name:string,args:Record<string,unknown>) {
      calls.push({name,args});
      return { abortSignal: async () => ({data:name==='reserve_text_usage'?{allowed:true,retry_after:0}:true,error:null}) };
    } } as unknown as SupabaseClient;
    const result = await withTextQuota(client, async () => response);
    assert.equal(calls[1].args.p_success, expected);
    assert.equal(createHash('sha256').update(calls[1].args.p_token as string).digest('hex'), calls[0].args.p_token_hash);
    assert.doesNotMatch(await result.text(), new RegExp(calls[1].args.p_token as string));
  }
});

test('quota denial/DB outage skip paid generation; lost commit reply retries same reservation', async () => {
  for (const data of [null, {allowed:false,retry_after:300,code:'text_daily_limit'}]) {
    const client = {rpc:()=>({abortSignal:async()=>({data,error:null})})} as unknown as SupabaseClient;
    const result = await withTextQuota(client, async()=>{throw Error('must not generate');});
    assert.equal(result.status, data ? 429 : 503);
  }
  let attempts = 0, firstToken: unknown;
  const client = {rpc:(name:string,args:Record<string,unknown>)=>({abortSignal:async()=>{
    if(name==='reserve_text_usage') return {data:{allowed:true,retry_after:0},error:null};
    if(attempts++===0) {firstToken=args.p_token;throw Error('lost commit response');}
    assert.equal(args.p_token,firstToken);return {data:true,error:null};
  }})} as unknown as SupabaseClient;
  assert.equal((await withTextQuota(client,async()=>Response.json({reply:'ok'}))).status,200);
  assert.equal(attempts,2);
});
