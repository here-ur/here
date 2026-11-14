import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("PostgreSQL: 문자 인증과 비밀번호를 모두 완료해야 초대 없이 회원이 된다", async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const memberIds = async () => (await db.query<{ user_id: string }>("select user_id from public.members order by user_id")).rows.map(row => row.user_id);
  const migrate = (name: string) => db.exec(readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), "utf8"));
  const code = "A1B2C3D4E5F60718";
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
        id uuid primary key, phone text, phone_confirmed_at timestamptz,
        encrypted_password text, raw_user_meta_data jsonb default '{}'
      );
    `);
    // Use the real historical schema and RPC permissions, not a simplified fixture.
    await migrate("0001_invite_auth");
    await migrate("0002_invite_three_uses");
    await migrate("0007_friends");
    await db.exec(`
      insert into auth.users (id,phone,phone_confirmed_at,encrypted_password) values
        ('${id(1)}','+820000000001',now(),'sms-temporary-hash'),
        ('${id(2)}','+820000000002',null,'test-hash'),
        ('${id(3)}','+820000000003',now(),'test-hash'),
        ('${id(4)}','+820000000004',now(),'test-hash'),
        ('${id(5)}','',now(),'test-hash'),
        ('${id(6)}','+820000000006',now(),null);
      insert into public.members (user_id,joined_at,display_name) values
        ('${id(4)}','2026-10-31T00:00:00Z','기존 회원');
    `);
    await db.query("insert into public.invite_codes(code_hash,inviter_id) values (encode(extensions.digest($1,'sha256'),'hex'),$2)", [code, id(4)]);
    assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.redeem_invite(text)','execute') as allowed")).rows[0].allowed, true);
    await migrate("0008_phone_password_signup");
    await migrate("0009_disable_invite_signup");

    // Even with a valid legacy invite and verified phone, password setup is required.
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
      await assert.rejects(db.query("select public.redeem_invite($1)", [code]), /permission denied/);
      await assert.rejects(db.query("select public.invite_available($1)", [code]), /permission denied/);
      await db.exec("reset role");
    }
    // The retired body is inert even if an admin calls it or accidentally regrants access.
    assert.equal((await db.query<{ allowed: boolean }>("select public.redeem_invite($1) as allowed", [code])).rows[0].allowed, false);
    assert.equal((await db.query<{ allowed: boolean }>("select public.invite_available($1) as allowed", [code])).rows[0].allowed, false);
    assert.equal((await db.query<{ used_count: number }>("select used_count from public.invite_codes")).rows[0].used_count, 0);
    assert.deepEqual(await memberIds(), [id(4)]);
    // An OTP-generated temporary hash must not be mistaken for a chosen password.
    await db.query("update auth.users set encrypted_password=encrypted_password where id=$1", [id(3)]);
    assert.deepEqual(await memberIds(), [id(4)]);
    await db.query("update auth.users set encrypted_password='user-chosen-hash' where id=$1", [id(3)]);
    assert.deepEqual(await memberIds(), [id(3), id(4)]);

    // OTP-only sessions cannot enter until Auth saves an actual password.
    await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [{ has_password: true }, id(6)]);
    assert.deepEqual(await memberIds(), [id(3), id(4)]);
    await db.query("update auth.users set encrypted_password='new-test-hash' where id=$1", [id(1)]);
    assert.deepEqual(await memberIds(), [id(1), id(3), id(4)]);
    // A password chosen before SMS verification must not skip the final setup.
    await db.query("update auth.users set phone_confirmed_at=now() where id=$1", [id(2)]);
    assert.deepEqual(await memberIds(), [id(1), id(3), id(4)]);
    await db.query("update auth.users set encrypted_password='user-chosen-hash' where id=$1", [id(2)]);
    assert.deepEqual(await memberIds(), [id(1), id(2), id(3), id(4)]);

    // Updates and retries do not reset existing profile, referral or join date.
    await db.query("update public.members set invited_by=$1 where user_id=$2", [id(3), id(4)]);
    const before = (await db.query("select * from public.members where user_id=$1", [id(4)])).rows;
    await db.query("update auth.users set encrypted_password='changed-test-hash' where id=$1", [id(4)]);
    assert.deepEqual((await db.query("select * from public.members where user_id=$1", [id(4)])).rows, before);

    // Browser clients still cannot register arbitrary users or read others.
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
    assert.deepEqual(await memberIds(), [id(1)]);
    await assert.rejects(db.query("insert into public.members(user_id) values($1)", [id(6)]), /permission denied/);
    await assert.rejects(db.query("update auth.users set encrypted_password='fake' where id=$1", [id(6)]), /permission denied/);
    assert.equal((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.register_phone_member()','execute') as allowed")).rows[0].allowed, false);
    await db.exec("reset role; set role anon");
    await assert.rejects(memberIds(), /permission denied/);
  } finally {
    await db.close();
  }
});
