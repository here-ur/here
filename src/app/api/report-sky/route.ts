import { reportSkyResponse } from "@/lib/report-sky-server";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { requireApiQuota } from "@/lib/api-quota";

export const maxDuration = 120;

// 리포트의 하늘 고르기는 글 대화와 같은 Runyour 설정·chat 할당량을 쓴다. 기억은 읽지도 저장하지도 않는다.
export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  const quotaError = await requireApiQuota(access.supabase, "chat");
  if (quotaError) return quotaError;
  return reportSkyResponse(request, {
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
  });
}
