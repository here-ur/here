import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("동의 화면은 바텀시트 본문 스크롤을 써서 긴 내용이 프레임 clip에 잘리지 않는다", () => {
  const component = readFileSync(new URL("../app/MemoryConsentGate.tsx", import.meta.url), "utf8");
  const sheet = readFileSync(new URL("../app/Sheet.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/auth-screen.css", import.meta.url), "utf8");
  // 동의 내용은 공통 Sheet 안에 있고, Sheet 본문은 세로로 스크롤된다.
  assert.match(component, /<Sheet[\s\S]{0,200}?className="auth-sheet consent-sheet"/);
  assert.match(sheet, /min-h-0 overflow-x-hidden overflow-y-auto/);
  // 시트 높이는 화면 안에 고정되고, 버튼 묶음은 스크롤 중에도 아래에 붙으며, 홈 바 여백을 남긴다.
  assert.match(css, /\.here-sheet\.auth-sheet\s*\{[^}]*height:/);
  assert.match(css, /\.auth-sheet-actions\s*\{[^}]*position:\s*sticky/);
  assert.match(css, /\.auth-sheet-step\s*\{[^}]*safe-area-inset-bottom/);
});

test("동의 본문은 기본 접힘이며 체크박스는 접힘 영역 바깥에 둔다", () => {
  const component = readFileSync(new URL("../app/MemoryConsentGate.tsx", import.meta.url), "utf8");
  const disclosures = [...component.matchAll(/<details>([\s\S]*?)<\/details>/g)];
  assert.equal(disclosures.length, 2);
  for (const [, content] of disclosures) {
    assert.match(content, /<summary /);
    assert.ok(!content.includes('type="checkbox"'));
  }
  assert.ok(!/<details\s+open/.test(component));
  assert.match(component, /disabled=\{!privacy \|\| !sensitive \|\| busy\}/);
});

test("로그인 시트에서 이어 가기: 이미 동의한 기기면 바로 넘어가고, 다시 확인할 때 이미 홈이면 전환을 반복하지 않는다", () => {
  const gate = readFileSync(new URL("../app/AuthGate.tsx", import.meta.url), "utf8");
  const consent = readFileSync(new URL("../app/MemoryConsentGate.tsx", import.meta.url), "utf8");
  // 이 기기에 동의 기록이 있으면 시트를 이어 가지 않고 전환으로 바로 넘어간다.
  const finish = gate.slice(gate.indexOf("function finishInSheet"), gate.indexOf("function openForm"));
  assert.match(finish, /hasConsentDisplayHint[\s\S]*movePage\("enter"[\s\S]*setContinueSheet\(true\)/);
  // 회원이 아닌 결과(로그아웃·재시도·가입 계속)면 이어 가기를 지운다.
  assert.match(gate, /if \(result\.kind !== "member"\) setContinueSheet\(false\)/);
  // 창에 다시 들어올 때마다 확인하지만, 이미 준비된 상태면 전환하지 않는다.
  assert.match(consent, /continueSheet && statusRef\.current !== "ready"\) void movePage\("enter"/);
  // 시트가 한 번 보였으면 다시 확인하는 동안 사진 화면으로 바꾸지 않는다.
  assert.match(consent, /status === "checking" && !sheetShown\) return <AuthScreen loading \/>/);
  // 확인 중 표시는 화면 낭독기에도 글자로 읽힌다.
  assert.match(consent, /role="status"><span aria-hidden="true" \/><span className="sr-only">/);
});
