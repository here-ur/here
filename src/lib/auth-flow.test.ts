import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearPasswordReset, isPasswordResetPending, markPasswordReset, shouldRecheckAuth, smsError } from "./session-entry.ts";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("문자 인증 뒤 비밀번호 재설정 표시는 그 계정에만 남고, 저장·로그아웃 때 지운다", () => {
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

test("AuthGate는 재설정 표시가 있는 회원을 앱 대신 비밀번호 설정으로 돌려보낸다", () => {
  const gate = source("../app/AuthGate.tsx");
  const enter = gate.slice(gate.indexOf("const enter = useCallback"), gate.indexOf("}, []);"));
  assert.match(enter, /isPasswordResetPending\(resetStorage\(\), result\.id\)/);
  assert.match(enter, /if \(resetting\) \{[\s\S]*setStep\("new-password"\)/);
  const verify = gate.slice(gate.indexOf("async function verifyOtp"), gate.indexOf("function goBack"));
  assert.match(verify, /markPasswordReset\(resetStorage\(\), data\.user\.id\)[\s\S]*afterSms\(/);
  const finish = gate.slice(gate.indexOf("async function finishPasswordSetup"), gate.indexOf("async function finishInSheet"));
  assert.match(finish, /clearPasswordReset\(resetStorage\(\)\)/);
  const signOut = gate.slice(gate.indexOf("const signOut = useCallback"), gate.indexOf("function fail"));
  assert.match(signOut, /clearPasswordReset\(resetStorage\(\)\)/);
  // 회원가입으로 들어온 기존 회원은 재설정 문구(모드 login)로 바꾸고 이미 가입된 번호라고 알린다.
  const afterSms = gate.slice(gate.indexOf("function afterSms"), gate.indexOf("function requestCode"));
  assert.match(afterSms, /setMemberNotice\(mode === "signup"\)[\s\S]*setMode\("login"\)/);
});

test("비밀번호 설정은 가입·재설정 모두 건너뛸 수 없다", () => {
  const setup = source("../app/PasswordSetup.tsx");
  const gate = source("../app/AuthGate.tsx");
  assert.ok(!setup.includes("onSkip"));
  assert.ok(!/나중에\s*(할게요|설정하기)/.test(setup));
  const usage = gate.match(/<PasswordSetup[\s\S]*?\/>/)?.[0] ?? "";
  assert.ok(usage, "AuthGate가 PasswordSetup을 쓴다");
  assert.ok(!usage.includes("onSkip"));
  assert.match(gate, /dismissible=\{step !== "new-password"\}/);
});

test("로그인·비밀번호 폼은 브라우저 말풍선 대신 한국어 오류 줄을 쓴다", () => {
  const setup = source("../app/PasswordSetup.tsx");
  const gate = source("../app/AuthGate.tsx");
  assert.equal(setup.match(/<form noValidate/g)?.length, 2);
  assert.match(gate, /<form noValidate/);
  assert.match(gate, /if \(!password\) \{ fail\("비밀번호를 입력해 주세요\.", "password"\)/);
  // 보내는 동안 입력칸은 잠그기만 하고(readOnly) 포커스를 잃지 않는다.
  assert.ok(!/disabled=\{busy\} inputClassName/.test(gate));
  assert.ok(!/required disabled=\{busy\}/.test(setup));
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

test("인증번호 단계에는 다시 받기와 기다리는 시간이 있고, 시트 오류 줄은 왼쪽 정렬이다", () => {
  const gate = source("../app/AuthGate.tsx");
  const css = source("../app/auth-screen.css");
  assert.match(gate, /인증번호 다시 받기/);
  assert.match(gate, /\{resendWait\}초 후 다시 받을 수 있어요/);
  assert.match(css, /\.here-sheet\.auth-sheet \.fr-error, \.here-sheet\.auth-sheet \.here-field__message \{ text-align: left; \}/);
  // 단계 설명·오류는 포커스를 받는 입력칸에 이어서 읽힌다.
  assert.match(gate, /aria-describedby=\{describedBy\} aria-invalid=\{invalid\("code"\)\}/);
});
