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
    [null, { user_id: "owner", withdrawn_at: "2026-11-23T00:00:00Z" }, null, 403], [null, { user_id: "owner", withdrawn_at: null }, null, 200],
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

test("요청 본문이 아니라 인증 서버에서 확인한 본인 계정의 온보딩 응답을 반환한다", async () => {
  const answers = { lately: "조금 지쳤어요", concern: "나 자신", want: "아직 모르겠어요", support: "있어요" };
  const query = { select: () => query, eq: (_key: string, id: string) => { assert.equal(id, "owner"); return query; }, abortSignal: () => query, maybeSingle: async () => ({ data: { user_id: "owner" }, error: null }) };
  const client = { auth: { getUser: async () => ({ data: { user: { id: "owner", user_metadata: { here_profile_v1: { version: 1, profile: { onboardingAnswers: answers } } } } }, error: null }) }, from: () => query } as unknown as SupabaseClient;
  const result = await requireMember(new Request("https://here.test/api/chat", { method: "POST", headers: { Authorization: "Bearer fake" }, body: JSON.stringify({ userId: "other", onboardingAnswers: { lately: "그럭저럭 괜찮아요" } }) }), () => client);
  assert.equal(result.response, undefined);
  if (!result.response) assert.deepEqual(result.onboardingAnswers, answers);
});
