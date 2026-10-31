import test from "node:test";
import assert from "node:assert/strict";
import { readSmallJson, JsonRequestError } from "./request-json.ts";

function request(body: BodyInit, headers = { "Content-Type": "application/json" }, signal?: AbortSignal) {
  return new Request("http://localhost/api/memory-consent", { method: "POST", body, headers, signal, duplex: "half" } as RequestInit);
}
const status = (expected: number) => (error: unknown) => error instanceof JsonRequestError && error.status === expected;

test("작은 JSON만 허용하고 형식·바이트 제한을 검증한다", async () => {
  assert.deepEqual(await readSmallJson(request('{"privacy":true}')), { privacy: true });
  await assert.rejects(readSmallJson(request("{}", { "Content-Type": "text/plain" })), status(415));
  await assert.rejects(readSmallJson(request("{")), status(400));
  await assert.rejects(readSmallJson(request(JSON.stringify({ text: "가".repeat(400) }))), status(413));
});

test("유효한 JSON을 먼저 보내도 본문을 끝내지 않으면 동의를 처리하지 않는다", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"privacy":true}')); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readSmallJson(request(stream), 10), status(408));
  assert.equal(cancelled, true);
});

test("요청 취소 시 본문 읽기를 중단한다", async () => {
  const controller = new AbortController();
  const pending = readSmallJson(request(new ReadableStream(), undefined, controller.signal));
  controller.abort();
  await assert.rejects(pending, status(408));
});
