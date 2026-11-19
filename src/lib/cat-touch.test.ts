import assert from "node:assert/strict";
import test from "node:test";
import { classifyGesture, purrsBetween, PURR_EVERY_PX, STROKE_START_PX, TAP_MAX_MS } from "./cat-touch.ts";

test("조금 움직이고 금방 떼면 누르기, 쓸면 쓰다듬기, 오래 누르고 떼면 아무것도 아니다", () => {
  assert.equal(classifyGesture(3, 120), "tap");
  assert.equal(classifyGesture(STROKE_START_PX + 1, 120), "stroke");
  assert.equal(classifyGesture(STROKE_START_PX + 1, 5000), "stroke");
  assert.equal(classifyGesture(2, TAP_MAX_MS + 1), "none");
});

test("골골은 쓸어 간 거리 일정 간격마다 하나씩 뜬다", () => {
  assert.equal(purrsBetween(0, PURR_EVERY_PX - 1), 0);
  assert.equal(purrsBetween(PURR_EVERY_PX - 1, PURR_EVERY_PX + 1), 1);
  assert.equal(purrsBetween(0, PURR_EVERY_PX * 3), 3);
});
