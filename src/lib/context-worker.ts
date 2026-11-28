import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { contextConfig } from './conversation-context.ts';
import { finishMaintenance } from './context-maintenance.ts';
import { reportError } from './error-report.ts';
import { memoryEnabled } from './memory.ts';

export async function handleContextWorker(request: Request, env: Record<string, string | undefined>, deps: { client?: SupabaseClient; fetch?: typeof fetch } = {}) {
  const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (!memoryEnabled(env)) return json({ error: 'disabled' }, 404);
  const token = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return json({ error: 'unauthorized' }, 401);
  if (!env.RUNYOUR_API_KEY || !env.OPENAI_API_KEY || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return json({ error: 'unavailable' }, 503);
  const client = deps.client ?? createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const { data: job, error } = await client.rpc('claim_context_work', { p_token: token }).abortSignal(AbortSignal.timeout(5000));
    if (error) { await reportError(client, 'worker.context', error); return json({ error: 'unavailable' }, 503); }
    if (!job) return json({ processed: false });
    // 작업자는 로그인 사용자가 없으므로 finishMaintenance가 DB가 넘겨준 job.user_id 기준으로 복호화·암호화한다.
    const processed = await finishMaintenance(client, token, job, { ...contextConfig(env), fetch: deps.fetch });
    return json({ processed }, processed ? 200 : 503);
  } catch (e) { await reportError(client, 'worker.context', e); return json({ error: 'processing_failed' }, 503); }
}
