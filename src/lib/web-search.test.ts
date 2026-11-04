import test from "node:test";
import assert from "node:assert/strict";
import { searchWeb } from "./web-search.ts";
import { parseSearchQuery, safeSearchSource, searchCitations } from "./web-search-protocol.ts";

const result = () => ({ status: "completed", output: [
  { type: "web_search_call", status: "completed" },
  { type: "message", role: "assistant", content: [{ type: "output_text", text: "공식 문서에서 확인했어.citeturn0search0", annotations: [
    { type: "url_citation", url: "https://supabase.com/docs?utm_source=openai", title: "공식 문서" },
    { type: "url_citation", url: "javascript:alert(1)", title: "bad" },
  ] }] },
] });

test("웹검색은 짧은 일반 검색어만 받고 흔한 직접 식별자는 전송 전 거절한다", async () => {
  for (const value of [null, [], { query: "" }, { query: "x".repeat(301) }, { query: "문의 test@example.com" }, { query: "010-1234-5678" }, { query: "940101-1234567" }, { query: "Bearer secret" }, { query: "https://example.com/private" }, { query: "docs", userId: "A" }]) assert.equal(parseSearchQuery(value), null);
  assert.equal(parseSearchQuery({ query: "  서울시 공공도서관 휴관일  " }), "서울시 공공도서관 휴관일");
  let calls = 0;
  await searchWeb("test@example.com", { apiKey: "fake", fetch: async () => { calls++; return Response.json(result()); } });
  assert.equal(calls, 0);
});

test("검색 전용 요청은 대화·기억 없이 검색어만 전달하고 실제 검색과 검증된 출처를 요구한다", async () => {
  const response = await searchWeb("Supabase 공식 문서", { apiKey: "fake", fetch: async (url, init) => {
    assert.equal(url, "https://api.runyour.ai/v1/responses");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.input, "Supabase 공식 문서");
    assert.equal(body.store, false); assert.equal(body.max_tool_calls, 1);
    assert.equal(body.tool_choice, "required"); assert.equal(body.tools[0].type, "web_search");
    assert.equal(body.model, "openai/gpt-5.6-sol");
    assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
    return Response.json(result());
  } });
  assert.equal(response.available, true);
  assert.equal(response.text, "공식 문서에서 확인했어.");
  assert.deepEqual(response.sources, [{ title: "공식 문서", url: "https://supabase.com/docs" }]);
  assert.match(searchCitations(response.sources), /\[공식 문서\]\(<https:\/\/supabase.com\/docs>\)/);
});

test("검색 실패·출처 없음·미완료·크기 초과·네트워크 오류는 확인된 사실처럼 반환하지 않는다", async () => {
  const noSearch = result(); noSearch.output.shift();
  const noSources = result(); noSources.output[1].content![0].annotations = [];
  const attempts = [Response.json({ error: "private_key_or_query" }, { status: 429 }), Response.json(noSearch), Response.json(noSources), Response.json({ ...result(), status: "incomplete" }), new Response("x".repeat(128 * 1024 + 1)), new Response("not-json")];
  for (const response of attempts) {
    const value = await searchWeb("공개 정보", { apiKey: "fake", fetch: async () => response });
    assert.equal(value.available, false); assert.equal(value.sources.length, 0);
    assert.doesNotMatch(JSON.stringify(value), /private_key_or_query/);
  }
  assert.equal((await searchWeb("공개 정보", { apiKey: "fake", fetch: async () => { throw Error("secret"); } })).available, false);
});

test("검색 취소는 유효 JSON 접두부를 성공으로 받지 않는다", async () => {
  const controller = new AbortController();
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(JSON.stringify(result()))); } });
  const pending = searchWeb("공개 정보", { apiKey: "fake", fetch: async () => new Response(stream) }, controller.signal);
  setTimeout(() => controller.abort(), 5);
  assert.equal((await pending).available, false);
});

test("출처는 안전한 HTTPS만 표시하며 중복·마크다운 삽입을 제한한다", () => {
  for (const url of ["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "https://127.0.0.1/a"]) assert.equal(safeSearchSource({ title: "x", url }), null);
  const source = { title: "[클릭](javascript:evil)", url: "https://example.com" };
  const text = searchCitations([source, source]);
  assert.equal((text.match(/https:\/\/example.com/g) || []).length, 1);
  assert.doesNotMatch(text, /\[클릭\]/);
  assert.equal(searchCitations([{ title: "공식", url: "https://example.com/docs" }], "[공식](https://example.com/docs)"), "");
});
