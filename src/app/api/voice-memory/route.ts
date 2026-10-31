import { after } from "next/server";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { createMemoryService, memoryEnabled } from "@/lib/memory";
import { supabaseMemoryStore } from "@/lib/memory-store";
import { voiceMemoryResponse } from "@/lib/voice-memory-server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return Response.json({ error: "음성 기억 기능이 열리지 않았어요." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const memory = createMemoryService(supabaseMemoryStore(access.supabase), {
    openaiKey: process.env.OPENAI_API_KEY || "", summaryKey: process.env.RUNYOUR_API_KEY || "",
    summaryBaseUrl: process.env.RUNYOUR_BASE_URL, summaryModel: process.env.MEMORY_SUMMARY_MODEL,
  });
  return voiceMemoryResponse(request, {
    recall: memory.recall,
    schedule: (messages, sourceId) => after(() => memory.remember(messages, sourceId)),
    checkConsent: () => requireMemoryConsent(access.supabase),
  });
}
