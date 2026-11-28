import { requireMember } from "@/lib/member-auth";
import { memoryEnabled } from "@/lib/memory";
import { requireMemoryConsent } from "@/lib/memory-access";
import { createGreetingCache, homeGreetingPlan } from "@/lib/home-greeting";
import { requireApiQuota } from "@/lib/api-quota";
import { requireCipher } from "@/lib/conversation-cipher";

export const maxDuration = 30;
const greeting = createGreetingCache();
const json = (headline: string | null) => Response.json({ headline }, { headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json(null);
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  const quotaError = await requireApiQuota(access.supabase, "home_greeting");
  if (quotaError) return quotaError;
  const guard = requireCipher(access.userId);
  if (guard.response) return guard.response;
  const plan = homeGreetingPlan(access.userId);
  try {
    if (!plan.useMemory) return json(plan.fallback);
    // Always recheck current ready rows BEFORE cache lookup: deleted memories must not survive in the greeting.
    const { data, error } = await access.supabase.from("conversation_memories")
      .select("id,summary,summary_key_version,updated_at").eq("user_id", access.userId).eq("status", "ready")
      .order("created_at", { ascending: false }).limit(20).abortSignal(AbortSignal.timeout(3000));
    if (error || !data?.length) return json(plan.fallback);
    // 화제 고르기에는 원문 요약을 쓰고, 아래 "바뀌었는지" 비교는 저장된 값(암호문) 그대로 한다.
    const memories = data.map(({ summary_key_version, ...m }) => ({ ...m, summary: guard.cipher.decryptSummary("conversation_memories", m.summary, summary_key_version ?? 0) }));
    const headline = await greeting(access.userId, memories, {
      apiKey: process.env.RUNYOUR_API_KEY, baseUrl: process.env.RUNYOUR_BASE_URL,
      model: process.env.CHAT_MODEL,
    });
    // Consent can be withdrawn while the model is selecting a topic.
    const revoked = await requireMemoryConsent(access.supabase);
    if (revoked) return revoked;
    const { data: current, error: changed } = await access.supabase.from("conversation_memories")
      .select("id,summary,summary_key_version,updated_at").eq("user_id", access.userId).eq("status", "ready")
      .order("created_at", { ascending: false }).limit(20).abortSignal(AbortSignal.timeout(3000));
    return json(changed || JSON.stringify(current) !== JSON.stringify(data) ? plan.fallback : headline || plan.fallback);
  } catch { return json(plan.fallback); }
}
