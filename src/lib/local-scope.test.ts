import test from "node:test";
import assert from "node:assert/strict";
import { clearAccountStorage } from "./local-scope.ts";

function store(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return { map, get length() { return map.size; }, key: (i: number) => [...map.keys()][i] ?? null, removeItem: (k: string) => { map.delete(k); } };
}

test("탈퇴하면 그 계정 ID가 든 기기 기록만 지우고 기기 설정과 다른 계정은 남긴다", () => {
  const me = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", other = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const local = store({ [`here.log.v1.${me}`]: "[]", [`here.report.v1.${me}`]: "{}", [`here:consent:${me}`]: "1", [`here.log.v1.${other}`]: "[]", "here:sfx": "off" });
  const session = store({ [`here.onboarding-draft.${me}`]: "{}", "here:consent-reload": "v" });
  clearAccountStorage(me, [local, session, undefined]);
  assert.deepEqual([...local.map.keys()], [`here.log.v1.${other}`, "here:sfx"]);
  assert.deepEqual([...session.map.keys()], ["here:consent-reload"]);
  clearAccountStorage("", [local]);
  assert.equal(local.map.size, 2, "빈 ID로 모든 키를 지우지 않는다");
});
