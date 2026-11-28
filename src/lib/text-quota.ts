import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const unavailable = () => Response.json({ error: '대화 이용량을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'quota_unavailable' },
  { status: 503, headers: { 'Cache-Control': 'no-store' } });

/** Reserve before paid work, commit only a valid reply. Capability never leaves this server. */
export async function withTextQuota(client: SupabaseClient, generate: () => Promise<Response>): Promise<Response> {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  try {
    const { data, error } = await client.rpc('reserve_text_usage', {
      p_id: id, p_token_hash: createHash('sha256').update(token).digest('hex'),
    }).abortSignal(AbortSignal.timeout(3000));
    if (error || !data || typeof data.allowed !== 'boolean' || !Number.isSafeInteger(data.retry_after)
      || data.retry_after < 0 || data.retry_after > 86400) return unavailable();
    if (!data.allowed) {
      const daily = data.code === 'text_daily_limit';
      return Response.json({ error: daily ? '오늘 글 대화 40회를 모두 이용했어요. 한국 시간 자정에 다시 이야기할 수 있어요.'
        : '이전 답변을 만들고 있어요. 잠시 뒤 다시 보내 주세요.', code: daily ? 'text_daily_limit' : 'text_in_progress' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, data.retry_after)) } });
    }
  } catch { return unavailable(); }

  let response: Response;
  try { response = await generate(); }
  catch { response = unavailable(); }
  let success = false;
  if (response.ok) {
    try { const body = await response.clone().json(); success = typeof body.reply === 'string' && body.reply.trim().length > 0; }
    catch { /* Invalid success bodies must never consume the allowance. */ }
  }
  // A repeated finalization is idempotent, including a response lost after DB commit.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await client.rpc('finish_text_usage', { p_id: id, p_token: token, p_success: success })
        .abortSignal(AbortSignal.timeout(3000));
      if (!error && data === true) return response.ok && !success ? unavailable() : response;
    } catch { /* One bounded retry, never refund an uncertain successful commit. */ }
  }
  return success ? unavailable() : response;
}
