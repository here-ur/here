import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dir = new URL("../../supabase/migrations/", import.meta.url);

test("0029: 대화 요약·밤 기억 정리 작업은 탈퇴한 회원을 고르지 않고, 탈퇴를 취소하면 다시 고른다", async () => {
  const db = new PGlite({ extensions: { vector, pgcrypto } });
  const val = async (sql: string, args: unknown[] = []) => (await db.query<{ v: unknown }>(sql, args)).rows[0]?.v;
  const as = async (user: string) => { await db.exec("reset role; set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); };
  const admin = () => db.exec("reset role");
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema extensions;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth,public,extensions to authenticated,anon;
      create table auth.users (
        id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz,
        phone text, phone_confirmed_at timestamptz, encrypted_password text, raw_user_meta_data jsonb default '{}'
      );
      create table auth.identities (user_id uuid references auth.users(id), provider text);
    `);
    // Cron files need pg_cron, which PGlite does not have.
    for (const file of readdirSync(dir).filter(f => f.endsWith(".sql") && !f.includes("cron")).sort()) {
      await db.exec(readFileSync(new URL(file, dir), "utf8"));
    }
    const [gone, stay] = [id(1), id(2)];
    for (const user of [gone, stay]) {
      await admin();
      await db.query("insert into auth.users(id) values($1)", [user]);
      await db.query("insert into public.members(user_id) values($1)", [user]);
      await as(user);
      assert.equal(await val("select public.accept_memory_consent('2026-11-16-dev-v2',true,true) v"), true);
      await val("select public.save_conversation_batch($1,$2::jsonb) v", [user, JSON.stringify([{ id: user, role: "user", content: "기타 좋아해", at: new Date(Date.now() - 60000).toISOString() }])]);
    }
    await admin();
    await db.query("update public.members set withdrawn_at = now() where user_id=$1", [gone]);

    const conversation = async () => { await admin(); await db.exec("select * from public.issue_conversation_work()"); return (await db.query<{ user_id: string }>("select distinct user_id from public.conversation_worker_runs")).rows.map(r => r.user_id); };
    const context = async () => { await admin(); await db.exec("select * from public.issue_context_work()"); return (await db.query<{ user_id: string }>("select distinct user_id from public.context_worker_runs")).rows.map(r => r.user_id); };

    assert.deepEqual(await conversation(), [stay], "대화 요약 작업은 탈퇴한 회원의 대화를 고르지 않는다");
    assert.deepEqual(await context(), [stay], "밤 기억 정리는 탈퇴한 회원을 고르지 않는다");

    // 유예기간 안에 탈퇴를 취소하면 다음 실행부터 다시 고른다.
    await db.exec("delete from public.conversation_worker_runs; delete from public.context_worker_runs;");
    await db.query("update public.members set withdrawn_at = null where user_id=$1", [gone]);
    assert.deepEqual((await conversation()).sort(), [gone, stay].sort());
    assert.deepEqual((await context()).sort(), [gone, stay].sort());
  } finally { await db.close(); }
});
