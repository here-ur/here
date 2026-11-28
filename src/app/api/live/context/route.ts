import { requireMember } from '@/lib/member-auth';
import { requireMemoryConsent } from '@/lib/memory-access';
import { requireApiQuota } from '@/lib/api-quota';
import { memoryEnabled } from '@/lib/memory';
import { contextConfig, contextStore, createConversationContext } from '@/lib/conversation-context';
import { readSmallJson } from '@/lib/request-json';
import { parseContextMessages } from '@/lib/context-messages';
import { requireCipher } from '@/lib/conversation-cipher';
import { reportError } from '@/lib/error-report';
import { after } from 'next/server';

export async function POST(request: Request) {
  const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const access = await requireMember(request);
  if (access.response) return access.response;
  if (!memoryEnabled(process.env)) return json({ error: 'disabled' }, 404);
  const consent = await requireMemoryConsent(access.supabase);
  if (consent) return consent;
  const quota = await requireApiQuota(access.supabase, 'voice_memory');
  if (quota) return quota;
  const guard = requireCipher(access.userId);
  if (guard.response) { after(() => reportError(access.supabase, 'cipher.keys', guard.error)); return guard.response; }
  let messages;
  try { messages = parseContextMessages(await readSmallJson(request, 5000, 256000)); }
  catch { return json({ error: 'invalid_messages' }, 400); }
  let context;
  try { context = await createConversationContext(contextStore(access.supabase, guard.cipher), contextConfig(process.env), 4500, true)(messages, request.signal); }
  catch (e) { after(() => reportError(access.supabase, 'live.context', e)); return json({ error: 'context_unavailable' }, 503); }
  const revoked = await requireMemoryConsent(access.supabase);
  if (revoked) return revoked;
  return json({ context });
}
