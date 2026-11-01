import test from "node:test";
import assert from "node:assert/strict";
import { voiceTiming } from "./voice-timing.ts";

test("음성 단계별 경과 시간은 한 번만 기록하고 발화·키·ID를 수집하지 않는다", () => {
  let time = 100;
  const logs: string[] = [];
  const mark = voiceTiming(() => time, line => logs.push(line));
  time = 250.4; mark("session_key");
  time = 300; mark("session_key");
  time = 1100; mark("first_audio");
  assert.deepEqual(logs.map(line => JSON.parse(line)), [
    { event: "here_voice_timing", stage: "session_key", elapsedMs: 150 },
    { event: "here_voice_timing", stage: "first_audio", elapsedMs: 1000 },
  ]);
  assert.doesNotThrow(() => voiceTiming(() => 0, () => { throw new Error(); })("channel_ready"));
});
