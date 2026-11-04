import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { memoryEnabled } from "@/lib/memory";
import { requireApiQuota } from "@/lib/api-quota";
import { readSmallJson, JsonRequestError } from "@/lib/request-json";
import { parseSearchQuery } from "@/lib/web-search-protocol";
import { searchWeb } from "@/lib/web-search";

export const maxDuration = 30;
const json = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json({ error: "개발 환경에서만 사용할 수 있어요." }, 503);
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  try {
    const query = parseSearchQuery(await readSmallJson(request, 5000, 2048));
    if (!query) return json({ error: "개인정보를 제외한 짧은 검색어로 다시 요청해 주세요." }, 400);
    // Search shares the existing chat budget; every search consumes an additional unit.
    const quotaError = await requireApiQuota(access.supabase, "chat");
    if (quotaError) return quotaError;
    const result = await searchWeb(query, { apiKey: process.env.RUNYOUR_API_KEY }, request.signal);
    return json(result, result.available ? 200 : 503);
  } catch (error) {
    return json({ error: error instanceof JsonRequestError ? error.message : "검색하지 못했어요." }, error instanceof JsonRequestError ? error.status : 503);
  }
}
