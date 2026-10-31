import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("동의 화면은 기본 프레임의 clip 대신 전용 스크롤 스타일을 쓴다", () => {
  const component = readFileSync(new URL("../app/MemoryConsentGate.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/app-frame.css", import.meta.url), "utf8");
  assert.match(component, /app-frame app-frame-scrollable/);
  const override = css.match(/\.app-frame\.app-frame-scrollable\s*\{([^}]+)\}/)?.[1];
  assert.ok(override);
  assert.match(override, /overflow-y:\s*auto/);
  assert.match(override, /min-height:\s*0/);
  assert.match(override, /safe-area-inset-bottom/);
  assert.match(css, /\.app-frame\s*\{[^}]*overflow:\s*clip/);
});

test("동의 본문은 기본 접힘이며 체크박스는 접힘 영역 바깥에 둔다", () => {
  const component = readFileSync(new URL("../app/MemoryConsentGate.tsx", import.meta.url), "utf8");
  const disclosures = [...component.matchAll(/<details>([\s\S]*?)<\/details>/g)];
  assert.equal(disclosures.length, 2);
  for (const [, content] of disclosures) {
    assert.match(content, /<summary /);
    assert.ok(!content.includes('type="checkbox"'));
  }
  assert.ok(!/<details\s+open/.test(component));
  assert.match(component, /disabled=\{!privacy \|\| !sensitive \|\| busy\}/);
});
