import { chatResponse } from "@/lib/chat-server";
import { requireMember } from "@/lib/member-auth";
import { after } from "next/server";
import { createMemoryService, memoryEnabled } from "@/lib/memory";
import { supabaseMemoryStore } from "@/lib/memory-store";
import { requireMemoryConsent } from "@/lib/memory-access";
import { requireApiQuota } from "@/lib/api-quota";
import { searchWeb } from "@/lib/web-search";
import { SEARCH_UNAVAILABLE } from "@/lib/web-search-protocol";

export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  const quotaError = await requireApiQuota(access.supabase, "chat");
  if (quotaError) return quotaError;
  const memory = memoryEnabled(process.env) ? createMemoryService(supabaseMemoryStore(access.supabase), {
    openaiKey: process.env.OPENAI_API_KEY || "",
    summaryKey: process.env.RUNYOUR_API_KEY || "",
    summaryBaseUrl: process.env.RUNYOUR_BASE_URL,
    summaryModel: process.env.MEMORY_SUMMARY_MODEL,
  }) : null;
  const search = memoryEnabled(process.env) ? async (query: string, signal: AbortSignal) => {
    // Recheck consent before transmitting a query. Search counts against the same chat budget.
    if (await requireMemoryConsent(access.supabase) || await requireApiQuota(access.supabase, "chat")) return SEARCH_UNAVAILABLE;
    return searchWeb(query, { apiKey: process.env.RUNYOUR_API_KEY }, signal);
  } : undefined;
  return chatResponse(request, {
    search,
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
    memory: memory ? { recall: memory.recall, schedule: messages => after(() => memory.remember(messages)) } : undefined,
  });
}
