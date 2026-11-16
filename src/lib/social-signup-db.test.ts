import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("PostgreSQL: 이메일·SNS 인증, 회원 등록 권한, RLS, 휴대폰 가입 폐기", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const migrate = (name: string) => db.exec(readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
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
        phone text, phone_confirmed_at timestamptz, encrypted_password text,
        raw_user_meta_data jsonb default '{}'
      );
      create table auth.identities (user_id uuid references auth.users(id), provider text);
    `);
    await migrate("0001_invite_auth");
    await migrate("0008_phone_password_signup");
    await migrate("0009_disable_invite_signup");
    await migrate("0010_social_signup");
    await migrate("0011_email_signup");
    for (let n = 1; n <= 7; n++) await db.query("insert into auth.users(id) values($1)", [id(n)]);
    await db.query("update auth.users set email='verified@example.com',email_confirmed_at=now() where id=$1", [id(1)]);
    await db.query("update auth.users set email='unverified@example.com' where id=$1", [id(2)]);
    await db.query("insert into auth.identities values ($1,'google'),($2,'kakao')", [id(3), id(4)]);
    await db.query("update auth.users set phone='+820000000005',phone_confirmed_at=now(),encrypted_password='old' where id=$1", [id(5)]);
    await db.query("update auth.users set encrypted_password='new' where id=$1", [id(5)]);
    assert.equal((await db.query("select * from public.members")).rows.length, 0, "전화 인증/비밀번호 변경으로 더 이상 가입되지 않음");
    await db.query("update auth.users set email='banned@example.com',email_confirmed_at=now(),banned_until=now()+interval '1 day' where id=$1", [id(6)]);
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [{ email_verified: true, provider: "google", providers: ["google"] }, id(7)]);
    await db.exec("set role anon");
    await assert.rejects(db.query("select public.register_verified_member()"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    const register = async () => (await db.query<{ allowed: boolean }>("select public.register_verified_member() as allowed")).rows[0].allowed;
    assert.equal(await register(), false, "세션 ID 없는 호출 거부");
    for (const [n, expected] of [[1,false],[2,false],[3,true],[4,true],[5,false],[6,false],[7,false]] as const) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(n)]);
      assert.equal(await register(), expected, `계정 ${n}`);
    }
    // OTP 자체, 메타데이터, 같은 해시 재저장으로는 회원이 되지 않는다.
    await db.exec("reset role");
    await db.query("update auth.users set encrypted_password=encrypted_password where id=$1", [id(1)]);
    assert.equal((await db.query("select * from public.members where user_id=$1", [id(1)])).rows.length, 0);
    // 인증되지 않은 계정은 비밀번호부터 설정해도 회원이 되지 않는다.
    await db.query("update auth.users set encrypted_password='before-verification' where id=$1", [id(2)]);
    await db.query("update auth.users set email_confirmed_at=now() where id=$1", [id(2)]);
    assert.equal((await db.query("select * from public.members where user_id=$1", [id(2)])).rows.length, 0);
    // 검증된 이메일이 실제 비밀번호를 저장하면 가입 완료.
    await db.query("update auth.users set encrypted_password='chosen-password-hash' where id=$1", [id(1)]);
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
    const before = (await db.query("select * from public.members")).rows;
    assert.equal(await register(), true, "중복 등록 허용");
    assert.deepEqual((await db.query("select * from public.members")).rows, before, "재접속 때 가입일 유지");
    assert.equal(before.length, 1, "RLS로 자기 회원 행만 조회");
    await assert.rejects(db.query("insert into public.members(user_id) values($1)", [id(2)]), /permission denied/);
    await assert.rejects(db.query("insert into auth.identities values($1,'google')", [id(2)]), /permission denied/);
    await db.exec("reset role");
    assert.equal((await db.query("select * from public.members")).rows.length, 3);
  } finally { await db.close(); }
});
