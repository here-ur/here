import { refreshActivityDays } from '@/lib/account-activity-server';
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
import { contextStore, createConversationContext } from '@/lib/conversation-context';
import { processContextMaintenance } from '@/lib/context-maintenance';
import { requireCipher } from '@/lib/conversation-cipher';
import { reportError, isServerFailure, reportingFailures } from '@/lib/error-report';

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
  // 기억 기능이 켜진 환경에서만 대화를 저장하므로, 그때만 암호화 키가 필요하다.
  let cipher: import('@/lib/conversation-cipher').UserCipher | undefined;
  if (memoryEnabled(process.env)) {
    const guard = requireCipher(access.userId);
    if (guard.response) { after(() => reportError(access.supabase, 'cipher.keys', guard.error)); return guard.response; }
    cipher = guard.cipher;
  }
  const memory = cipher ? createMemoryService(supabaseMemoryStore(access.supabase, cipher), memoryConfig) : null;
  // 맥락 준비 실패는 진짜 원인(임베딩 429 등)과 함께 기록한다. 응답은 chat.reply 503으로 따로 남는다.
  const prepareContext = cipher ? reportingFailures(createConversationContext(contextStore(access.supabase, cipher), memoryConfig, 4500, true),
    e => after(() => reportError(access.supabase, 'chat.context', e))) : undefined;
  let history: {batchId:string;userMessageId:string;assistantMessageId:string;userAt:number;assistantAt:number}|undefined;
  const historyVersion = request.headers.get("x-here-history");
  if(memory && (historyVersion === "v1" || historyVersion === "v2")) {
    try {
      const body=await readSmallJson(request.clone(),5000,256000) as {history?: typeof history};
      const h=body.history;
      if(h && isUuid(h.batchId) && isUuid(h.userMessageId) && isUuid(h.assistantMessageId)
        && Number.isFinite(h.userAt) && Number.isFinite(h.assistantAt)) history=h;
    } catch { /* Main request validation returns the user-facing error. */ }
  }
  const response = await chatResponse(request, {
    onboardingAnswers: access.onboardingAnswers,
    hereName: access.hereName,
    prepareContext,
    contextRequired: Boolean(prepareContext),
    onExchange: history ? async (messages, reply) => {
      const h=history!;
      const assistantAt = historyVersion === "v2" ? Math.max(Date.now(), h.userAt + 1) : h.assistantAt;
      try {
      // DB에는 암호문만 보내고, 재전송 판단용 지문은 원문 기준으로 만든다.
      const batch=cipher!.encryptBatch([
        {id:h.userMessageId,role:'user',content:messages.at(-1)!.content,at:new Date(h.userAt).toISOString()},
        {id:h.assistantMessageId,role:'assistant',content:reply,at:new Date(assistantAt).toISOString()},
      ]);
      const {error}=await access.supabase.rpc('save_conversation_batch',{p_id:h.batchId,p_messages:batch.messages,p_fingerprint:batch.fingerprint})
        .abortSignal(AbortSignal.timeout(8000));
      if (error) after(() => reportError(access.supabase, 'chat.save', error));
      else after(async()=>{await Promise.allSettled([refreshActivityDays(access.supabase,cipher!).catch(e=>reportError(access.supabase,'activity.refresh',e)),processConversationMemories(access.supabase,memoryConfig)]);});
      } catch (e) { after(() => reportError(access.supabase, 'chat.save', e)); /* The durable outbox retries without changing the reply timestamp. */ }
      // Return the exact timestamp even if the durable client outbox must retry this save.
      return { assistantAt };
    } : undefined,
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
    memory: memory ? { recall: memory.recall, schedule: messages => { if (historyVersion !== "v1" && historyVersion !== "v2") after(async () => { await memory.remember(messages); await processContextMaintenance(access.supabase, memoryConfig); }); } } : undefined,
  });
  // 우리 쪽 문제(5xx·AI 한도 429)만 기록한다. 형식 오류·로그인 만료 같은 4xx와 499는 정상 동작.
  if (isServerFailure(response.status)) after(() => reportError(access.supabase, 'chat.reply', { status: response.status }));
  return response;
}
