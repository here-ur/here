import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { parseQuotaStatus, quotaSummary } from "./quota-status.ts";

const status = (chatUsed: number, voiceUsed: number) => ({ chat: { limit: 200, used: chatUsed }, realtime: { limit: 60, used: voiceUsed }, resetAt: 1_800_000_000 });

test("남은 대화량 응답은 모양이 맞을 때만 읽고, 아니면 감춘다", () => {
  const raw = { chat: { limit: 200, used: 12 }, realtime: { limit: 60, used: 3 }, reset_at: 1_800_000_000 };
  assert.deepEqual(parseQuotaStatus(raw), status(12, 3));
  for (const bad of [null, "x", {}, { ...raw, chat: { limit: 0, used: 0 } }, { ...raw, realtime: { limit: 60, used: -1 } }, { ...raw, reset_at: "soon" }]) {
    assert.equal(parseQuotaStatus(bad), null);
  }
});

test("막대와 부족 상태는 표시된 글 대화 잔여량 기준이며 음성 잔여량과 독립적이다", () => {
  assert.deepEqual(quotaSummary(status(20, 6)), { chatLeft: 180, voiceLeft: 54, ratio: 0.9, state: "ok" });
  assert.deepEqual(quotaSummary(status(10, 35)), { chatLeft: 190, voiceLeft: 25, ratio: 0.95, state: "ok" });
  assert.deepEqual(quotaSummary(status(0, 60)), { chatLeft: 200, voiceLeft: 0, ratio: 1, state: "ok" });
  assert.equal(quotaSummary(status(170, 0)).state, "low");
  assert.equal(quotaSummary(status(160, 0)).state, "ok");
  assert.equal(quotaSummary(status(200, 10)).state, "out");
  assert.deepEqual(quotaSummary(status(230, 60)), { chatLeft: 0, voiceLeft: 0, ratio: 0, state: "out" });
});

test("PostgreSQL: 본인 하루 사용량만 읽고, 읽어도 한도를 쓰지 않으며, 한도 값은 소비와 같다", async () => {
  const db = new PGlite();
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const asUser = async (id: string) => { await db.exec("reset role; set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  type Row = { chat: { limit: number; used: number }; realtime: { limit: number; used: number }; reset_at: number } | null;
  const read = async () => (await db.query<{ s: Row }>("select public.api_quota_status() as s")).rows[0].s;
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      create table public.members(user_id uuid primary key); insert into public.members values('${a}'),('${b}');`);
    for (const file of ["0004_api_limits.sql", "0006_api_quota_status.sql"]) {
      await db.exec(readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"));
    }
    await asUser(a);
    const before = await read();
    assert.deepEqual([before?.chat, before?.realtime], [{ limit: 200, used: 0 }, { limit: 60, used: 0 }]);
    assert.equal(before!.reset_at % 86400, 0);
    for (let i = 0; i < 3; i++) await db.query("select public.consume_api_quota('chat')");
    await db.query("select public.consume_api_quota('realtime')");
    await read(); await read();
    const after = await read();
    assert.deepEqual([after?.chat.used, after?.realtime.used], [3, 1]);
    // 소비 쪽 한도도 같은 함수에서 온다: 하루 200번을 채우면 거절된다.
    await db.exec("reset role");
    await db.query("update public.api_usage_windows set used=200 where user_id=$1 and resource='chat' and window_seconds=86400", [a]);
    await asUser(a);
    assert.equal((await db.query<{ q: { allowed: boolean } }>("select public.consume_api_quota('chat') as q")).rows[0].q.allowed, false);
    assert.equal((await read())?.chat.used, 200);
    await asUser(b); assert.equal((await read())?.chat.used, 0);
    await asUser(""); assert.equal(await read(), null);
    await assert.rejects(db.query("select public.api_quota_limits('chat')"), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(read(), /permission denied/);
  } finally { await db.close(); }
});
