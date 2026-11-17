import assert from "node:assert/strict";
import test from "node:test";
import { continuedScene, loadingPhase, LOADING_SAME_FLOW_MS, LOADING_SHOW_AFTER_MS, LOADING_SLOW_AFTER_MS } from "./loading-scene.ts";

test("짧은 대기는 아무것도 보여 주지 않는다", () => {
  assert.equal(loadingPhase(0, true), "hidden");
  assert.equal(loadingPhase(LOADING_SHOW_AFTER_MS - 1, true), "hidden");
  assert.equal(loadingPhase(LOADING_SHOW_AFTER_MS, true), "waiting");
});

test("8초가 넘으면 나갈 길이 있을 때만 느린 단계가 된다", () => {
  assert.equal(loadingPhase(LOADING_SLOW_AFTER_MS, true), "slow");
  assert.equal(loadingPhase(LOADING_SLOW_AFTER_MS * 3, false), "waiting");
});

test("이어지는 로딩은 처음부터 장면을 보여 준다", () => {
  assert.equal(loadingPhase(0, true, true), "waiting");
});

test("바로 이어지는 로딩은 앞 장면을 이어 쓰고, 시간이 지나면 새 장면을 쓴다", () => {
  const last = { scene: "nap" as const, endedAt: 1000 };
  assert.deepEqual(continuedScene("groom", last, 1000 + LOADING_SAME_FLOW_MS - 1), { scene: "nap", continued: true });
  assert.deepEqual(continuedScene("groom", last, 1000 + LOADING_SAME_FLOW_MS), { scene: "groom", continued: false });
  assert.deepEqual(continuedScene("groom", null, 5000), { scene: "groom", continued: false });
});
