import { requireMember } from "@/lib/member-auth";
import { memoryEnabled } from "@/lib/memory";
import { MEMORY_CONSENT_VERSION, validMemoryConsent } from "@/lib/memory-consent";
import { JsonRequestError, readSmallJson } from "@/lib/request-json";
import { reportError } from "@/lib/error-report";
import { after } from "next/server";

const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json({ required: false });
  try {
    const { data, error } = await access.supabase.rpc("conversation_is_enabled").abortSignal(AbortSignal.timeout(5000));
    if (error) throw error;
    return json({ required: data !== true, version: MEMORY_CONSENT_VERSION });
  } catch (e) { after(() => reportError(access.supabase, "consent.check", e)); return json({ error: "동의 상태를 확인하지 못했어요." }, 503); }
}

export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json({ error: "기억 기능이 아직 열리지 않았어요." }, 503);
  try {
    const body = await readSmallJson(request);
    if (body && typeof body === "object" && "version" in body && body.version !== MEMORY_CONSENT_VERSION) return json({ error: "동의 내용이 바뀌었어요. 새로고침한 뒤 새 내용을 확인해 주세요.", code: "consent_version_changed", version: MEMORY_CONSENT_VERSION }, 409);
    if (!validMemoryConsent(body)) return json({ error: "필수 동의 항목을 각각 확인해 주세요." }, 400);
    const { data, error } = await access.supabase.rpc("accept_memory_consent", {
      p_version: MEMORY_CONSENT_VERSION, p_privacy: true, p_sensitive: true,
    }).abortSignal(AbortSignal.timeout(5000));
    if (error || data !== true) { after(() => reportError(access.supabase, "consent.save", error ?? { code: "rejected" })); return json({ error: "동의를 저장하지 못했어요." }, 503); }
    return json({ ok: true });
  } catch (error) {
    if (error instanceof JsonRequestError) return json({ error: error.message }, error.status);
    after(() => reportError(access.supabase, "consent.save", error));
    return json({ error: "동의를 저장하지 못했어요." }, 503);
  }
}
