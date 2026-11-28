import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const authority = 'c'.repeat(64);
type Usage = { call_limit_seconds: number; active_call: boolean; day: { limit_seconds: number; used_seconds: number; reset_at: number }; month: { limit_seconds: number; used_seconds: number; reset_at: number } };
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated;
    create table public.members(user_id uuid primary key,withdrawn_at timestamptz);
    insert into public.members(user_id) values('${a}'),('${b}');`);
  // Replace only the clock dependency in the test database. Production RPCs expose no clock override.
  await db.exec(`create table public.fixture_time(stamp timestamptz);
    insert into public.fixture_time values('2026-11-20T01:00:00Z');
    create function public.fixture_clock() returns timestamptz language sql security definer as $$select stamp from public.fixture_time$$;`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/0031_voice_usage_ledger.sql', import.meta.url), 'utf8')
    .replaceAll('clock_timestamp()', 'public.fixture_clock()'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/0032_voice_watch_jobs.sql', import.meta.url), 'utf8').replaceAll('clock_timestamp()', 'public.fixture_clock()'));
  // pg_net/pg_cron are mocked only at the external dispatch boundary.
  await db.exec(`create schema net; create schema cron;
    create table public.fixture_http(url text,headers jsonb,body jsonb,timeout_ms integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
      begin insert into public.fixture_http values(url,headers,body,timeout_milliseconds);return 1;end;$$;
    create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;`);
  await db.exec(readFileSync(new URL('../../supabase/migrations/0033_voice_watch_dispatch_cron.sql', import.meta.url), 'utf8').replaceAll('clock_timestamp()', 'public.fixture_clock()'));
  await db.exec('create schema vault;create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text)');
  await db.exec(readFileSync(new URL('../../supabase/migrations/0035_voice_watch_protection_cron.sql', import.meta.url), 'utf8'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/0036_voice_api_control.sql', import.meta.url), 'utf8').replaceAll('clock_timestamp()', 'public.fixture_clock()'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/0037_voice_dispatch_gate.sql', import.meta.url), 'utf8').replaceAll('clock_timestamp()', 'public.fixture_clock()'));
  await db.exec(readFileSync(new URL('../../supabase/migrations/0039_voice_confirmed_start.sql', import.meta.url), 'utf8').replaceAll('clock_timestamp()', 'public.fixture_clock()'));
  await db.exec("update public.voice_watch_config set enabled=true,endpoint='https://here-preview.vercel.app/api/internal/voice-watch'");
  await db.query('update public.voice_control_authority set token_hash=$1', [createHash('sha256').update(authority).digest('hex')]);
  const val = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
  const admin = () => db.exec('reset role');
  const user = async (id: string) => { await db.exec('reset role;set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  const anon = () => db.exec("reset role;set role anon;select set_config('request.jwt.claim.sub','',false)");
  const status = () => val<Usage>('select public.voice_usage_status() v');
  const reserve = async () => {
    const id = randomUUID(), token = randomBytes(32).toString('hex');
    const hash = createHash('sha256').update(token).digest('hex');
    const result = await val<{ allowed: boolean; max_seconds?: number; code?: string }>('select public.reserve_voice_usage($1,$2,$3) v', [id, hash, authority]);
    return { id, token, hash, ...result };
  };
  const begin = (r: { id: string; token: string }) => val<boolean>('select public.begin_voice_usage($1,$2) v', [r.id, r.token]);
  const start = (r: { id: string; token: string }, at: string) => val<{ deadline_at: number; close_requested: boolean } | null>('select public.activate_voice_usage($1,$2,$3,$4) v', [r.id, r.token, 'live_' + r.id, at]);
  const finish = (r: { id: string; token: string }, at: string) => val<boolean>('select public.finish_voice_usage($1,$2,$3) v', [r.id, r.token, at]);
  const clock = () => val<string>("select to_char(public.fixture_clock() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') v");
  const tick = async (seconds: number) => {
    const role = await val<string>('select current_user v');
    await admin();
    await db.query("update public.fixture_time set stamp=stamp+make_interval(secs=>$1)", [seconds]);
    if (role === 'authenticated' || role === 'anon') await db.exec('set role ' + role);
  };
  const seed = async (start: string, end: string) => {
    await admin();
    await db.query(`insert into public.voice_usage_sessions(id,user_id,token_hash,state,reserved_at,reservation_expires_at,provider_session_id,started_at,deadline_at,ended_at)
      values($1,$2,$3,'closed',$4::timestamptz-interval '1 second',$4,'fixture',$4,$4::timestamptz+interval '300 seconds',$5)`, [randomUUID(), a, 'a'.repeat(64), start, end]);
  };
  await user(a);
  return { db, val, admin, user, anon, status, reserve, begin, start, finish, clock, seed, tick };
}

test('voice reservations: one open call, server capability, acknowledged close, idempotent settlement', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.status()).day.used_seconds, 0);
    const r = await f.reserve();
    assert.equal(r.allowed, true); assert.equal(r.max_seconds, 300);
    const others = await Promise.all(Array.from({ length: 5 }, f.reserve));
    assert.ok(others.every(x => !x.allowed && x.code === 'voice_call_active'));
    assert.equal(await f.begin({ ...r, token: 'f'.repeat(64) }), false);
    assert.equal(await f.begin(r), true);
    assert.equal(await f.begin(r), false, 'a duplicate request must not create another provider session');
    const start = await f.clock();
    const active = await f.start(r, start);
    assert.ok(active); assert.equal(active.close_requested, false);
    assert.ok(Math.abs(active.deadline_at * 1000 - Date.parse(start) - 300_000) < 1);
    assert.deepEqual(await f.start(r, start), active);
    await f.user(b);
    assert.equal(await f.val('select public.request_voice_close($1) v', [r.id]), false);
    assert.equal((await f.status()).active_call, false);
    assert.equal(await f.finish({ ...r, token: 'f'.repeat(64) }, await f.clock()), false);
    await f.user(a);
    assert.equal(await f.val('select public.request_voice_close($1) v', [r.id]), true);
    assert.equal((await f.reserve()).code, 'voice_call_active', 'stop request alone cannot release a paid session');
    await f.anon();
    await f.tick(1);
    const end = await f.clock();
    assert.equal(await f.finish(r, end), true);
    assert.equal(await f.finish(r, end), true);
    assert.equal(await f.finish(r, start), false, 'cannot revise/refund an already settled interval');
    await f.user(a);
    assert.equal((await f.status()).active_call, false);
    assert.ok((await f.status()).day.used_seconds > 0);
    assert.equal((await f.reserve()).allowed, true);
  } finally { await f.db.close(); }
});

test('voice: KST midnight/month boundaries, fractional durations and exact reset timestamps', async () => {
  const f = await fixture();
  try {
    await f.seed('2026-10-31T14:59:30.250Z', '2026-10-31T15:00:30.750Z');
    const usage = await f.val<Usage>('select public.voice_usage_at($1,$2) v', [a, '2026-10-31T15:01:00Z']);
    assert.equal(usage.day.used_seconds, 30.75);
    assert.equal(usage.month.used_seconds, 30.75);
    assert.equal(usage.day.reset_at, Date.parse('2026-11-01T15:00:00Z') / 1000);
    assert.equal(usage.month.reset_at, Date.parse('2026-11-30T15:00:00Z') / 1000);
    const before = await f.val<Usage>('select public.voice_usage_at($1,$2) v', [a, '2026-10-31T14:59:45.250Z']);
    assert.equal(before.day.used_seconds, 15);
    assert.equal(before.month.used_seconds, 15);
    await f.seed('2026-11-01T14:59:50Z', '2026-11-01T15:00:10Z');
    const nextDay = await f.val<Usage>('select public.voice_usage_at($1,$2) v', [a, '2026-11-01T15:01:00Z']);
    assert.equal(nextDay.day.used_seconds, 10);
    assert.equal(nextDay.month.used_seconds, 50.75);
    await f.db.exec("set time zone 'America/New_York'");
    const dst = await f.val<Usage>('select public.voice_usage_at($1,$2) v', [a, '2026-03-07T16:00:00Z']);
    assert.equal(dst.day.reset_at, Date.parse('2026-03-08T15:00:00Z') / 1000, 'DB session timezone/DST cannot move Korean midnight');
  } finally { await f.db.close(); }
});

test('voice: 10 minute daily and 30 minute monthly allowance; 5 minute per-call maximum', async () => {
  const f = await fixture();
  try {
    await f.seed('2026-11-20T00:00:00Z', '2026-11-20T00:09:10Z');
    await f.user(a);
    const r = await f.reserve(); assert.equal(r.max_seconds, 50);
    await f.begin(r);
    const start = await f.clock(), active = await f.start(r, start);
    assert.ok(active); assert.equal(active.deadline_at * 1000 - Date.parse(start), 50_000);
    await f.finish(r, start);
    await f.seed('2026-11-20T00:09:10Z', '2026-11-20T00:10:00Z');
    await f.user(a); assert.equal((await f.reserve()).code, 'voice_daily_limit');
    await f.admin(); await f.db.exec('delete from public.voice_usage_sessions');
    await f.seed('2026-11-01T00:00:00Z', '2026-11-01T00:29:10Z');
    await f.user(a);
    const monthRemaining = await f.reserve(); assert.equal(monthRemaining.max_seconds, 50);
    await f.val('select public.cancel_voice_creation($1,$2) v', [monthRemaining.id, monthRemaining.token]);
    await f.seed('2026-11-01T00:29:10Z', '2026-11-01T00:30:00Z');
    await f.user(a); assert.equal((await f.reserve()).code, 'voice_monthly_limit');
  } finally { await f.db.close(); }
});

test('voice: never auto-release uncertain provider creation or an expired active deadline; no client ledger access', async () => {
  const f = await fixture();
  try {
    const r = await f.reserve();
    await assert.rejects(f.db.query('select * from public.voice_usage_sessions'), /permission denied/);
    await assert.rejects(f.db.query('select * from public.voice_control_authority'), /permission denied/);
    assert.deepEqual(await f.val('select public.reserve_voice_usage($1,$2,$3) v', [randomUUID(), 'f'.repeat(64), 'e'.repeat(64)]),
      { allowed: false, code: 'voice_control_unavailable' }, 'clients cannot mint a capability to forge a provider session ID');
    await assert.rejects(f.db.query('select public.voice_usage_at($1,public.fixture_clock())', [a]), /permission denied/);
    await f.admin(); await f.db.query("update public.voice_usage_sessions set reservation_expires_at=public.fixture_clock()-interval '1 second' where id=$1", [r.id]);
    await f.user(a); assert.equal(await f.begin(r), false);
    const next = await f.reserve(); assert.equal(next.allowed, true);
    await f.begin(next);
    await f.admin(); await f.db.query("update public.voice_usage_sessions set reservation_expires_at=public.fixture_clock()-interval '1 day' where id=$1", [next.id]);
    await f.user(a); assert.equal((await f.reserve()).code, 'voice_call_active');
    const start = await f.clock(); await f.start(next, start);
    await f.admin(); await f.db.query('update public.voice_usage_sessions set deadline_at=started_at where id=$1', [next.id]);
    await f.user(a); assert.equal((await f.reserve()).code, 'voice_call_active');
    assert.equal(await f.val('select public.cancel_voice_creation($1,$2) v', [next.id, next.token]), false);
    await f.anon(); await assert.rejects(f.reserve(), /permission denied/);
    await f.admin(); await f.db.query('update public.members set withdrawn_at=now() where user_id=$1', [a]);
    await f.user(a); assert.equal(await f.status(), null); await assert.rejects(f.reserve(), /member_required/);
  } finally { await f.db.close(); }
});

test('voice: stop during creation waits for provider confirmation; overrun is counted and missing server authority fails closed', async () => {
  const f = await fixture();
  try {
    const r = await f.reserve(); await f.begin(r);
    assert.equal(await f.val('select public.request_voice_close($1) v', [r.id]), true);
    assert.equal((await f.reserve()).code, 'voice_call_active');
    const start = await f.clock();
    assert.equal((await f.start(r, start))?.close_requested, true);
    await f.tick(320);
    assert.equal((await f.status()).day.used_seconds, 320, 'unconfirmed overrun is not erased at the planned deadline');
    assert.equal((await f.reserve()).code, 'voice_call_active');
    assert.equal(await f.finish(r, await f.clock()), true);
    assert.equal((await f.reserve()).max_seconds, 280);
    await f.admin(); await f.db.exec('update public.voice_control_authority set token_hash=null');
    await f.user(b);
    assert.equal((await f.reserve()).code, 'voice_control_unavailable');
  } finally { await f.db.close(); }
});

test('voice watcher DB: unforgeable single claim, overlapping successor, stale worker and provider closure', async () => {
  const f = await fixture();
  try {
    const r = await f.reserve(); await f.begin(r); await f.start(r, await f.clock());
    await assert.rejects(f.db.query('select * from public.issue_voice_watch_jobs()'), /permission denied/);
    const issue = async () => { await f.admin(); return (await f.db.query<{ id: string; token: string }>('select * from public.issue_voice_watch_jobs()')).rows; };
    const [one] = await issue(); assert.ok(one); assert.equal((await issue()).length, 0);
    await f.anon();
    await assert.rejects(f.db.query('select * from public.voice_watch_jobs'), /permission denied/);
    assert.equal(await f.val('select public.claim_voice_watch($1) v', ['f'.repeat(64)]), null);
    assert.ok(await f.val('select public.claim_voice_watch($1) v', [one.token]));
    assert.equal(await f.val('select public.claim_voice_watch($1) v', [one.token]), null);
    assert.deepEqual(await f.val('select public.voice_watch_heartbeat($1) v', [one.token]), { closed: false, close_requested: false });
    assert.equal(await f.val('select public.handoff_voice_watch($1) v', [one.token]), false);
    await f.tick(31);
    const [two] = await issue(); assert.ok(two); await f.anon();
    assert.ok(await f.val('select public.claim_voice_watch($1) v', [two.token]));
    await f.val('select public.voice_watch_heartbeat($1) v', [two.token]);
    assert.equal(await f.val('select public.handoff_voice_watch($1) v', [one.token]), true);
    assert.equal(await f.val('select public.fail_voice_watch($1) v', [one.token]), false);
    assert.equal(await f.val('select public.confirm_voice_watch_closed($1,$2) v', [one.token, 1]), false);
    await f.user(a); assert.equal((await f.reserve()).code, 'voice_call_active');
    await f.anon();
    assert.equal(await f.val('select public.confirm_voice_watch_closed($1,$2) v', [two.token, 23]), true);
    assert.equal(await f.val('select public.confirm_voice_watch_closed($1,$2) v', [two.token, 0]), true);
    await f.user(a); assert.equal((await f.status()).active_call, false);
    await f.admin(); assert.equal(await f.val('select provider_usage_seconds v from public.voice_usage_sessions where id=$1', [r.id]), '23');
  } finally { await f.db.close(); }
});

test('voice watcher failure keeps active lock and the next recovery job must close the session', async () => {
  const f = await fixture();
  try {
    const r = await f.reserve(); await f.begin(r); await f.start(r, await f.clock());
    await f.admin(); const [one] = (await f.db.query<{ token: string }>('select * from public.issue_voice_watch_jobs()')).rows;
    await f.anon(); await f.val('select public.claim_voice_watch($1) v', [one.token]);
    assert.equal(await f.val('select public.fail_voice_watch($1) v', [one.token]), true);
    await f.user(a); assert.equal((await f.reserve()).code, 'voice_call_active');
    await f.admin(); const [two] = (await f.db.query<{ token: string }>('select * from public.issue_voice_watch_jobs()')).rows;
    await f.anon(); const next = await f.val<{ close_requested: boolean }>('select public.claim_voice_watch($1) v', [two.token]);
    assert.equal(next.close_requested, true);
    await f.tick(91);
    assert.equal(await f.val('select public.confirm_voice_watch_closed($1,$2) v', [two.token, 10]), false);
    await f.user(a); assert.equal((await f.reserve()).code, 'voice_call_active');
  } finally { await f.db.close(); }
});


test('voice dispatch stays disabled by default and only confirms a connected initial watcher', async () => {
  const f = await fixture();
  try {
    const r = await f.reserve(); await f.begin(r); await f.start(r, await f.clock());
    await f.admin(); await f.db.exec('update public.voice_watch_config set enabled=false'); await f.user(a);
    assert.equal((await f.reserve()).code, 'voice_control_unavailable');
    assert.equal(await f.val('select public.start_voice_watch($1,$2) v', [r.id, r.token]), false);
    await f.admin();
    assert.equal(await f.val('select public.dispatch_voice_watches() v'), 0);
    assert.equal(await f.val('select count(*)::integer v from public.fixture_http'), 0);
    await f.db.exec("insert into vault.decrypted_secrets values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','fixture-only');update public.voice_watch_config set enabled=true,endpoint='https://here-preview.vercel.app/api/internal/voice-watch',bypass_secret_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'");
    await f.anon();
    assert.equal(await f.val('select public.start_voice_watch($1,$2) v', [r.id, 'f'.repeat(64)]), false);
    assert.equal(await f.val('select public.start_voice_watch($1,$2) v', [r.id, r.token]), true);
    assert.equal(await f.val('select public.start_voice_watch($1,$2) v', [r.id, r.token]), true, 'retry must not dispatch duplicate worker');
    assert.equal(await f.val('select public.voice_watch_ready($1,$2) v', [r.id, r.token]), false);
    await assert.rejects(f.db.query('select public.dispatch_voice_watches()'), /permission denied/);
    await assert.rejects(f.db.query("select public.voice_watch_headers('test')"), /permission denied/);
    await f.admin();
    const jobs = (await f.db.query<{ headers: { Authorization: string; 'x-vercel-protection-bypass': string }; timeout_ms: number }>('select * from public.fixture_http')).rows;
    assert.equal(jobs[0].headers['x-vercel-protection-bypass'], 'fixture-only');
    assert.equal(jobs.length, 1); assert.equal(jobs[0].timeout_ms, 90000);
    const token = jobs[0].headers.Authorization.slice(7);
    await f.anon(); await f.val('select public.claim_voice_watch($1) v', [token]);
    assert.equal(await f.val('select public.voice_watch_ready($1,$2) v', [r.id, r.token]), false, 'claim alone is not a provider connection');
    await f.val('select public.voice_watch_heartbeat($1) v', [token]);
    assert.equal(await f.val('select public.voice_watch_ready($1,$2) v', [r.id, r.token]), true);
    await f.tick(6);
    assert.equal(await f.val('select public.voice_watch_ready($1,$2) v', [r.id, r.token]), false, 'stale readiness must fail closed');
  } finally { await f.db.close(); }
});


test('voice API clock and active call authorization cannot cross account or deadline', async () => {
 const f=await fixture();try {
  const r=await f.reserve();
  const stamp=await f.val<string>('select public.begin_voice_request($1,$2) v',[r.id,r.token]);assert.ok(stamp);
  assert.equal(await f.val('select public.begin_voice_request($1,$2) v',[r.id,r.token]),null);
  await f.start(r,await f.clock());
  assert.equal(await f.val('select public.voice_call_authorized($1) v',[r.id]),true);
  await f.user(b);assert.equal(await f.val('select public.voice_call_authorized($1) v',[r.id]),false);
  await f.user(a);await f.tick(301);assert.equal(await f.val('select public.voice_call_authorized($1) v',[r.id]),false);
  await f.anon();assert.equal(await f.val('select public.finish_voice_observed($1,$2) v',[r.id,r.token]),true);
 }finally{await f.db.close();}
});


test('confirmed voice start excludes all preparation time and duplicate events cannot extend a call', async () => {
 const f=await fixture();try {
  const r=await f.reserve();await f.begin(r);await f.tick(12);
  const prepared=await f.val<{deadline_at:number}>('select public.prepare_voice_usage($1,$2,$3) v',[r.id,r.token,'live_start_fixture']);
  assert.ok(prepared);assert.equal((await f.status()).day.used_seconds,0);assert.equal((await f.status()).active_call,true);
  assert.equal(await f.val('select public.voice_call_authorized($1) v',[r.id]),false);
  await f.admin();const [w]=(await f.db.query<{token:string}>('select * from public.issue_voice_watch_jobs()')).rows;
  await f.anon();const job=await f.val<{awaiting_start:boolean}>('select public.claim_voice_watch($1) v',[w.token]);assert.equal(job.awaiting_start,true);
  await f.tick(8);
  assert.equal(await f.val('select public.confirm_voice_started($1) v',['f'.repeat(64)]),null);
  const started=await f.val<{deadline_at:number;server_now:number}>('select public.confirm_voice_started($1) v',[w.token]);assert.equal(started.deadline_at-started.server_now,300);
  await f.user(a);assert.equal((await f.status()).day.used_seconds,0);assert.equal(await f.val('select public.voice_call_authorized($1) v',[r.id]),true);
  await f.tick(5);await f.anon();const repeat=await f.val<{deadline_at:number}>('select public.confirm_voice_started($1) v',[w.token]);assert.equal(repeat.deadline_at,started.deadline_at);
  assert.equal(await f.val('select public.confirm_voice_watch_closed($1,$2) v',[w.token,25]),true);
  await f.user(a);assert.equal((await f.status()).day.used_seconds,5);assert.equal((await f.status()).active_call,false);
 }finally{await f.db.close();}
});

test('provider acknowledgement without startup consumes zero and an unconfirmed preparation stays locked', async () => {
 const f=await fixture();try {
  const r=await f.reserve();await f.begin(r);
  await f.val('select public.prepare_voice_usage($1,$2,$3) v',[r.id,r.token,'live_no_start']);
  await f.admin();const [w]=(await f.db.query<{token:string}>('select * from public.issue_voice_watch_jobs()')).rows;
  await f.anon();await f.val('select public.claim_voice_watch($1) v',[w.token]);await f.tick(21);
  assert.equal((await f.val<{close_requested:boolean}>('select public.voice_watch_heartbeat($1) v',[w.token])).close_requested,true);
  await f.user(a);assert.equal((await f.status()).day.used_seconds,0);assert.equal((await f.reserve()).code,'voice_call_active');
  await f.anon();assert.equal(await f.val('select public.confirm_voice_watch_closed($1,$2) v',[w.token,20]),true);
  await f.user(a);assert.equal((await f.status()).day.used_seconds,0);assert.equal((await f.reserve()).allowed,true);
 }finally{await f.db.close();}
});
