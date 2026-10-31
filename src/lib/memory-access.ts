import type { SupabaseClient } from "@supabase/supabase-js";
import { memoryEnabled } from "./memory.ts";

export async function requireMemoryConsent(client: SupabaseClient): Promise<Response | null> {
  if (!memoryEnabled(process.env)) return null;
  try {
    const { data, error } = await client.rpc("memory_is_enabled").abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error("consent_unavailable");
    return data === true ? null : Response.json({ error: "개인정보 이용 동의를 먼저 확인해 주세요.", code: "consent_required" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "동의 상태를 확인하지 못했어요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
