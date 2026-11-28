import { requireMember } from "@/lib/member-auth";
import { parseQuotaStatus } from "@/lib/quota-status";
import { reportError } from "@/lib/error-report";
import { after } from "next/server";

// 메뉴에 보여 줄 하루 남은 대화량. 읽기만 해서 한도를 쓰지 않고, 모델도 부르지 않는다.
export async function GET(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  try {
    const { data, error } = await access.supabase.rpc("api_quota_status").abortSignal(AbortSignal.timeout(3000));
    if (error || !parseQuotaStatus(data)) { after(() => reportError(access.supabase, "quota.status", error ?? { code: "invalid_result" })); return Response.json({ error: "남은 대화량을 확인하지 못했어요." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    after(() => reportError(access.supabase, "quota.status", e));
    return Response.json({ error: "남은 대화량을 확인하지 못했어요." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
