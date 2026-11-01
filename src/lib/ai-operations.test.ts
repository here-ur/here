import test from "node:test";
import assert from "node:assert/strict";
import { memoryRetryFetch, operationMetric } from "./ai-operations.ts";
import { readFileSync } from "node:fs";

test("관측 로그는 허용된 수치만 남기고 원문·키·ID·오류를 제외한다", () => {
  const output: string[] = [];
  operationMetric({ operation: "chat", outcome: "ok", durationMs: 12, inputTokens: 3, outputTokens: NaN,
    ...{ secret: "sk-secret", summary: "private", userId: "private" } }, line => output.push(line));
  assert.deepEqual(JSON.parse(output[0]), { event: "here_ai_operation", operation: "chat", outcome: "ok", durationMs: 12, inputTokens: 3 });
  assert.doesNotThrow(() => operationMetric({ operation: "chat", outcome: "ok" }, () => { throw new Error(); }));
  const source = readFileSync(new URL("./openai.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /await res.text\(|console.error\(/);
});
test("명시적 일시 HTTP 실패만 최대 3회 재시도하고 응답을 정리한다", async () => {
  let count = 0, cancelled = 0;
  const waits: number[] = [];
  const fake: typeof fetch = async () => {
    count++;
    return count < 3 ? new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 503 }) : Response.json({ ok: true });
  };
  const response = await memoryRetryFetch(fake, async ms => { waits.push(ms); })("https://example.test/responses");
  assert.equal(response.status, 200); assert.equal(count, 3); assert.equal(cancelled, 2);
  assert.deepEqual(waits, [250,500]);
});
test("인증 실패·긴 cooldown·네트워크 오류·취소는 반복 호출하지 않는다", async () => {
  for (const response of [new Response(null, { status: 401 }), new Response(null, { status: 429, headers: { "Retry-After": "60" } })]) {
    let calls = 0;
    const retry = memoryRetryFetch(async () => { calls++; return response; }, async () => { assert.fail(); });
    assert.equal(await retry("https://example.test"), response); assert.equal(calls, 1);
  }
  let calls = 0;
  const retry = memoryRetryFetch(async () => { calls++; throw new Error("network"); });
  await assert.rejects(retry("https://example.test")); assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(retry("https://example.test", { signal: controller.signal })); assert.equal(calls, 1);
});
test("짧은 Retry-After를 존중하고 마지막 실패는 호출자에게 반환한다", async () => {
  let calls = 0;
  const waits: number[] = [];
  const retry = memoryRetryFetch(async () => { calls++; return new Response(null, { status: 429, headers: { "Retry-After": "2" } }); }, async ms => { waits.push(ms); });
  assert.equal((await retry("https://example.test")).status, 429);
  assert.equal(calls, 3); assert.deepEqual(waits, [2000,2000]);
});
