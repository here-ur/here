import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGreetingCache, greetingCandidates, topicGreeting, homeGreetingPlan } from "./home-greeting.ts";
import { FIRST_HOME_OPENER, DEFAULT_HOME_OPENER, CASUAL_HOME_OPENERS, safeHomeOpener, withHomeOpener } from "./home-opener.ts";

const memory = { id: "test-a", summary: "사용자는 보드게임 아줄을 가장 좋아한다고 말했다.", updated_at: "2026-10-31" };
const selection = { memory_id: "test-a", topic: "아줄", category: "game", context: "preference", evidence: memory.summary };
const provider = (selection: unknown) => Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(selection) }] }] });

test("저장된 취향에서만 짧은 홈 문구를 만들고 날짜별로 변주한다", () => {
  assert.equal(topicGreeting(selection, [memory], 0), "아줄 좋아한다며.\n뭐가 그렇게 재밌어?");
  assert.notEqual(topicGreeting(selection, [memory], 0), topicGreeting(selection, [memory], 1));
  assert.equal(topicGreeting({ ...selection, topic: "체스" }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, memory_id: "other" }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, category: "health" }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, topic: "<script>" }, [memory], 0), null);
});

test("첫 만남·가벼운 재방문·기억 문구는 분리하고 한국 날짜 안에서 유지한다", () => {
  assert.equal(FIRST_HOME_OPENER, "네가 새 집사야?\n일단 얘기 좀 해 봐.");
  assert.notEqual(FIRST_HOME_OPENER, DEFAULT_HOME_OPENER);
  assert.equal(DEFAULT_HOME_OPENER, "왔어?\n오늘은 무슨 일인데.");
  const morning = Date.parse("2026-11-02T00:00:00+09:00");
  assert.deepEqual(homeGreetingPlan("a", morning), homeGreetingPlan("a", morning + 86_399_999));
  assert.notEqual(homeGreetingPlan("a", morning).day, homeGreetingPlan("a", morning - 1).day);
  const plans = Array.from({ length: 30 }, (_, i) => homeGreetingPlan("a", morning + i * 86_400_000));
  assert.ok(plans.some(p => p.useMemory));
  assert.ok(plans.some(p => !p.useMemory));
  for (const p of plans) assert.ok(CASUAL_HOME_OPENERS.includes(p.fallback));
  for (const line of [...CASUAL_HOME_OPENERS, FIRST_HOME_OPENER]) assert.ok(line.length <= 100);
});

test("활동·계획이 명시된 기억에서 자연스러운 후속 질문을 만든다", () => {
  const cases = [
    ["종이접기", "creative", "ongoing", "사용자는 요즘 종이접기를 하고 있다.", "그 종이접기, 요즘도 해?\n뭐 만들었는지 얘기 좀 해 봐."],
    ["어린 왕자", "book", "ongoing", "사용자는 어린 왕자를 읽고 있다.", "그 어린 왕자,\n어디까지 읽었어?"],
    ["재즈", "music", "ongoing", "사용자는 재즈를 자주 듣는다.", "요즘도 재즈 들어?\n좋은 곡 있으면 나도 좀 알자."],
    ["파스타", "food", "cooking_plan", "사용자는 파스타를 만들어 보고 싶다.", "그 파스타, 만들어 봤어?\n어떻게 됐나 좀 궁금해서."],
    ["취미", "creative", "hobby_exploring", "사용자는 새로운 취미를 찾고 있다.", "취미는 좀 골랐어?\n후보라도 얘기해 봐."],
  ];
  for (const [topic, category, context, summary, expected] of cases) {
    assert.equal(topicGreeting({ ...selection, topic, category, context, evidence: summary }, [{ ...memory, summary }], 0), expected);
  }
});

test("단순 취향·희망·완료를 진행 중 활동으로 바꾸지 않는다", () => {
  for (const summary of ["사용자는 어린 왕자를 좋아한다.", "사용자는 어린 왕자를 읽고 싶다.", "사용자는 어린 왕자를 다 읽었다.", "사용자는 어린 왕자를 읽고 있지 않다.", "사용자가 어린 왕자를 읽고 있다면 즐거울 것이라고 말했다."]) {
    assert.equal(topicGreeting({ ...selection, topic: "어린 왕자", category: "book", context: "ongoing", evidence: summary }, [{ ...memory, summary }], 0), null);
  }
  const summary = "사용자는 파스타를 먹고 싶다.";
  assert.equal(topicGreeting({ ...selection, topic: "파스타", category: "food", context: "cooking_plan", evidence: summary }, [{ ...memory, summary }], 0), null);
});

test("정확한 한 문장 근거 없이 상태를 추정하지 않는다", () => {
  assert.equal(topicGreeting({ ...selection, evidence: "사용자는 아줄을 하고 있다." }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, evidence: "" }, [memory], 0), null);
  assert.equal(topicGreeting({ ...selection, context: "unknown" }, [memory], 0), null);
  const summary = "사용자는 어린 왕자를 좋아한다. 다른 책을 읽고 있다.";
  assert.equal(topicGreeting({ ...selection, topic: "어린 왕자", category: "book", context: "ongoing", evidence: summary }, [{ ...memory, summary }], 0), null);
});

test("홈 문구를 대화 맥락에 한 번만 넣고 기존 대화를 덮어쓰지 않는다", () => {
  const initial = withHomeOpener([], FIRST_HOME_OPENER);
  assert.deepEqual(initial, [{ role: "assistant", content: "네가 새 집사야? 일단 얘기 좀 해 봐." }]);
  assert.equal(withHomeOpener(initial, DEFAULT_HOME_OPENER), initial);
  assert.equal(safeHomeOpener("<script>"), DEFAULT_HOME_OPENER);
  assert.equal(safeHomeOpener("x".repeat(101)), DEFAULT_HOME_OPENER);
});

test("모든 허용 분류의 문구는 광고식 비유나 확인되지 않은 일정이 없다", () => {
  for (const category of ["game", "music", "book", "food", "outdoors", "creative", "pet"]) {
    for (const day of [0, 1]) {
      const line = topicGreeting({ ...selection, category }, [memory], day)!;
      assert.ok(line.length <= 100);
      assert.match(line, /아줄/);
      assert.doesNotMatch(line, /한 스푼|첫 장|준비 완료|한 판 대신|어제|주말|면접/);
    }
  }
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
    assert.deepEqual(body.text.format.schema.required, ["memory_id", "topic", "category", "context", "evidence"]);
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
