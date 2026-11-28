import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMeteredVoice, requireActiveVoice } from './voice-quota.ts';
import { VoiceProviderError } from './openai.ts';
const env = { VOICE_QUOTA_ENABLED: 'true', VOICE_CONTROL_SECRET: 'c'.repeat(64), OPENAI_API_KEY: 'fixture' };
function fixture(overrides: Record<string, unknown> = {}) {
 const calls: string[] = [];
 const values: Record<string, unknown> = { reserve_voice_usage: { allowed: true }, begin_voice_request: '2026-11-28T00:00:00Z', prepare_voice_usage: { deadline_at: 1800000000, close_requested: false }, start_voice_watch: true, voice_watch_ready: true, request_voice_close: true, finish_voice_observed: true, cancel_voice_creation: true, voice_call_authorized: true, ...overrides };
 const client = { rpc: (name: string) => { calls.push(name); return { abortSignal: async () => ({ data: values[name], error: null }) }; } } as unknown as SupabaseClient;
 return {client,calls};
}
const create = async () => ({ session: { id: 'live_fixture' }, transport: { sdp: 'v=0\r\n' } });
test('paid creation requires a reservation and a connected server watcher; no secret reaches browser', async () => {
 const f=fixture();const result=await createMeteredVoice(f.client,env,create);
 assert.ok(!(result instanceof Response));assert.equal(result.sdp,'v=0\r\n');
 assert.deepEqual(f.calls,['reserve_voice_usage','begin_voice_request','prepare_voice_usage','start_voice_watch','voice_watch_ready']);
 assert.equal(JSON.stringify(result).includes(env.VOICE_CONTROL_SECRET),false);
});
test('daily/monthly limits, uncertain previous call and disabled control never create a paid session', async () => {
 for(const code of ['voice_daily_limit','voice_monthly_limit','voice_call_active']) {
  const f=fixture({reserve_voice_usage:{allowed:false,code}});
  const result=await createMeteredVoice(f.client,env,async()=>{throw Error('must not create');});
  assert.ok(result instanceof Response);assert.equal(result.status,429);assert.equal((await result.json()).code,code);
 }
 const f=fixture();assert.ok(await createMeteredVoice(f.client,{},async()=>{throw Error('must not create');}) instanceof Response);assert.equal(f.calls.length,0);
});
test('missing initial watcher closes paid session and only confirmed close settles the ledger', async () => {
 for(const confirmed of [true,false]) {
  const f=fixture({start_voice_watch:false});let closed=0;
  const result=await createMeteredVoice(f.client,env,create,{close:async()=>{closed++;return confirmed;}});
  assert.ok(result instanceof Response);assert.equal(result.status,503);assert.equal(closed,1);
  assert.equal(f.calls.includes('finish_voice_observed'),confirmed);assert.ok(f.calls.includes('request_voice_close'));
 }
});
test('definite provider rejection releases creation; network uncertainty keeps the lock', async () => {
 for(const error of [new VoiceProviderError(429),new Error('network uncertainty')]) {
  const f=fixture();try { await createMeteredVoice(f.client,env,async()=>{throw error;}); } catch(e) {assert.equal(e,error);}
  assert.equal(f.calls.includes('cancel_voice_creation'),error instanceof VoiceProviderError);
 }
});
test('voice auxiliary calls require the signed-in account active call',async()=>{
 const f=fixture();assert.equal((await requireActiveVoice(f.client,null))?.status,409);
 assert.equal(await requireActiveVoice(f.client,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),null);
 const expired=fixture({voice_call_authorized:false});assert.equal((await requireActiveVoice(expired.client,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))?.status,409);
});

test('cancellation before paid creation releases reservation without calling provider',async()=>{
 const f=fixture();let made=false;
 const result=await createMeteredVoice(f.client,env,async()=>{made=true;return create();},{cancelled:()=>true});
 assert.ok(result instanceof Response);assert.equal(made,false);assert.ok(f.calls.includes('cancel_voice_creation'));
});
