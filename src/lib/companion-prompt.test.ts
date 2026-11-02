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
  assert.match(client, /homeEntryGreetingPrompt\(persona.name, options.opener\)/);
  assert.doesNotMatch(voice, /너는 "몽글이"|"몽글이" 대신/);
  for (const source of [chat, voice]) {
    assert.match(source, /진단하지 마/);
    assert.match(source, /show_crisis_help/);
    assert.match(source, /show_get_help/);
  }
});

test("음성 인사는 화면 문구만 읽고 별도 질문이나 자기소개를 붙이지 않는다", () => {
  const prompt = homeEntryGreetingPrompt("보리", "너와 친해지고 싶어!\n너에 대해 알려줘.");
  assert.match(prompt, /너와 친해지고 싶어! 너에 대해 알려줘\./);
  assert.match(prompt, /이 문구만 한 번 말해/);
  assert.doesNotMatch(prompt, /오늘은 어떤 하루였어/);
});

test("편한 어미·짧은 반응·상황에 맞는 웃음을 허용하되 정직함은 유지한다", () => {
  for (const mode of ["chat", "voice"] as const) {
    const prompt = companionConversationPrompt("보리", mode);
    assert.match(prompt, /웃음·감탄사·유행어·이모지는 상황에 맞게 써도 돼/);
    assert.match(prompt, /"발표 준비하던 거\?"/);
    assert.match(prompt, /모든 문장을 같은 어미나 물음표로 끝내지 마/);
    assert.match(prompt, /이름만 물으면 이름만 답해/);
    assert.match(prompt, /AI: 보리!/);
    assert.match(prompt, /AI: 웅, 말해 봐/);
    assert.match(prompt, /AI인지 물으면 솔직하게 답해/);
    assert.match(prompt, /긴급한 안전 대응은 예외야/);
    assert.doesNotMatch(prompt, /과한 감탄·칭찬·유행어·귀여운 말투는 피해야 해/);
    assert.doesNotMatch(prompt, /AI: 응\. 해결하려고 안 할게/);
  }
});

test("깊은 고민은 구체적 맥락·선택권·안전을 다루며 맞장구는 웅을 쓴다", () => {
  for (const mode of ["chat", "voice"] as const) {
    const prompt = companionConversationPrompt("보리", mode);
    assert.match(prompt, /편한 말투와 얕은 답변은 달라/);
    assert.match(prompt, /확인되는 사실과 사용자가 붙인 해석을 구분/);
    assert.match(prompt, /사용자가 아니라고 하면 해석을 거두/);
    assert.match(prompt, /결과를 보장하거나 무조건 편들지 마/);
    assert.match(prompt, /결정권은 사용자에게/);
    assert.match(prompt, /듣기만 원하면 과제·체크리스트·행동 요구를 붙이지 마/);
    assert.match(prompt, /폭력·협박·통제·즉각적인 위험/);
    assert.match(prompt, /피해자의 사과나 말투 책임을 언급하지 마/);
    assert.match(prompt, /"응" 대신 "웅"/);
    assert.doesNotMatch(prompt, /AI: 응[,! .]/);
    assert.match(prompt, /사용자 사실이나 만능 답변으로 재사용하지 마/);
  }
});
