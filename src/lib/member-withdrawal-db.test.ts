import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { vector } from "@electric-sql/pglite-pgvector";

test("PostgreSQL: 탈퇴는 본인만, 모든 기기 로그아웃 · 7일 안에는 취소 · 7일 뒤 로그인 차단 · 그 뒤 1년이 지나면 파기", async () => {
  const db = new PGlite({ extensions: { pgcrypto, vector } });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const migrate = (name: string) => db.exec(readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  const val = async <T>(sql: string, args: unknown[] = []) => (await db.query<{ v: T }>(sql, args)).rows[0]?.v;
  const as = async (user: string | null) => {
    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? ""]);
  };
  const admin = () => db.exec("reset role");
  const withdrawnAgo = (user: string, interval: string) => db.query(`update public.members set withdrawn_at = now() - interval '${interval}' where user_id=$1`, [user]);
  const banned = (user: string) => val<boolean>("select coalesce(banned_until > now(), false) v from auth.users where id=$1", [user]);
  const sessions = (user: string) => val<number>("select count(*)::int v from auth.sessions where user_id=$1", [user]);
  const login = async (user: string) => {
    const session = await val<string>("insert into auth.sessions(user_id) values($1) returning id v", [user]);
    await db.query("insert into auth.refresh_tokens(user_id, session_id) values($1,$2),($1,null)", [user, session]);
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
    await migrate("0027_withdrawal_grace");
    for (let n = 1; n <= 3; n++) { await db.query("insert into auth.users(id) values($1)", [id(n)]); await login(id(n)); }
    await db.query("insert into public.members(user_id) values($1),($2)", [id(1), id(2)]); // 3은 회원이 아님
    await db.query("insert into public.memory_consents(user_id, version, sensitive_accepted, privacy_accepted) values($1,'v',true,true)", [id(1)]);
    await db.query("insert into public.invite_codes(code_hash, redeemed_by) values('old',$1)", [id(1)]);

    await as(null);
    assert.equal(await val("select public.withdraw_member() v"), "not_member");
    assert.equal(await val("select public.cancel_withdrawal() v"), "not_member");
    await as(id(3));
    assert.equal(await val("select public.withdraw_member() v"), "not_member", "가입하지 않은 계정은 탈퇴할 회원이 없다");
    await as(id(2));
    assert.equal(await val("select public.cancel_withdrawal() v"), "not_withdrawn");

    // 탈퇴: 표시를 남기고 모든 기기에서 로그아웃. 유예기간에는 로그인을 막지 않는다.
    await as(id(1));
    assert.equal(await val("select public.withdraw_member() v"), "ok");
    await admin();
    const first = await val<Date>("select withdrawn_at v from public.members where user_id=$1", [id(1)]);
    assert.ok(first, "탈퇴 시각을 남긴다");
    assert.equal(await banned(id(1)), false, "유예기간에는 다시 로그인해서 취소할 수 있다");
    assert.equal(await sessions(id(1)), 0, "모든 기기의 세션을 지운다");
    assert.equal(await val("select count(*)::int v from auth.refresh_tokens where user_id=$1", [id(1)]), 0);
    assert.equal(await sessions(id(2)), 1, "다른 회원은 그대로");
    await as(id(1));
    assert.equal(await val("select public.withdraw_member() v"), "ok");
    await admin();
    assert.deepEqual(await val("select withdrawn_at v from public.members where user_id=$1", [id(1)]), first, "다시 불러도 처음 탈퇴 시각을 지킨다");

    // 유예기간 안: 다시 로그인해서 취소하면 원래대로.
    await login(id(1));
    await as(id(1));
    assert.equal(await val("select public.cancel_withdrawal() v"), "ok");
    await admin();
    assert.equal(await val("select withdrawn_at v from public.members where user_id=$1", [id(1)]), null, "취소하면 탈퇴 표시를 지운다");
    assert.equal(await val("select public.finalize_withdrawals() v"), 0);

    // 회원이 직접 표시를 지우거나 확정·파기를 부를 수 없다.
    await as(id(1));
    assert.equal(await val("select public.withdraw_member() v"), "ok");
    await assert.rejects(db.query("update public.members set withdrawn_at = null where user_id=$1", [id(1)]), "탈퇴 표시를 직접 지울 수 없다");
    await assert.rejects(db.query("select public.finalize_withdrawals()"), "회원은 확정을 직접 부를 수 없다");
    await assert.rejects(db.query("select public.purge_withdrawn_members()"), "회원은 파기를 직접 부를 수 없다");

    // 7일이 지나면 취소할 수 없고, 확정 작업이 로그인을 막는다.
    await admin();
    await withdrawnAgo(id(1), "6 days 23 hours");
    assert.equal(await val("select public.finalize_withdrawals() v"), 0, "7일이 되기 전에는 확정하지 않는다");
    await withdrawnAgo(id(1), "7 days 1 minute");
    await login(id(1)); // 확정 작업이 돌기 전에 남은 세션
    await as(id(1));
    assert.equal(await val("select public.cancel_withdrawal() v"), "expired", "7일이 지나면 취소할 수 없다");
    await admin();
    assert.equal(await val("select public.finalize_withdrawals() v"), 1);
    assert.equal(await banned(id(1)), true, "로그인을 막는다");
    assert.equal(await sessions(id(1)), 0, "남은 세션도 지운다");
    assert.equal(await val("select public.finalize_withdrawals() v"), 0, "이미 막은 계정은 다시 세지 않는다");
    assert.equal(await banned(id(2)), false, "다른 회원은 그대로");

    // 확정 뒤 1년(탈퇴 신청 뒤 1년 7일)이 지나야 파기한다.
    await withdrawnAgo(id(1), "1 year 6 days");
    assert.equal(await val("select public.purge_withdrawn_members() v"), 0, "1년 보관 중에는 파기하지 않는다");
    assert.equal(await val("select count(*)::int v from public.memory_consents"), 1);
    await withdrawnAgo(id(1), "1 year 7 days 1 minute");
    assert.equal(await val("select public.purge_withdrawn_members() v"), 1);
    assert.equal(await val("select count(*)::int v from auth.users where id=$1", [id(1)]), 0, "계정을 지운다");
    assert.equal(await val("select count(*)::int v from public.members where user_id=$1", [id(1)]), 0);
    assert.equal(await val("select count(*)::int v from public.memory_consents"), 0, "회원 데이터도 함께 지운다");
    assert.equal(await val("select redeemed_by v from public.invite_codes where code_hash='old'"), null, "예전 초대코드 기록이 파기를 막지 않는다");
    assert.equal(await val("select count(*)::int v from public.members"), 1, "탈퇴하지 않은 회원은 남는다");
  } finally { await db.close(); }
});
