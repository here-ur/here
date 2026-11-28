import { chatResponse } from "@/lib/chat-server";
import { requireMember } from "@/lib/member-auth";
import { requireMemoryConsent } from "@/lib/memory-access";
import { requireApiQuota } from "@/lib/api-quota";
import { contextConfig, contextStore, createConversationContext } from '@/lib/conversation-context';
import { memoryEnabled } from '@/lib/memory';
import { requireCipher } from '@/lib/conversation-cipher';

export const maxDuration = 120;

export async function POST(request: Request) {
  const access = await requireMember(request);
  if (access.response) return access.response;
  const consent = await requireMemoryConsent(access.supabase);
  if (consent) return consent;
  const quota = await requireApiQuota(access.supabase, "chat");
  if (quota) return quota;
  let prepareContext;
  if (memoryEnabled(process.env)) {
    const guard = requireCipher(access.userId);
    if (guard.response) return guard.response;
    prepareContext = createConversationContext(contextStore(access.supabase, guard.cipher), contextConfig(process.env), 4500, true);
  }
  return chatResponse(request, {
    onboardingAnswers: access.onboardingAnswers,
    hereName: access.hereName,
    prepareContext,
    contextRequired: Boolean(prepareContext),
    mode: "voice",
    apiKey: process.env.RUNYOUR_API_KEY,
    baseUrl: process.env.RUNYOUR_BASE_URL,
    model: process.env.CHAT_MODEL,
  });
}
