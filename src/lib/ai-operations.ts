import { setTimeout as delay } from "node:timers/promises";

type Operation = "chat" | "summary" | "embedding" | "realtime_session" | "memory_save" | "web_search";
type Outcome = "ok" | "failed" | "retry" | "skipped" | "usage";
type Metric = { operation: Operation; outcome: Outcome; durationMs?: number; status?: number; attempt?: number; inputTokens?: number; outputTokens?: number; cachedTokens?: number };
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000_000;
// Exact allowlist: never spread caller input, raw exceptions, model responses, or identifiers into logs.
export function operationMetric(metric: Metric, sink: (line: string) => void = console.info) {
  const event: Record<string, unknown> = { event: "here_ai_operation", operation: metric.operation, outcome: metric.outcome };
  for (const field of ["durationMs","status","attempt","inputTokens","outputTokens","cachedTokens"] as const) {
    if (integer(metric[field])) event[field] = metric[field];
  }
  try { sink(JSON.stringify(event)); } catch { /* Observability must not break a request. */ }
}
export function usageMetric(operation: "chat" | "summary" | "embedding" | "web_search", body: unknown) {
  if (!body || typeof body !== "object" || !("usage" in body)) return;
  const usage = body.usage;
  if (!usage || typeof usage !== "object") return;
  const u = usage as Record<string, unknown>;
  const details = u.input_tokens_details as Record<string, unknown> | undefined;
  operationMetric({ operation, outcome: "usage",
    inputTokens: (u.input_tokens ?? u.prompt_tokens) as number,
    outputTokens: (u.output_tokens ?? u.completion_tokens) as number,
    cachedTokens: details?.cached_tokens as number,
  });
}

// Retry only explicit transient HTTP failures. Network failures may have already incurred cost.
// No raw input persistence: process interruption still cannot resume the summarization job.
export function memoryRetryFetch(base: typeof fetch = fetch, wait = (ms: number, signal?: AbortSignal) => delay(ms, undefined, { signal })) : typeof fetch {
  return async (input, init) => {
    for (let attempt = 1; ; attempt++) {
      init?.signal?.throwIfAborted();
      const response = await base(input, init);
      if (attempt >= 3 || ![429,500,502,503,504].includes(response.status)) return response;
      const retry = response.headers.get("retry-after");
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : NaN;
      const retryMs = retry ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now()) : 0;
      // Honor a long provider cooldown by leaving the job failed, not retrying too early.
      if (retry && (!Number.isFinite(retryMs) || retryMs > 5000)) return response;
      const ms = Math.max(250 * 2 ** (attempt - 1), retryMs || 0);
      await response.body?.cancel().catch(() => {});
      operationMetric({ operation: String(input).endsWith("/embeddings") ? "embedding" : "summary", outcome: "retry", status: response.status, attempt });
      await wait(ms, init?.signal ?? undefined);
    }
  };
}
