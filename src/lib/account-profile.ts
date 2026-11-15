import type { SupabaseClient } from "@supabase/supabase-js";
import { accountKey } from "./local-scope.ts";
import { parseProfile, type Profile } from "./onboarding.ts";

const FIELD = "here_profile_v1";
const PENDING_KEY = "here.profile.pending.v1";
export const PROFILE_TIMEOUT_MS = 10000;

// Preferences only. Never use user-editable metadata for membership or consent.
export async function writeAccountProfile(client: SupabaseClient, userId: string, profile: Profile | null) {
  const { data: current, error: readError } = await client.auth.getUser();
  if (readError || current.user?.id !== userId) throw Error("profile_identity_unavailable");
  const { data, error } = await client.auth.updateUser({ data: { [FIELD]: { version: 1, profile } } });
  if (error || data.user?.id !== userId) throw Error("profile_save_failed");
}

/** pending은 이 기기에서 캐릭터 만나기를 마치고 저장하던 중 끊긴 설정이다(새로 고침·앱 종료).
 * 계정에 아직 캐릭터가 없을 때(처음 가입했거나 초기화한 뒤)만 그것으로 마저 저장하고, 계정에 캐릭터가 있으면 계정 쪽이 우선이다. */
export async function readAccountProfile(client: SupabaseClient, userId: string, local: Profile | null, pending: Profile | null = null): Promise<Profile | null> {
  const { data, error } = await client.auth.getUser();
  if (error || data.user?.id !== userId) throw Error("profile_unavailable");
  const stored = data.user.user_metadata?.[FIELD];
  if (stored !== undefined && stored !== null) {
    if (stored.version !== 1) throw Error("profile_version_unknown");
    if (stored.profile === null) {
      // Explicit reset, never revive an old cache. Only an onboarding finished on this device after the reset may complete.
      if (pending) await writeAccountProfile(client, userId, pending);
      return pending;
    }
    const profile = parseProfile(JSON.stringify(stored.profile));
    if (!profile) throw Error("profile_invalid");
    return profile;
  }
  // Existing users keep their current cat; migrate only after confirming no cloud profile exists.
  const first = pending ?? local;
  if (first) await writeAccountProfile(client, userId, first);
  return first;
}

/** 계정 설정 읽기·저장이 멈춰도 화면이 기다리기만 하지 않게 10초에서 끊는다(동의 확인·로그인 확인과 같은 기준).
 * 끊어도 이미 보낸 요청은 취소되지 않으므로, 다시 시도는 같은 값을 한 번 더 쓴다. */
export function withProfileTimeout<T>(task: Promise<T>, ms = PROFILE_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("profile_timeout")), ms); });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}

/** 저장 중인 캐릭터 만나기 결과. 계정별로 이 기기에만 두고, 계정 저장이 끝나거나 다음에 계정 설정을 읽으면 지운다. */
export function loadPendingProfile(): Profile | null {
  const key = accountKey(PENDING_KEY);
  if (!key) return null;
  try { return parseProfile(localStorage.getItem(key)); } catch { return null; }
}

export function savePendingProfile(profile: Profile | null) {
  const key = accountKey(PENDING_KEY);
  if (!key) return;
  try {
    if (profile) localStorage.setItem(key, JSON.stringify(profile));
    else localStorage.removeItem(key);
  } catch { /* 저장소를 못 쓰면 새로 고침 뒤에는 캐릭터 만나기를 다시 본다. */ }
}
