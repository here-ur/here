import type { SupabaseClient } from '@supabase/supabase-js';
import { ContextUnavailableError, type ConversationContext } from './conversation-context.ts';
import type { MemoryMessage } from './memory.ts';

export async function liveStartContext(client: SupabaseClient, requestSignal: AbortSignal): Promise<{ context: ConversationContext; messages: MemoryMessage[] }> {
  const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(5000)]);
  const { data, error } = await client.rpc('read_live_context').abortSignal(signal);
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
