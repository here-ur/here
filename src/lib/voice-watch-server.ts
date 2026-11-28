import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

export type VoiceWatchJob = { call_id: string; provider_session_id: string; server_now: number; deadline_at: number; run_until: number; close_requested: boolean };
export type WatchSocket = {
  readyState: number;
  on(event: 'open' | 'message' | 'close' | 'error', listener: (data?: unknown) => void): unknown;
  send(data: string): void;
  terminate(): void;
};
type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;
type WatchResult = 'closed' | 'handed_off' | 'unconfirmed';
type Env = Record<string, string | undefined>;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export function parseVoiceWatchJob(data: unknown): VoiceWatchJob | null {
  if (!data || typeof data !== 'object') return null;
  const j = data as VoiceWatchJob;
  if (typeof j.call_id !== 'string' || !/^[a-f0-9-]{36}$/i.test(j.call_id)
    || typeof j.provider_session_id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(j.provider_session_id)
    || typeof j.close_requested !== 'boolean'
    || ![j.server_now, j.deadline_at, j.run_until].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)
    || j.run_until <= j.server_now || j.run_until - j.server_now > 45.01
    || j.deadline_at - j.server_now > 300.01) return null;
  return j;
}

/** Receives only control events; transcript/audio payloads are never stored or logged. */
export function watchVoiceLease(job: VoiceWatchJob, token: string, socket: WatchSocket, rpc: Rpc, claimElapsedMs = 0): Promise<WatchResult> {
  return new Promise(resolve => {
    let ended = false, closing = false, settling = false, heartbeating = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closeRetry: ReturnType<typeof setInterval> | undefined;
    let drain: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const clear = () => { timers.forEach(clearTimeout); clearInterval(heartbeat); clearInterval(closeRetry); clearTimeout(drain); };
    const finish = (result: WatchResult) => {
      if (ended) return;
      ended = true; clear(); socket.terminate(); resolve(result);
    };
    const sendClose = () => {
      if (ended || settling || socket.readyState !== WebSocket.OPEN || attempts >= 4) return;
      attempts++;
      try { socket.send(JSON.stringify({ type: 'session.close', event_id: crypto.randomUUID() })); }
      catch { finish('unconfirmed'); }
    };
    const requestClose = () => {
      if (ended || settling || closing) return;
      closing = true;
      clearInterval(heartbeat);
      drain = setTimeout(() => finish('unconfirmed'), 8000);
      closeRetry = setInterval(sendClose, 2000);
      sendClose();
    };
    const beat = async () => {
      if (ended || closing || settling || heartbeating) return;
      heartbeating = true;
      try {
        const result = await rpc<{ closed: boolean; close_requested?: boolean } | null>('voice_watch_heartbeat', { p_token: token });
        if (ended || settling) return;
        if (result?.closed === true) finish('closed');
        else if (!result || result.closed !== false || typeof result.close_requested !== 'boolean' || result.close_requested) requestClose();
      } catch { requestClose(); }
      finally { heartbeating = false; }
    };
    // Subtract the entire claim round trip conservatively; network delay must not extend the allowance.
    // Durations use DB clock differences, not the Vercel host's wall clock.
    const elapsed = Math.max(0, claimElapsedMs);
    timers.push(setTimeout(requestClose, Math.max(0, (job.deadline_at - job.server_now) * 1000 - elapsed)));
    timers.push(setTimeout(async () => {
      if (ended || settling || closing) return;
      try {
        if (await rpc<boolean>('handoff_voice_watch', { p_token: token }) === true) { finish('handed_off'); return; }
      } catch { /* No verified successor: close while this observer is still alive. */ }
      requestClose();
    }, Math.max(0, (job.run_until - job.server_now) * 1000 - elapsed - 3000)));
    const opening = setTimeout(() => finish('unconfirmed'), 5000); timers.push(opening);
    socket.on('open', () => {
      clearTimeout(opening);
      if (ended) return;
      if (closing) sendClose();
      else if (job.close_requested) requestClose();
      else { void beat(); heartbeat = setInterval(() => { void beat(); }, 4000); }
    });
    socket.on('message', raw => {
      if (ended || settling) return;
      let event: { type?: unknown; usage?: { seconds?: unknown } };
      try { event = JSON.parse(String(raw)); } catch { return; }
      if (event?.type === 'error') { requestClose(); return; }
      if (event?.type !== 'session.closed') return;
      settling = true; clear();
      const seconds = event.usage?.seconds;
      const usage = typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
      void (async () => {
        // Idempotent retry covers a response lost after the DB commit.
        for (let i = 0; i < 2; i++) {
          try {
            if (await rpc<boolean>('confirm_voice_watch_closed', { p_token: token, p_usage_seconds: usage }) === true) { finish('closed'); return; }
          } catch { /* One retry; do not release an uncertain call. */ }
        }
        finish('unconfirmed');
      })();
    });
    socket.on('error', () => { if (!settling) finish('unconfirmed'); });
    socket.on('close', () => { if (!settling) finish('unconfirmed'); });
  });
}

