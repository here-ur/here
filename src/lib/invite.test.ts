import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeInviteCode, normalizePhone } from "./invite.ts";

test("초대코드는 공백과 구분자를 제거하고 16자리 16진수만 받는다", () => {
  assert.equal(normalizeInviteCode("a1b2-c3d4 e5f6-0718"), "A1B2C3D4E5F60718");
  assert.equal(normalizeInviteCode("guess"), null);
});

test("국내 휴대폰 번호를 국제 형식으로 바꾼다", () => {
  assert.equal(normalizePhone("010-1234-5678"), "+821012345678");
  assert.equal(normalizePhone("+82 10 1234 5678"), "+821012345678");
  assert.equal(normalizePhone("123"), null);
});
