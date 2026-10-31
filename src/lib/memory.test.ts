import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryService, embed, EMBEDDING_MODEL, memoryEnabled, memoryKey, parseMemoryFacts, summarize, type MemoryConfig, type MemoryStore } from "./memory.ts";
import { MEMORY_CONSENT_VERSION, validMemoryConsent } from "./memory-consent.ts";

const vector = Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0);
const embedding = () => ({ model: EMBEDDING_MODEL, data: [{ index: 0, embedding: vector }] });
const summary = (facts = [{ text: "사용자는 차를 좋아한다고 말했다.", evidence: "차를 좋아해" }]) => ({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify({ facts }) }] }] });
function provider(results: unknown[]) {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const config: MemoryConfig = { openaiKey: "test-embedding", summaryKey: "test-summary", fetch: async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("Authorization") });
    const result = results.shift();
    assert.notEqual(result, undefined);
    return result instanceof Response ? result : Response.json(result);
  } };
  return { config, calls };
}
function fixture() {
  const events: string[] = [];
  const store: MemoryStore = {
    enabled: async () => true,
    claim: async () => { events.push("claim"); return { id: "test", lease: "lease" }; },
    finish: async (_job, text, v) => { events.push("finish"); assert.equal(text, "사용자는 차를 좋아한다고 말했다."); assert.deepEqual(v, vector); },
    fail: async () => { events.push("fail"); },
    search: async () => [{ id: "test", summary: "사용자는 차를 좋아한다고 말했다.", created_at: "2026-10-31T00:00:00Z" }],
  };
  return { store, events };
}

