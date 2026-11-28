import type { SupabaseClient } from '@supabase/supabase-js';
import { ContextUnavailableError, type ConversationContext } from './conversation-context.ts';
import type { MemoryMessage } from './memory.ts';
import type { UserCipher } from './conversation-cipher.ts';

export async function liveStartContext(client: SupabaseClient, requestSignal: AbortSignal, cipher: UserCipher): Promise<{ context: ConversationContext; messages: MemoryMessage[] }> {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(5000)]);
  const { data: raw, error } = await client.rpc('read_live_context').abortSignal(signal);
  const data = raw && !error ? decryptLiveContext(raw, cipher) : raw;
  if (error || !data || typeof data.chat_summary !== 'string' || data.chat_summary.length > 2400
    || !Array.isArray(data.retrieved_memories) || data.retrieved_memories.length > 5
    || !Array.isArray(data.recent_messages) || data.recent_messages.length > 8) throw new ContextUnavailableError();
  for (const m of data.retrieved_memories) {
    if (!m || typeof m.summary !== 'string' || m.summary.length > 902 || typeof m.at !== 'string' || !Number.isFinite(Date.parse(m.at))) throw new ContextUnavailableError();
  }
  for (const m of data.recent_messages) {
    if (!m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 8000) throw new ContextUnavailableError();
  }
  return {
    context: { tone_guidance: '', chat_summary: data.chat_summary, retrieved_memories: data.retrieved_memories.map((m: { summary: string; at: string }) => ({ summary: m.summary, at: m.at })) },
    // Limit startup history. The full originals remain in the account's backend history.
    messages: data.recent_messages.map((m: MemoryMessage) => ({ role: m.role, content: m.content.slice(-1000) })),
  };
}

type EncryptedLiveContext = {
  chat_summary?: unknown; chat_summary_key_version?: number;
  retrieved_memories?: { summary?: unknown; summary_key_version?: number; at?: unknown }[];
  recent_messages?: { role?: unknown; content?: unknown; content_key_version?: number }[];
};
// 암호문 필드를 원문으로 바꾼다. 모양이 이상한 값은 그대로 두어 아래 검증에서 거절되게 한다.
function decryptLiveContext(data: EncryptedLiveContext, cipher: UserCipher) {
  return {
    ...data,
    chat_summary: typeof data.chat_summary === 'string' ? cipher.decryptSummary('chat_context_state', data.chat_summary, data.chat_summary_key_version ?? 0) : data.chat_summary,
    retrieved_memories: Array.isArray(data.retrieved_memories) ? data.retrieved_memories.map(m => m && typeof m.summary === 'string'
      ? { ...m, summary: cipher.decryptSummary('conversation_memories', m.summary, m.summary_key_version ?? 0) } : m) : data.retrieved_memories,
    recent_messages: Array.isArray(data.recent_messages) ? data.recent_messages.map(m => m && typeof m.content === 'string'
      ? { ...m, content: cipher.decryptContent(m.content, m.content_key_version ?? 0) } : m) : data.recent_messages,
  };
}
