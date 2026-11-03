import assert from "node:assert/strict";
import test from "node:test";
import { setLocalOwner } from "./local-scope.ts";
import type { Session } from "./log.ts";
import {
  type DayStat,
  ReportSkyError,
  applySkyResults,
  clearReport,
  countWords,
  dayMessages,
  effectiveSky,
  loadReport,
  localDate,
  mergeDays,
  monthView,
  pendingSkyDays,
  reportMonths,
  requestReportSky,
  saveReport,
  setMySky,
  stripParticle,
  summarizeDays,
  syncReport,
} from "./report.ts";

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;
setLocalOwner("member-a");

// 로컬 시간대 기준으로 만든 시각이라 UTC 환경에서도 같은 날짜로 묶인다.
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const day = (date: string, patch: Partial<DayStat> = {}): DayStat => ({ date, said: 2, replies: 2, hours: Array(24).fill(0), words: {}, crisis: false, ...patch });

test("로컬 날짜는 한국 새벽도 그날로 센다", () => {
  assert.equal(localDate(at(11, 1, 0, 30)), "2026-11-01");
  assert.equal(localDate(at(10, 31, 23, 59)), "2026-10-31");
});

test("날짜별로 내가 한 말·답·시간대를 묶고, 자정을 넘긴 말은 다음 날로 센다", () => {
  const sessions: Session[] = [{
    id: "a", startedAt: at(10, 28, 23, 50), messages: [
      { role: "user", content: "회의가 길었어", at: at(10, 28, 23, 50) },
      { role: "assistant", content: "그랬구나", at: at(10, 28, 23, 51) },
      { role: "user", content: "회의 생각이 계속 나", at: at(10, 29, 0, 10) },
      { role: "assistant", content: "그 생각이 계속 나는구나", at: at(10, 29, 0, 20) },
    ],
  }];
  const days = summarizeDays(sessions);
  assert.deepEqual(days.map((d) => [d.date, d.said, d.replies]), [["2026-10-28", 1, 1], ["2026-10-29", 1, 1]]);
  assert.equal(days[0].hours[23], 1);
  assert.equal(days[1].hours[0], 1);
});

test("예전 기록처럼 시각이 없으면 세션 시작 시각으로 대신하고, 내가 말하지 않은 날은 만들지 않는다", () => {
  const days = summarizeDays([
    { id: "old", startedAt: at(10, 5, 21), messages: [{ role: "user", content: "산책했어" }, { role: "assistant", content: "좋다" }] },
    { id: "greet", startedAt: at(10, 6, 9), messages: [{ role: "assistant", content: "안녕!" }] },
  ]);
  assert.deepEqual(days.map((d) => d.date), ["2026-10-05"]);
  assert.equal(days[0].hours[21], 1);
});

test("위기 표현(내 말의 키워드나 AI의 109 안내)이 있던 날은 표시하고 자주 한 말을 세지 않는다", () => {
  const days = summarizeDays([
    { id: "a", startedAt: at(10, 16), messages: [{ role: "user", content: "회의 회의 다 끝났으면 좋겠어" }, { role: "assistant", content: "지금 안전한지 묻고 싶어. 자살예방상담전화 109에 전화할 수 있어." }] },
    { id: "b", startedAt: at(10, 17), messages: [{ role: "user", content: "요즘 죽고 싶어" }] },
    { id: "c", startedAt: at(10, 18), messages: [{ role: "user", content: "회의 회의 회의" }] },
  ]);
  assert.deepEqual(days.map((d) => [d.date, d.crisis, Object.keys(d.words).length > 0]), [["2026-10-16", true, false], ["2026-10-17", true, false], ["2026-10-18", false, true]]);
});

