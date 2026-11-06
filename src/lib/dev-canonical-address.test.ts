import test from "node:test";
import assert from "node:assert/strict";
import { devCanonicalAddress } from "./dev-canonical-address.ts";

const dev = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "dev" };
test("dev 임시 배포와 브랜치 주소는 고정 주소로 이동", () => {
  for (const host of ["here-brj8u4qux-here23.vercel.app", "here-git-dev-here23.vercel.app"]) {
    assert.equal(devCanonicalAddress(`https://${host}/?from=team`, "GET", dev), "https://here-dev.vercel.app/?from=team");
  }
});
test("고정 주소·운영·기능 브랜치·로컬에는 리다이렉트 없음", () => {
  for (const host of ["here-dev.vercel.app", "here-prod.vercel.app", "localhost:3010", "unrelated.vercel.app"]) {
    assert.equal(devCanonicalAddress(`https://${host}/`, "GET", dev), null);
  }
  for (const env of [{}, { ...dev, VERCEL_ENV: "production" }, { ...dev, VERCEL_GIT_COMMIT_REF: "feature/test" }]) {
    assert.equal(devCanonicalAddress("https://here-test-here23.vercel.app/", "GET", env), null);
  }
});
test("API와 POST는 다른 호스트로 전달하지 않음", () => {
  assert.equal(devCanonicalAddress("https://here-test-here23.vercel.app/api/chat", "GET", dev), null);
  assert.equal(devCanonicalAddress("https://here-test-here23.vercel.app/", "POST", dev), null);
});
