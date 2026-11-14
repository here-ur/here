import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { displayNameForServer, inviteMessage, parseFriends, smsHref } from "./friends.ts";

test("친구 행은 관계·가입일이 맞을 때만 읽고, 빈 닉네임은 이름 없음으로 둔다", () => {
  assert.deepEqual(parseFriends([
    { display_name: " 민지 ", relation: "invited_by_me", joined_at: "2026-11-01T00:00:00Z" },
    { display_name: null, relation: "invited_me", joined_at: "2026-10-31T00:00:00Z" },
    { display_name: "x", relation: "stranger", joined_at: "2026-10-31T00:00:00Z" },
    { display_name: "y", relation: "invited_me", joined_at: "어제" },
  ]), [
    { name: "민지", relation: "invited_by_me", joinedAt: "2026-11-01T00:00:00Z" },
    { name: null, relation: "invited_me", joinedAt: "2026-10-31T00:00:00Z" },
  ]);
  assert.deepEqual(parseFriends(null), []);
});

test("서버에 올릴 닉네임은 1~20자이고 제어 문자가 없어야 한다", () => {
  assert.equal(displayNameForServer("  쿠키 "), "쿠키");
  for (const bad of [undefined, "", "   ", "가".repeat(21), "줄\n바꿈"]) assert.equal(displayNameForServer(bad), null);
});

test("초대 메시지는 가입 주소를 공유하고 폐지된 초대코드를 안내하지 않는다", () => {
  const text = inviteMessage("https://here-dev.vercel.app");
  assert.doesNotMatch(text, /초대코드|3명/);
  assert.match(text, /휴대폰 번호로 가입/);
  assert.match(text, /https:\/\/here-dev\.vercel\.app/);
  assert.equal(smsHref("a b&c", "01012345678"), "sms:01012345678?body=a%20b%26c");
  assert.equal(smsHref("hi", "010", true), "sms:010&body=hi");
});

test("PostgreSQL: 친구는 초대로 이어진 사람만, 닉네임·가입일만 보이고 본인 닉네임만 바꾼다", async () => {
  const db = new PGlite();
  const [a, b, c, d] = ["a", "b", "c", "d"].map((x) => `${x.repeat(8)}-${x.repeat(4)}-4${x.repeat(3)}-8${x.repeat(3)}-${x.repeat(12)}`);
  const asUser = async (id: string) => { await db.exec("reset role; set role authenticated"); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  const friends = async () => (await db.query<{ display_name: string | null; relation: string }>("select display_name, relation from public.list_friends()")).rows;
  try {
    // a가 b·c를 초대했고, d는 따로 들어왔다.
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      create table public.members(user_id uuid primary key, invited_by uuid references public.members(user_id), joined_at timestamptz not null default now());
      alter table public.members enable row level security; grant select on public.members to authenticated;
      create policy members_read_self on public.members for select to authenticated using (user_id = (select auth.uid()));
      insert into public.members values('${a}', null, '2026-10-30'), ('${b}', '${a}', '2026-10-31'), ('${c}', '${a}', '2026-11-01'), ('${d}', null, '2026-11-02');`);
    await db.exec(readFileSync(new URL("../../supabase/migrations/0007_friends.sql", import.meta.url), "utf8"));
    await asUser(b); assert.equal((await db.query<{ ok: boolean }>("select public.set_display_name('  비비 ') as ok")).rows[0].ok, true);
    await asUser(c); assert.equal((await db.query<{ ok: boolean }>("select public.set_display_name($1) as ok", ["가".repeat(21)])).rows[0].ok, false);
    assert.equal((await db.query<{ ok: boolean }>("select public.set_display_name($1) as ok", ["줄\n바꿈"])).rows[0].ok, false);
    await asUser(a);
    assert.deepEqual(await friends(), [{ display_name: null, relation: "invited_by_me" }, { display_name: "비비", relation: "invited_by_me" }]);
    await asUser(b); assert.deepEqual(await friends(), [{ display_name: null, relation: "invited_me" }]);
    await asUser(d); assert.deepEqual(await friends(), []);
    // 다른 회원의 행은 직접 읽거나 고칠 수 없다.
    await asUser(a);
    assert.equal((await db.query("select * from public.members where user_id=$1", [b])).rows.length, 0);
    await assert.rejects(db.query("update public.members set display_name='해킹' where user_id=$1", [b]), /permission denied/);
    await asUser(""); assert.deepEqual(await friends(), []);
    await db.exec("reset role; set role anon");
    await assert.rejects(friends(), /permission denied/);
  } finally { await db.close(); }
});
