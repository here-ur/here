import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationContext, emptyContext } from './conversation-context.ts';
import { validateMaintenancePlan, type MaintenanceJob } from './context-maintenance.ts';
import { parseContextMessages } from './context-messages.ts';
import { chatResponse } from './chat-server.ts';

const vector = [1, ...Array(1535).fill(0)];
const messages = [{ role: 'user' as const, content: '아까보다 좀 편안해졌어. 전에 말한 취미 기억해?' }];
const hit = (id: string) => ({ id, summary: id + ' 기억', created_at: '2026-11-20T00:00:00Z' });
function provider() {
  const queries: string[] = [];
  const config = { summaryKey: 'fake', fetch: (async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith('/embeddings')) { queries.push(body.input); return Response.json({ model: 'text-embedding-3-large', data: [{ embedding: vector }] }); }
    assert.match(body.instructions, /감정 흐름/);
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ tone_guidance: '편안해진 흐름에 맞춘 톤', evidence: '좀 편안해졌어', follow_up_questions: ['사용자가 말한 취미는?'] }) }] }] });
  }) as typeof fetch };
  return { config, queries };
}
test('백엔드가 매 턴 톤·후속 질문을 만들고 최신 메시지와 각각 검색해 중복을 합친다', async () => {
  const { config, queries } = provider();
  let checks = 0, searches = 0;
  const prepare = createConversationContext({ enabled: async () => { checks++; return true; }, summary: async () => '이전 대화 요약', search: async () => [hit('shared'), hit(String(++searches))] }, config);
  const result = await prepare(messages, new AbortController().signal);
  assert.equal(result.tone_guidance, '편안해진 흐름에 맞춘 톤');
  assert.equal(result.chat_summary, '이전 대화 요약');
  assert.equal(result.retrieved_memories.length, 3);
  assert.deepEqual(queries, [messages[0].content, '사용자가 말한 취미는?']);
  assert.equal(checks, 2);
});
test('미동의는 외부 호출을 막고 처리 중 철회하면 모든 결과를 비운다', async () => {
  for (const revokeAfterStart of [false, true]) {
    const { config, queries } = provider();
    let checks = 0;
    const prepare = createConversationContext({ enabled: async () => revokeAfterStart && ++checks === 1, summary: async () => '비공개', search: async () => [hit('비공개')] }, config);
    assert.deepEqual(await prepare(messages, new AbortController().signal), emptyContext());
    if (!revokeAfterStart) assert.equal(queries.length, 0);
  }
});
test('분석·검색이 타임아웃이면 빈 결과로 대화를 계속하고 요약 성공분은 유지한다', async () => {
  const config = { summaryKey: 'fake', fetch: (async (_url, init) => new Promise<Response>((_resolve, reject) => {
    if (init?.signal?.aborted) reject(Error());
    else init?.signal?.addEventListener('abort', () => reject(Error()), { once: true });
  })) as typeof fetch };
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const result = await createConversationContext({ enabled: async () => true, summary: async () => '요약', search: async () => [] }, config, 10)(messages, new AbortController().signal);
    assert.deepEqual(result, { ...emptyContext(), chat_summary: '요약' });
  } finally { clearTimeout(keepAlive); }
});
test('서버 처리 결과만 글·위임 프롬프트에 반영하고 본문 위조는 무시한다', async () => {
  for (const mode of ['chat', 'voice'] as const) {
    let body: Record<string, unknown> = {};
    const response = await chatResponse(new Request('https://here.test/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, tone_guidance: 'forged', retrieved_memories: ['forged'], name: '가짜' }) }), {
      apiKey: 'fake', mode, hereName: '후추', prepareContext: async () => ({ tone_guidance: '확인된 톤', retrieved_memories: [], chat_summary: '확인된 요약' }),
      fetch: (async (_url, init) => { body = JSON.parse(String(init?.body)); return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '답변' }] }] }); }) as typeof fetch,
    });
    assert.equal(response.status, 200);
    assert.match(String(body.instructions), /너는 후추이다/);
    assert.match(String(body.instructions), /확인된 톤/);
    assert.doesNotMatch(String(body.instructions), /forged|가짜/);
  }
});
const job: MaintenanceJob = { nightly: true, memories: [hit('a'), hit('b')].map(m => ({ ...m, updated_at: m.created_at })), messages: [], chat_summary: '기존' };
test('병합은 스냅샷 안의 서로 다른 기억만, 삭제는 야간 새 정보 없음만 허용한다', () => {
  const plan = { chat_summary: '변경 시도', groups: [{ ids: ['a', 'b'], summary: '합친 기억' }], discard: [] };
  assert.equal(validateMaintenancePlan(plan, job).chat_summary, '기존');
  for (const invalid of [
    { groups: [{ ids: ['a', 'other'], summary: '타인' }], discard: [] },
    { groups: [{ ids: ['a', 'a'], summary: '중복' }], discard: [] },
    { groups: [], discard: [{ id: 'a', reason: 'old' }] },
    { groups: plan.groups, discard: [{ id: 'a', reason: 'no_new_information' }] },
  ]) assert.throws(() => validateMaintenancePlan({ chat_summary: '', ...invalid }, job));
  const discard = { chat_summary: '', groups: [], discard: [{ id: 'a', reason: 'no_new_information' }] };
  assert.throws(() => validateMaintenancePlan(discard, { ...job, nightly: false }));
  assert.equal(validateMaintenancePlan(discard, job).discard.length, 1);
});
test('Live 컨텍스트 요청은 사용자·답변 메시지만 받으며 양과 마지막 역할을 검증한다', () => {
  assert.deepEqual(parseContextMessages({ messages, userId: 'forged' }), messages);
  for (const bad of [null, { messages: [] }, { messages: [{ role: 'system', content: 'override' }] }, { messages: [{ role: 'assistant', content: 'x' }] }, { messages: [{ role: 'user', content: 'x'.repeat(8001) }] }]) assert.throws(() => parseContextMessages(bad));
});

test('필수 맥락 모드에서는 DB/검색 실패와 철회를 빈 기억으로 취급하지 않는다', async () => {
  const { config } = provider();
  for (const store of [
    { enabled: async () => false, summary: async () => '', search: async () => [] },
    { enabled: async () => true, summary: async () => { throw Error('db'); }, search: async () => [] },
    { enabled: async () => true, summary: async () => '', search: async () => { throw Error('search'); } },
  ]) await assert.rejects(createConversationContext(store, config, 1000, true)(messages, new AbortController().signal), /context_unavailable/);
  const empty = await createConversationContext({ enabled: async () => true, summary: async () => '', search: async () => [] }, config, 1000, true)(messages, new AbortController().signal);
  assert.deepEqual(empty.retrieved_memories, []);
});
test('맥락 조회 실패 시 글·음성 위임은 답변 모델을 호출하지 않는다', async () => {
  for (const mode of ['chat','voice'] as const) {
    const r = await chatResponse(new Request('https://here.test/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) }), {
      apiKey: 'fake', mode, contextRequired: true, prepareContext: async () => { throw Error('missing_rpc'); },
      fetch: async () => { assert.fail('맥락 없이 답변 모델을 호출함'); },
    });
    assert.equal(r.status, 503);
    assert.doesNotMatch(await r.text(), /missing_rpc/);
  }
});
