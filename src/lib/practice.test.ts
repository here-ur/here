import test from "node:test";
import assert from "node:assert/strict";
import { setLocalOwner } from "./local-scope.ts";
import type { DayStat } from "./report.ts";
import { DAILY_COUNT, PRACTICES, dailyPractices, loadPractice, markClosed, markDone, markLater, nextPractice, practiceTotal, weekChecks } from "./practice.ts";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;
setLocalOwner("member-a");

const day = (date: string, said = 3): DayStat => ({ date, said, replies: said, hours: Array(24).fill(0), words: {}, crisis: false });
const NOW = new Date(2026, 10, 4, 21).getTime(); // 2026-11-04 수요일

test("그날 실천은 날짜로만 돌리고, 날마다 다른 것을 보여 준다", () => {
  const a = dailyPractices("2026-11-04");
  const b = dailyPractices("2026-11-05");
  assert.equal(a.length, DAILY_COUNT);
  assert.deepEqual(dailyPractices("2026-11-04"), a);
  assert.notDeepEqual(a.map((p) => p.id), b.map((p) => p.id));
  assert.ok(a.every((p) => PRACTICES.includes(p)));
});

test("한 것·닫은 것은 빼고 나중에는 뒤로 보내며, 다 하면 비어 있다", () => {
  const [first, second, third] = dailyPractices("2026-11-04");
  let log = loadPractice();
  assert.equal(nextPractice(log, NOW)?.id, first.id);
  log = markLater(log, first.id, NOW);
  assert.equal(nextPractice(log, NOW)?.id, second.id);
  log = markClosed(log, second.id, NOW);
  assert.equal(nextPractice(log, NOW)?.id, third.id);
  log = markDone(log, third.id, NOW);
  assert.equal(nextPractice(log, NOW)?.id, first.id); // 미룬 것이 마지막에 다시 온다
  log = markDone(log, first.id, NOW);
  assert.equal(nextPractice(log, NOW), null);
  assert.equal(practiceTotal(log), 2);
  assert.equal(practiceTotal(markDone(log, first.id, NOW)), 2); // 같은 날 같은 실천은 한 번만
  assert.deepEqual(loadPractice().done, log.done);
});

test("이번 주 체크는 월~일이고, 쉰 날은 그냥 빈칸이다", () => {
  const log = markDone({ done: {}, later: {}, closed: {} }, "water", new Date(2026, 10, 2, 9).getTime());
  const checks = weekChecks([day("2026-11-02"), day("2026-11-04"), day("2026-10-31")], log, NOW);
  assert.deepEqual(checks.map((c) => c.date), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  assert.deepEqual(checks.map((c) => [c.talked, c.practiced]), [[true, true], [false, false], [true, false], [false, false], [false, false], [false, false], [false, false]]);
  assert.equal(checks.find((c) => c.today)?.date, "2026-11-04");
  assert.deepEqual(checks.filter((c) => c.future).map((c) => c.date), ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
});
