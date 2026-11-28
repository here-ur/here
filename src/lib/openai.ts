// 서버 전용. OPENAI_API_KEY는 API 라우트에서만 읽는다.
import { operationMetric } from "./ai-operations.ts";
import { voiceConnectionErrorMessage } from './voice-errors.ts';
type FailureKind = 'quota' | 'concurrency' | 'rate_limit' | 'other';
export class VoiceProviderError extends Error {
  readonly status: number;
  readonly kind: FailureKind;
  constructor(status: number, kind: FailureKind = 'other') { super('voice_provider_failed'); this.status = status; this.kind = kind; }
}
// Member-level quota is enforced by the route. Edge/IP abuse protection remains separate.
export async function openai(path: string, init: RequestInit): Promise<Response> {
  const started = Date.now();
  const key = process.env.OPENAI_API_KEY?.trim();
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
    const label = String(detail?.error?.code) + ' ' + String(detail?.error?.type) + ' ' + message;
    const kind = /insufficient_quota|billing|credits|balance|(?:spend|usage)_limit_exceeded/i.test(label) ? 'quota'
      : /concurrent|concurrency|simultaneous/i.test(message) ? 'concurrency'
      : /rate.?limit/i.test(String(detail?.error?.code) + ' ' + message) ? 'rate_limit' : 'other';
    console.warn(JSON.stringify({ event: 'here_voice_provider_failure', status: res.status, kind }));
    await res.body?.cancel().catch(() => {});
    throw new VoiceProviderError(res.status, kind);
  }
  operationMetric({ operation: "realtime_session", outcome: "ok", status: res.status, durationMs: Date.now() - started });
  return res;
}

export function failed(error?: unknown): Response {
  operationMetric({ operation: "realtime_session", outcome: "failed" });
  const status = error instanceof VoiceProviderError && error.status === 429 ? 429 : 502;
  const code = error instanceof VoiceProviderError && error.kind === 'quota' ? 'voice_provider_quota'
    : status === 429 ? 'voice_provider_busy' : 'voice_unavailable';
  return Response.json({ error: voiceConnectionErrorMessage(status, code), code }, { status, headers: { "Cache-Control": "no-store" } });
}
