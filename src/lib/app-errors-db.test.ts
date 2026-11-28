import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const dir = new URL("../../supabase/migrations/", import.meta.url);

// 0001~0031(크론 제외)을 올리고 회원 둘을 만든다.
async function migrated() {
  const db = new PGlite({ extensions: { vector, pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema extensions;
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
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql") && !f.includes("cron")).sort()) {
    await db.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  for (const id of [A, B]) {
    await db.query("insert into auth.users(id) values($1)", [id]);
    await db.query("insert into public.members(user_id) values($1)", [id]);
  }
  const as = async (who: string | null) => {
    await db.exec(`reset role; set role ${who ? "authenticated" : "anon"}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [who ?? ""]);
  };
  const report = (source: string, code: string, detail: object = {}) =>
    db.query("select public.report_app_error($1,$2,$3::jsonb)", [source, code, JSON.stringify(detail)]);
  const rows = async () => {
    await db.exec("reset role");
    return (await db.query<{ source: string; code: string; user_id: string | null; count: number; detail: object }>(
      "select source, code, user_id, count, detail from public.app_errors order by id")).rows;
  };
  return { db, as, report, rows };
}

test("0031: 같은 에러를 1분 안에 여러 번 기록하면 한 행에 횟수만 오른다", async () => {
  const { db, as, report, rows } = await migrated();
  try {
    // given
    await as(A);
    // when
    for (let i = 0; i < 3; i++) await report("chat.save", "timeout", { attempt: i });
    // then
    assert.deepEqual((await rows()).map(r => [r.source, r.code, r.user_id, r.count]), [["chat.save", "timeout", A, 3]]);
  } finally { await db.close(); }
});

test("0031: 코드나 사용자가 다르거나 묶음이 1분을 넘으면 새 행이 된다", async () => {
  const { db, as, report, rows } = await migrated();
  try {
    // given
    await as(A); await report("chat.save", "timeout");
    await as(B); await report("chat.save", "timeout");
    await as(A); await report("chat.save", "http_503");
    await db.exec("reset role; update public.app_errors set first_seen_at = now() - interval '2 minutes' where code = 'http_503'");
    // when
    await as(A); await report("chat.save", "http_503");
    // then
    assert.deepEqual((await rows()).map(r => [r.code, r.user_id, r.count]),
      [["timeout", A, 1], ["timeout", B, 1], ["http_503", A, 1], ["http_503", A, 1]]);
  } finally { await db.close(); }
});

test("0031: 형식이 틀린 값과 1KB 넘는 정보는 에러 없이 무시한다", async () => {
  const { db, as, report, rows } = await migrated();
  try {
    // given
    await as(A);
    // when
    await report("Chat Save!", "timeout");
    await report("chat.save", "오늘 죽고 싶어");
    await report("chat.save", "timeout", { text: "x".repeat(2000) });
    // then
    assert.deepEqual(await rows(), []);
  } finally { await db.close(); }
});

test("0031: 로그인 없는 호출은 worker.* 만 기록되고, 사용자 ID는 파라미터로 바꿀 수 없다", async () => {
  const { db, as, report, rows } = await migrated();
  try {
    // given / when
    await as(null);
    await report("chat.save", "timeout");
    await report("worker.context", "timeout");
    // then
    assert.deepEqual((await rows()).map(r => [r.source, r.user_id]), [["worker.context", null]]);
    const fn = await db.query<{ args: string }>("select pg_get_function_arguments('public.report_app_error(text,text,jsonb)'::regprocedure) args");
    assert.doesNotMatch(fn.rows[0].args, /user/);
  } finally { await db.close(); }
});

test("0031: 사용자 한 명의 1분 새 행이 30개를 넘으면 overflow 행에 숫자만 센다", async () => {
  const { db, as, report, rows } = await migrated();
  try {
    // given
    await as(A);
    // when
    for (let i = 0; i < 35; i++) await report("chat.save", `code_${i}`);
    // then
    const all = await rows();
    assert.equal(all.filter(r => r.user_id === A).length, 30);
    assert.deepEqual(all.filter(r => r.source === "app_errors.overflow").map(r => [r.code, r.count]), [["dropped", 5]]);
  } finally { await db.close(); }
});

test("0031: 사용자는 테이블을 직접 읽거나 쓸 수 없고, 정리 함수는 30일 지난 행만 지운다", async () => {
  const { db, as, report, rows } = await migrated();
  try {
    // given
    await as(A); await report("chat.save", "timeout"); await report("chat.load", "timeout");
    // when / then
    await assert.rejects(db.query("select * from public.app_errors"), /permission denied/);
    await assert.rejects(db.query("insert into public.app_errors(source, code) values ('chat.save','x')"), /permission denied/);
    await assert.rejects(db.query("select public.purge_app_errors()"), /permission denied/);
    await db.exec("reset role; update public.app_errors set first_seen_at = now() - interval '31 days' where source = 'chat.load'");
    await db.query("select public.purge_app_errors()");
    assert.deepEqual((await rows()).map(r => r.source), ["chat.save"]);
  } finally { await db.close(); }
});
