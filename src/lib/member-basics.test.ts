import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  birthDigits, formatBirthDate, hasBasicsDisplayHint, isUnderAge, needsMemberBasics, parseBirthDate,
  saveMemberBasics, seoulToday, setBasicsDisplayHint,
} from "./member-basics.ts";

test("오늘 날짜는 한국 시간으로 잰다", () => {
  assert.equal(seoulToday(Date.UTC(2026, 10, 16, 14, 59)), "2026-11-16");
  assert.equal(seoulToday(Date.UTC(2026, 10, 16, 15, 0)), "2026-11-17");
});

test("생년월일 8자리는 실제 있는 날짜만 받는다", () => {
  const today = "2026-11-17";
  assert.equal(birthDigits("1999. 01. 01"), "19990101");
  assert.equal(birthDigits("2000-02-29123"), "20000229");
  assert.equal(parseBirthDate("19990101", today), "1999-01-01");
  assert.equal(parseBirthDate("1999.01.01", today), "1999-01-01");
  assert.equal(parseBirthDate("20000229", today), "2000-02-29", "윤년 2월 29일");
  for (const bad of ["", "1999011", "199901011", "19990230", "19991301", "19990100", "21000101", "20261118", "18991231", "1999a0101"]) {
    assert.equal(parseBirthDate(bad, today), null, bad);
  }
  assert.equal(parseBirthDate("20261117", today), "2026-11-17", "오늘까지는 날짜로는 맞다(나이는 따로 확인)");
});

test("만 14세는 생일 당일부터, 2월 29일생은 평년 2월 28일부터", () => {
  assert.equal(isUnderAge("2012-11-17", "2026-11-17"), false);
  assert.equal(isUnderAge("2012-11-18", "2026-11-17"), true);
  assert.equal(isUnderAge("1990-01-01", "2026-11-17"), false);
  assert.equal(isUnderAge("2012-02-29", "2026-02-27"), true);
  assert.equal(isUnderAge("2012-02-29", "2026-02-28"), false);
  assert.equal(formatBirthDate("1999-01-01"), "1999년 1월 1일");
});

function client(result: { data: unknown; error: unknown }, rpc?: (name: string, args: unknown) => { data: unknown; error: unknown }) {
  const query = {
    select: (columns: string) => { assert.equal(columns, "gender, birth_date, basics_required"); return query; },
    eq: (key: string, value: string) => { assert.equal(key, "user_id"); assert.equal(value, "member-a"); return query; },
    abortSignal: () => query,
    maybeSingle: async () => result,
  };
  return {
    from: (table: string) => { assert.equal(table, "members"); return query; },
    rpc: async (name: string, args: unknown) => rpc!(name, args),
  } as unknown as SupabaseClient;
}

test("새 회원이고 값이 비어 있을 때만 묻는다", async () => {
  const ask = (row: unknown) => needsMemberBasics(client({ data: row, error: null }), "member-a");
  assert.deepEqual(await ask({ gender: null, birth_date: null, basics_required: true }), { needed: true, known: true });
  assert.deepEqual(await ask({ gender: "female", birth_date: null, basics_required: true }), { needed: true, known: true });
  assert.deepEqual(await ask({ gender: "male", birth_date: "1990-01-01", basics_required: true }), { needed: false, known: true });
  assert.deepEqual(await ask({ gender: null, birth_date: null, basics_required: false }), { needed: false, known: true }, "기존 회원");
});

test("마이그레이션 전 DB는 묻지 않고, 그 밖의 조회 실패는 오류로 알린다", async () => {
  assert.deepEqual(await needsMemberBasics(client({ data: null, error: { code: "42703" } }), "member-a"), { needed: false, known: false });
  await assert.rejects(needsMemberBasics(client({ data: null, error: { code: "PGRST301" } }), "member-a"), /basics_unavailable/);
  await assert.rejects(needsMemberBasics(client({ data: null, error: null }), "member-a"), /basics_member_missing/);
});

test("저장은 DB 함수 결과만 그대로 돌려준다", async () => {
  const calls: unknown[] = [];
  const c = (data: unknown, error: unknown = null) => client({ data: null, error: null }, (name, args) => { calls.push([name, args]); return { data, error }; });
  assert.equal(await saveMemberBasics(c("ok"), "female", "1990-01-01"), "ok");
  assert.deepEqual(calls[0], ["set_member_basics", { p_gender: "female", p_birth_date: "1990-01-01" }]);
  assert.equal(await saveMemberBasics(c("under_14"), "male", "2020-01-01"), "under_14");
  await assert.rejects(saveMemberBasics(c(null, { message: "boom" }), "male", "1990-01-01"), /basics_save_failed/);
  await assert.rejects(saveMemberBasics(c("weird"), "male", "1990-01-01"), /basics_save_unknown/);
});

test("다시 묻지 않는 표시는 계정별로 이 기기에만 남는다", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  assert.equal(hasBasicsDisplayHint(storage, "member-a"), false);
  setBasicsDisplayHint(storage, "member-a");
  assert.equal(hasBasicsDisplayHint(storage, "member-a"), true);
  assert.equal(hasBasicsDisplayHint(storage, "member-b"), false);
  assert.equal(hasBasicsDisplayHint(storage, ""), false);
  assert.equal(hasBasicsDisplayHint(undefined, "member-a"), false);
});
