import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkEntry } from "./session-entry.ts";

const user = { id: "member-a", phone: "test-phone" };
const known = { data: { user }, error: null };
type Result = { data: { user_id: string } | null; error: unknown };
const row = { data: { user_id: user.id }, error: null };
function mock(auth = async (): Promise<unknown> => known, member = async (): Promise<Result> => row, refresh = async (): Promise<unknown> => ({ data: {}, error: null })) {
  const query = {
    select: () => query, eq: (key: string, id: string) => { assert.equal(key, "user_id"); assert.equal(id, user.id); return query; },
    abortSignal: () => query, maybeSingle: member,
  };
  return { auth: { getUser: auth, refreshSession: refresh }, from: (name: string) => { assert.equal(name, "members"); return query; } } as unknown as SupabaseClient;
}
test("기존 회원은 새 진입과 OTP 직후 모두 가입 없이 입장한다", async () => {
  assert.deepEqual(await checkEntry(mock()), { kind: "member", id: user.id });
  assert.deepEqual(await checkEntry(mock(async () => { throw Error("unexpected"); }), user), { kind: "member", id: user.id });
});
test("회원 조회 장애는 로그인/가입으로 가지 않고 같은 세션으로 복구된다", async () => {
  let n = 0;
  const c = mock(undefined, async () => n++ === 0 ? { data: null, error: { status: 503 } } : row);
  assert.deepEqual(await checkEntry(c), { kind: "retry" });
  assert.deepEqual(await checkEntry(c), { kind: "member", id: user.id });
  assert.deepEqual(await checkEntry(mock(undefined, async () => ({ data: null, error: {} })), user), { kind: "retry" });
});
test("인증이 없거나 무효화된 경우만 로그인, 서버/네트워크/시간초과는 재확인", async () => {
  for (const [error, kind] of [[{ name: "AuthSessionMissingError" }, "login"], [{ status: 401 }, "retry"], [{ code: "refresh_token_not_found" }, "login"], [{ status: 503 }, "retry"], [{ status: 429 }, "retry"]] as const) {
    assert.deepEqual(await checkEntry(mock(async () => ({ data: { user: null }, error }))), { kind });
  }
  assert.deepEqual(await checkEntry(mock(async () => { throw Error("offline"); })), { kind: "retry" });
  assert.deepEqual(await checkEntry(mock(() => new Promise(() => {})), undefined, 5), { kind: "retry" });
});
test("만료 경계의 401은 갱신 후 사용자와 회원을 재검증해 SMS 없이 입장", async () => {
  let calls = 0, refreshes = 0;
  const client = mock(async () => calls++ === 0 ? { data: { user: null }, error: { status: 401, code: "bad_jwt" } } : known,
    undefined, async () => { refreshes++; return { data: {}, error: null }; });
  assert.deepEqual(await checkEntry(client), { kind: "member", id: user.id });
  assert.equal(refreshes, 1);
  assert.equal(calls, 2);
});
test("갱신 서버 장애는 재인증을 요구하지 않고 복구 대기", async () => {
  const rejected = async () => ({ data: { user: null }, error: { status: 401 } });
  assert.deepEqual(await checkEntry(mock(rejected, undefined, async () => ({ error: { status: 503 } }))), { kind: "retry" });
  assert.deepEqual(await checkEntry(mock(rejected, undefined, async () => ({ error: { code: "refresh_token_not_found" } }))), { kind: "login" });
});
test("인증된 번호에 회원 행이 없으면 비밀번호 설정부터 가입을 이어간다", async () => {
  assert.deepEqual(await checkEntry(mock(undefined, async () => ({ data: null, error: null }))), { kind: "signup", phone: user.phone });
  assert.deepEqual(await checkEntry(mock(undefined, async () => ({ data: { user_id: "other" }, error: null }))), { kind: "retry" });
});
