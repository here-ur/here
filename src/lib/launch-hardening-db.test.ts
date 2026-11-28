import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const V1 = "2026-10-31-dev-v1";
const CURRENT = "2026-11-28-dev-v3";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dir = new URL("../../supabase/migrations/", import.meta.url);

// Applies all local migrations. Cron files need pg_cron, which PGlite does not have.
async function migrated() {
  const db = new PGlite({ extensions: { vector, pgcrypto } });
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
      phone text, phone_confirmed_at timestamptz, encrypted_password text,
      raw_user_meta_data jsonb default '{}'
    );
    create table auth.identities (user_id uuid references auth.users(id), provider text);
  `);
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql") && !f.includes("cron")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  for (const n of [1, 2]) {
    await db.query("insert into auth.users(id) values($1)", [id(n)]);
    await db.query("insert into public.members(user_id) values($1)", [id(n)]);
  }
  const val = async (sql: string, args: unknown[] = []) => (await db.query<{ v: unknown }>(sql, args)).rows[0]?.v;
  const user = async (n: number) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
  };
  const admin = () => db.exec("reset role");
  return { db, val, user, admin };
}

test("0024 동의 버전: 옛 버전으로는 새로 동의할 수 없고, 현재 버전 동의자만 기억·대화 저장이 켜진다", async () => {
  const { db, val, user, admin } = await migrated();
  try {
    // given: user 2 already holds an old v1 consent (memory only)
    await db.query("insert into public.privacy_consents(user_id,version,privacy_accepted,sensitive_accepted) values($1,$2,true,true)", [id(2), V1]);

    // when / then: user 1
    await user(1);
    assert.equal(await val("select public.accept_memory_consent($1,true,true) v", [V1]), false, "v1 is no longer accepted");
    assert.equal(await val("select public.accept_memory_consent($1,true,true) v", ["2026-11-16-dev-v2"]), false, "the superseded notice cannot be submitted as current consent");
    assert.equal(await val("select public.conversation_is_enabled() v"), false);
    assert.equal(await val("select public.accept_memory_consent($1,true,true) v", [CURRENT]), true);
    assert.equal(await val("select public.memory_is_enabled() v"), true);
    assert.equal(await val("select public.conversation_is_enabled() v"), true);

    // then: v1 holder keeps memory but not conversation history
    await user(2);
    assert.equal(await val("select public.memory_is_enabled() v"), true);
    assert.equal(await val("select public.conversation_is_enabled() v"), false);

    // then: the event lands in the renamed table
    await admin();
    const events = (await db.query<{ event_type: string; version: string }>(
      "select event_type, version from public.privacy_consent_events where user_id=$1", [id(1)])).rows;
    assert.deepEqual(events, [{ event_type: "accepted", version: CURRENT }]);
  } finally {
    await db.close();
  }
});

test("0024 컬럼 변경: 이름은 nickname에 저장되고 대화 메시지에는 received_at이 채워진다", async () => {
  const { db, val, user, admin } = await migrated();
  try {
    // given
    await user(1);
    await val("select public.accept_memory_consent($1,true,true) v", [CURRENT]);

    // when
    assert.equal(await val("select public.set_display_name('테스트') v"), true);
    const batch = [{ id: id(10), role: "user", content: "hi", at: "2026-11-24T00:00:00Z" }];
    assert.equal(await val("select public.save_conversation_batch($1,$2::jsonb) v", [id(9), JSON.stringify(batch)]), true);

    // then
    await admin();
    assert.equal(await val("select nickname v from public.members where user_id=$1", [id(1)]), "테스트");
    assert.equal(await val("select count(*)::int v from public.conversation_messages where received_at is null"), 0);
    assert.equal(await val("select count(*)::int v from public.conversation_messages"), 1);
  } finally {
    await db.close();
  }
});

test("0024 권한: 사용자는 동의 버전 테이블과 현재 버전 함수에 직접 접근할 수 없다", async () => {
  const { db, user } = await migrated();
  try {
    // when / then
    await user(1);
    await assert.rejects(db.query("select * from public.consent_versions"), /permission denied/);
    await assert.rejects(db.query("select public.current_consent_version()"), /permission denied/);
  } finally {
    await db.close();
  }
});
