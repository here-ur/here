import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { VoiceProviderError } from './openai.ts';

const json = (error: string, code: string, status = 503) => Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });
export const voiceQuotaUnavailable = () => json('음성 이용량을 확인하지 못했어요. 잠시 뒤 다시 연결해 주세요.', 'voice_control_unavailable');
const rpc = async <T>(client: SupabaseClient, name: string, args: Record<string, unknown>) => {
  const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(3000));
  if (error) throw Error('voice_quota_db_failed');
  return data as T;
};

/** Used for setup failures only. A successful send is never evidence of closure. */
export function closeProviderSession(id: string, key: string): Promise<boolean> {
  return new Promise(resolve => {
    let finished = false;
    const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(id)}/attach`, {
      headers: { Authorization: `Bearer ${key.trim()}` }, handshakeTimeout: 5000, maxPayload: 512 * 1024,
    });
    const done = (closed: boolean) => { if (finished) return; finished = true; clearTimeout(timer); socket.terminate(); resolve(closed); };
    const timer = setTimeout(() => done(false), 8000);
    socket.on('open', () => { try { socket.send(JSON.stringify({ type: 'session.close' })); } catch { done(false); } });
    socket.on('message', raw => { try { if (JSON.parse(String(raw)).type === 'session.closed') done(true); } catch { /* No content logging. */ } });
    socket.on('error', () => done(false)); socket.on('close', () => done(false));
  });
}

type ProviderResult = { session?: { id?: unknown }; transport?: { sdp?: unknown } };
/** All capabilities remain on the server. The browser receives only its own call ID/deadline. */
export async function createMeteredVoice(client: SupabaseClient, env: Record<string, string | undefined>, create: () => Promise<ProviderResult>, deps: {
  sleep?: (ms: number) => Promise<void>;
  close?: typeof closeProviderSession;
  callId?: string;
  cancelled?: () => boolean;
} = {}): Promise<{ id: string; sdp: string; callId: string; deadlineAt: number } | Response> {
  if (env.VOICE_QUOTA_ENABLED !== 'true' || !/^[a-f0-9]{64}$/.test(env.VOICE_CONTROL_SECRET ?? '') || !env.OPENAI_API_KEY) return voiceQuotaUnavailable();
  const id = deps.callId ?? randomUUID(), token = randomBytes(32).toString('hex');
  let providerId: string | undefined, activated = false, begun = false;
  try {
    const reserved = await rpc<{ allowed: boolean; code?: string }>(client, 'reserve_voice_usage', {
      p_id: id, p_token_hash: createHash('sha256').update(token).digest('hex'), p_authority_token: env.VOICE_CONTROL_SECRET,
    });
    if (!reserved || typeof reserved.allowed !== 'boolean') return voiceQuotaUnavailable();
    if (!reserved.allowed) {
      const messages: Record<string, string> = {
        voice_call_active: '이전 음성 연결이 아직 종료되지 않았어요. 잠시 뒤 다시 눌러 주세요.',
        voice_daily_limit: '오늘 음성 대화 10분을 모두 이용했어요. 한국 시간 자정에 다시 이야기할 수 있어요.',
        voice_monthly_limit: '이번 달 음성 대화 30분을 모두 이용했어요. 다음 달 1일에 다시 이야기할 수 있어요.',
      };
      return reserved.code && messages[reserved.code] ? json(messages[reserved.code], reserved.code, 429) : voiceQuotaUnavailable();
    }
    const stamp = await rpc<string | null>(client, 'begin_voice_request', { p_id: id, p_token: token });
    if (!stamp || !Number.isFinite(Date.parse(stamp))) return voiceQuotaUnavailable();
    begun = true;
    if (deps.cancelled?.()) { await rpc(client, 'cancel_voice_creation', { p_id: id, p_token: token }); return voiceQuotaUnavailable(); }
    const result = await create();
    if (typeof result.session?.id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(result.session.id)) providerId = result.session.id;
    if (!providerId || typeof result.transport?.sdp !== 'string' || !result.transport.sdp.startsWith('v=0')) throw Error('invalid_provider_response');
    let active: { deadline_at: number; close_requested: boolean } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { active = await rpc(client, 'activate_voice_usage', { p_id: id, p_token: token, p_provider_id: providerId, p_started_at: stamp }); if (active) break; } catch { /* idempotent retry */ }
    }
    activated = Boolean(active);
    if (!active || !Number.isFinite(active.deadline_at) || active.close_requested || deps.cancelled?.()) throw Error('voice_activation_failed');
    activated = true;
    if (await rpc(client, 'start_voice_watch', { p_id: id, p_token: token }) !== true) throw Error('watch_dispatch_failed');
    const sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    const until = performance.now() + 8000;
    do {
      if (deps.cancelled?.()) throw Error('call_cancelled');
      if (await rpc(client, 'voice_watch_ready', { p_id: id, p_token: token }) === true) return { id: providerId, sdp: result.transport.sdp, callId: id, deadlineAt: active.deadline_at };
      await sleep(250);
    } while (performance.now() < until);
    throw Error('watch_not_ready');
  } catch (error) {
    if (providerId) {
      // The cron recovery remains responsible if this bounded cleanup loses confirmation.
      try { await rpc(client, 'request_voice_close', { p_id: id }); } catch { /* Keep lock. */ }
      if (await (deps.close ?? closeProviderSession)(providerId, env.OPENAI_API_KEY).catch(() => false)) {
        if (activated) { try { await rpc(client, 'finish_voice_observed', { p_id: id, p_token: token }); } catch { /* Keep lock. */ } }
      }
    } else if (begun && error instanceof VoiceProviderError && error.status >= 400 && error.status < 500) {
      try { await rpc(client, 'cancel_voice_creation', { p_id: id, p_token: token }); } catch { /* Uncertain request stays blocked. */ }
    }
    if (error instanceof VoiceProviderError) throw error;
    return voiceQuotaUnavailable();
  }
}

export async function requireActiveVoice(client: SupabaseClient, id: string | null): Promise<Response | null> {
  if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return json('음성 대화를 먼저 연결해 주세요.', 'voice_call_required', 409);
  try { return await rpc(client, 'voice_call_authorized', { p_id: id }) === true ? null : json('음성 대화가 종료됐어요.', 'voice_call_ended', 409); }
  catch { return voiceQuotaUnavailable(); }
}
