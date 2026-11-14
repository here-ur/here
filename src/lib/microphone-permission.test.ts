import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markMicrophoneNoticeSeen, microphoneAskStep, microphoneNoticeSeen, microphonePermission, requestMicrophonePermission } from "./microphone-permission.ts";

test("권한 조회는 마이크를 열지 않고 브라우저 미지원도 처리한다", async () => {
  for (const state of ["granted", "denied", "prompt"] as const) {
    const nav = { permissions: { query: async (input: {name: string}) => { assert.equal(input.name, "microphone"); return { state }; } } };
    assert.equal(await microphonePermission(nav as unknown as Navigator), state);
  }
  assert.equal(await microphonePermission({} as Navigator), "unknown");
  assert.equal(await microphonePermission({ permissions: { query: async () => { throw Error(); } } } as unknown as Navigator), "unknown");
});

test("초기 허용은 늦게 허용된 스트림도 즉시 정지하고 권한 거절은 그대로 반환한다", async () => {
  let resolve!: (stream: MediaStream) => void;
  let stopped = 0;
  const request = requestMicrophonePermission({ getUserMedia: async constraints => {
    assert.deepEqual(constraints, { audio: true });
    return new Promise<MediaStream>(r => { resolve = r; });
  } });
  assert.equal(stopped, 0);
  resolve({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] } as unknown as MediaStream);
  await request;
  assert.equal(stopped, 2);
  await assert.rejects(requestMicrophonePermission({ getUserMedia: async () => { throw Error("denied"); } }));
});

test("안내 확인은 저장소 사용 불가 상태에서도 같은 탭에서 기억한다", () => {
  assert.equal(microphoneNoticeSeen(), false);
  markMicrophoneNoticeSeen();
  assert.equal(microphoneNoticeSeen(), true);
});

test("마이크 안내는 앱 진입 때가 아니라 홈의 마이크 버튼을 처음 누를 때 띄우고, 녹음·전송하지 않는다", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /MicrophonePermissionGate/);
  assert.match(page, /useMicrophoneAsk\(startVoice/);
  assert.match(page, /onVoice=\{toVoice\}/);
  assert.doesNotMatch(page, /연결하는 중/);
  const ask = readFileSync(new URL("../app/MicrophoneAsk.tsx", import.meta.url), "utf8");
  assert.match(ask, /마이크 사용 허용/);
  assert.match(ask, /지금은 글로 이야기할게요/);
  // 권한이 이미 있거나 안내를 거쳐 허용했으면 시트 없이 바로 연결한다.
  assert.match(ask, /microphoneNoticeSeen\(\)/);
  assert.match(ask, /microphoneAskStep\(/);
  assert.doesNotMatch(ask, /MediaRecorder|fetch\(/);
});

test("마이크 버튼을 누르면: 안내를 거쳐 허용했거나 미지원이면 바로 연결, 아니면 권한을 조회해 허용·차단·안내로 나눈다", () => {
  assert.equal(microphoneAskStep({ seen: true, supported: true }), "start");
  assert.equal(microphoneAskStep({ seen: false, supported: false }), "start");
  assert.equal(microphoneAskStep({ seen: false, supported: true }), "query");
  assert.equal(microphoneAskStep({ seen: false, supported: true, permission: "granted" }), "start");
  assert.equal(microphoneAskStep({ seen: false, supported: true, permission: "denied" }), "blocked");
  assert.equal(microphoneAskStep({ seen: false, supported: true, permission: "prompt" }), "sheet");
  assert.equal(microphoneAskStep({ seen: false, supported: true, permission: "unknown" }), "sheet");
});

test("안내 시트에서 '지금은 글로'를 고르면 확인 기록을 남기지 않아 다음에 마이크를 누르면 다시 묻는다", () => {
  const ask = readFileSync(new URL("../app/MicrophoneAsk.tsx", import.meta.url), "utf8");
  const textStart = ask.indexOf("onText={");
  const textAction = ask.slice(textStart, ask.indexOf("onClose={", textStart));
  assert.ok(textAction.length > 0);
  assert.doesNotMatch(textAction, /markMicrophoneNoticeSeen/);
  // 허용은 안내를 거친 뒤에만 기록한다.
  const allow = ask.slice(ask.indexOf("async function allow"), ask.indexOf("const element"));
  assert.match(allow, /requestMicrophonePermission[\s\S]*markMicrophoneNoticeSeen/);
});
