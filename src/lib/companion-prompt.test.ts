import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { companionConversationPrompt, homeEntryGreetingPrompt } from "./companion-prompt.ts";
import { DEFAULT_COMPANION } from "./onboarding.ts";

test("채팅·음성·홈 인사는 지정 이름만 정체성으로 사용한다", () => {
  for (const name of ["보리", "Joy", "하루"]) {
    for (const prompt of [companionConversationPrompt(name, "chat"), companionConversationPrompt(name, "voice"), homeEntryGreetingPrompt(name)]) {
      assert.ok(prompt.startsWith(`너의 이름은 "${name}"`));
      assert.ok(!prompt.includes(DEFAULT_COMPANION));
      assert.match(prompt, /사용자의 이름이 아니야/);
    }
  }
});

test("이름 미설정·빈 값은 기본 이름, 이름의 구문 문자는 제거한다", () => {
  for (const name of [undefined, "", "  ", "<>\n"]) {
    assert.ok(homeEntryGreetingPrompt(name).startsWith(`너의 이름은 "${DEFAULT_COMPANION}"`));
    for (const mode of ["chat", "voice"] as const) {
      assert.ok(companionConversationPrompt(name, mode).startsWith(`너의 이름은 "${DEFAULT_COMPANION}"`));
    }
  }
  assert.ok(homeEntryGreetingPrompt('Joy"\n<>').startsWith('너의 이름은 "Joy"'));
});

test("공통 말투는 강제 질문을 없애고 기억 예시와 실제 사실을 구분한다", () => {
  for (const mode of ["chat", "voice"] as const) {
    const prompt = companionConversationPrompt("보리", mode);
    assert.match(prompt, /질문 없이 반응만 하고 끝내도 돼/);
    assert.match(prompt, /실제 사용자 정보가 아니야/);
    assert.match(prompt, /실제 대화나 조회된 기억만 사용해/);
    assert.match(prompt, /정해진 인사를 먼저 하지 마/);
    assert.doesNotMatch(prompt, /한 가지만 부드럽게 물어봐/);
  }
  assert.match(companionConversationPrompt("보리", "voice"), /지나치게 천천히 말하지 마/);
});

test("각 요청 경로가 같은 이름·말투 빌더를 사용하며 안전 규칙을 유지한다", () => {
  const chat = readFileSync(new URL("./chat-server.ts", import.meta.url), "utf8");
  const voice = readFileSync(new URL("../app/api/realtime/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("./realtime.ts", import.meta.url), "utf8");
  assert.match(chat, /companionConversationPrompt\(name, "chat"\)/);
  assert.match(voice, /companionConversationPrompt\(name, "voice"\)/);
  assert.match(client, /homeEntryGreetingPrompt\(persona.name\)/);
  assert.doesNotMatch(voice, /너는 "몽글이"|"몽글이" 대신/);
  for (const source of [chat, voice]) {
    assert.match(source, /진단하지 마/);
    assert.match(source, /show_crisis_help/);
    assert.match(source, /show_get_help/);
  }
});
