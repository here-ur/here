import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voiceMemoryResponse } from "./voice-memory-server.ts";
import { parseVoiceMemoryInput } from "./voice-memory-protocol.ts";

const request = (body: unknown) => new Request("http://localhost/api/voice-memory", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function fixture() {
  const saves: unknown[] = [], searches: unknown[] = [];
  const deps = {
    recall: async (messages: unknown) => { searches.push(messages); return "본인 기억"; },
    schedule: (messages: unknown, sourceId: string) => { saves.push({ messages, sourceId }); },
    checkConsent: async (): Promise<Response | null> => null,
  };
  return { deps, saves, searches };
}
test("확정 음성 발언의 저장 작업만 예약하고 완료로 거짓 표시하지 않는다", async () => {
  const f = fixture();
  const result = await voiceMemoryResponse(request({ action: "remember", text: " 차를 좋아해 ", sourceId: "session:item1" }), f.deps);
  assert.equal(result.status, 202);
  assert.deepEqual(await result.json(), { accepted: true });
  assert.deepEqual(f.saves, [{ messages: [{ role: "user", content: "차를 좋아해" }], sourceId: "session:item1" }]);
  assert.equal(f.searches.length, 0);
  assert.equal(result.headers.get("cache-control"), "no-store");
});
test("음성 검색은 같은 기억 서비스를 사용하고 반환 직전 동의를 재확인한다", async () => {
  const f = fixture(); let checks = 0;
  f.deps.checkConsent = async () => { checks++; return checks > 1 ? Response.json({ code: "consent_required" }, { status: 403 }) : null; };
  const result = await voiceMemoryResponse(request({ action: "recall", text: "좋아하는 차" }), f.deps);
  assert.equal(result.status, 403);
  assert.equal(f.searches.length, 1);
  assert.equal(f.saves.length, 0);
});
test("미동의 요청은 검색·저장하지 않고 계정 ID·역할·원음·과대 요청을 거절한다", async () => {
  const f = fixture();
  f.deps.checkConsent = async () => Response.json({ code: "consent_required" }, { status: 403 });
  for (const body of [{ action: "recall", text: "취향" }, { action: "remember", text: "차", sourceId: "i" }]) {
    assert.equal((await voiceMemoryResponse(request(body), f.deps)).status, 403);
  }
  for (const body of [null, {}, { action: "remember", text: "차" }, { action: "recall", text: "x".repeat(1001) }, { action: "remember", text: "x".repeat(8001), sourceId: "i" }, { action: "recall", text: "차", userId: "other" }, { action: "remember", text: "차", sourceId: "i", role: "assistant" }, { action: "remember", audio: "base64", sourceId: "i" }]) {
    assert.equal(parseVoiceMemoryInput(body), null);
    assert.equal((await voiceMemoryResponse(request(body), f.deps)).status, 400);
  }
  assert.equal((await voiceMemoryResponse(request({ text: "x".repeat(32769) }), f.deps)).status, 413);
  assert.equal(f.saves.length + f.searches.length, 0);
});
test("음성 API는 서버 회원·개발 환경·동의를 강제하며 동일 RLS 저장소를 사용한다", () => {
  const route = readFileSync(new URL("../app/api/voice-memory/route.ts", import.meta.url), "utf8");
  assert.match(route, /await requireMember\(request\)/);
  assert.match(route, /if \(!memoryEnabled\(process.env\)\)/);
  assert.match(route, /supabaseMemoryStore\(access.supabase\)/);
  assert.match(route, /requireMemoryConsent\(access.supabase\)/);
  assert.match(route, /after\(\(\) => memory.remember\(messages, sourceId\)\)/);
});
