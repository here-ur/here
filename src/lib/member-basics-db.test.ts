import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

test("PostgreSQL: 새 회원만 성별·생년월일을 묻고, 본인 행만 RPC로 저장하며 만 14세 미만은 거절", async () => {
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
      create table auth.users (id uuid primary key, phone_confirmed_at timestamptz);
    `);
    await migrate("0001_invite_auth");
    for (let n = 1; n <= 4; n++) await db.query("insert into auth.users(id) values($1)", [id(n)]);
    await db.query("insert into public.members(user_id) values($1)", [id(1)]); // 마이그레이션 전에 가입한 회원
    await migrate("0020_member_basics");
    await migrate("20261128121308_member_gender_undisclosed");
    await db.query("insert into public.members(user_id) values($1),($2)", [id(2), id(3)]); // 새 회원. 4는 회원이 아님

    const flags = (await db.query<{ user_id: string; basics_required: boolean }>("select user_id, basics_required from public.members order by user_id")).rows;
    assert.deepEqual(flags.map(r => r.basics_required), [false, true, true], "기존 회원은 묻지 않고 새 회원만 묻는다");

    const { rows: [dates] } = await db.query<{ today: string; fourteen: string; tomorrow: string; under: string; future: string }>(`
      with t as (select (now() at time zone 'Asia/Seoul')::date as d)
      select d::text as today, (d - interval '14 years')::date::text as fourteen,
        (d - interval '14 years' + interval '1 day')::date::text as under,
        (d + 1)::text as future, (d + 1)::text as tomorrow from t`);

    await db.exec("set role anon");
    await assert.rejects(db.query("select public.set_member_basics('female', '1990-01-01')"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    const save = async (gender: string | null, birth: string | null) =>
      (await db.query<{ result: string }>("select public.set_member_basics($1, $2::date) as result", [gender, birth])).rows[0].result;

    assert.equal(await save("female", "1990-01-01"), "not_member", "세션 ID 없는 호출 거부");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(4)]);
    assert.equal(await save("female", "1990-01-01"), "not_member", "회원이 아닌 계정 거부");

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(2)]);
    for (const [gender, birth] of [["other", "1990-01-01"], [null, "1990-01-01"], ["male", null], ["male", "1899-12-31"], ["male", dates.future]] as const) {
      assert.equal(await save(gender, birth), "invalid", `${gender} ${birth}`);
    }
    assert.equal(await save("female", dates.under), "under_14", "만 14세 생일 전날까지는 거절");
    assert.equal(await save("female", dates.today), "under_14");
    const unchanged = (await db.query<{ gender: string | null; birth_date: string | null }>("select gender, birth_date::text from public.members")).rows;
    assert.deepEqual(unchanged, [{ gender: null, birth_date: null }], "거절하면 아무것도 저장하지 않고, RLS로 내 행만 보인다");

    assert.equal(await save("male", dates.fourteen), "ok", "만 14세 생일부터 저장");
    assert.equal(await save("undisclosed", dates.under), "under_14");
    assert.equal(await save("undisclosed", "1990-02-28"), "ok");
    assert.equal((await db.query<{ gender: string }>("select gender from public.members")).rows[0].gender, "undisclosed");
    assert.equal(await save("female", "1990-02-28"), "ok", "본인 값은 고칠 수 있다");
    assert.deepEqual((await db.query("select gender, birth_date::text, basics_required from public.members")).rows,
      [{ gender: "female", birth_date: "1990-02-28", basics_required: true }]);

    await assert.rejects(db.query("update public.members set gender='male'"), /permission denied/, "직접 수정 불가");
    await assert.rejects(db.query("update public.members set basics_required=false"), /permission denied/, "묻기 표시도 직접 끌 수 없다");

    await db.exec("reset role");
    assert.deepEqual((await db.query("select user_id, gender, birth_date::text from public.members order by user_id")).rows, [
      { user_id: id(1), gender: null, birth_date: null },
      { user_id: id(2), gender: "female", birth_date: "1990-02-28" },
      { user_id: id(3), gender: null, birth_date: null },
    ], "다른 회원의 행은 바뀌지 않는다");
    await assert.rejects(db.query("update public.members set gender='other' where user_id=$1", [id(3)]), /check constraint/);
  } finally { await db.close(); }
});
