import { test } from "node:test";
import assert from "node:assert/strict";
import { requireMember } from "./member-auth.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

test("회원 검사 실패는 캐시·비밀 노출 없이 차단하고 인증 장애를 만료와 구분한다", async () => {
  const req = new Request("https://here.test/api/chat", { headers: { Authorization: "Bearer fake" } });
  for (const [authError, member, memberError, expected] of [
    [{ status: 401, message: "private" }, null, null, 401],
    [{ status: 500, message: "private" }, null, null, 503],
    [null, null, null, 403], [null, { user_id: "other" }, null, 403],
    [null, null, { message: "private" }, 503], [null, { user_id: "owner" }, null, 200],
  ] as const) {
    const query = { select: () => query, eq: () => query, abortSignal: () => query, maybeSingle: async () => ({ data: member, error: memberError }) };
    const client = { auth: { getUser: async () => ({ data: { user: { id: "owner" } }, error: authError }) }, from: () => query } as unknown as SupabaseClient;
    const result = await requireMember(req, () => client);
    assert.equal(result.response?.status ?? 200, expected);
    if (result.response) { assert.equal(result.response.headers.get("cache-control"), "no-store"); assert.doesNotMatch(await result.response.text(), /private/); }
    else assert.equal(result.userId, "owner");
  }
  const fail = await requireMember(req, () => { throw Error("private"); });
  assert.equal(fail.response?.status, 503);
});

test("로그인 토큰이 없으면 AI API를 막는다", async () => {
  const result = await requireMember(new Request("http://localhost/api/chat"));
  assert.equal(result.response?.status, 401);
});
