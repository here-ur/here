import test from "node:test";
import assert from "node:assert/strict";
import { formatWithdrawalDeadline, withdrawalDeadline, WITHDRAWAL_GRACE_DAYS, WITHDRAW_DONE_MESSAGE } from "./member-withdrawal.ts";

test("탈퇴 취소 마감은 탈퇴 시각 + 7일이고, 한국 시간 오전·오후로 보여 준다", () => {
  assert.equal(WITHDRAWAL_GRACE_DAYS, 7);
  assert.equal(withdrawalDeadline("2026-11-26T06:30:00Z")?.toISOString(), "2026-12-03T06:30:00.000Z");
  assert.equal(withdrawalDeadline(null), null);
  assert.equal(withdrawalDeadline("not a date"), null);
  assert.equal(formatWithdrawalDeadline(new Date("2026-12-03T06:30:00Z")), "12월 3일 오후 3시");
  assert.equal(formatWithdrawalDeadline(new Date("2026-12-03T15:00:00Z")), "12월 4일 오전 12시");
  assert.equal(formatWithdrawalDeadline(new Date("2026-12-31T03:00:00Z")), "12월 31일 오후 12시");
  assert.match(WITHDRAW_DONE_MESSAGE, /7일 안에 다시 로그인하면 취소/);
});
