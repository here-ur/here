import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail, emailAuthError, socialSignInUrl } from "./social-auth.ts";

const config = { url: "https://auth.example", key: "publishable-test-key" };
test("이메일 주소의 바깥 공백만 제거하고 비정상 주소는 거절한다", () => {
  assert.equal(normalizeEmail("  Name+here@example.com  "), "Name+here@example.com");
  for (const value of ["", "here", "hello @example.com", "a@@example.com", "a@host", "a".repeat(255) + "@example.com"]) assert.equal(normalizeEmail(value), null);
});
test("미설정 공급자는 OAuth로 이동하지 않고 앱 안에서 안내한다", async () => {
  const client = { auth: { signInWithOAuth: () => { throw new Error("must not call"); } } } as unknown as SupabaseClient;
  const fetcher = (async () => new Response(JSON.stringify({ external: { google: false } }))) as typeof fetch;
  await assert.rejects(socialSignInUrl(client, "google", "http://localhost:3000", config, fetcher), /구글 로그인을 준비 중/);
});
test("OAuth 콜백은 시작한 origin 안에 고정하고 PKCE URL만 돌려준다", async () => {
  const client = { auth: { signInWithOAuth: async (options: unknown) => {
    assert.deepEqual(options, { provider: "kakao", options: { redirectTo: "http://localhost:3000/auth/callback", skipBrowserRedirect: true, queryParams: { scope: "profile_nickname profile_image" } } });
    return { data: { url: "https://auth.example/auth/v1/authorize" }, error: null };
  } } } as unknown as SupabaseClient;
  const fetcher = (async (url, options) => {
    assert.equal(url, "https://auth.example/auth/v1/settings");
    assert.deepEqual(options?.headers, { apikey: config.key });
    return new Response(JSON.stringify({ external: { kakao: true } }));
  }) as typeof fetch;
  assert.equal(await socialSignInUrl(client, "kakao", "http://localhost:3000", config, fetcher), "https://auth.example/auth/v1/authorize");
});
test("설정 조회 장애를 공급자 비활성으로 오인하지 않는다", async () => {
  const client = {} as SupabaseClient;
  const fetcher = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
  await assert.rejects(socialSignInUrl(client, "google", "http://localhost:3000", config, fetcher), /확인하지 못했어요/);
});
test("이메일 인증 오류는 만료, 전송 설정, 요청 제한을 구분한다", () => {
  assert.match(emailAuthError({ code: "otp_expired" }, "verify"), /만료/);
  assert.match(emailAuthError({ status: 429 }, "send"), /요청이 많아요/);
  assert.match(emailAuthError({ code: "email_address_not_authorized" }, "send"), /준비 중/);
  assert.match(emailAuthError({ status: 0 }, "verify"), /연결 상태/);
});

test("구글 로그인은 Google 공급자와 현재 개발 주소의 콜백을 사용한다", async () => {
  const client = { auth: { signInWithOAuth: async (options: unknown) => {
    assert.deepEqual(options, { provider: "google", options: { redirectTo: "https://here-dev.vercel.app/auth/callback", skipBrowserRedirect: true } });
    return { data: { url: "https://auth.example/auth/v1/authorize?provider=google" }, error: null };
  } } } as unknown as SupabaseClient;
  const fetcher = (async () => new Response(JSON.stringify({ external: { google: true } }))) as typeof fetch;
  assert.equal(await socialSignInUrl(client, "google", "https://here-dev.vercel.app", config, fetcher), "https://auth.example/auth/v1/authorize?provider=google");
});