export async function handleVoiceWatch(request: Request, env: Env, deps: {
  client?: SupabaseClient;
  defer?: (work: () => Promise<void>) => void;
  connect?: (id: string, key: string) => WatchSocket;
} = {}): Promise<Response> {
  if (env.VOICE_WATCH_ENABLED !== 'true') return json({ error: 'disabled' }, 404);
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return json({ error: 'unauthorized' }, 401);
  if (!env.OPENAI_API_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return json({ error: 'unavailable' }, 503);
  const client = deps.client ?? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const rpc: Rpc = async <T>(name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args).abortSignal(AbortSignal.timeout(3000));
    if (error) throw Error('voice_watch_db_failed');
    return data as T;
  };
  let claimed = false;
  let phase = 'claim';
  try {
    const claimStarted = performance.now();
    const raw = await rpc<unknown>('claim_voice_watch', { p_token: token });
    if (raw === null) return json({ processed: false });
    claimed = true;
    phase = 'validate_job';
    const job = parseVoiceWatchJob(raw);
    if (!job) throw Error('invalid_watch_job');
    const connect = deps.connect ?? ((id, key) => {
      const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(id)}/attach`, {
        headers: { Authorization: `Bearer ${key}` }, handshakeTimeout: 5000, maxPayload: 512 * 1024,
      });
      socket.on('error', error => {
        const code = (error as NodeJS.ErrnoException).code;
        console.warn(JSON.stringify({ event: 'voice_watch_socket_error', kind: ['ECONNRESET','ETIMEDOUT','ENOTFOUND','ECONNREFUSED'].includes(code ?? '') ? code : 'socket_error' }));
      });
      socket.on('unexpected-response', (_request, response) => {
        console.warn(JSON.stringify({ event: 'voice_watch_attach_rejected', status: response.statusCode }));
        response.resume(); socket.terminate();
      });
      return socket;
    });
    const work = async () => {
      try {
        phase = 'connect';
        const socket = connect(job.provider_session_id, env.OPENAI_API_KEY!.trim());
        phase = 'watch';
        const result = await watchVoiceLease(job, token, socket, rpc, performance.now() - claimStarted);
        if (result === 'unconfirmed') throw Error('voice_close_unconfirmed');
        return result;
      } catch {
        console.warn(JSON.stringify({ event: 'voice_watch_failed', phase }));
        try { await rpc('fail_voice_watch', { p_token: token }); } catch { /* Durable lock remains. */ }
        return 'unconfirmed' as const;
      }
    };
    if (deps.defer) {
      // after()/waitUntil keeps the invocation alive without occupying pg_net's HTTP batch.
      deps.defer(async () => { await work(); });
      return json({ processed: true, scheduled: true }, 202);
    }
    const outcome = await work();
    return outcome === 'unconfirmed' ? json({ error: 'voice_watch_failed' }, 503) : json({ processed: true, outcome });
  } catch (error) {
    console.warn(JSON.stringify({ event: 'voice_watch_failed', phase, kind: error instanceof TypeError ? /constructor/i.test(error.message) ? 'constructor_unavailable' : /socket.on|on is not a function/i.test(error.message) ? 'event_api_missing' : 'type_error' : error instanceof Error && error.message === 'voice_close_unconfirmed' ? 'close_unconfirmed' : 'internal_error' }));
    if (claimed) { try { await rpc('fail_voice_watch', { p_token: token }); } catch { /* Durable active lock is kept for recovery. */ } }
    return json({ error: 'voice_watch_failed' }, 503);
  }
}
