import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

test("실제 PostgreSQL RLS·동의·중복·삭제 경쟁·회상 격리", async () => {
  const db = new PGlite({ extensions: { vector } });
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const outsider = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const v = JSON.stringify(Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0));
  const key = "a".repeat(64);
  type Job = { id: string; lease: string };
  async function value<T>(sql: string, params: unknown[] = []) { return (await db.query<{ value: T }>(sql, params)).rows[0]?.value; }
  async function asUser(id: string, role = "authenticated") {
    await db.exec(`reset role; set role ${role};`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  }
  const claim = (k: string) => value<Job | null>("select public.claim_memory($1) as value", [k]);
  const finish = (job: Job) => value<boolean>("select public.finish_memory($1,$2,'사용자는 차를 좋아한다고 말했다.',$3::extensions.vector,'openai/gpt-5.6-sol','memory-v1') as value", [job.id, job.lease, v]);
  const accept = () => value<boolean>("select public.accept_memory_consent('2026-10-31-dev-v1',true,true) as value");
  const search = () => db.query("select * from public.match_memories($1::extensions.vector,'text-embedding-3-large')", [v]);
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema extensions;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public,extensions to authenticated,anon;
      create table public.members(user_id uuid primary key);
      insert into public.members values('${a}'),('${b}');`);
    await db.exec(readFileSync(new URL("../../supabase/migrations/20261031010000_conversation_memory.sql", import.meta.url), "utf8"));
    await asUser("");
    assert.equal(await claim(key), null);
    await asUser(outsider);
    assert.equal(await accept(), false);
    await asUser(a);
    assert.equal(await value("select public.memory_is_enabled() as value"), false);
    assert.equal(await claim(key), null);
    assert.equal(await value("select public.accept_memory_consent('old',true,true) as value"), false);
    assert.equal(await value("select public.accept_memory_consent('2026-10-31-dev-v1',true,false) as value"), false);
    assert.equal(await accept(), true);
    const job = await claim(key); assert.ok(job);
    assert.equal(await claim(key), null);
    assert.equal(await finish(job), true);
    assert.equal(await finish(job), false);
    assert.equal((await search()).rows.length, 1);
    await assert.rejects(db.exec("insert into public.conversation_memories(user_id,source_key) values('" + b + "','" + key + "')"), /permission denied/);

    await asUser(b); await accept();
    assert.equal((await db.query("select * from public.conversation_memories")).rows.length, 0);
    assert.equal((await search()).rows.length, 0);
    assert.equal(await value("select public.forget_memory($1) as value", [job.id]), false);
    assert.equal(await finish(job), false);
    const bJob = await claim(key); assert.ok(bJob); assert.notEqual(bJob.id, job.id);
    assert.equal(await finish(bJob), true);
    assert.equal((await search()).rows.length, 1);

    await asUser(a);
    assert.equal(await value("select public.forget_memory($1) as value", [job.id]), true);
    assert.equal((await search()).rows.length, 0);
    assert.equal(await claim(key), null);
    assert.equal(await finish(job), false);
    const race = await claim("b".repeat(64)); assert.ok(race);
    await value("select public.forget_memory($1) as value", [race.id]);
    assert.equal(await finish(race), false);
    const pending = await claim("c".repeat(64)); assert.ok(pending);
    assert.equal(await value("select public.withdraw_memory_consent() as value"), true);
    assert.equal(await finish(pending), false);
    await accept();
    assert.equal(await claim("c".repeat(64)), null);
    assert.equal((await search()).rows.length, 0);
    const rows = await db.query<{ summary: string; embedding: unknown }>("select summary,embedding from public.conversation_memories");
    assert.ok(rows.rows.every(r => r.summary === "" && r.embedding === null));

    const failed = await claim("d".repeat(64)); assert.ok(failed);
    assert.equal(await value("select public.fail_memory($1,$2) as value", [failed.id, failed.lease]), true);
    const retried = await claim("d".repeat(64)); assert.ok(retried);
    assert.notEqual(retried.lease, failed.lease);
    assert.equal(await finish(failed), false); // Old workers cannot overwrite the new attempt.
    assert.equal(await finish(retried), true);
    await asUser("", "anon");
    await assert.rejects(search(), /permission denied/);
    await assert.rejects(db.query("select * from public.memory_consents"), /permission denied/);
  } finally { await db.close(); }
});
