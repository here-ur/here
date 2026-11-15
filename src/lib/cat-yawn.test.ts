import { test } from "node:test";
import assert from "node:assert/strict";
import { CAT_YAWN_DURATION_MS, catYawnPose, waitForCatYawn } from "./cat-yawn.ts";

test("하품의 첫 프레임과 마지막 프레임은 원화의 눈·입·고개를 변형하지 않는다", () => {
  for (const progress of [0, 1]) {
    const pose = catYawnPose(progress);
    assert.equal(pose.eyes, 0);
    assert.equal(pose.mouth, 0);
    assert.equal(pose.head, 0);
  }
  const peak = catYawnPose(.6);
  assert.equal(peak.eyes, 1);
  assert.equal(peak.mouth, 1);
  assert.ok(peak.head > 1);
});

test("눈은 입이 닫힐 때까지 감겨 있고 고개는 뒤늦게 힘을 푼다", () => {
  const preparing = catYawnPose(.14);
  assert.ok(preparing.head < 0);
  assert.ok(preparing.mouth < .02);
  const releasing = catYawnPose(.82);
  assert.equal(releasing.eyes, 1);
  assert.ok(releasing.mouth <= .021);
  assert.ok(releasing.head > 0);
  assert.equal(catYawnPose(.87).mouth, 0);
});

test("하품을 마친 뒤에만 음성 시작을 이어간다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let started = false;
  const opening = waitForCatYawn(new AbortController().signal).then(() => { started = true; });
  t.mock.timers.tick(CAT_YAWN_DURATION_MS - 1);
  await Promise.resolve();
  assert.equal(started, false);
  t.mock.timers.tick(1);
  await opening;
  assert.equal(started, true);
});

test("하품 중 종료하면 뒤늦게 마이크 연결을 시작하지 않는다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  let started = false;
  const opening = waitForCatYawn(controller.signal).then(() => { started = true; });
  controller.abort();
  await assert.rejects(opening, { name: "AbortError" });
  t.mock.timers.tick(CAT_YAWN_DURATION_MS);
  assert.equal(started, false);
});

test("이미 종료된 요청은 하품을 시작하지 않는다", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForCatYawn(controller.signal), { name: "AbortError" });
});

test("동작 줄이기에서는 하품 대기 없이 음성을 시작한다", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await waitForCatYawn(new AbortController().signal, true);
});
