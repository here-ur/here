import test from "node:test";
import assert from "node:assert/strict";
import { passwordSetupError } from "./password-policy.ts";

test("비밀번호는 7자를 거절하고 8자부터 허용한다", () => {
  assert.equal(passwordSetupError("pass123", "pass123"), "비밀번호를 8자 이상 입력해 주세요.");
  assert.equal(passwordSetupError("pass1234", "pass1234"), null);
  assert.equal(passwordSetupError("pass1234", "pass1235"), "두 비밀번호가 일치하지 않아요.");
  assert.equal(passwordSetupError("🔑".repeat(4), "🔑".repeat(4)), "비밀번호를 8자 이상 입력해 주세요.");
});
