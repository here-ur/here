import { chatResponse } from "@/lib/chat-server";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { requireApiQuota } from "@/lib/api-quota";
import { createMemoryService, memoryEnabled } from "@/lib/memory";
import { supabaseMemoryStore } from "@/lib/memory-store";
import { searchWeb } from "@/lib/web-search";
import { SEARCH_UNAVAILABLE, type SearchSource } from "@/lib/web-search-protocol";

export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  const consent = await requireMemoryConsent(access.supabase);
  if (consent) return consent;
  const quota = await requireApiQuota(access.supabase, "chat");
  if (quota) return quota;
  const enabled = memoryEnabled(process.env);
  const memory = enabled ? createMemoryService(supabaseMemoryStore(access.supabase), {
    openaiKey: process.env.OPENAI_API_KEY || "", summaryKey: process.env.RUNYOUR_API_KEY || "",
    summaryBaseUrl: process.env.RUNYOUR_BASE_URL, summaryModel: process.env.MEMORY_SUMMARY_MODEL,
  }) : null;
  const sources: SearchSource[] = [];
  const response = await chatResponse(request, {
    mode: "voice",
    apiKey: process.env.RUNYOUR_API_KEY, baseUrl: process.env.RUNYOUR_BASE_URL, model: process.env.CHAT_MODEL,
    // Voice fragments are saved through voice-memory with source IDs. Do not save the same request as chat too.
    memory: memory ? { recall: memory.recall, schedule: () => {} } : undefined,
    search: enabled ? async (query, signal) => {
      if (await requireMemoryConsent(access.supabase) || await requireApiQuota(access.supabase, "chat")) return SEARCH_UNAVAILABLE;
      const result = await searchWeb(query, { apiKey: process.env.RUNYOUR_API_KEY }, signal);
      if (result.available) sources.push(...result.sources);
      return result;
    } : undefined,
  });
  if (!response.ok) return response;
  return Response.json({ ...await response.json(), sources: sources.slice(0, 5) }, { headers: { "Cache-Control": "no-store" } });
}
