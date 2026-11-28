import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsEnv, analyticsId, beforeSend, cleanEvent, cleanUrl } from "./analytics.ts";

test("목록에 없는 이벤트는 보내지 않는다", () => {
  assert.equal(cleanEvent("chat_text", { text: "오늘 힘들었어" }), null);
  assert.equal(cleanEvent("$autocapture"), null);
  assert.equal(cleanEvent("toString"), null);
});

test("정해진 속성·값만 남기고 대화 내용 같은 다른 속성은 버린다", () => {
  assert.deepEqual(cleanEvent("chat_message_sent", { text: "죽고 싶어", length: 5 }), {});
  assert.deepEqual(cleanEvent("onboarding_step_viewed", { scene: "q1", answer: "많이 힘들어요" }), { scene: "q1" });
  assert.deepEqual(cleanEvent("onboarding_step_viewed", { scene: "민주" }), {});
  assert.deepEqual(cleanEvent("report_opened", { mode: "library" }), { mode: "library" });
});

test("숫자 속성은 0 이상의 유한한 값만 반올림해 남긴다", () => {
  assert.deepEqual(cleanEvent("voice_ended", { seconds: 61.6 }), { seconds: 62 });
  assert.deepEqual(cleanEvent("voice_ended", { seconds: -1 }), {});
  assert.deepEqual(cleanEvent("voice_ended", { seconds: Infinity }), {});
  assert.deepEqual(cleanEvent("voice_ended", { seconds: "61" }), {});
});

test("주소는 쿼리와 해시를 뺀다", () => {
  assert.equal(cleanUrl("https://here-dev.vercel.app/?invite=ABCD#token=x"), "https://here-dev.vercel.app/");
  assert.equal(cleanUrl("not a url"), undefined);
});

test("보내기 직전: 자동 수집 이벤트를 버리고 사람 속성·모르는 속성을 지운다", () => {
  assert.equal(beforeSend({ event: "$pageview", properties: {} }), null);
  assert.equal(beforeSend({ event: "$autocapture", properties: { $elements: [] } }), null);
  const out = beforeSend({
    event: "report_opened",
    properties: { mode: "insight", $current_url: "https://here-dev.vercel.app/?invite=AB", $browser: "Safari", $referrer: "https://x.test/?q=1", $set: { phone: "010" }, nickname: "민주" },
    $set: { email: "a@b.c" },
  });
  assert.deepEqual(out?.properties, { mode: "insight", $current_url: "https://here-dev.vercel.app/", $browser: "Safari" });
  assert.equal(out?.$set, undefined);
});

test("회원 연결($identify)은 통과하되 사람 속성은 붙이지 않는다", () => {
  const out = beforeSend({ event: "$identify", properties: { distinct_id: "h", $anon_distinct_id: "a", $set: { name: "x" } } });
  assert.deepEqual(out?.properties, { distinct_id: "h", $anon_distinct_id: "a" });
});

test("회원 ID는 해시로 바꾸고 같은 회원은 같은 값이 된다", async () => {
  const id = "3f2b1c7e-0000-4000-8000-000000000001";
  const a = await analyticsId(id);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await analyticsId(id));
  assert.ok(!a.includes(id));
  assert.notEqual(a, await analyticsId("3f2b1c7e-0000-4000-8000-000000000002"));
});

test("운영은 Vercel 환경값이나 운영 주소 어느 쪽으로든 꺼진다", () => {
  assert.equal(analyticsEnv("production", "here-dev.vercel.app", "production"), "production");
  assert.equal(analyticsEnv(undefined, "here-prod.vercel.app", "production"), "production");
  assert.equal(analyticsEnv("preview", "here-dev.vercel.app", "production"), "development");
  assert.equal(analyticsEnv("preview", "here-git-x.vercel.app", "production"), "preview");
  assert.equal(analyticsEnv(undefined, "localhost", "development"), "local");
});
