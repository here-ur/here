import { isUuid } from "@/lib/conversation-history";
import { processConversationMemories } from "@/lib/conversation-memory";
import { readSmallJson } from "@/lib/request-json";
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
  const memoryConfig = {
    openaiKey: process.env.OPENAI_API_KEY || "",
    summaryKey: process.env.RUNYOUR_API_KEY || "",
    summaryBaseUrl: process.env.RUNYOUR_BASE_URL,
    summaryModel: process.env.MEMORY_SUMMARY_MODEL,
  };
  const memory = memoryEnabled(process.env) ? createMemoryService(supabaseMemoryStore(access.supabase), memoryConfig) : null;
  const search = memoryEnabled(process.env) ? async (query: string, signal: AbortSignal) => {
    // Recheck consent before transmitting a query. Search counts against the same chat budget.
    if (await requireMemoryConsent(access.supabase) || await requireApiQuota(access.supabase, "chat")) return SEARCH_UNAVAILABLE;
    return searchWeb(query, { apiKey: process.env.RUNYOUR_API_KEY }, signal);
  } : undefined;
  let history: {batchId:string;userMessageId:string;assistantMessageId:string;userAt:number;assistantAt:number}|undefined;
  if(memory && request.headers.get("x-here-history")==="v1") {
    try {
      const body=await readSmallJson(request.clone(),5000,256000) as {history?: typeof history};
      const h=body.history;
      if(h && isUuid(h.batchId) && isUuid(h.userMessageId) && isUuid(h.assistantMessageId)
        && Number.isFinite(h.userAt) && Number.isFinite(h.assistantAt)) history=h;
    } catch { /* Main request validation returns the user-facing error. */ }
  }
  return chatResponse(request, {
    onExchange: history ? async (messages, reply) => {
      const h=history!;
      const {error}=await access.supabase.rpc('save_conversation_batch',{p_id:h.batchId,p_messages:[
        {id:h.userMessageId,role:'user',content:messages.at(-1)!.content,at:new Date(h.userAt).toISOString()},
        {id:h.assistantMessageId,role:'assistant',content:reply,at:new Date(h.assistantAt).toISOString()},
      ]}).abortSignal(AbortSignal.timeout(8000));
      if(error) throw new Error('history_save_failed');
      after(()=>processConversationMemories(access.supabase,memoryConfig));
    } : undefined,
    search,
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
    memory: memory ? { recall: memory.recall, schedule: messages => { if (request.headers.get("x-here-history") !== "v1") after(() => memory.remember(messages)); } } : undefined,
  });
}
