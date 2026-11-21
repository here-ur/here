import type { MemoryMessage } from './memory.ts';

export function parseContextMessages(body: unknown): MemoryMessage[] {
  const raw = body as { messages?: unknown } | null;
  if (!raw || !Array.isArray(raw.messages) || raw.messages.length < 1 || raw.messages.length > 30) throw Error('invalid_messages');
  let size = 0;
  const messages = raw.messages.map((m): MemoryMessage => {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 8000) throw Error('invalid_message');
    size += m.content.length;
    return { role: m.role, content: m.content };
  });
  if (size > 40000 || messages.at(-1)?.role !== 'user') throw Error('invalid_messages');
  return messages;
}
