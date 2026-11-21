import { openai, failed } from "@/lib/openai";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { requireApiQuota } from "@/lib/api-quota";
import { readSmallJson, JsonRequestError } from "@/lib/request-json";
import { liveSessionRequest } from "@/lib/live-session";
import { memoryEnabled } from "@/lib/memory";
import { liveStartContext } from '@/lib/live-start-context';

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
    let body;
    // Both checks must finish before creating a paid session; neither depends on the other.
    const [quota, snapshot] = await Promise.all([
      requireApiQuota(access.supabase, "realtime"),
      memoryEnabled(process.env)
        ? liveStartContext(access.supabase, request.signal).then(value => ({ value, failed: false })).catch(() => ({ value: undefined, failed: true }))
        : Promise.resolve({ value: undefined, failed: false }),
    ]);
    if (quota) return quota;
    if (snapshot.failed) return Response.json({ error: '대화 맥락을 불러오지 못했어요. 잠시 뒤 다시 연결해 주세요.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const startup = snapshot.value;
    timed('context_quota');
    try { body = liveSessionRequest(input, process.env.LIVE_MODEL || "gpt-live-1", process.env.LIVE_VOICE || "noeul", access.onboardingAnswers, startup?.context, access.hereName, startup?.messages); }
    catch { throw new JsonRequestError(400, "음성 연결 요청을 확인해 주세요."); }
    const response = await openai("live/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: request.signal,
    });
    const result = await response.json();
    timed('provider');
    if (typeof result.session?.id !== "string" || typeof result.transport?.sdp !== "string") return failed();
    // Never return credentials, provider instructions, or the full session configuration.
    return Response.json({ id: result.session.id, sdp: result.transport.sdp, model: body.session.model,
      voice: body.session.audio.output.voice, memory: memoryEnabled(process.env) }, { headers: { "Cache-Control": "no-store", "Server-Timing": timings.join(', ') } });
  } catch (error) {
    if (error instanceof JsonRequestError) return Response.json({ error: error.message }, { status: error.status });
    return failed();
  }
}
