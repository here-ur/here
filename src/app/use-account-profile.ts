"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadPendingProfile, readAccountProfile, savePendingProfile, withProfileTimeout, writeAccountProfile } from "@/lib/account-profile";
import { clearProfile, loadProfile, saveProfile, type Profile } from "@/lib/onboarding";
import { browserSupabase } from "@/lib/supabase";

/** 계정의 캐릭터 설정. 이 기기에 남은 설정(저장 중이던 것 → 지난번 캐시)으로 먼저 그려서, 로그인 뒤 화면 전환이 빈 화면에 내려앉지 않게 한다.
 * 계정에서 읽은 값이 오면 그것으로 바꾼다(다른 기기에서 바꾸거나 초기화했으면 그쪽을 따른다). 읽기에 실패해도 먼저 그린 설정은 그대로 쓴다.
 * startEmpty: 방금 처음부터 다시 만들기로 캐릭터를 지운 뒤 새로 연 홈이라, 기다리지 않고 캐릭터 만나기부터 그린다.
 * onRemoteReset: 먼저 그린 캐릭터가 계정에서는 지워져 있을 때(다른 기기에서 처음부터 다시 만들기) 홈을 새로 연다. */
export function useAccountProfile(userId: string, { startEmpty = false, onRemoteReset }: { startEmpty?: boolean; onRemoteReset?: () => void } = {}) {
  const [profile, setProfile] = useState<Profile | null | undefined>(() => loadPendingProfile() ?? (startEmpty ? null : loadProfile() ?? undefined));
  const remoteReset = useRef(onRemoteReset);
  useEffect(() => { remoteReset.current = onRemoteReset; }, [onRemoteReset]);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const current = useRef(profile);
  const writes = useRef(0);
  useEffect(() => { current.current = profile; }, [profile]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const client = browserSupabase();
    if (!client) return;
    const writesAtStart = writes.current;
    void withProfileTimeout(readAccountProfile(client, userId, loadProfile(), loadPendingProfile())).then(p => {
      if (!active) return;
      // 먼저 그린 캐릭터를 읽는 사이 꾸미기에서 바꿨으면 그 저장이 더 새롭다. 읽은 값으로 되돌리지 않는다.
      if (writes.current !== writesAtStart) return;
      // 먼저 그린 캐릭터가 계정에서는 초기화돼 있으면(다른 기기에서 처음부터 다시 만들기) 이 기기의 초기화처럼 홈을 새로 열어,
      // 그사이 시작한 음성·글 대화를 모두 닫고 캐릭터 만나기부터 시작한다. 새 홈은 빈 캐릭터로 시작하므로 되풀이되지 않는다.
      if (!p && current.current && remoteReset.current) {
        clearProfile();
        remoteReset.current();
        return;
      }
      savePendingProfile(null);
      if (p) saveProfile(p); else clearProfile();
      setProfile(p); setLoadError("");
    }).catch(() => { if (active) setLoadError("캐릭터 설정을 불러오지 못했어요"); });
    return () => { active = false; };
  }, [userId, attempt]);
  const save = useCallback(async (p: Profile | null) => {
    writes.current += 1;
    setSaving(true); setSaveError("");
    // 캐릭터 만나기를 마치고 저장하는 중에 새로 고치거나 앱이 닫혀도 고른 설정을 잃지 않게 먼저 이 기기에 남긴다.
    // 다음에 열 때 계정에 아직 캐릭터가 없으면 이것으로 마저 저장한다. 초기화는 남은 것을 지운다.
    if (!p) savePendingProfile(null);
    else if (current.current === null) savePendingProfile(p);
    try {
      const client = browserSupabase();
      if (!client) throw Error("not_configured");
      await withProfileTimeout(writeAccountProfile(client, userId, p));
      // 그사이 로그아웃·계정 전환으로 화면이 내려갔으면 다른 계정의 저장소를 건드리지 않는다(남은 것은 다음에 읽을 때 정리된다).
      if (!mounted.current) return false;
      savePendingProfile(null);
      if (p) saveProfile(p); else clearProfile();
      setProfile(p);
      return true;
    } catch { if (mounted.current) setSaveError("캐릭터 설정을 저장하지 못했어요. 다시 시도해 주세요."); return false; }
    finally { if (mounted.current) setSaving(false); }
  }, [userId]);
  const retry = useCallback(() => { setLoadError(""); setAttempt(n => n + 1); }, []);
  const clearSaveError = useCallback(() => setSaveError(""), []);
  return { profile, loadError, saveError, saving, save, retry, clearSaveError };
}
