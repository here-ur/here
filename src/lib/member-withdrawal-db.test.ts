import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { vector } from "@electric-sql/pglite-pgvector";

test("PostgreSQL: 탈퇴는 본인만, 모든 기기 로그아웃·로그인 차단 후 1년이 지나면 계정과 데이터를 파기", async () => {
  const db = new PGlite({ extensions: { pgcrypto, vector } });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const migrate = (name: string) => db.exec(readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  const val = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
  const as = async (user: string | null) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  };
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
      create table auth.users (id uuid primary key, phone_confirmed_at timestamptz, banned_until timestamptz);
      create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
      create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), session_id uuid references auth.sessions(id) on delete cascade);
    `);
    await migrate("0001_invite_auth");
    await migrate("0003_conversation_memory");
    await migrate("0025_member_withdrawal");
    for (let n = 1; n <= 3; n++) {
      await db.query("insert into auth.users(id) values($1)", [id(n)]);
      const session = await val<string>("insert into auth.sessions(user_id) values($1) returning id v", [id(n)]);
      await db.query("insert into auth.refresh_tokens(user_id, session_id) values($1,$2),($1,null)", [id(n), session]);
    }
    await db.query("insert into public.members(user_id) values($1),($2)", [id(1), id(2)]); // 3은 회원이 아님
    await db.query("insert into public.memory_consents(user_id, version, sensitive_accepted, privacy_accepted) values($1,'v',true,true)", [id(1)]);
    await db.query("insert into public.invite_codes(code_hash, redeemed_by) values('old',$1)", [id(1)]);

    await as(null);
    assert.equal(await val("select public.withdraw_member() v"), "not_member");
    await as(id(3));
    assert.equal(await val("select public.withdraw_member() v"), "not_member", "가입하지 않은 계정은 탈퇴할 회원이 없다");

    await as(id(1));
    assert.equal(await val("select public.withdraw_member() v"), "ok");
    await db.exec("reset role");
    const first = await val<Date>("select withdrawn_at v from public.members where user_id=$1", [id(1)]);
    assert.ok(first, "탈퇴 시각을 남긴다");
    assert.ok(await val("select banned_until > now() + interval '1 year' v from auth.users where id=$1", [id(1)]), "로그인을 막는다");
    assert.equal(await val("select count(*)::int v from auth.sessions where user_id=$1", [id(1)]), 0, "모든 기기의 세션을 지운다");
    assert.equal(await val("select count(*)::int v from auth.refresh_tokens where user_id=$1", [id(1)]), 0);
    assert.equal(await val("select count(*)::int v from auth.sessions where user_id=$1", [id(2)]), 1, "다른 회원은 그대로");
    assert.equal(await val("select withdrawn_at v from public.members where user_id=$1", [id(2)]), null);

    await as(id(1));
    assert.equal(await val("select public.withdraw_member() v"), "ok");
    await db.exec("reset role");
    assert.deepEqual(await val("select withdrawn_at v from public.members where user_id=$1", [id(1)]), first, "다시 불러도 처음 탈퇴 시각을 지킨다");

    await as(id(2));
    await assert.rejects(db.query("select public.purge_withdrawn_members()"), "회원은 파기를 직접 부를 수 없다");
    await assert.rejects(db.query("update public.members set withdrawn_at = null where user_id=$1", [id(1)]), "탈퇴 표시를 직접 지울 수 없다");

    await db.exec("reset role");
    assert.equal(await val("select public.purge_withdrawn_members() v"), 0, "1년이 지나기 전에는 보관한다");
    assert.equal(await val("select count(*)::int v from public.memory_consents"), 1);

    await db.query("update public.members set withdrawn_at = now() - interval '1 year 1 day' where user_id=$1", [id(1)]);
    assert.equal(await val("select public.purge_withdrawn_members() v"), 1);
    assert.equal(await val("select count(*)::int v from auth.users where id=$1", [id(1)]), 0, "계정을 지운다");
    assert.equal(await val("select count(*)::int v from public.members where user_id=$1", [id(1)]), 0);
    assert.equal(await val("select count(*)::int v from public.memory_consents"), 0, "회원 데이터도 함께 지운다");
    assert.equal(await val("select redeemed_by v from public.invite_codes where code_hash='old'"), null, "예전 초대코드 기록이 파기를 막지 않는다");
    assert.equal(await val("select count(*)::int v from public.members"), 1, "탈퇴하지 않은 회원은 남는다");
  } finally { await db.close(); }
});
