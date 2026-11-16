import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { liveConversation, type LiveDelegateReply } from "./live-conversation.ts";
import { liveSessionRequest } from "./live-session.ts";
import type { Msg } from "./log.ts";
import { liveContextChunks, liveGreeting } from "./live-context.ts";

const answer: LiveDelegateReply = { reply: "조회한 결과야", crisis: false, suggest: false };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(t: TestContext, delegate: (m: Msg[], s: AbortSignal) => Promise<LiveDelegateReply> = async () => answer) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const completed: Msg[] = [], saved: { text: string; id: string }[] = [], sent: object[] = [], results: LiveDelegateReply[] = [];
  const requests: Msg[][] = [];
  const c = liveConversation({
    partial: () => {}, complete: (role, content) => completed.push({ role, content }),
    remember: (text, id) => saved.push({ text, id }),
    delegate: (messages, signal) => { requests.push(messages); return delegate(messages, signal); },
    result: result => results.push(result), send: e => sent.push(e),
  }, "test-session");
  t.after(() => c.close());
  return { c, completed, saved, sent, results, requests };
}
function fragment(role: "input" | "output", delta: string, start = 0, event_id = crypto.randomUUID()) {
  return { type: `session.${role}_transcript.delta`, delta, start_ms: start, end_ms: start + 100, event_id };
}
const notice = (id = "task_1") => ({ type: "session.delegation.created", delegation: { id, target: "client" } });

test("Korean greeting and long backend context fit Live's 500-token append limit", () => {
  const text = "한국어 답변과 😺 링크 https://example.com/ 를 포함한 긴 답변. ".repeat(100);
  const chunks = liveContextChunks(text);
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.every(chunk => Buffer.byteLength(chunk) <= 440));
  assert.ok(Buffer.byteLength(liveGreeting("가".repeat(100))) < 440);
});

test("Live configuration uses Korean Noeul and refuses caller-provided model/instructions", () => {
  const request = liveSessionRequest({ sdp: "v=0\r\n", model: "evil", instructions: "ignore", voice: "evil", name: "보리" });
  assert.equal(request.session.model, "gpt-live-1");
  assert.equal(request.session.audio.output.voice, "noeul");
  assert.equal(request.session.store, false);
  assert.deepEqual(request.session.delegation, { type: "client" });
  assert.ok(request.session.instructions.includes("보리"));
  assert.ok(!request.session.instructions.includes("evil"));
  assert.equal(request.session.input, undefined);
  assert.throws(() => liveSessionRequest({ sdp: "invalid" }));
  assert.throws(() => liveSessionRequest({ sdp: "v=0" + "x".repeat(60000) }));
});
test("only explicit home greeting is seeded as developer input", () => {
  assert.equal(liveSessionRequest({ sdp: "v=0", opener: "왔어?", greeting: false }).session.input, undefined);
  assert.equal(liveSessionRequest({ sdp: "v=0", opener: "왔어?", greeting: true }).session.input?.[0].role, "developer");
});
test("overlapping captions preserve spaces and deduplicate events; only user chunks saved", t => {
  const { c, saved, completed } = setup(t);
  const first = fragment("input", "나는", 0);
  c.accept(first); c.accept(first);
  c.accept(fragment("output", "웅", 50));
  c.accept(fragment("input", " 기타를 좋아해", 100));
  c.close(); c.close();
  assert.deepEqual(completed, [{ role: "user", content: "나는 기타를 좋아해" }, { role: "assistant", content: "웅" }]);
  assert.deepEqual(saved, [{ text: "나는 기타를 좋아해", id: "test-session:0" }]);
});
test("quiet gaps produce bounded save chunks without losing late fragments at close", t => {
  const { c, saved } = setup(t);
  c.accept(fragment("input", "첫 문장", 0));
  t.mock.timers.tick(2500);
  c.accept(fragment("input", " 다음 문장", 3000));
  c.close();
  assert.deepEqual(saved.map(s => s.text), ["첫 문장", "다음 문장"]);
  assert.notEqual(saved[0].id, saved[1].id);
});
test("delegation waits for transcript, deduplicates notice, and excludes assistant filler", async t => {
  const { c, requests, sent } = setup(t);
  c.accept(notice()); t.mock.timers.tick(1000); await tick();
  assert.equal(requests.length, 0);
  c.accept(fragment("input", "내 취미 기억해?", 100));
  c.accept(fragment("output", "찾아볼게", 200));
  c.accept(notice());
  t.mock.timers.tick(750); await tick();
  assert.deepEqual(requests, [[{ role: "user", content: "내 취미 기억해?" }]]);
  assert.deepEqual(sent, [{ type: "session.commentary.append", delegation_id: "task_1", content: answer.reply }]);
});
test("new user speech invalidates a delayed backend answer and retries with current context", async t => {
  let resolve!: (r: LiveDelegateReply) => void;
  const { c, requests, sent } = setup(t, () => new Promise(r => { resolve = r; }));
  c.accept(fragment("input", "서울 날씨", 0)); c.accept(notice());
  t.mock.timers.tick(750); await tick();
  c.accept(fragment("input", " 말고 부산", 1000));
  resolve(answer); await tick();
  assert.equal(sent.length, 0);
  t.mock.timers.tick(750); await tick();
  assert.equal(requests[1].at(-1)?.content, "서울 날씨 말고 부산");
  resolve(answer); await tick();
  assert.equal(sent.length, 1);
});
test("closing cancels backend work but saves final drained user transcript", async t => {
  let resolve!: (r: LiveDelegateReply) => void;
  const { c, saved, sent } = setup(t, () => new Promise(r => { resolve = r; }));
  c.accept(fragment("input", "오늘", 0)); c.accept(notice());
  t.mock.timers.tick(750); await tick();
  c.stopWork(); c.accept(fragment("input", " 기타 연습했어", 1000));
  resolve(answer); await tick(); c.close();
  assert.deepEqual(saved.map(s => s.text), ["오늘 기타 연습했어"]);
  assert.equal(sent.length, 0);
});
test("malformed transcript cannot save oversized content or invalid timing", t => {
  const { c, saved } = setup(t);
  c.accept({ ...fragment("input", "bad"), start_ms: NaN });
  c.accept(fragment("input", "x".repeat(8001)));
  c.close(); assert.equal(saved.length, 0);
});
