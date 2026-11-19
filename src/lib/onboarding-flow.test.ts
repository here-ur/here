import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ONBOARDING_STEPS, PROMISE_REPLY, STAGE_NOTICE, STAGE_OPEN, STAGE_SCENES, sceneOfStep, stepOfScene } from "./onboarding.ts";

// 캐릭터 만나기는 1번 톤 무대가 그린다: 값은 app/Onboarding.tsx, 무대를 세우는 일은 app/OnboardingStage.tsx,
// 장면·동작은 public/onboarding의 스크립트가 맡는다. 여기서는 그 셋이 지켜야 할 약속을 글자로 확인한다.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const component = read("../app/Onboarding.tsx");
const stage = read("../app/OnboardingStage.tsx");
const frame = read("../app/FirstRun.tsx");
const css = read("../app/first-run.css");
const engine = (name: string) => read(`../../public/onboarding/${name}`);
const block = (source: string, from: string, to?: string) => source.slice(source.indexOf(from), to ? source.indexOf(to) : undefined);
const loaded = (list: string) => [...(stage.match(new RegExp(`const ${list} = \\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

test("캐릭터 만나기는 만남에서 AI라고 밝히고, 시작 전 약속(AI·기록·109)을 보여 준 뒤, 이름 짓기에서만 끝난다", () => {
  assert.deepEqual([...STAGE_SCENES], ["open", "promise", "name", "q1", "q2", "q3", "q4", "meet", "naming"]);
  assert.deepEqual([...ONBOARDING_STEPS], ["promise", "name", "q1", "q2", "q3", "q4", "meet", "summary", "naming"]);
  // 첫 화면: 고양이가 AI라고 밝히고, 서비스가 풀어서 한 번 더 알린다.
  assert.match(STAGE_OPEN.line, /나 AI야/);
  assert.match(STAGE_OPEN.note, /사람이 아니라 AI와 이야기/);
  // 시작 전 약속: AI · 기록 · 109. 카드는 서비스 말투이고, 고양이 말투는 '알겠어요' 뒤의 한마디뿐이다.
  const notice = STAGE_NOTICE.items.map((item) => `${item.title} ${item.desc}`).join("\n");
  assert.match(notice, /AI예요/);
  assert.match(notice, /진단과 치료는 사람 전문가가 해요/);
  assert.match(notice, /원문은 이 기기에, 동의한 기억은 계정에 둬요/);
  assert.match(notice, /109/);
  assert.doesNotMatch(notice, /…|흥|든가/);
  assert.equal(STAGE_NOTICE.reply, PROMISE_REPLY);
  // 무대는 약속 장면을 알림만 모드로 올리고(동의 칸 없음), 109는 진짜 전화 링크다.
  assert.match(stage, /copy\.notice = \{ \.\.\.STAGE_NOTICE,/);
  assert.match(engine("scenes/promise.js"), /const N = C\.notice \|\| null;/);
  assert.match(engine("scenes/promise.js"), /call\.href = "tel:109"/);
  // 올린 장면: 약속 · 질문 2 · 질문 4 · 데려가기(만남 · 내 이름 · 질문 1 · 질문 3 · 이름 짓기는 phone.js 안에 있다). 생일 · 성별은 아직 올리지 않았다.
  assert.deepEqual(loaded("SCRIPTS"), ["copy.js", "cat.js", "sound.js", "phone.js", "scenes/promise.js", "scenes/q2.js", "scenes/q4.js", "scenes/meet.js"]);
  for (const name of loaded("SCRIPTS")) assert.ok(engine(name).length > 0, name);
  for (const name of loaded("STYLES")) assert.ok(engine(name).length > 0, name);
  // onDone을 부르는 곳은 마지막 버튼을 받는 finish 하나뿐이다.
  assert.equal(component.match(/\bonDone\(/g)?.length, 1);
  assert.match(block(component, "function finish(", "return <OnboardingStage"), /onDone\(\{/);
  // 처음 꾸미기는 라벤더 자리와 marin 목소리로 시작한다.
  assert.match(component, /const START_COLOR: ColorId = "lavender";/);
  assert.match(component, /const START_VOICE: VoiceId = "marin";/);
  assert.match(block(component, "function finish(", "return <OnboardingStage"), /color: START_COLOR, voice: START_VOICE/);
});

test("많이 힘들다고 고르면 그 자리에서, 그리고 데려가기 장면에서 109를 바로 보여 준다", () => {
  assert.match(engine("copy.js"), /TOUGH: "많이 힘들어요"/);
  assert.match(engine("copy.js"), /toughDesc: "많이 힘든 날엔 사람과 바로 이야기할 수도 있어요\."/);
  // 질문 1(phone.js)과 데려가기(meet.js) 모두 진짜 전화 링크를 쓴다.
  assert.match(engine("phone.js"), /tel:109/);
  assert.match(engine("phone.js"), /C\.TOUGH/);
  assert.match(engine("scenes/meet.js"), /tel:109/);
  assert.match(engine("scenes/meet.js"), /C\.TOUGH/);
  assert.match(engine("scenes/meet.js"), /toughDesc/);
});

test("들은 것 정리에서 '맞아요'면 이름 짓기로, '조금 달라요'면 질문 1부터 다시 고른다", () => {
  assert.match(stage, /copy\.summary = \(nickname, answers\) => summaryLine\(nickname, answers\);/);
  const meet = engine("scenes/meet.js");
  assert.match(meet, /C\.summary\(nickname, answers\)/);
  assert.match(meet, /ctx\.go\("q1", undefined, no\)/);
  assert.match(meet, /ctx\.next\(/);
});

test("마지막 버튼 뒤에는 그 화면에 머물며 저장 중·실패·다시 저장을 버튼에서 보여 준다", () => {
  // 무대: 앱이 저장하는 동안 마지막 화면에 머물고, 버튼의 진행·실패 표시를 넘긴다.
  assert.match(engine("phone.js"), /if \(onFinish\) \{ onFinish\(\{ \.\.\.snapshot\(\), scene: "done" \}, finishing\(from, sceneEl\)\); return; \}/);
  assert.match(engine("phone.js"), /n = el\("p", "hp-fail"\); n\.setAttribute\("role", "alert"\);/);
  assert.match(stage, /if \(saving\) control\.busy\(true\);\s*else if \(saveError\) control\.fail\(saveError, "다시 저장"\);/);
  // 두 번 눌러도 onDone은 한 번, 실패한 뒤에는 같은 버튼으로 다시 저장한다.
  const finish = block(component, "function finish(", "return <OnboardingStage");
  assert.match(finish, /if \(saving\) return;\s*if \(saveError\) \{ onRetry\?\.\(\); return; \}\s*if \(finished\.current\) return;/);
  // 고양이 이름은 무대의 기본 이름으로 시작하고, 지은 뒤의 첫마디가 다르다.
  assert.match(stage, /copy\.naming\.defaultName = DEFAULT_COMPANION;/);
  assert.match(engine("copy.js"), /"이름\? …없어\. 네 맘대로 해\."/);
});

test("하던 자리를 이 탭에 남기고 되살리며, 미리보기(initialStep)에서는 쓰지 않는다", () => {
  assert.match(component, /useState\(\(\) => \(preview \? null : loadOnboardingDraft\(\)\)\)/);
  assert.match(component, /sceneOfStep\(initialStep \?\? draft\?\.step \?\? "promise", preview\)/);
  assert.match(component, /if \(preview \|\| finished\.current \|\| snapshot\.scene === "done"\) return;\s*saveOnboardingDraft\(/);
  assert.match(block(component, "function finish(", "return <OnboardingStage"), /if \(!preview\) clearOnboardingDraft\(\);/);
  // 처음이면 만남부터, 미리보기에서는 약속 장면을 바로, 들은 것 정리는 데려가기의 끝 상태로 연다.
  assert.deepEqual(sceneOfStep("promise"), { scene: "open" });
  assert.deepEqual(sceneOfStep("promise", true), { scene: "promise" });
  assert.deepEqual(sceneOfStep("summary"), { scene: "meet", state: "heard" });
  for (const step of ONBOARDING_STEPS) assert.ok((STAGE_SCENES as readonly string[]).includes(sceneOfStep(step).scene), step);
  // 무대의 장면은 모두 하던 자리로 바뀌고, 모르는 장면은 처음으로 돌아간다.
  assert.equal(stepOfScene("open"), "promise");
  for (const scene of STAGE_SCENES) assert.ok((ONBOARDING_STEPS as readonly string[]).includes(stepOfScene(scene)), scene);
  assert.equal(stepOfScene("done"), "promise");
  // 무대가 넘긴 값 가운데 질문의 선택지에 있는 답만 남긴다.
  assert.match(component, /if \(typeof value === "string" && \(q\.options as readonly string\[\]\)\.includes\(value\)\) answers\[q\.id\] = value;/);
});

test("고양이의 말은 건너뛸 수 없고, 화면 낭독기도 읽는다", () => {
  // 줄이 적히는 중에 버튼을 누르면 그 줄만 끝까지 보이고, 잠깐은 넘어가지 않는다.
  assert.match(engine("phone.js"), /speech\(hold = 420\)/);
  for (const name of ["scenes/promise.js", "scenes/q2.js", "scenes/q4.js", "scenes/meet.js"]) assert.match(engine(name), /ui\.speech\(\)/, name);
  assert.match(engine("phone.js"), /live\.setAttribute\("role", "status"\); live\.setAttribute\("aria-live", "polite"\);/);
});

test("소리 버튼은 이름을 그대로 두고 눌림 상태로 꺼졌는지 알리고, 앱의 효과음 설정과 같은 값을 쓴다", () => {
  const toggle = frame.slice(frame.indexOf("export function SoundToggle"), frame.indexOf("export function FirstRunHeading"));
  assert.match(toggle, /aria-pressed=\{muted\} aria-label="소리 끄기"/);
  assert.ok(!toggle.includes("소리 켜기"));
  // 무대의 스피커 버튼도 같은 방식이다.
  assert.match(engine("phone.js"), /snd\.setAttribute\("aria-label", "소리 끄기"\)/);
  assert.match(engine("phone.js"), /snd\.setAttribute\("aria-pressed", String\(!on\)\)/);
  assert.ok(!engine("phone.js").includes("소리 켜기"));
  assert.match(stage, /window\.HereSoundKey = SFX_KEY;/);
  assert.match(stage, /window\.HereSound\?\.onChange\(\(on\) => setSfxEnabled\(on\)\)/);
});

test("무대는 앱의 스타일과 섞이지 않게 섀도 루트 안에 서고, 동작 줄이기를 따른다", () => {
  assert.match(stage, /node\.shadowRoot \?\? node\.attachShadow\(\{ mode: "open" \}\)/);
  assert.match(stage, /api\?\.destroy\(\);/);
  assert.match(engine("phone.js"), /prefers-reduced-motion/);
  assert.match(engine("phone.css"), /prefers-reduced-motion: reduce/);
  // 무대의 스타일은 모두 .hp 아래에만 닿는다(화면 고정·뷰포트 단위를 쓰지 않는다).
  for (const name of loaded("STYLES")) {
    const sheet = engine(name);
    assert.doesNotMatch(sheet, /position:\s*fixed/, name);
    assert.doesNotMatch(sheet, /\d(vw|vh|dvh|svh)\b/, name);
  }
});

// WCAG 상대 휘도 대비
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const token = (name: string) => css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1] ?? "";
const colorOf = (selector: string) => {
  const rule = css.match(new RegExp(`${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{[^}]*?[^-]color:\\s*([^;]+);`))?.[1].trim() ?? "";
  const ref = rule.match(/^var\((--[\w-]+)\)$/);
  return ref ? token(ref[1]) : rule;
};

test("첫 실행의 작은 회색 글씨는 흰 시트와 크림 배경에서 4.5:1, 빈 체크 상자는 3:1을 넘는다", () => {
  // 흰 시트, 크림 장면의 가장 진한 곳들, 동의 카드
  const backgrounds = ["#FFFFFF", "#FFEBD6", "#FFF6EC", "#FFF2E4", "#FEE9D8", "#F7F4EF"];
  const colors = {
    "--fr-muted": token("--fr-muted"),
    "--fr-faint": token("--fr-faint"),
    ".fr-req": colorOf(".fr-req"),
    ".fr-more": colorOf(".fr-more"),
    ".fr-fineprint": colorOf(".fr-fineprint"),
  };
  for (const [name, color] of Object.entries(colors)) {
    assert.match(color, /^#[0-9A-Fa-f]{6}$/, name);
    for (const bg of backgrounds) assert.ok(contrast(color, bg) >= 4.5, `${name} ${color} on ${bg}: ${contrast(color, bg).toFixed(2)}`);
  }
  const box = token("--f7-checkbox-inactive-color");
  assert.ok(contrast(box, "#F7F4EF") >= 3, `checkbox ${box}: ${contrast(box, "#F7F4EF").toFixed(2)}`);
});
