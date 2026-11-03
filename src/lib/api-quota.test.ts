import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireApiQuota } from "./api-quota.ts";

test("한도 거절은 429·Retry-After, DB 장애/잘못된 응답은 503으로 닫힌다", async () => {
  for (const [data, error, status] of [
    [{ allowed: true, retry_after: 0 }, null, 0],
    [{ allowed: false, retry_after: 42 }, null, 429],
    [null, null, 503], [{ allowed: "yes", retry_after: 0 }, null, 503],
    [{ allowed: true, retry_after: -1 }, null, 503], [null, { message: "secret" }, 503],
  ] as const) {
    const client = { rpc: (name: string, args: unknown) => {
      assert.equal(name, "consume_api_quota"); assert.deepEqual(args, { p_resource: "chat" });
      return { abortSignal: async () => ({ data, error }) };
    } } as unknown as SupabaseClient;
    const result = await requireApiQuota(client, "chat");
    assert.equal(result?.status ?? 0, status);
    if (result) { assert.equal(result.headers.get("Cache-Control"), "no-store"); assert.doesNotMatch(await result.text(), /secret/); }
    if (status === 429) assert.equal(result?.headers.get("Retry-After"), "42");
  }
});

test("PostgreSQL 공유 한도: 회원별 격리·분/일 한도·고정 행·익명/직접 수정 금지", async () => {
  const db = new PGlite();
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const asUser = async (id: string) => { await db.exec("reset role; set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  const take = async () => (await db.query<{ quota: { allowed: boolean; retry_after: number } }>("select public.consume_api_quota('chat') as quota")).rows[0].quota;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      create table public.members(user_id uuid primary key); insert into public.members values('${a}'),('${b}');`);
    await db.exec(readFileSync(new URL("../../supabase/migrations/0004_api_limits.sql", import.meta.url), "utf8"));
    await asUser(a);
    const results = await Promise.all(Array.from({ length: 21 }, take));
    assert.equal(results.filter(r => r.allowed).length, 20);
    assert.ok(results[20].retry_after > 0);
    await assert.rejects(db.query("select * from public.api_usage_windows"), /permission denied/);
    await assert.rejects(db.query("delete from public.api_usage_windows"), /permission denied/);
    await assert.rejects(db.query("select public.consume_api_quota('unlimited')"), /invalid_resource/);
    await asUser(b); assert.equal((await take()).allowed, true);
    await asUser(""); assert.equal((await take()).allowed, false);
    await db.exec("reset role");
    assert.equal((await db.query("select * from public.api_usage_windows")).rows.length, 4);
    await db.query("update public.api_usage_windows set window_start=0 where user_id=$1 and window_seconds=60", [a]);
    await asUser(a); assert.equal((await take()).allowed, true);
    await db.exec("reset role");
    await db.query("update public.api_usage_windows set used=200 where user_id=$1 and window_seconds=86400", [a]);
    await asUser(a); assert.equal((await take()).allowed, false);
    await db.exec("reset role; set role anon");
    await assert.rejects(take(), /permission denied/);
  } finally { await db.close(); }
});

test("비용 발생 API는 회원/동의 확인 뒤 공유 한도를 검사한다", () => {
  for (const route of ["chat", "report-sky", "realtime", "voice-memory", "home-greeting"]) {
    const source = readFileSync(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    const quota = source.indexOf("await requireApiQuota(");
    assert.ok(quota > source.indexOf("await requireMember("));
    assert.ok(quota > source.indexOf("await requireMemoryConsent("));
    assert.match(source, /if \(quotaError\) return quotaError/);
  }
});
