// 서버 전용. OPENAI_API_KEY는 API 라우트에서만 읽는다.
import { operationMetric } from "./ai-operations.ts";
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
    await res.body?.cancel().catch(() => {});
    throw new Error("provider_failed");
  }
  operationMetric({ operation: "realtime_session", outcome: "ok", status: res.status, durationMs: Date.now() - started });
  return res;
}

export function failed(): Response {
  operationMetric({ operation: "realtime_session", outcome: "failed" });
  return Response.json({ error: "잠시 연결이 어려워요. 조금 뒤에 다시 해 줘." }, { status: 502, headers: { "Cache-Control": "no-store" } });
}
