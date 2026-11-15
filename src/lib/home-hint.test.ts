import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homeHintSeen, markHomeHintSeen } from "./home-hint.ts";

test("홈 첫 방문 안내는 한 번 보면 저장소가 없어도 같은 탭에서 다시 보이지 않는다", () => {
  assert.equal(homeHintSeen(), false);
  markHomeHintSeen();
  assert.equal(homeHintSeen(), true);
});

test("홈 첫 방문 안내는 글·음성·메뉴를 열거나 안내를 누르면 닫히고, 고양이 말투를 쓰지 않는다", () => {
  const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /nudge=\{showHint/);
  for (const opener of ["function openText()", "function toVoice()"]) {
    const body = page.slice(page.indexOf(opener), page.indexOf("}", page.indexOf(opener)));
    assert.match(body, /dismissHint\(\)/, opener);
  }
  assert.match(page, /onMenu=\{\(\) => \{ dismissHint\(\);/);
  assert.match(page, /<HomeHint name=\{profile\.companion\} onDismiss=\{dismissHint\} \/>/);
  const hint = readFileSync(new URL("../app/HomeHint.tsx", import.meta.url), "utf8");
  // 닫으면 안내가 가리키던 마이크 버튼으로 포커스를 옮긴다.
  assert.match(hint, /onDismiss\(\);\s*mic\?\.focus/);
  assert.match(hint, /에게 말을 걸어 보세요/);
  assert.match(hint, /마이크는 목소리로, 말풍선은 글로 이야기해요/);
});
