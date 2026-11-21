import test from "node:test";
import assert from "node:assert/strict";
import { voiceTiming, greetingWithinBudget } from "./voice-timing.ts";

test("음성 단계별 경과 시간은 한 번만 기록하고 발화·키·ID를 수집하지 않는다", () => {
  let time = 100;
  const logs: string[] = [];
  const mark = voiceTiming(() => time, line => logs.push(line));
  time = 250.4; mark("session_key");
  time = 300; mark("session_key");
  time = 1100; mark("first_audio");
  assert.deepEqual(logs.map(line => JSON.parse(line)), [
    { event: "here_voice_timing", stage: "session_key", elapsedMs: 150.4 },
    { event: "here_voice_timing", stage: "first_audio", elapsedMs: 1000, budgetMs: 2000, passed: true },
  ]);
  assert.doesNotThrow(() => voiceTiming(() => 0, () => { throw new Error(); })("channel_ready"));
});

test('첫 인사는 2000ms까지 통과하며 소수점 초과나 2100ms는 실패한다', () => {
  for (const ms of [0, 1999.99, 2000]) assert.equal(greetingWithinBudget(ms), true);
  for (const ms of [-1, 2000.001, 2100, Infinity, NaN]) assert.equal(greetingWithinBudget(ms), false);
  const logs: string[] = [];
  voiceTiming(() => 2500.01, line => logs.push(line), 500)('first_audio');
  assert.equal(JSON.parse(logs[0]).passed, false);
  assert.ok(JSON.parse(logs[0]).elapsedMs > 2000);
});
