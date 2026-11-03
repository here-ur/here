import assert from "node:assert/strict";
import test from "node:test";
import { transitionCue } from "./buddy-cues.ts";

test("상태 전환마다 가이드의 연결 동작을 고른다", () => {
  assert.equal(transitionCue("idle", "attentive"), "press");
  assert.equal(transitionCue("attentive", "thinking"), "hop");
  assert.equal(transitionCue("thinking", "speaking"), "pop");
  assert.equal(transitionCue("speaking", "listening"), "lean");
  assert.equal(transitionCue("listening", "thinking"), "lift");
});

test("기본 상태로 돌아올 때는 튀지 않고 가라앉고, 같은 상태나 정하지 않은 전환에는 붙이지 않는다", () => {
  for (const from of ["attentive", "listening", "thinking", "speaking"] as const) assert.equal(transitionCue(from, "idle"), "settle");
  assert.equal(transitionCue("idle", "idle"), null);
  assert.equal(transitionCue("attentive", "listening"), null);
});
