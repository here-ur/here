import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { consentDisplayKey, hasConsentDisplayHint, setConsentDisplayHint } from "./consent-display-cache.ts";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
test("동의 확인 힌트는 사용자별이며 저장·재방문·철회를 반영한다", () => {
  const store = storage();
  assert.equal(hasConsentDisplayHint(store, "A"), false);
  setConsentDisplayHint(store, "A", true);
  assert.equal(hasConsentDisplayHint(store, "A"), true);
  assert.equal(hasConsentDisplayHint(store, "B"), false);
  setConsentDisplayHint(store, "A", false);
  assert.equal(hasConsentDisplayHint(store, "A"), false);
});
test("다른 동의 버전·빈 사용자·저장소 오류는 확인된 상태로 취급하지 않는다", () => {
  const store = storage();
  store.setItem(consentDisplayKey("A"), "old-version");
  assert.equal(hasConsentDisplayHint(store, "A"), false);
  setConsentDisplayHint(store, "", true);
  assert.equal(hasConsentDisplayHint(store, ""), false);
  assert.equal(hasConsentDisplayHint(undefined, "A"), false);
  const broken = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => { throw Error(); } };
  assert.equal(hasConsentDisplayHint(broken, "A"), false);
  assert.doesNotThrow(() => setConsentDisplayHint(broken, "A", true));
  assert.doesNotThrow(() => setConsentDisplayHint(broken, "A", false));
});
test("재방문은 홈부터 표시하고 서버 재검증·오류·철회 경로를 유지한다", () => {
  const gate = readFileSync(new URL("../app/MemoryConsentGate.tsx", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../app/AuthGate.tsx", import.meta.url), "utf8");
  assert.match(auth, /key=\{userId\} userId=\{userId\}/);
  assert.match(gate, /hasConsentDisplayHint\(consentDisplayStorage\(\), userId\) \? "ready" : "checking"/);
  assert.match(gate, /setConsentDisplayHint\(consentDisplayStorage\(\), userId, !body.required\)/);
  assert.match(gate, /setConsentDisplayHint\(consentDisplayStorage\(\), userId, true\)/);
  assert.match(gate, /current === "ready" \? current : "error"/);
  assert.match(gate, /Promise.race/);
  assert.match(gate, /request !== generation.current/);
  assert.ok(!gate.includes("이용 동의를 확인하고 있어요"));
  const access = readFileSync(new URL("./memory-access.ts", import.meta.url), "utf8");
  assert.match(access, /memory_is_enabled/);
  assert.match(access, /consent_required/);
});
