import { chatResponse } from "@/lib/chat-server";
import { requireMember } from "@/lib/member-auth";
import { after } from "next/server";
import { createMemoryService, memoryEnabled } from "@/lib/memory";
import { supabaseMemoryStore } from "@/lib/memory-store";
import { requireMemoryConsent } from "@/lib/memory-access";

export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  const consentError = await requireMemoryConsent(access.supabase);
  if (consentError) return consentError;
  const memory = memoryEnabled(process.env) ? createMemoryService(supabaseMemoryStore(access.supabase), {
    openaiKey: process.env.OPENAI_API_KEY || "",
    summaryKey: process.env.RUNYOUR_API_KEY || "",
    summaryBaseUrl: process.env.RUNYOUR_BASE_URL,
    summaryModel: process.env.MEMORY_SUMMARY_MODEL || process.env.CHAT_MODEL,
  }) : null;
  return chatResponse(request, {
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
    memory: memory ? { recall: memory.recall, schedule: messages => after(() => memory.remember(messages)) } : undefined,
  });
}
