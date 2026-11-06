import test from "node:test";
import assert from "node:assert/strict";
import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { migrateAuthCookie } from "./auth-cookie-migration.ts";

const url = "https://test.supabase.co";
const key = "sb-test-auth-token";
function fixture() {
  const jar = new Map<string, string>();
  const local = new Map<string, string>();
  const document = {
    get cookie() { return [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; "); },
    set cookie(value: string) { const c = parseCookieHeader(value.split(";")[0])[0]; jar.set(c.name, c.value); },
  };
  const storage = { getItem: (k: string) => local.get(k) ?? null, setItem: (k: string, v: string) => { local.set(k, v); }, removeItem: (k: string) => { local.delete(k); } };
  return { jar, local, document, storage };
}
test("기존 로그인 이전 후 로그아웃된 쿠키를 옛 토큰으로 되살리지 않음", () => {
  const f = fixture();
  const raw = JSON.stringify({ access_token: "synthetic-access", refresh_token: "synthetic-refresh" });
  f.local.set(key, raw);
  migrateAuthCookie(url, f.document, f.storage, true);
  assert.equal(f.local.has(key), false);
  assert.ok(f.jar.has(key));
  f.jar.clear(); f.local.set(key, raw); // A stale tab has written the old value.
  migrateAuthCookie(url, f.document, f.storage, true);
  assert.equal(f.jar.size, 0);
});
test("쿠키 저장 불가 시 기존 세션을 삭제하지 않음", () => {
  const f = fixture();
  f.local.set(key, JSON.stringify({ access_token: "synthetic", refresh_token: "synthetic" }));
  const blocked = { get cookie() { return ""; }, set cookie(_v: string) {} };
  migrateAuthCookie(url, blocked, f.storage, true);
  assert.ok(f.local.has(key));
});
test("실제 Supabase SDK: 만료된 세션을 새 서버 요청에서 갱신, 재접속에도 SMS 불필요", async () => {
  const f = fixture();
  const user = { id: "synthetic-user", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" };
  f.local.set(key, JSON.stringify({ access_token: "expired-synthetic", refresh_token: "refresh-synthetic", expires_at: 1, token_type: "bearer", user }));
  migrateAuthCookie(url, f.document, f.storage, true);
  const paths: string[] = [];
  let writes = 0;
  const fresh = () => createServerClient(url, "test-publishable-key", {
    global: { fetch: async (input) => {
      const path = new URL(String(input)).pathname; paths.push(path);
      if (path.endsWith("/token")) return Response.json({ access_token: "renewed-synthetic", refresh_token: "rotated-synthetic", expires_in: 3600, token_type: "bearer", user });
      assert.ok(path.endsWith("/user"));
      return Response.json(user);
    } },
    cookies: {
      getAll: () => [...f.jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies, headers) => {
        writes++;
        assert.match(headers["Cache-Control"] ?? "", /no-store/);
        for (const c of cookies) { if (c.options.maxAge === 0) f.jar.delete(c.name); else f.jar.set(c.name, c.value); }
      },
    },
  });
  assert.equal((await fresh().auth.getUser()).data.user?.id, user.id);
  assert.ok(writes > 0);
  assert.equal((await fresh().auth.getUser()).data.user?.id, user.id);
  assert.equal(paths.filter(p => p.endsWith("/token")).length, 1);
  assert.equal(paths.some(p => /otp|verify/.test(p)), false);
});
