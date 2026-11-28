import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorCode, isServerFailure, reportError, reportingFailures } from "./error-report.ts";
import { ContextUnavailableError } from "./conversation-context.ts";
import { VoiceProviderError } from "./openai.ts";
import { FieldCipherError } from "./field-cipher.ts";

function fakeClient(result: () => Promise<unknown> = async () => ({ data: null, error: null })) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = { rpc(name: string, args: Record<string, unknown>) { calls.push({ name, args }); return { abortSignal: result }; } } as unknown as SupabaseClient;
  return { client, calls };
}

test("errorCode는 에러 종류별로 원문 없이 분류 코드만 뽑는다", () => {
  // given / when / then
  assert.equal(errorCode(new FieldCipherError("decrypt_failed")), "decrypt_failed");
  assert.equal(errorCode({ code: "PGRST202", message: "Could not find the function ... with p_fingerprint" }), "PGRST202");
  assert.equal(errorCode({ status: 503 }), "http_503");
  assert.equal(errorCode(Object.assign(new Error("x"), { name: "TimeoutError" })), "timeout");
  assert.equal(errorCode(new Error("summary_save_failed")), "summary_save_failed");
});

test("errorCode는 사용자 글·이메일이 들어간 메시지를 코드로 쓰지 않는다", () => {
  // given / when / then
  assert.equal(errorCode(new Error("user wrote: 오늘 죽고 싶어")), "unknown");
  assert.equal(errorCode(new Error("invalid email a@b.com")), "unknown");
  assert.equal(errorCode({ code: "has space and 한글" }), "unknown");
  assert.equal(errorCode(null), "unknown");
});

test("reportError는 메시지·스택 없이 코드와 숫자 정보만 보낸다", async () => {
  // given
  const { client, calls } = fakeClient();
  const error = Object.assign(new Error("PRIVATE TEXT"), { status: 502 });
  // when
  await reportError(client, "chat.save", error, { attempt: 2, ok: false, secret: "x" as unknown as number, "bad key": 1 });
  // then
  assert.deepEqual(calls, [{ name: "report_app_error", args: { p_source: "chat.save", p_code: "http_502", p_detail: { attempt: 2, ok: false } } }]);
  assert.doesNotMatch(JSON.stringify(calls), /PRIVATE|at Object|secret/);
});

test("기록이 실패하거나 시간이 걸려도 reportError는 에러를 던지지 않는다", async () => {
  // given
  const throwing = fakeClient(async () => { throw new Error("db down"); });
  // when / then
  await reportError(throwing.client, "chat.save", new Error("x"));
  await reportError(undefined, "chat.save", new Error("x"));
});

test("감싼 에러는 진짜 원인 코드를 붙이고, AI 크레딧 소진은 따로 구분한다", () => {
  // given
  const embedding = Object.assign(new Error("memory_provider_failed"), { status: 429 });
  // when / then
  assert.equal(errorCode(new ContextUnavailableError(embedding)), "context_unavailable:http_429");
  assert.equal(errorCode(new ContextUnavailableError()), "context_unavailable");
  assert.equal(errorCode(new VoiceProviderError(429, "quota")), "provider_quota");
  assert.equal(errorCode(new ContextUnavailableError(new Error("user said 오늘 힘들어"))), "context_unavailable");
});

test("우리 쪽 문제(5xx·AI 한도 429)만 기록 대상으로 본다", () => {
  // given / when / then
  for (const status of [500, 502, 503, 504, 429]) assert.equal(isServerFailure(status), true, String(status));
  for (const status of [200, 400, 401, 403, 404, 409, 413, 499]) assert.equal(isServerFailure(status), false, String(status));
});

test("reportingFailures는 실패를 알리고 같은 에러를 그대로 다시 던지며, 성공하면 아무것도 알리지 않는다", async () => {
  // given
  const seen: unknown[] = [];
  const failure = new Error("boom");
  const failing = reportingFailures(async () => { throw failure; }, e => seen.push(e));
  const passing = reportingFailures(async (x: number) => x + 1, e => seen.push(e));
  // when / then
  await assert.rejects(failing(), e => e === failure);
  assert.equal(await passing(1), 2);
  assert.deepEqual(seen, [failure]);
});
