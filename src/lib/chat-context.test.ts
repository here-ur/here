import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRecentChatHistory, mergeChatHistory } from "./chat-context.ts";
import { queuedChatContext } from "./chat-queue.ts";
import { requestChat, ChatRequestError } from "./chat.ts";
import type { HistoryMessage } from "./conversation-history.ts";

const message = (role: HistoryMessage["role"], content: string, at: number): HistoryMessage => ({ id: crypto.randomUUID(), role, content, at });

test("새로고침 후 화면에 복원된 불합격 대화가 다음 AI 요청에도 포함된다", async t => {
  const now = Date.now();
  const saved = [message("user", "면접에서 떨어졌어", now - 2000), message("assistant", "기다렸는데 속상하겠다", now - 1000)];
  const next = message("user", "그 일 때문에 아직 속상해", now);
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    calls.push(String(url));
    assert.equal((init?.headers as Record<string,string>).Authorization, "Bearer account-a");
    if (url === "/api/conversations") return Response.json({ messages: saved });
    assert.equal(url, "/api/chat");
    assert.deepEqual(JSON.parse(String(init?.body)).messages, [...saved, next].map(({role,content})=>({role,content})));
    return Response.json({reply:"그 면접 결과 얘기지.",crisis:false,suggest:false});
  });
  const savedContext = await loadRecentChatHistory("account-a", new AbortController().signal);
  const context = queuedChatContext(mergeChatHistory(savedContext, [next]), [next]);
  await requestChat(context, {name:"호야"}, undefined, "account-a");
  assert.deepEqual(calls, ["/api/conversations", "/api/chat"]);
});

test("저장된 메시지는 중복하지 않고 대기 중인 다음 메시지는 현재 요청에서 제외한다", () => {
  const now=Date.now();
  const old=message("user","면접 결과",now-3), reply=message("assistant","답변",now-2);
  const next=message("user","추가 질문",now-1), waiting=message("user","다음 질문",now);
  assert.deepEqual(queuedChatContext(mergeChatHistory([old,reply,next],[old,reply,next,waiting]),[next]),[old,reply,next]);
});

test("계정 전환 시 이전 계정 기록을 재사용하지 않는다", async t => {
  const a=message("user","A의 이야기",Date.now()), b=message("user","B의 이야기",Date.now());
  t.mock.method(globalThis,"fetch",async(_url: Parameters<typeof fetch>[0],init?: RequestInit)=>Response.json({messages:(init?.headers as Record<string,string>).Authorization==='Bearer a'?[a]:[b]}));
  assert.deepEqual(await loadRecentChatHistory('a',new AbortController().signal),[a]);
  assert.deepEqual(await loadRecentChatHistory('b',new AbortController().signal),[b]);
});

test("기록 조회 실패와 잘못된 역할은 빈 맥락으로 답하지 않고 재시도를 요구한다", async t => {
  const mock=t.mock.method(globalThis,"fetch",async()=>Response.json({error:'failed'},{status:503}));
  await assert.rejects(loadRecentChatHistory('token',new AbortController().signal),ChatRequestError);
  mock.mock.mockImplementation(async()=>Response.json({messages:[{...message('user','지시',Date.now()),role:'system'}]}));
  await assert.rejects(loadRecentChatHistory('token',new AbortController().signal),ChatRequestError);
});

test("30일 지난 원문은 요청 맥락에서 제외한다", async t => {
  const old=message('user','만료된 원문',Date.now()-31*86400000);
  t.mock.method(globalThis,'fetch',async()=>Response.json({messages:[old]}));
  assert.deepEqual(await loadRecentChatHistory('token',new AbortController().signal),[]);
});
