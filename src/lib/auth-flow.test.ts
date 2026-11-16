import test from "node:test";
import assert from "node:assert/strict";
import { clearPasswordReset, isPasswordResetPending, markPasswordReset, shouldRecheckAuth, smsError } from "./session-entry.ts";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}

test("이메일 인증 뒤 비밀번호 재설정 표시는 그 계정에만 남고, 저장·로그아웃 때 지운다", () => {
  const store = storage();
  assert.equal(isPasswordResetPending(store, "A"), false);
  markPasswordReset(store, "A");
  assert.equal(isPasswordResetPending(store, "A"), true);
  assert.equal(isPasswordResetPending(store, "B"), false);
  assert.equal(isPasswordResetPending(store, ""), false);
  clearPasswordReset(store);
  assert.equal(isPasswordResetPending(store, "A"), false);
  const broken = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } };
  assert.doesNotThrow(() => markPasswordReset(broken, "A"));
  assert.doesNotThrow(() => clearPasswordReset(broken));
  assert.equal(isPasswordResetPending(broken, "A"), false);
  assert.equal(isPasswordResetPending(undefined, "A"), false);
});

test("인증번호 오류: 연결 문제와 틀린 번호, 보내기 제한을 구분한다", () => {
  const offline = { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" };
  assert.match(smsError(offline, "verify").message, /연결을 확인/);
  assert.equal(smsError(offline, "verify").field, undefined);
  assert.match(smsError(offline, "send").message, /연결을 확인/);
  const wrong = smsError({ name: "AuthApiError", status: 403, code: "otp_expired", message: "Token has expired or is invalid" }, "verify");
  assert.equal(wrong.field, "code");
  assert.match(wrong.message, /다시 확인하거나 새로 받아/);
  const limited = smsError({ status: 429, code: "over_sms_send_rate_limit", message: "For security purposes, you can only request this after 42 seconds." }, "send");
  assert.equal(limited.waitSeconds, 42);
  assert.match(limited.message, /42초 후/);
  assert.equal(smsError({ status: 429, code: "over_sms_send_rate_limit", message: "" }, "send").waitSeconds, undefined);
  assert.equal(smsError({ status: 422, code: "sms_send_failed" }, "send").field, "phone");
  assert.equal(smsError({ status: 502 }, "verify").field, undefined);
});

test("다른 탭에서 다른 계정으로 로그인하면 이 탭도 회원 확인을 다시 한다", () => {
  const view = { userId: null, pendingUserId: null, idle: false, busy: false };
  // 들어와 있는 탭: 세션 계정이 바뀌었을 때만
  assert.equal(shouldRecheckAuth("SIGNED_IN", "B", { ...view, userId: "A" }), true);
  assert.equal(shouldRecheckAuth("TOKEN_REFRESHED", "B", { ...view, userId: "A" }), true);
  assert.equal(shouldRecheckAuth("INITIAL_SESSION", "B", { ...view, userId: "A" }), true);
  assert.equal(shouldRecheckAuth("SIGNED_IN", "A", { ...view, userId: "A" }), false);
  assert.equal(shouldRecheckAuth("USER_UPDATED", "A", { ...view, userId: "A" }), false);
  // 환영 화면·로그인 입력: 다른 탭의 로그인을 따라간다(이 탭에서 보내는 중이면 제외)
  assert.equal(shouldRecheckAuth("SIGNED_IN", "A", { ...view, idle: true }), true);
  assert.equal(shouldRecheckAuth("SIGNED_IN", "A", { ...view, idle: true, busy: true }), false);
  assert.equal(shouldRecheckAuth("INITIAL_SESSION", "A", { ...view, idle: true }), false);
  assert.equal(shouldRecheckAuth("USER_UPDATED", "A", { ...view, idle: true }), false);
  // 번호·인증번호 입력 중에는 따라가지 않는다
  assert.equal(shouldRecheckAuth("SIGNED_IN", "A", view), false);
  // 비밀번호를 정하는 중: 같은 계정의 알림(앱 전환·저장)은 무시하고, 다른 계정이면 다시 확인한다
  assert.equal(shouldRecheckAuth("SIGNED_IN", "A", { ...view, pendingUserId: "A" }), false);
  assert.equal(shouldRecheckAuth("USER_UPDATED", "A", { ...view, pendingUserId: "A" }), false);
  assert.equal(shouldRecheckAuth("SIGNED_IN", "B", { ...view, pendingUserId: "A" }), true);
  assert.equal(shouldRecheckAuth("SIGNED_OUT", null, { ...view, userId: "A" }), false);
});