test("자주 한 말은 한글 이름씨만 세고 조사·서술어·흔한 말·민감어·숫자는 뺀다", () => {
  const words = countWords([
    "오늘 회의에서 내 기획안이 또 밀렸어. 팀장님이 다음 주에 따로 얘기하자는데 벌써 신경 쓰여.",
    "기획안을 고쳐야 할지 모르겠어. 주말에 산책했어. 고양이가 귀여웠고 바나나를 먹었어.",
    "친구하고 영어 공부하는 중이야. 우울하고 불안했어. 공황 같아. 010-1234-5678 abc 2026",
    "몽글이가 회의 전에 정리하면 좋대. 약을 먹어야 하나 병원 진단",
  ], ["몽글이"]);
  for (const kept of ["회의", "기획안", "팀장님", "주말", "산책", "고양이", "바나나", "친구", "영어", "공부"]) assert.ok(kept in words, kept);
  for (const dropped of ["회의에서", "기획안이", "밀렸어", "쓰여", "할지", "모르겠어", "산책했어", "귀여웠고", "먹었어", "오늘", "따로", "벌써", "우울", "불안", "공황", "몽글이", "병원", "진단", "010", "abc"]) assert.ok(!(dropped in words), dropped);
  assert.equal(words["회의"], 2);
  assert.equal(words["기획안"], 2);
});

test("한 글자 조사는 받침이 맞을 때만 떼고, 원래 단어처럼 끝나는 말은 그대로 둔다", () => {
  assert.equal(stripParticle("기획안이"), "기획안");
  assert.equal(stripParticle("친구가"), "친구");
  assert.equal(stripParticle("회의"), "회의");
  assert.equal(stripParticle("고양이"), "고양이");
  assert.equal(stripParticle("바나나"), "바나나");
  assert.equal(stripParticle("가을"), "가을");
  assert.equal(stripParticle("잠을"), "");
  assert.equal(stripParticle("주에"), "");
  assert.equal(stripParticle("회의에서"), "회의");
});

test("새로 센 날은 메시지가 같거나 많을 때만 덮고, 하늘·고친 하늘·위기 표시는 지킨다", () => {
  const now = at(11, 1);
  const stored = [day("2026-10-28", { said: 6, replies: 6, ai: "cloudy", mine: "rain", tried: 1 }), day("2026-10-20", { said: 3, crisis: true })];
  // 30일이 지나 원문 일부가 사라진 날은 작은 숫자로 덮지 않는다.
  const shrunk = mergeDays(stored, [day("2026-10-28", { said: 2, replies: 2 })], now);
  assert.equal(shrunk.find((d) => d.date === "2026-10-28")?.said, 6);
  const grown = mergeDays(stored, [day("2026-10-28", { said: 8, replies: 8, words: { 회의: 2 } }), day("2026-10-20", { said: 4, words: { 회의: 1 } })], now);
  const d28 = grown.find((d) => d.date === "2026-10-28")!;
  assert.deepEqual([d28.said, d28.ai, d28.mine, d28.tried, d28.words], [8, "cloudy", "rain", 1, { 회의: 2 }]);
  const d20 = grown.find((d) => d.date === "2026-10-20")!;
  assert.deepEqual([d20.crisis, d20.words], [true, {}]);
});

test("1년이 지난 날짜별 숫자는 정리한다", () => {
  const days = mergeDays([day("2025-10-31"), day("2025-11-02")], [], at(11, 1));
  assert.deepEqual(days.map((d) => d.date), ["2025-11-02"]);
});

test("원문에서 숫자를 옮겨 계정별로 저장하고 지울 수 있다", () => {
  clearReport();
  const sessions: Session[] = [{ id: "a", startedAt: at(10, 30, 19), messages: [{ role: "user", content: "주말에 산책 가 볼까 해", at: at(10, 30, 19) }] }];
  syncReport(sessions, at(11, 1));
  assert.deepEqual(loadReport().map((d) => [d.date, d.said]), [["2026-10-30", 1]]);
  setLocalOwner("member-b");
  assert.deepEqual(loadReport(), []);
  setLocalOwner("member-a");
  clearReport();
  assert.deepEqual(loadReport(), []);
});

