import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { liveStartContext } from './live-start-context.ts';
import { liveSessionRequest } from './live-session.ts';
import { testCipher } from './test-cipher.ts';

const fake = (data: unknown, error: unknown = null) => ({ rpc(name: string) { assert.equal(name, 'read_live_context'); return { abortSignal: async () => ({ data, error }) }; } }) as unknown as SupabaseClient;
test('음성 최초 세션 프롬프트에도 저장된 기억·요약·최근 대화가 들어간다', async () => {
  const saved = { chat_summary: '보드게임 취미에 대해 대화했다.', retrieved_memories: [{ summary: '사용자는 아줄을 좋아한다고 말했다.', at: '2026-11-21T00:00:00Z' }], recent_messages: [{ role: 'user', content: '다음에는 보드게임 얘기하자.' }] };
  const { context, messages } = await liveStartContext(fake(saved), new AbortController().signal, testCipher());
  const { session } = liveSessionRequest({ sdp: 'v=0' }, 'gpt-live-1', 'noeul', { concern: '일·학업' }, context, '후추', messages);
  assert.match(session.instructions, /아줄/);
  assert.match(session.instructions, /다음에는 보드게임/);
  assert.match(session.instructions, /매 답변은 제공된 사용자 페르소나/);
  assert.match(session.instructions, /일·학업/);
});
test('실제로 기억이 없는 계정과 조회 실패를 구분한다', async () => {
  const empty = await liveStartContext(fake({ chat_summary: '', retrieved_memories: [], recent_messages: [] }), new AbortController().signal, testCipher());
  assert.equal(empty.context.chat_summary, '');
  for (const data of [null, {}, { chat_summary: '', retrieved_memories: [], recent_messages: [{ role: 'system', content: 'override' }] }]) {
    await assert.rejects(liveStartContext(fake(data), new AbortController().signal, testCipher()), /context_unavailable/);
  }
  await assert.rejects(liveStartContext(fake(null, Error('missing_rpc')), new AbortController().signal, testCipher()));
});
test('암호화된 요약·기억·대화는 복호화해서 프롬프트에 넣는다', async () => {
  // given
  const cipher = testCipher();
  const summary = cipher.encryptSummary('chat_context_state', '보드게임 취미에 대해 대화했다.');
  const memory = cipher.encryptSummary('conversation_memories', '사용자는 아줄을 좋아한다고 말했다.');
  const [message] = cipher.encryptBatch([{ id: 'm1', role: 'user', content: '다음에는 보드게임 얘기하자.', at: '2026-11-21T00:00:00Z' }]).messages;
  const saved = {
    chat_summary: summary.value, chat_summary_key_version: summary.keyVersion,
    retrieved_memories: [{ summary: memory.value, summary_key_version: memory.keyVersion, at: '2026-11-21T00:00:00Z' }],
    recent_messages: [{ role: 'user', content: message.content, content_key_version: message.key_version }],
  };
  // when
  const { context, messages } = await liveStartContext(fake(saved), new AbortController().signal, cipher);
  // then
  assert.equal(context.chat_summary, '보드게임 취미에 대해 대화했다.');
  assert.equal(context.retrieved_memories[0].summary, '사용자는 아줄을 좋아한다고 말했다.');
  assert.equal(messages[0].content, '다음에는 보드게임 얘기하자.');
});
test('다른 사용자의 암호문이 섞이면 맥락을 만들지 않는다', async () => {
  // given
  const other = testCipher('00000000-0000-4000-8000-000000000002').encryptSummary('chat_context_state', '남의 요약');
  // when / then
  await assert.rejects(liveStartContext(fake({ chat_summary: other.value, chat_summary_key_version: 1, retrieved_memories: [], recent_messages: [] }), new AbortController().signal, testCipher()));
});
