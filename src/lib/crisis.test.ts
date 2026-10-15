import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCrisisSignal } from "./crisis.ts";

test("위기 표현을 잡는다", () => {
  for (const t of ["요즘 죽고 싶어", "그냥 사라지고싶다", "자해했어", "극단적인 선택을 생각해", "살기 싫어"]) {
    assert.ok(hasCrisisSignal(t), t);
  }
});

test("일상 표현은 잡지 않는다", () => {
  for (const t of ["오늘 너무 피곤해", "배고파 죽겠다는 아니고 그냥 배고파", "회사 가기 싫어"]) {
    assert.ok(!hasCrisisSignal(t), t);
  }
});
