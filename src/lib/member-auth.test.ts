import { test } from "node:test";
import assert from "node:assert/strict";
import { requireMember } from "./member-auth.ts";

test("로그인 토큰이 없으면 AI API를 막는다", async () => {
  const result = await requireMember(new Request("http://localhost/api/chat"));
  assert.equal(result.response?.status, 401);
});