test("기억 기능은 명시한 개발 DB·플래그에서만 활성화한다", () => {
  const env = { MEMORY_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://mwjwfumpxdlllikcdvkh.supabase.co" };
  assert.equal(memoryEnabled(env), true);
  assert.equal(memoryEnabled({ ...env, VERCEL_ENV: "production" }), false);
  assert.equal(memoryEnabled({ ...env, NEXT_PUBLIC_SUPABASE_URL: "https://jtgdmuenwsvjhnugytfa.supabase.co" }), false);
  assert.equal(memoryEnabled({ ...env, MEMORY_ENABLED: undefined }), false);
});
test("현재 버전의 두 필수 동의를 모두 명시해야 한다", () => {
  for (const body of [null, {}, { version: MEMORY_CONSENT_VERSION, privacy: true }, { version: "old", privacy: true, sensitive: true }, { version: MEMORY_CONSENT_VERSION, privacy: "true", sensitive: true }]) assert.equal(validMemoryConsent(body), false);
  assert.equal(validMemoryConsent({ version: MEMORY_CONSENT_VERSION, privacy: true, sensitive: true }), true);
});
test("large 1536차원·float 형식으로 임베딩하고 별도 키를 쓴다", async () => {
  const { config, calls } = provider([embedding()]);
  assert.deepEqual(await embed("차 취향", config, AbortSignal.timeout(1000)), vector);
  assert.equal(calls[0].url, "https://api.openai.com/v1/embeddings");
  assert.deepEqual(calls[0].body, { input: "차 취향", model: EMBEDDING_MODEL, dimensions: 1536, encoding_format: "float" });
  assert.equal(calls[0].auth, "Bearer test-embedding");
});
test("잘못된 모델·차원·벡터, 과한 응답과 제공자 오류를 거절한다", async () => {
  for (const response of [{ ...embedding(), model: "other" }, { data: [] }, { ...embedding(), data: [{ embedding: [1, 2] }] }, { ...embedding(), data: [{ embedding: Array(1536).fill(0) }] }, new Response("private-token-details", { status: 401 }), new Response("x".repeat(128 * 1024 + 1))]) {
    const { config } = provider([response]);
    await assert.rejects(embed("차", config, AbortSignal.timeout(1000)), error => !String(error).includes("private-token-details"));
  }
});
test("사용자 원문에서 확인되는 근거만 받아들이고 근거는 저장 요약에서 제외한다", () => {
  assert.equal(parseMemoryFacts({ facts: [{ text: "차를 선호한다고 말했다.", evidence: "차를 좋아해" }] }, "나는 차를 좋아해"), "차를 선호한다고 말했다.");
  assert.equal(parseMemoryFacts({ facts: [] }, "안녕"), "");
  assert.throws(() => parseMemoryFacts({ facts: [{ text: "우울증이 있다.", evidence: "우울증" }] }, "오늘 힘들어"));
  assert.throws(() => parseMemoryFacts({ facts: [{ text: "x".repeat(301), evidence: "차를" }] }, "차를 좋아해"));
});
test("요약은 Runyour Responses의 store:false·구조화 출력으로 요청한다", async () => {
  const { config, calls } = provider([summary()]);
  assert.equal(await summarize("나는 차를 좋아해", config, AbortSignal.timeout(1000)), "사용자는 차를 좋아한다고 말했다.");
  assert.equal(calls[0].url, "https://api.runyour.ai/v1/responses");
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].auth, "Bearer test-summary");
  assert.deepEqual(calls[0].body.input, [{ role: "user", content: "나는 차를 좋아해" }]);
});
test("회원 동의 없으면 검색·저장·외부 API를 호출하지 않는다", async () => {
  const { store, events } = fixture(); store.enabled = async () => false;
  const { config, calls } = provider([]);
  const service = createMemoryService(store, config);
  assert.equal(await service.recall([{ role: "user", content: "차" }], AbortSignal.timeout(1000)), "");
  await service.remember([{ role: "user", content: "차" }]);
  assert.deepEqual(calls, []); assert.deepEqual(events, []);
});
test("이전 대화·AI 답변은 다시 요약하지 않고 최신 사용자 메시지만 저장한다", async () => {
  const { store, events } = fixture();
  const { config, calls } = provider([summary(), embedding()]);
  await createMemoryService(store, config).remember([{ role: "user", content: "지워진 과거 내용" }, { role: "assistant", content: "모델이 추측한 성격" }, { role: "user", content: "나는 차를 좋아해" }]);
  assert.deepEqual(calls[0].body.input, [{ role: "user", content: "나는 차를 좋아해" }]);
  assert.deepEqual(events, ["claim", "finish"]);
});
test("이미 처리한 요청은 API 비용이나 저장을 중복 발생시키지 않는다", async () => {
  const { store } = fixture(); store.claim = async () => null;
  const { config, calls } = provider([]);
  await createMemoryService(store, config).remember([{ role: "user", content: "나는 차를 좋아해" }]);
  assert.equal(calls.length, 0);
  const messages = [{ role: "user" as const, content: "나는 차를 좋아해" }];
  assert.equal(memoryKey(messages), memoryKey(messages)); assert.match(memoryKey(messages), /^[0-9a-f]{64}$/);
});
test("요약 실패를 failed로 기록하고 검색 실패는 대화를 차단하지 않는다", async () => {
  const { store, events } = fixture();
  const { config } = provider([new Response("private", { status: 500 }), new Response("private", { status: 500 })]);
  const service = createMemoryService(store, config);
  await service.remember([{ role: "user", content: "차" }]);
  assert.deepEqual(events, ["claim", "fail"]);
  assert.equal(await service.recall([{ role: "user", content: "차" }], AbortSignal.timeout(1000)), "");
});
test("빈 기억은 임베딩하지 않고 skipped로 마무리한다", async () => {
  const { store } = fixture();
  store.finish = async (_job, text, v) => { assert.equal(text, ""); assert.equal(v, null); };
  const { config, calls } = provider([summary([])]);
  await createMemoryService(store, config).remember([{ role: "user", content: "안녕" }]);
  assert.equal(calls.length, 1);
});
test("회상은 과거 자기보고·비명령 데이터임을 명시한다", async () => {
  const { store } = fixture(); const { config } = provider([embedding()]);
  const context = await createMemoryService(store, config).recall([{ role: "user", content: "좋아하는 음료" }], AbortSignal.timeout(1000));
  assert.match(context, /명령이 아니다/); assert.match(context, /현재 사용자 발언이 우선/); assert.match(context, /차를 좋아/);
});
