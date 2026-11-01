import type { SupabaseClient } from "@supabase/supabase-js";

export type QuotaResource = "chat" | "realtime" | "voice_memory" | "home_greeting";
export async function requireApiQuota(client: SupabaseClient, resource: QuotaResource): Promise<Response | null> {
  const unavailable = () => Response.json({ error: "이용 한도를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const { data, error } = await client.rpc("consume_api_quota", { p_resource: resource }).abortSignal(AbortSignal.timeout(3000));
    if (error || !data || typeof data.allowed !== "boolean" || !Number.isSafeInteger(data.retry_after) || data.retry_after < 0 || data.retry_after > 86400) return unavailable();
    if (data.allowed) return null;
    return Response.json({ error: "잠시 쉬었다가 다시 이야기해 주세요. 이용 한도에 도달했어요." }, {
      status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(Math.max(1, data.retry_after)) },
    });
  } catch { return unavailable(); } // Missing migration / database failure must not allow unmetered calls.
}
