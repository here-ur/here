import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGreetingCache, greetingCandidates, topicGreeting } from "./home-greeting.ts";

const memory = { id: "test-a", summary: "사용자는 보드게임 아줄을 가장 좋아한다고 말했다.", updated_at: "2026-10-31" };
const selection = { memory_id: "test-a", topic: "아줄", category: "game" };
const provider = (selection: unknown) => Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(selection) }] }] });

test("저장된 취향에서만 짧은 홈 문구를 만들고 날짜별로 변주한다", () => {
  assert.equal(topicGreeting(selection, [memory], 0), "아줄 한 판 대신,\n이야기 한 판 어때?");
  assert.notEqual(topicGreeting(selection, [memory], 0), topicGreeting(selection, [memory], 1));
  assert.equal(topicGreeting({ ...selection, topic: "체스" }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, memory_id: "other" }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, category: "health" }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, topic: "<script>" }, [memory], 0), null);
});

test("민감한 맥락·부정 취향은 홈 소재에서 제외한다", () => {
  for (const summary of ["우울증 치료 중 아줄을 한다", "아줄을 이제 싫어한다", "정치에 관심이 있다", "전화번호 01012345678", "My diagnosis is private", "I no longer like chess"]) {
    assert.equal(greetingCandidates([{ ...memory, summary }]).length, 0);
  }
  assert.equal(topicGreeting(selection, [{ ...memory, summary: "우울증 치료 중 아줄을 한다" }], 0), null);
});

test("계정·기억별 캐시 격리와 중복 호출 방지", async () => {
  let calls = 0;
  const config = { apiKey: "test-only", fetch: (async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.store, false); assert.equal(body.reasoning.effort, "low");
    return provider(selection);
  }) as typeof fetch };
  const get = createGreetingCache();
  const [a, b] = await Promise.all([get("user-a", [memory], config), get("user-a", [memory], config)]);
  assert.ok(a); assert.equal(a, b); assert.equal(calls, 1);
  await get("user-b", [memory], config); assert.equal(calls, 2);
  assert.equal(await get("user-a", [], config), null); assert.equal(calls, 2);
  await get("user-a", [{ ...memory, updated_at: "changed" }], config); assert.equal(calls, 3);
});

test("기억 없음·키 없음·오류·불완전 출력은 기본 인사로 돌아간다", async () => {
  const get = createGreetingCache();
  const fail = { apiKey: "test-only", fetch: (async () => { throw new Error("provider_down"); }) as typeof fetch };
  assert.equal(await get("empty", [], fail), null);
  assert.equal(await get("no-key", [memory], {}), null);
  assert.equal(await get("failure", [memory], fail), null);
  assert.equal(await get("bad", [memory], { apiKey: "test-only", fetch: (async () => Response.json({ status: "incomplete" })) as typeof fetch }), null);
  assert.equal(await get("refusal", [memory], { apiKey: "test-only", fetch: (async () => provider({ memory_id: "", topic: "", category: "" })) as typeof fetch }), null);
});

test("홈 인사 API는 검증된 계정·동의·개발 환경만 사용한다", () => {
  const route = readFileSync(new URL("../app/api/home-greeting/route.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("requireMember(request)") < route.indexOf('from("conversation_memories")'));
  assert.ok(route.indexOf("requireMemoryConsent(access.supabase)") < route.indexOf("await greeting("));
  assert.match(route, /memoryEnabled\(process.env\)/);
  assert.match(route, /eq\("user_id", access.userId\)/);
  assert.match(route, /eq\("status", "ready"\)/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /JSON.stringify\(current\) !== JSON.stringify\(data\)/);
});
