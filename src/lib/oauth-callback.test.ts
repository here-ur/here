import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOAuthCompletion } from "./oauth-callback.ts";

const client = (exchange: (...args: unknown[]) => unknown) => ({ auth: { exchangeCodeForSession: exchange } }) as unknown as SupabaseClient;
test("인증 code와 flow ID를 교환하고 반복 마운트에서도 한 번만 요청한다", async () => {
  let calls = 0;
  const complete = createOAuthCompletion(client(async (...args) => {
    calls++; assert.deepEqual(args, ["test-code", { flowId: "test-flow" }]);
    return { data: { session: { user: { id: "test-member" } } }, error: null };
  }));
  const url = "http://localhost:3000/auth/callback?code=test-code&flow_id=test-flow";
  assert.deepEqual(await Promise.all([complete(url), complete(url)]), ["success", "success"]);
  assert.equal(calls, 1);
});
test("취소·오류·누락·중복 code·implicit token은 세션으로 교환하지 않는다", async () => {
  const complete = createOAuthCompletion(client(() => { throw new Error("must not call"); }));
  assert.equal(await complete("https://here.example/auth/callback?error=access_denied"), "cancelled");
  for (const suffix of ["", "?error=server_error&code=example", "?code=a&code=b", "#access_token=example"]) {
    assert.equal(await complete("https://here.example/auth/callback" + suffix), "failed");
  }
});
test("만료된 code·연결 실패·세션 없는 응답은 성공으로 처리하지 않는다", async () => {
  for (const exchange of [
    async () => ({ data: { session: null }, error: { code: "flow_state_expired" } }),
    async () => ({ data: { session: null }, error: null }),
    async () => { throw new Error("offline"); },
    () => new Promise(() => {}),
  ]) assert.equal(await createOAuthCompletion(client(exchange), 5)("https://here.example/auth/callback?code=test"), "failed");
});
