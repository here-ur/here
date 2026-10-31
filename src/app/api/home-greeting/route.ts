import { requireMember } from "@/lib/member-auth";
import { memoryEnabled } from "@/lib/memory";
import { requireMemoryConsent } from "@/lib/memory-access";
import { createGreetingCache } from "@/lib/home-greeting";

export const maxDuration = 30;
const greeting = createGreetingCache();
const json = (headline: string | null) => Response.json({ headline }, { headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json(null);
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  try {
    // Always recheck current ready rows BEFORE cache lookup: deleted memories must not survive in the greeting.
    const { data, error } = await access.supabase.from("conversation_memories")
      .select("id,summary,updated_at").eq("user_id", access.userId).eq("status", "ready")
      .order("created_at", { ascending: false }).limit(20).abortSignal(AbortSignal.timeout(3000));
    if (error || !data?.length) return json(null);
    const headline = await greeting(access.userId, data, {
      apiKey: process.env.RUNYOUR_API_KEY, baseUrl: process.env.RUNYOUR_BASE_URL,
      model: process.env.MEMORY_SUMMARY_MODEL || process.env.CHAT_MODEL,
    });
    // Consent can be withdrawn while the model is selecting a topic.
    const revoked = await requireMemoryConsent(access.supabase);
    if (revoked) return revoked;
    const { data: current, error: changed } = await access.supabase.from("conversation_memories")
      .select("id,summary,updated_at").eq("user_id", access.userId).eq("status", "ready")
      .order("created_at", { ascending: false }).limit(20).abortSignal(AbortSignal.timeout(3000));
    return json(changed || JSON.stringify(current) !== JSON.stringify(data) ? null : headline);
  } catch { return json(null); }
}
