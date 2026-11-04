import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkEntry } from "./session-entry.ts";

const user = { id: "member-a", phone: "test-phone" };
const known = { data: { user }, error: null };
type Result = { data: { user_id: string } | null; error: unknown };
const row = { data: { user_id: user.id }, error: null };
function mock(auth = async (): Promise<unknown> => known, member = async (): Promise<Result> => row) {
  const query = {
    select: () => query, eq: (key: string, id: string) => { assert.equal(key, "user_id"); assert.equal(id, user.id); return query; },
    abortSignal: () => query, maybeSingle: member,
  };
  return { auth: { getUser: auth }, from: (name: string) => { assert.equal(name, "members"); return query; } } as unknown as SupabaseClient;
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
  for (const [error, kind] of [[{ name: "AuthSessionMissingError" }, "login"], [{ status: 401 }, "login"], [{ code: "refresh_token_not_found" }, "login"], [{ status: 503 }, "retry"], [{ status: 429 }, "retry"]] as const) {
    assert.deepEqual(await checkEntry(mock(async () => ({ data: { user: null }, error }))), { kind });
  }
  assert.deepEqual(await checkEntry(mock(async () => { throw Error("offline"); })), { kind: "retry" });
  assert.deepEqual(await checkEntry(mock(() => new Promise(() => {})), undefined, 5), { kind: "retry" });
});
test("인증된 번호에 회원 행이 없다고 확인된 경우만 초대 단계로 간다", async () => {
  assert.deepEqual(await checkEntry(mock(undefined, async () => ({ data: null, error: null }))), { kind: "invite", phone: user.phone });
  assert.deepEqual(await checkEntry(mock(undefined, async () => ({ data: { user_id: "other" }, error: null }))), { kind: "retry" });
});
