import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ONBOARDING_STEPS } from "./onboarding.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const component = read("../app/Onboarding.tsx");
const frame = read("../app/FirstRun.tsx");
const css = read("../app/first-run.css");
const block = (from: string, to?: string) => component.slice(component.indexOf(from), to ? component.indexOf(to) : undefined);

test("캐릭터 만나기는 시작 전 약속(AI·기록·109)부터 보여 주고, 이름 짓기에서만 끝난다", () => {
  assert.equal(ONBOARDING_STEPS[0], "promise");
  assert.deepEqual([...ONBOARDING_STEPS], ["promise", "name", "q1", "q2", "q3", "q4", "meet", "summary", "naming"]);
  const promise = block('case "promise"', 'case "name"');
  assert.match(promise, /href="tel:109"/);
  assert.match(promise, /AI예요/);
  assert.match(promise, /진단과 치료는 사람 전문가가 해요/);
  assert.match(promise, /원문은 이 기기에, 동의한 기억은 계정에 둬요/);
  // 약속 장면의 안내 카드는 서비스 말투다(고양이 말투는 제목 한 줄뿐).
  assert.doesNotMatch(block("<List", "</List>"), /…|흥|든가/);
  // finish(onDone)를 부르는 곳은 마지막 이름 짓기 장면 하나뿐이다.
  const uses = [...component.matchAll(/\bfinish\b/g)].map((m) => m.index);
  const definition = component.indexOf("function finish()");
  const start = component.indexOf('case "naming"');
  assert.ok(uses.length >= 2);
  for (const at of uses) assert.ok(at === definition + "function ".length || at > start, `finish를 이름 짓기 밖에서 부른다: ${at}`);
  // 처음 꾸미기는 라벤더 자리와 marin 목소리로 시작한다.
  assert.match(component, /const START_COLOR: ColorId = "lavender";/);
  assert.match(component, /const START_VOICE: VoiceId = "marin";/);
  assert.match(block("function finish()", "// 나갈 때는"), /onDone\(\{[^}]*color: START_COLOR, voice: START_VOICE/);
});

test("많이 힘들다고 고르면 데려가기 장면에서 109를 바로 보여 주고, 고치러 왔어도 그 장면을 다시 거친다", () => {
  const meet = block('case "meet"', 'case "summary"');
  assert.match(meet, /meet\.tough && <a href="tel:109"/);
  assert.match(meet, /meet\.tough \? "많이 힘든 날엔 사람과 바로 이야기할 수도 있어요\."/);
  assert.match(component, /return fixing && !meetLine\(nextAnswers\)\.tough \? "summary" : "meet";/);
});

test("들은 것 정리에서 '맞아요'면 이름 짓기로, '조금 달라요'면 질문 1부터 다시 고른다", () => {
  const summary = block('case "summary"', 'case "naming"');
  assert.match(summary, /description=\{summaryLine\(name, answers\)\}/);
  assert.match(summary, /say\(SUMMARY_YES_REPLY, "naming"\)/);
  assert.match(summary, /say\(SUMMARY_FIX_REPLY, "q1"\)\) setFixing\(true\)/);
});

test("이름 짓기 버튼 뒤에는 그 화면에 머물며 저장 중·실패·다시 저장을 버튼에서 보여 준다", () => {
  const naming = block('case "naming"');
  assert.match(naming, /loading=\{saving\}/);
  assert.match(naming, /role="alert" className="fr-error"/);
  assert.match(naming, /if \(saveError\) onRetry\?\.\(\); else if \(companion\.trim\(\)\) finish\(\);/);
  assert.match(naming, /\{saveError \? "다시 저장" : "이 이름으로 할게요"\}/);
  // 고양이 이름은 미리 채우지 않고, 짓기 전과 뒤의 첫마디가 다르다.
  assert.match(component, /useState\(draft\?\.companion \?\? ""\)/);
  assert.match(naming, /"이름\? …없어\. 네 맘대로 해\."/);
  // 두 번 눌러도 onDone은 한 번, 저장 중·실패 뒤에는 뒤로 가지 않는다.
  assert.match(block("function finish()", "// 나갈 때는"), /if \(finished\.current \|\| saving\) return;/);
  assert.match(component, /onBack=\{step === "promise" \|\| locked \? undefined : back\}/);
});

test("하던 자리를 이 탭에 남기고 되살리며, 미리보기(initialStep)에서는 쓰지 않는다", () => {
  assert.match(component, /useState\(\(\) => \(preview \? null : loadOnboardingDraft\(\)\)\)/);
  assert.match(component, /useState<Step>\(initialStep \?\? draft\?\.step \?\? "promise"\)/);
  assert.match(component, /if \(preview \|\| finished\.current\) return;\s*saveOnboardingDraft\(/);
  assert.match(block("function finish()", "// 나갈 때는"), /if \(!preview\) clearOnboardingDraft\(\);/);
});

test("고양이가 받아치는 동안과 흐려지며 나가는 동안에는 답이 다시 눌리지 않고, 다음 장면이 나타난 뒤에야 고를 수 있다", () => {
  assert.match(component, /function say\([^\n]*\{\s*if \(advancing\.current \|\| leavingRef\.current\) return false;/);
  assert.match(component, /function answer\([^\n]*\{\s*if \(advancing\.current \|\| leavingRef\.current\) return;/);
  assert.match(component, /const arrive = \(\) => \{\s*setStep\(next\);\s*setReply\(""\);\s*advancing\.current = false;/);
  assert.equal(component.match(/advancing\.current = false/g)?.length, 1);
  assert.match(component, /leaving\s*\? "pointer-events-none motion-safe:animate-screen-out"/);
  // 받아친 말은 화면 낭독기도 읽는다.
  assert.match(component, /<p className="fr-reply" role="status" aria-live="polite">\{reply\}<\/p>/);
});

test("장면이 바뀌면 새 제목으로 포커스를 옮기고, 입력 폼도 들어오는 움직임을 받는다", () => {
  // 질문 1~4는 제목 하나를 같이 쓴다.
  const headings = component.match(/<FirstRunHeading\b[^>]*>/g) ?? [];
  assert.equal(headings.length, ONBOARDING_STEPS.length - 3);
  for (const heading of headings) assert.match(heading, /\bfocusOnMount\b/);
  assert.match(frame, /tabIndex=\{focusOnMount \? -1 : undefined\}/);
  assert.match(frame, /focus\(\{ preventScroll: true \}\)/);
  assert.ok(!component.includes('className="contents"'));
});

test("소리 버튼은 이름을 그대로 두고 눌림 상태로 꺼졌는지 알린다", () => {
  const toggle = frame.slice(frame.indexOf("export function SoundToggle"), frame.indexOf("export function FirstRunHeading"));
  assert.match(toggle, /aria-pressed=\{muted\} aria-label="소리 끄기"/);
  assert.ok(!toggle.includes("소리 켜기"));
});

test("동작 줄이기에서도 꾹 누르는 고리는 누르는 시간만큼 차오른다", () => {
  const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.ok(!/\.fr-hold-ring\s*[,{][^}]*transition:\s*none/.test(reduce));
  assert.match(reduce, /\.app-frame \.fr-hold-ring\[data-holding\] \{ transition-duration: var\(--fr-hold-ms[^)]*\) !important; \}/);
  assert.match(component, /data-holding=\{holding \|\| undefined\} style=\{\{ "--fr-hold-ms": `\$\{HOLD_MS\}ms` \}/);
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
