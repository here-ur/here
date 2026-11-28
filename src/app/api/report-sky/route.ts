import { reportSkyResponse } from "@/lib/report-sky-server";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { requireApiQuota } from "@/lib/api-quota";
import { reportError, isServerFailure } from "@/lib/error-report";
import { after } from "next/server";

export const maxDuration = 120;

// 리포트의 하늘 고르기는 글 대화와 같은 Runyour 설정·chat 할당량을 쓴다. 기억은 읽지도 저장하지도 않는다.
export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  const quotaError = await requireApiQuota(access.supabase, "chat");
  if (quotaError) return quotaError;
  const response = await reportSkyResponse(request, {
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
  });
  // 앱은 실패해도 조용히 6시간 뒤 다시 시도하므로, 기록이 없으면 표정 기능이 멈춰도 모른다.
  if (isServerFailure(response.status)) after(() => reportError(access.supabase, "report.sky", { status: response.status }));
  return response;
}
