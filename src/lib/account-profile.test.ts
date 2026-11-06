import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAccountProfile, writeAccountProfile } from "./account-profile.ts";

const profile = { nickname: "테스트", companion: "후추", shape: "round", color: "sky", voice: "cedar", style: "listen" } as const;
function fake(initial: unknown, id = "a", readError = false, writeError = false) {
  let metadata = { here_profile_v1: initial };
  let writes = 0;
  return {
    client: { auth: {
      getUser: async () => ({ data: { user: { id, user_metadata: metadata } }, error: readError ? Error() : null }),
      updateUser: async ({ data }: { data: typeof metadata }) => {
        writes++;
        if (!writeError) metadata = data;
        return { data: { user: { id } }, error: writeError ? Error() : null };
      },
    } } as unknown as SupabaseClient,
    writes: () => writes,
  };
}
test("로컬 저장소가 없어도 계정 캐릭터를 복원", async () => {
  const c = fake({ version: 1, profile });
  assert.deepEqual(await readAccountProfile(c.client, "a", null), profile);
  assert.equal(c.writes(), 0);
});
test("기존 로컬 캐릭터는 계정에 한 번 이전하고 서버가 우선", async () => {
  const c = fake(undefined);
  assert.deepEqual(await readAccountProfile(c.client, "a", profile), profile);
  assert.deepEqual(await readAccountProfile(c.client, "a", { ...profile, companion: "오래된설정" }), profile);
  assert.equal(c.writes(), 1);
});
test("서버 조회 실패·다른 계정·잘못된 설정을 새 가입으로 처리하지 않음", async () => {
  for (const c of [fake(undefined, "b"), fake(undefined, "a", true), fake({ version: 1, profile: {} })]) {
    await assert.rejects(readAccountProfile(c.client, "a", profile));
    assert.equal(c.writes(), 0);
  }
  await assert.rejects(writeAccountProfile(fake(undefined, "b").client, "a", profile));
});
test("초기화는 서버에도 저장하고 다른 기기의 이전 캐시를 되살리지 않음", async () => {
  const c = fake({ version: 1, profile });
  await writeAccountProfile(c.client, "a", null);
  assert.equal(await readAccountProfile(c.client, "a", profile), null);
});
test("저장 실패를 성공으로 처리하지 않음", async () => {
  await assert.rejects(writeAccountProfile(fake(undefined, "a", false, true).client, "a", profile));
});
