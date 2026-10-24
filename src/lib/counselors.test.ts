import test from "node:test";
import assert from "node:assert/strict";
import { COUNSELING_TOPICS, EXAMPLE_COUNSELORS, counselorsForTopic } from "./counselors.ts";

test("전체 필터는 모든 예시 상담사를 원래 순서로 보여준다", () => {
  assert.deepEqual(counselorsForTopic("전체"), EXAMPLE_COUNSELORS);
  assert.equal(new Set(EXAMPLE_COUNSELORS.map((counselor) => counselor.id)).size, EXAMPLE_COUNSELORS.length);
});

test("주제 필터는 해당 주제를 가진 상담사만 보여준다", () => {
  for (const topic of COUNSELING_TOPICS) {
    if (topic === "전체") continue;
    const result = counselorsForTopic(topic);
    assert.ok(result.length > 0);
    assert.ok(result.every((counselor) => counselor.topics.includes(topic)));
    assert.deepEqual(result, EXAMPLE_COUNSELORS.filter((counselor) => counselor.topics.includes(topic)));
  }
});