test("저장값이 깨졌으면 그날만 빼고 읽는다", () => {
  saveReport([day("2026-10-01"), { date: "2026-10-02", said: "많이" } as never]);
  assert.deepEqual(loadReport().map((d) => d.date), ["2026-10-01"]);
  clearReport();
});

test("하늘은 내가 고친 하늘이 먼저이고, none은 하늘 없음이다", () => {
  assert.equal(effectiveSky(day("x", { ai: "cloudy" })), "cloudy");
  assert.equal(effectiveSky(day("x", { ai: "cloudy", mine: "rain" })), "rain");
  assert.equal(effectiveSky(day("x", { ai: "none" })), undefined);
  const back = setMySky(setMySky([day("x", { ai: "cloudy" })], "x", "sunny"), "x", undefined);
  assert.deepEqual([back[0].mine, effectiveSky(back[0])], [undefined, "cloudy"]);
});

test("AI에 물어볼 날은 오늘 전, 원문이 있고, 위기·고른·고친 날이 아니고, 쉬는 시간이 지난 날만 최근 순으로 7일까지", () => {
  const now = at(11, 1, 21);
  const talk = (d: number, text = "회의가 길었어. 팀장님이 따로 보자는데 신경 쓰여") => ({ id: `s${d}`, startedAt: at(10, d, 20), messages: [{ role: "user" as const, content: text, at: at(10, d, 20) }] });
  const sessions: Session[] = [talk(20), talk(21), talk(22), talk(23), talk(24, "응"), talk(25), { id: "today", startedAt: at(11, 1, 9), messages: [{ role: "user", content: "오늘은 쉬고 싶어 정말로 쉬고 싶어", at: at(11, 1, 9) }] }];
  const days = [
    day("2026-10-20"), day("2026-10-21", { ai: "cloudy" }), day("2026-10-22", { mine: "rain" }), day("2026-10-23", { crisis: true }),
    day("2026-10-24"), day("2026-10-25", { tried: now - 60_000 }), day("2026-10-19"), day("2026-11-01"),
  ];
  assert.deepEqual(pendingSkyDays(days, sessions, now).map((p) => p.date), ["2026-10-20"]);
  assert.deepEqual(pendingSkyDays([day("2026-10-25", { tried: now - 7 * 60 * 60 * 1000 })], sessions, now).map((p) => p.date), ["2026-10-25"]);
  const many = Array.from({ length: 9 }, (_, i) => talk(10 + i));
  assert.equal(pendingSkyDays(many.map((s) => day(localDate(s.startedAt))), many, now).length, 7);
  assert.ok(pendingSkyDays([day("2026-10-20")], [talk(20, "가".repeat(5000))], now)[0].text.length <= 4000);
});

test("AI 결과를 반영하고, 답이 없던 날은 물어본 시각만 남긴다", () => {
  const next = applySkyResults([day("a"), day("b"), day("c"), day("d")], ["a", "b", "c"], [
    { date: "a", sky: "sunny", crisis: false },
    { date: "b", sky: null, crisis: false },
  ], 100);
  assert.deepEqual(next.map((d) => [d.ai, d.tried]), [["sunny", 100], ["none", 100], [undefined, 100], [undefined, undefined]]);
  const crisis = applySkyResults([day("a", { words: { 회의: 1 } })], ["a"], [{ date: "a", sky: null, crisis: true }], 1);
  assert.deepEqual([crisis[0].crisis, crisis[0].words, crisis[0].ai], [true, {}, undefined]);
});

