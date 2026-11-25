import test from "node:test";
import assert from "node:assert/strict";
import { devToolsVisible } from "./deploy-env.ts";

test("개발·테스트용 기능은 운영에서만 숨긴다", () => {
  assert.equal(devToolsVisible("production"), false);
  assert.equal(devToolsVisible("preview"), true, "here-dev는 Preview라 보인다");
  assert.equal(devToolsVisible("development"), true);
  assert.equal(devToolsVisible(undefined), true);
});
