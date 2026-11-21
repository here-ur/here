// 서버 전용. OPENAI_API_KEY는 API 라우트에서만 읽는다.
import { operationMetric } from "./ai-operations.ts";
export class VoiceProviderError extends Error {
  readonly status: number;
  constructor(status: number) { super('voice_provider_failed'); this.status = status; }
}
// Member-level quota is enforced by the route. Edge/IP abuse protection remains separate.
export async function openai(path: string, init: RequestInit): Promise<Response> {
  const started = Date.now();
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("provider_not_configured");
  const res = await fetch(`https://api.openai.com/v1/${path}`, {
    ...init,
    signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(15000)]),
    redirect: "error",
    cache: "no-store",
    headers: { Authorization: `Bearer ${key}`, ...init.headers },
  });
  if (!res.ok) {
    operationMetric({ operation: 'realtime_session', outcome: 'failed', status: res.status, durationMs: Date.now() - started });
    const detail = await res.json().catch(() => null);
    const message = typeof detail?.error?.message === 'string' ? detail.error.message : '';
    // Classify the failure without logging provider messages, account IDs or keys.
    const kind = /insufficient_quota|billing|credits|balance/i.test(String(detail?.error?.code) + ' ' + message) ? 'quota'
      : /concurrent|concurrency|simultaneous/i.test(message) ? 'concurrency'
      : /rate.?limit/i.test(String(detail?.error?.code) + ' ' + message) ? 'rate_limit' : 'other';
    console.warn(JSON.stringify({ event: 'here_voice_provider_failure', status: res.status, kind }));
    await res.body?.cancel().catch(() => {});
    throw new VoiceProviderError(res.status);
  }
  operationMetric({ operation: "realtime_session", outcome: "ok", status: res.status, durationMs: Date.now() - started });
  return res;
}

export function failed(error?: unknown): Response {
  operationMetric({ operation: "realtime_session", outcome: "failed" });
  return Response.json({ error: "잠시 연결이 어려워요. 조금 뒤에 다시 해 줘." }, { status: error instanceof VoiceProviderError && error.status === 429 ? 429 : 502, headers: { "Cache-Control": "no-store" } });
}