test("달 화면 숫자: 합계, 하늘별 날 수, 두 번 이상 나온 말, 시간대, 기록이 적을 때", () => {
  const hours = (h: number, n: number) => { const list = Array(24).fill(0); list[h] = n; return list; };
  const days = [
    day("2026-10-02", { said: 5, ai: "sunny", hours: hours(22, 5), words: { 회의: 2, 잠: 1 } }),
    day("2026-10-05", { said: 3, ai: "cloudy", hours: hours(23, 3), words: { 회의: 1, 산책: 1 } }),
    day("2026-10-06", { said: 2, ai: "cloudy", mine: "rain", hours: hours(13, 2), words: { 산책: 1 } }),
    day("2026-10-16", { said: 4, crisis: true, hours: hours(20, 4) }),
    day("2026-11-01", { said: 9 }),
  ];
  const view = monthView(days, 2026, 10);
  assert.deepEqual([view.talked, view.said, view.noSky], [4, 14, 1]);
  assert.deepEqual(view.skies.map((s) => [s.id, s.count]), [["sunny", 1], ["cloudy", 1], ["rain", 1]]);
  assert.deepEqual(view.words, [{ word: "회의", count: 3 }, { word: "산책", count: 2 }]);
  assert.deepEqual(view.buckets.map((b) => [b.id, b.count]), [["morning", 0], ["day", 2], ["evening", 4], ["night", 8]]);
  assert.equal(view.peak, 22);
  const few = monthView([day("2026-11-01", { said: 4, hours: hours(21, 4) })], 2026, 11);
  assert.deepEqual([few.talked, few.peak], [1, null]);
});

test("달 목록은 최근 12개월 중 기록이 있는 달과 이번 달이다", () => {
  const months = reportMonths([day("2025-10-15"), day("2026-08-01"), day("2026-10-02")], at(11, 1));
  assert.deepEqual(months, [{ year: 2026, month: 8 }, { year: 2026, month: 10 }, { year: 2026, month: 11 }]);
});

test("그날 대화는 날짜로 골라 시간 순으로 돌려준다", () => {
  const sessions: Session[] = [
    { id: "b", startedAt: at(10, 28, 22), messages: [{ role: "user", content: "둘", at: at(10, 28, 22) }] },
    { id: "a", startedAt: at(10, 28, 9), messages: [{ role: "user", content: "하나", at: at(10, 28, 9) }, { role: "user", content: "다음 날", at: at(10, 29, 1) }] },
  ];
  assert.deepEqual(dayMessages(sessions, "2026-10-28").map((m) => m.content), ["하나", "둘"]);
});

test("하늘 요청은 같은 출처로 날짜와 내 말만 보내고, 모르는 날짜·잘못된 하늘은 버린다", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(input, "/api/report-sky");
    assert.equal(init?.credentials, "same-origin");
    assert.deepEqual(init?.headers, { "Content-Type": "application/json", Authorization: "Bearer member-token" });
    assert.deepEqual(JSON.parse(init?.body as string), { days: [{ date: "2026-10-28", text: "회의가 길었어" }, { date: "2026-10-27", text: "속상했어" }] });
    return Response.json({ days: [
      { date: "2026-10-28", sky: "cloudy", crisis: false },
      { date: "2026-10-27", sky: "storm", crisis: false },
      { date: "2026-09-01", sky: "sunny", crisis: false },
      { date: "2026-10-28", sky: "sunny", crisis: false },
    ] });
  });
  const results = await requestReportSky([{ date: "2026-10-28", text: "회의가 길었어" }, { date: "2026-10-27", text: "속상했어" }], undefined, "member-token");
  assert.deepEqual(results, [{ date: "2026-10-28", sky: "cloudy", crisis: false }]);
});

test("하늘 요청이 실패하면 상태 코드와 다시 시도할 시간을 알려 준다", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "지금은 요청이 많아요." }, { status: 429, headers: { "Retry-After": "30" } }));
  await assert.rejects(requestReportSky([{ date: "2026-10-28", text: "회의" }]), (error: unknown) => error instanceof ReportSkyError && error.status === 429 && error.retryAfter === 30 && error.message === "지금은 요청이 많아요.");
});
