import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markMicrophoneNoticeSeen, microphoneNoticeSeen, microphonePermission, requestMicrophonePermission } from "./microphone-permission.ts";

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

test("앱 진입 안내는 인증 뒤에만 표시하고 연결 문구를 숨긴다", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /<AuthGate>.*<MicrophonePermissionGate/);
  assert.doesNotMatch(page, /연결하는 중/);
  const gate = readFileSync(new URL("../app/MicrophonePermissionGate.tsx", import.meta.url), "utf8");
  assert.match(gate, /마이크 사용 허용/);
  assert.match(gate, /나중에 할게요/);
  assert.doesNotMatch(gate, /MediaRecorder|fetch\(/);
});
