import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleVoiceWatch, parseVoiceWatchJob, watchVoiceLease, type WatchSocket, type VoiceWatchJob } from './voice-watch-server.ts';
const token = 'a'.repeat(64);
const job: VoiceWatchJob = { call_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', provider_session_id: 'live_test', server_now: 1000, deadline_at: 1300, run_until: 1045, close_requested: false };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
class Socket extends EventEmitter implements WatchSocket {
  readyState = 0;
  sent: string[] = [];
  terminated = false;
  open() { this.readyState = 1; this.emit('open'); }
  send(data: string) { this.sent.push(JSON.parse(data).type); }
  terminate() { this.terminated = true; this.readyState = 3; this.emit('close'); }
  closed() { this.emit('message', JSON.stringify({ type: 'session.closed', usage: { seconds: 23 } })); }
}
function rpcFixture(overrides: Record<string, unknown> = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    calls.push({ name, args });
    const value = Object.hasOwn(overrides, name) ? overrides[name] : name === 'voice_watch_heartbeat' ? { closed: false, close_requested: false } : true;
    if (value instanceof Error) throw value;
    return value as T;
  };
  return { rpc, calls };
}

test('deadline sends server close and commits only after provider acknowledgement', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const socket = new Socket(), db = rpcFixture();
  const result = watchVoiceLease({ ...job, deadline_at: 1005 }, token, socket, db.rpc);
  socket.open(); await flush();
  t.mock.timers.tick(4999); await flush(); assert.equal(socket.sent.length, 0);
  t.mock.timers.tick(1); await flush(); assert.equal(socket.sent[0], 'session.close');
  assert.equal(db.calls.some(c => c.name === 'confirm_voice_watch_closed'), false);
  socket.closed(); assert.equal(await result, 'closed');
  assert.equal(db.calls.find(c => c.name === 'confirm_voice_watch_closed')?.args.p_usage_seconds, 23);
  assert.equal(socket.terminated, true);
});

test('handoff leaves primary call alive only after a verified successor', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const socket = new Socket(), db = rpcFixture();
  const result = watchVoiceLease(job, token, socket, db.rpc);
  socket.open(); await flush(); t.mock.timers.tick(42000); await flush();
  assert.equal(await result, 'handed_off'); assert.deepEqual(socket.sent, []);
  assert.equal(db.calls.some(c => c.name === 'confirm_voice_watch_closed'), false);
});

test('missing successor closes early; missing close acknowledgement never refunds or unlocks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const socket = new Socket(), db = rpcFixture({ handoff_voice_watch: false });
  const result = watchVoiceLease(job, token, socket, db.rpc);
  socket.open(); await flush(); t.mock.timers.tick(42000); await flush();
  assert.equal(socket.sent[0], 'session.close');
  t.mock.timers.tick(8000); await flush();
  assert.equal(await result, 'unconfirmed');
  assert.equal(db.calls.some(c => c.name === 'confirm_voice_watch_closed'), false);
  assert.ok(socket.sent.length <= 4);
});

test('manual stop / DB outage requests provider closure, not ledger completion', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  for (const heartbeat of [{ closed: false, close_requested: true }, new Error('DB unavailable')]) {
    const socket = new Socket(), db = rpcFixture({ voice_watch_heartbeat: heartbeat });
    const result = watchVoiceLease(job, token, socket, db.rpc);
    socket.open(); await flush(); assert.equal(socket.sent[0], 'session.close');
    socket.emit('close'); assert.equal(await result, 'unconfirmed');
    assert.equal(db.calls.some(c => c.name === 'confirm_voice_watch_closed'), false);
  }
});

test('malformed jobs and expired/replayed capabilities do not open a provider socket', async () => {
  assert.equal(parseVoiceWatchJob({ ...job, provider_session_id: '../../other-project' }), null);
  assert.equal(parseVoiceWatchJob({ ...job, run_until: 2000 }), null);
  assert.equal(parseVoiceWatchJob({ ...job, deadline_at: Infinity }), null);
  const request = new Request('https://here.test/api/internal/voice-watch', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const env = { VOICE_WATCH_ENABLED: 'true', OPENAI_API_KEY: 'test-only', NEXT_PUBLIC_SUPABASE_URL: 'https://db.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only' };
  const client = { rpc: () => ({ abortSignal: async () => ({ data: null, error: null }) }) } as unknown as SupabaseClient;
  const deps = { client, connect: () => { throw Error('provider must not be called'); } };
  assert.equal((await handleVoiceWatch(request, {}, deps)).status, 404);
  const response = await handleVoiceWatch(request, env, deps);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { processed: false });
});

test('lost close-commit response retries without exposing capabilities or transcripts', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const socket = new Socket(); let commits = 0;
  const result = watchVoiceLease(job, token, socket, async <T>(name: string) => {
    if (name === 'confirm_voice_watch_closed') { if (++commits === 1) throw Error('lost response'); return true as T; }
    return { closed: false, close_requested: false } as T;
  });
  socket.open(); await flush(); socket.closed(); assert.equal(await result, 'closed'); assert.equal(commits, 2);
});


test('claim network latency cannot extend the server deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const socket = new Socket(), db = rpcFixture();
  const result = watchVoiceLease({ ...job, deadline_at: 1005 }, token, socket, db.rpc, 900);
  socket.open(); await flush();
  t.mock.timers.tick(4099); await flush(); assert.equal(socket.sent.length, 0);
  t.mock.timers.tick(1); await flush(); assert.equal(socket.sent[0], 'session.close');
  socket.closed(); assert.equal(await result, 'closed');
});

test('deferred worker acknowledges before holding the socket and still commits only provider confirmation', async () => {
 let work: (() => Promise<void>) | undefined; const socket=new Socket();const db=rpcFixture();
 const client={rpc:(name:string,args:Record<string,unknown>)=>({abortSignal:async()=>({data:name==='claim_voice_watch'?job:await db.rpc(name,args),error:null})})} as unknown as SupabaseClient;
 const response=await handleVoiceWatch(new Request('https://here.test/api/internal/voice-watch',{method:'POST',headers:{Authorization:`Bearer ${token}`}}),
 {VOICE_WATCH_ENABLED:'true',OPENAI_API_KEY:' fixture\n',NEXT_PUBLIC_SUPABASE_URL:'https://db.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture'},
 {client,defer:callback=>{work=callback;},connect:(_id,key)=>{assert.equal(key,'fixture');return socket;}});
 assert.equal(response.status,202);assert.equal(db.calls.length,0);assert.ok(work);
 const pending=work();socket.open();await flush();socket.closed();await pending;
 assert.ok(db.calls.some(c=>c.name==='confirm_voice_watch_closed'));
});
