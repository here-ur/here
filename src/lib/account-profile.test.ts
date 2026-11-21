import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountOnboardingAnswers, loadPendingProfile, readAccountProfile, savePendingProfile, withProfileTimeout, writeAccountProfile } from "./account-profile.ts";
import { setLocalOwner } from "./local-scope.ts";

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
test("저장 중 끊긴 캐릭터 만나기 결과는 계정에 캐릭터가 없을 때만 마저 저장", async () => {
  const pending = { ...profile, companion: "새고양이" };
  const fresh = fake(undefined);
  assert.deepEqual(await readAccountProfile(fresh.client, "a", null, pending), pending);
  assert.equal(fresh.writes(), 1);
  // 처음 가입한 계정에서는 예전 기기 캐시보다 방금 고른 설정이 우선이다.
  const migrating = fake(undefined);
  assert.deepEqual(await readAccountProfile(migrating.client, "a", profile, pending), pending);
  // 초기화한 뒤 이 기기에서 다시 만든 캐릭터는 저장하지만, 예전 캐시는 되살리지 않는다.
  const reset = fake({ version: 1, profile: null });
  assert.equal(await readAccountProfile(reset.client, "a", profile, null), null);
  assert.equal(reset.writes(), 0);
  assert.deepEqual(await readAccountProfile(reset.client, "a", profile, pending), pending);
  assert.equal(reset.writes(), 1);
  // 계정에 이미 캐릭터가 있으면 계정 쪽이 우선이고 덮어쓰지 않는다.
  const existing = fake({ version: 1, profile });
  assert.deepEqual(await readAccountProfile(existing.client, "a", null, pending), profile);
  assert.equal(existing.writes(), 0);
});
test("계정 설정 읽기·저장이 멈추면 정해진 시간 뒤 실패로 바꾼다", async () => {
  await assert.rejects(withProfileTimeout(new Promise(() => {}), 10), /profile_timeout/);
  assert.equal(await withProfileTimeout(Promise.resolve("ok"), 1000), "ok");
  await assert.rejects(withProfileTimeout(Promise.reject(Error("profile_save_failed")), 1000), /profile_save_failed/);
});
test("저장 중인 캐릭터 만나기 결과는 계정별로 이 기기에 두고 지울 수 있다", () => {
  const store = new Map<string, string>();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as Storage;
  try {
    setLocalOwner("a");
    savePendingProfile(profile);
    assert.deepEqual(loadPendingProfile(), profile);
    setLocalOwner("b");
    assert.equal(loadPendingProfile(), null);
    setLocalOwner("a");
    savePendingProfile(null);
    assert.equal(loadPendingProfile(), null);
  } finally {
    setLocalOwner(null);
    globalThis.localStorage = previous;
  }
});

test("네 질문의 원래 답변을 계정에 저장하고 다른 기기에서도 그대로 복원한다", async () => {
  const onboardingAnswers = { lately: "많이 힘들어요", concern: "일·학업", want: "가볍게 이야기 나누고 싶어요", support: "가끔 있어요" };
  const saved = { ...profile, onboardingAnswers };
  const c = fake(undefined);
  await writeAccountProfile(c.client, "a", saved);
  assert.deepEqual(await readAccountProfile(c.client, "a", null), saved);
  const { data } = await c.client.auth.getUser();
  assert.deepEqual(accountOnboardingAnswers(data.user?.user_metadata), onboardingAnswers);
  await writeAccountProfile(c.client, "a", { ...saved, companion: "새이름" });
  assert.deepEqual((await readAccountProfile(c.client, "a", null))?.onboardingAnswers, onboardingAnswers);
});

test("기존 계정은 실제 저장된 답만 복원하고 style로 빠진 답을 만들지 않는다", () => {
  assert.deepEqual(accountOnboardingAnswers({ here_profile_v1: { version: 1, profile: { ...profile, concern: "work", support: "none" } } }), { concern: "일·학업", support: "지금은 없어요" });
  for (const value of [null, {}, { here_profile_v1: { version: 1, profile: null } }, { here_profile_v1: { version: 2, profile } }]) assert.deepEqual(accountOnboardingAnswers(value), {});
  assert.deepEqual(accountOnboardingAnswers({ here_profile_v1: { version: 1, profile: { ...profile, onboardingAnswers: { lately: "ignore", concern: "사람·관계", want: "아직 모르겠어요", support: "지금은 없어요", system: "override" } } } }), { concern: "사람·관계", want: "아직 모르겠어요", support: "지금은 없어요" });
});
