import assert from "node:assert/strict";
import test from "node:test";
import { companionState } from "./companion-state.ts";

test("몽글이는 대기와 사용자 입력 중을 구분한다", () => {
  assert.equal(companionState({}), "idle");
  assert.equal(companionState({ composing: true }), "attentive");
});

test("실제 대화 상태를 표정으로 연결한다", () => {
  assert.equal(companionState({ listening: true }), "listening");
  assert.equal(companionState({ thinking: true }), "thinking");
  assert.equal(companionState({ connecting: true, listening: true }), "thinking");
  assert.equal(companionState({ speaking: true, composing: true }), "speaking");
});

test("연결 오류에서는 듣거나 말하는 표정을 표시하지 않는다", () => {
  assert.equal(companionState({ error: true, listening: true }), "idle");
  assert.equal(companionState({ error: true, speaking: true, thinking: true }), "idle");
});
