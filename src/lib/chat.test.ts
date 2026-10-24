import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatRequestError, requestChat } from "./chat.ts";

const messages = [
  { role: "user" as const, content: "오늘은 좀 지쳤어" },
  { role: "assistant" as const, content: "어떤 하루였어?" },
  { role: "user" as const, content: "일이 많았어" },
];

test("같은 출처의 채팅 경로에 메시지와 이름만 JSON으로 보낸다", async (t) => {
  const controller = new AbortController();
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(input, "/api/chat");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin");
    assert.deepEqual(init?.headers, { "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(init?.body as string), { messages, name: "찬준" });
    assert.equal(init?.signal, controller.signal);
    return Response.json({ reply: "  어떤 일이 가장 힘들었어?  ", crisis: false, suggest: true });
  });

  assert.deepEqual(await requestChat(messages, "찬준", controller.signal), {
    reply: "어떤 일이 가장 힘들었어?",
    crisis: false,
    suggest: true,
  });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("취소 신호 없이도 요청하고 위기 응답을 보존한다", async (t) => {
  t.mock.method(globalThis, "fetch", async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(init?.signal, undefined);
    return Response.json({ reply: "혼자 견디지 않아도 돼.", crisis: true, suggest: false });
  });

  assert.deepEqual(await requestChat(messages, "찬준"), {
    reply: "혼자 견디지 않아도 돼.",
    crisis: true,
    suggest: false,
  });
});

test("HTTP 오류의 안전한 안내와 위기·도움받기 상태를 보존한다", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: "  잠시 후 다시 시도해 주세요.  ",
    crisis: true,
    suggest: true,
  }, { status: 503 }));

  await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => {
    assert.ok(error instanceof ChatRequestError);
    assert.equal(error.name, "ChatRequestError");
    assert.equal(error.message, "잠시 후 다시 시도해 주세요.");
    assert.equal(error.crisis, true);
    assert.equal(error.suggest, true);
    return true;
  });
});

test("HTTP 오류 안내는 최대 300자이며 boolean true만 상태로 받는다", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: `  ${"가".repeat(400)}  `,
    crisis: "true",
    suggest: 1,
  }, { status: 500 }));

  await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => {
    assert.ok(error instanceof ChatRequestError);
    assert.equal(error.message, "가".repeat(300));
    assert.equal(error.crisis, false);
    assert.equal(error.suggest, false);
    return true;
  });
});

test("HTTP 오류 안내가 없거나 잘못되어도 기본 안내를 제공한다", async (t) => {
  for (const payload of [null, [], {}, { error: "  " }, { error: { message: "내부 오류" } }]) {
    await t.test(JSON.stringify(payload), async (st) => {
      st.mock.method(globalThis, "fetch", async () => Response.json(payload, { status: 500 }));
      await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => {
        assert.ok(error instanceof ChatRequestError);
        assert.equal(error.message, "대화를 이어가지 못했어요. 잠시 후 다시 시도해 주세요.");
        assert.equal(error.crisis, false);
        assert.equal(error.suggest, false);
        return true;
      });
    });
  }
});

test("안내가 비어 있어도 HTTP 오류의 안전 상태를 잃지 않는다", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: " ",
    crisis: true,
    suggest: true,
  }, { status: 502 }));

  await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => {
    assert.ok(error instanceof ChatRequestError);
    assert.ok(error.message.length > 0);
    assert.equal(error.crisis, true);
    assert.equal(error.suggest, true);
    return true;
  });
});

test("비어 있거나 잘못된 성공 응답은 답변으로 사용하지 않는다", async (t) => {
  const malformed = [
    null,
    [],
    {},
    { reply: "", crisis: false, suggest: false },
    { reply: " \n\t ", crisis: false, suggest: false },
    { reply: 123, crisis: false, suggest: false },
    { reply: "답변", suggest: false },
    { reply: "답변", crisis: false },
    { reply: "답변", crisis: "false", suggest: false },
    { reply: "답변", crisis: false, suggest: 0 },
  ];
  for (const payload of malformed) {
    await t.test(JSON.stringify(payload), async (st) => {
      st.mock.method(globalThis, "fetch", async () => Response.json(payload));
      await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => {
        assert.ok(error instanceof ChatRequestError);
        assert.equal(error.message, "답변을 확인하지 못했어요. 다시 시도해 주세요.");
        return true;
      });
    });
  }
});

test("JSON이 아닌 성공·실패 응답도 내부 내용을 노출하지 않는다", async (t) => {
  for (const status of [200, 500]) {
    await t.test(String(status), async (st) => {
      st.mock.method(globalThis, "fetch", async () => new Response("<html>internal detail</html>", { status }));
      await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => {
        assert.ok(error instanceof ChatRequestError);
        assert.ok(!error.message.includes("internal"));
        assert.equal(error.crisis, false);
        assert.equal(error.suggest, false);
        return true;
      });
    });
  }
});

test("네트워크 오류는 내부 오류 대신 기본 안내와 false 상태를 반환한다", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("internal network detail");
  });

  await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => {
    assert.ok(error instanceof ChatRequestError);
    assert.equal(error.message, "대화를 이어가지 못했어요. 잠시 후 다시 시도해 주세요.");
    assert.equal(error.crisis, false);
    assert.equal(error.suggest, false);
    return true;
  });
});

test("진행 중인 요청의 취소 신호와 AbortError를 그대로 전달한다", async (t) => {
  const controller = new AbortController();
  const abortError = new DOMException("요청 취소", "AbortError");
  t.mock.method(globalThis, "fetch", (_input: Parameters<typeof fetch>[0], init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    assert.equal(init?.signal, controller.signal);
    init?.signal?.addEventListener("abort", () => reject(abortError), { once: true });
  }));

  const pending = requestChat(messages, "찬준", controller.signal);
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error === abortError);
});

test("응답 본문을 읽는 중의 취소도 일반 오류로 바꾸지 않는다", async (t) => {
  const abortError = new DOMException("본문 읽기 취소", "AbortError");
  const response = Response.json({ reply: "답변", crisis: false, suggest: false });
  t.mock.method(response, "json", async () => { throw abortError; });
  t.mock.method(globalThis, "fetch", async () => response);

  await assert.rejects(requestChat(messages, "찬준"), (error: unknown) => error === abortError);
});
