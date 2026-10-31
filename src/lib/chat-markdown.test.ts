import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown, markdownUrl } from "./chat-markdown.ts";

const render = (content: string) => renderToStaticMarkup(createElement(ChatMarkdown, { content }));

test("마크다운 강조·목록·표·코드를 실제 요소로 렌더링한다", () => {
  const html = render("**아줄**, **따뜻한 보리차**\n\n- 첫 항목\n- 둘째 항목\n\n| 이름 | 종류 |\n| --- | --- |\n| 아줄 | 게임 |\n\n```js\nconst a = 1;\n```");
  assert.match(html, /<strong>아줄<\/strong>/);
  assert.match(html, /<strong>따뜻한 보리차<\/strong>/);
  assert.match(html, /<ul>/); assert.match(html, /<li>첫 항목<\/li>/);
  assert.match(html, /<table>/); assert.match(html, /<pre><code/);
  assert.doesNotMatch(html, /\*\*아줄/);
});

test("원시 HTML·스크립트 URL·원격 이미지 요청을 차단한다", () => {
  const html = render('<script>alert(1)</script>\n\n[클릭](javascript:alert%281%29) ![사진](https://tracker.example/pixel)\n\n[문서](https://example.com)');
  assert.doesNotMatch(html, /<script|javascript:|<img|tracker\.example/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /referrerPolicy="no-referrer"/i);
  for (const url of ["javascript:alert(1)", "data:text/html,test", "//example.com", "https://user:pass@example.com"]) assert.equal(markdownUrl(url), "");
});

test("한국어·줄바꿈·불완전 문법도 내용을 잃지 않는다", () => {
  const html = render("첫 줄\n둘째 줄\n\n**아직 완성 중");
  assert.match(html, /첫 줄\n둘째 줄/);
  assert.match(html, /아직 완성 중/);
});
