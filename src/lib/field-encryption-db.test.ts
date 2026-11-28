import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { testCipher } from "./test-cipher.ts";

const USER = "00000000-0000-4000-8000-000000000001";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const dir = new URL("../../supabase/migrations/", import.meta.url);
const at = () => new Date().toISOString();

// 전체 마이그레이션(크론 제외)을 올리고, 회원 한 명이 대화 저장 동의까지 한 상태를 만든다.
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
  await db.query("insert into auth.users(id) values($1)", [USER]);
  await db.query("insert into public.members(user_id) values($1)", [USER]);
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [USER]);
  const consent = await db.query<{ accepted: boolean }>("select public.accept_memory_consent('2026-11-28-dev-v3',true,true) as accepted");
  assert.equal(consent.rows[0]?.accepted, true, "암호화 검증 전 현재 동의 버전을 수락한다");
  const val = async (sql: string, args: unknown[] = []) => (await db.query<{ v: unknown }>(sql, args)).rows[0]?.v;
  const save = (batch: string, messages: unknown[], fingerprint?: string) => fingerprint
    ? val("select public.save_conversation_batch($1,$2::jsonb,$3) v", [batch, JSON.stringify(messages), fingerprint])
    : val("select public.save_conversation_batch($1,$2::jsonb) v", [batch, JSON.stringify(messages)]);
  return { db, val, save };
}

test("0030: 옛 코드의 평문 저장과 새 코드의 암호문 저장이 함께 동작하고, 기록 조회는 key_version을 돌려준다", async () => {
  const { db, save } = await migrated();
  try {
    // given
    const cipher = testCipher(USER);
    const encrypted = cipher.encryptBatch([{ id: id(11), role: "user", content: "오늘 좀 지쳤어", at: at() }]);
    // when
    assert.equal(await save(id(1), [{ id: id(10), role: "user", content: "평문", at: at() }]), true);
    assert.equal(await save(id(2), encrypted.messages, encrypted.fingerprint), true);
    // then
    const rows = (await db.query<{ content: string; content_key_version: number }>("select * from public.list_conversation_messages()")).rows;
    const stored = rows.find(r => r.content_key_version === 1)!;
    assert.equal(rows.find(r => r.content_key_version === 0)?.content, "평문");
    assert.doesNotMatch(stored.content, /지쳤어/);
    assert.equal(cipher.decryptContent(stored.content, 1), "오늘 좀 지쳤어");
  } finally { await db.close(); }
});

test("0030: 암호문이 매번 달라도 같은 배치·메시지의 재전송은 중복 없이 성공하고, 내용이 다르면 충돌로 거절한다", async () => {
  const { db, val, save } = await migrated();
  try {
    // given
    const cipher = testCipher(USER);
    const plain = [{ id: id(20), role: "user", content: "기타 배우고 있어", at: at() }];
    const first = cipher.encryptBatch(plain);
    const replay = cipher.encryptBatch(plain);
    assert.notEqual(first.messages[0].content, replay.messages[0].content);
    await save(id(3), first.messages, first.fingerprint);
    // when / then
    assert.equal(await save(id(3), replay.messages, replay.fingerprint), true, "same batch replay");
    assert.equal(await save(id(4), replay.messages, replay.fingerprint), true, "same message in another batch (outbox)");
    assert.equal(await val("select count(*)::int v from public.conversation_messages"), 1);
    const changed = cipher.encryptBatch([{ ...plain[0], content: "기타 그만뒀어" }]);
    await assert.rejects(save(id(3), changed.messages, changed.fingerprint), /batch_conflict/);
    await assert.rejects(save(id(5), changed.messages, changed.fingerprint), /message_conflict/);
  } finally { await db.close(); }
});

test("0030: 0030 이전에 md5 지문·해시 없이 저장된 데이터는 새 코드가 다시 보내도 충돌로 보지 않는다", async () => {
  const { db, val, save } = await migrated();
  try {
    // given: saved by the old code (md5 fingerprint, plaintext, no hash)
    const plain = [{ id: id(30), role: "user", content: "옛 대화", at: at() }];
    await save(id(6), plain);
    // when: the new code replays it encrypted with an HMAC fingerprint
    const replay = testCipher(USER).encryptBatch(plain);
    // then
    assert.equal(await save(id(6), replay.messages, replay.fingerprint), true);
    assert.equal(await save(id(7), replay.messages, replay.fingerprint), true);
    assert.equal(await val("select content v from public.conversation_messages where id=$1", [id(30)]), "옛 대화", "never overwritten");
  } finally { await db.close(); }
});

test("0030: 해시 없는 암호문과 평문 한도를 넘는 글은 DB가 거절한다", async () => {
  const { db, save } = await migrated();
  try {
    // given
    const [message] = testCipher(USER).encryptBatch([{ id: id(40), role: "user", content: "안녕", at: at() }]).messages;
    // when / then
    await assert.rejects(save(id(8), [{ ...message, hash: undefined }], "a".repeat(64)), /invalid_message/);
    await assert.rejects(save(id(9), [{ id: id(41), role: "user", content: "가".repeat(8001), at: at() }]), /invalid_message/);
  } finally { await db.close(); }
});

test("0030: 기억 요약은 key_version과 함께 저장되고 검색·누적 요약 조회가 버전을 돌려준다", async () => {
  const { db, val } = await migrated();
  try {
    // given
    const cipher = testCipher(USER);
    const summary = cipher.encryptSummary("conversation_memories", "사용자는 기타를 배우고 있다고 말했다.");
    const job = await val("select public.claim_memory($1) v", ["f".repeat(64)]) as { id: string; lease: string };
    const embedding = JSON.stringify([1, ...Array(1535).fill(0)]);
    // when
    const saved = await val("select public.finish_memory($1,$2,$3,$4::extensions.vector,'m','memory-v1',$5::smallint) v",
      [job.id, job.lease, summary.value, embedding, summary.keyVersion]);
    // then
    assert.equal(saved, true);
    const [hit] = (await db.query<{ summary: string; summary_key_version: number }>(
      "select * from public.match_memories($1::extensions.vector,'text-embedding-3-large')", [embedding])).rows;
    assert.equal(hit.summary_key_version, 1);
    assert.equal(cipher.decryptSummary("conversation_memories", hit.summary, 1), "사용자는 기타를 배우고 있다고 말했다.");
    assert.deepEqual((await db.query("select * from public.read_chat_summary()")).rows, []);
  } finally { await db.close(); }
});

test("0030: 다시 만든 함수의 실행 권한은 이전과 같다", async () => {
  const { db } = await migrated();
  try {
    // given
    await db.exec("reset role; set role anon");
    // when / then
    await assert.rejects(db.query("select public.save_conversation_batch($1,'[]'::jsonb)", [id(1)]), /permission denied/);
    await assert.rejects(db.query("select * from public.list_conversation_messages()"), /permission denied/);
    assert.equal((await db.query<{ v: boolean }>("select public.finish_context_work('x','',  '[]'::jsonb, '{}'::uuid[], 'm') v")).rows[0].v, false);
    assert.equal((await db.query<{ v: boolean }>("select public.finish_conversation_work('x', null, null, null) v")).rows[0].v, false);
  } finally { await db.close(); }
});
