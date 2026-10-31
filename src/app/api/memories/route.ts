import { requireMember } from "@/lib/member-auth";
import { memoryEnabled } from "@/lib/memory";
import { JsonRequestError, readSmallJson } from "@/lib/request-json";

const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json({ enabled: false, available: false, memories: [] });
  try {
    const signal = AbortSignal.timeout(5000);
    const { data: enabled, error: settingsError } = await access.supabase.rpc("memory_is_enabled").abortSignal(signal);
    const { data, error } = await access.supabase.from("conversation_memories")
      .select("id,summary,status,created_at,updated_at").eq("user_id", access.userId)
      .neq("status", "deleted").order("created_at", { ascending: false }).limit(100).abortSignal(signal);
    if (error || settingsError) return json({ error: "기억을 불러오지 못했어요." }, 503);
    return json({ enabled, available: true, memories: data });
  } catch { return json({ error: "기억을 불러오지 못했어요." }, 503); }
}

// No product on/off toggle: signup consent is required. Withdrawal and forgetting remain separate rights.
export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json({ error: "기억 기능이 아직 열리지 않았어요." }, 503);
  try {
    const value = await readSmallJson(request);
    if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "잘못된 요청이에요." }, 400);
    const body = value as Record<string, unknown>;
    let name: string;
    let args: Record<string, unknown>;
    if (body?.action === "withdraw_consent") {
      name = "withdraw_memory_consent"; args = {};
    } else if (body?.action === "forget" && typeof body.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) {
      name = "forget_memory"; args = { p_id: body.id };
    } else return json({ error: "잘못된 요청이에요." }, 400);
    const { data, error } = await access.supabase.rpc(name, args).abortSignal(AbortSignal.timeout(5000));
    if (error) return json({ error: "기억 설정을 바꾸지 못했어요." }, 503);
    if (data !== true) return json({ error: "변경할 기억이 없어요." }, 404);
    return json({ ok: true });
  } catch (error) {
    return error instanceof JsonRequestError ? json({ error: error.message }, error.status)
      : json({ error: "요청을 처리하지 못했어요." }, 503);
  }
}
