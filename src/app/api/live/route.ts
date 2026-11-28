import { openai, failed } from "@/lib/openai";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { requireApiQuota } from "@/lib/api-quota";
import { readSmallJson, JsonRequestError } from "@/lib/request-json";
import { liveSessionRequest } from "@/lib/live-session";
import { memoryEnabled } from "@/lib/memory";
import { liveStartContext } from '@/lib/live-start-context';
import { createMeteredVoice } from '@/lib/voice-quota';
import { requireCipher } from '@/lib/conversation-cipher';

export const maxDuration = 60;

export async function POST(request: Request) {
  const timings: string[] = [];
  let mark = performance.now();
  const timed = (name: string) => { const now = performance.now(); timings.push(`${name};dur=${(now - mark).toFixed(1)}`); mark = now; };
  const access = await requireMember(request);
  if (access.response) return access.response;
  timed('member');
  const consent = await requireMemoryConsent(access.supabase);
  if (consent) return consent;
  timed('consent');
  try {
    const input = await readSmallJson(request, 5000, 64 * 1024);
    const callId = (input as { callId?: unknown })?.callId;
    if (typeof callId !== 'string' || !/^[a-f0-9-]{36}$/i.test(callId)) throw new JsonRequestError(400, '음성 연결 요청을 확인해 주세요.');
    let body;
    // Both checks must finish before creating a paid session; neither depends on the other.
    const [quota, snapshot] = await Promise.all([
      requireApiQuota(access.supabase, "realtime"),
      memoryEnabled(process.env)
        ? Promise.resolve(requireCipher(access.userId)).then(guard => { if (!guard.cipher) throw Error('cipher_unavailable'); return liveStartContext(access.supabase, request.signal, guard.cipher); }).then(value => ({ value, failed: false })).catch(() => ({ value: undefined, failed: true }))
        : Promise.resolve({ value: undefined, failed: false }),
    ]);
    if (quota) return quota;
    if (snapshot.failed) return Response.json({ error: '대화 맥락을 불러오지 못했어요. 잠시 뒤 다시 연결해 주세요.', code: 'context_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const startup = snapshot.value;
    timed('context_quota');
    try { body = liveSessionRequest(input, process.env.LIVE_MODEL || "gpt-live-1", process.env.LIVE_VOICE || "noeul", access.onboardingAnswers, startup?.context, access.hereName, startup?.messages); }
    catch { throw new JsonRequestError(400, "음성 연결 요청을 확인해 주세요."); }
    request.signal.throwIfAborted();
    const result = await createMeteredVoice(access.supabase, process.env, async () => {
      const response = await openai("live/sessions", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        // Client cancellation cannot cancel server bookkeeping after paid creation.
      });
      return response.json();
    }, { callId, cancelled: () => request.signal.aborted });
    if (result instanceof Response) return result;
    timed('provider');
    // Never return credentials, provider instructions, or the full session configuration.
    return Response.json({ id: result.id, sdp: result.sdp, callId: result.callId, deadlineAt: result.deadlineAt, model: body.session.model,
      voice: body.session.audio.output.voice, memory: memoryEnabled(process.env) }, { headers: { "Cache-Control": "no-store", "Server-Timing": timings.join(', ') } });
  } catch (error) {
    if (error instanceof JsonRequestError) return Response.json({ error: error.message }, { status: error.status });
    return failed(error);
  }
}
