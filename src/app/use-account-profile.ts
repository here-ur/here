"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readAccountProfile, writeAccountProfile } from "@/lib/account-profile";
import { clearProfile, loadProfile, saveProfile, type Profile } from "@/lib/onboarding";
import { browserSupabase } from "@/lib/supabase";

export function useAccountProfile(userId: string) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const client = browserSupabase();
    if (!client) return;
    void readAccountProfile(client, userId, loadProfile()).then(p => {
      if (!active) return;
      if (p) saveProfile(p); else clearProfile();
      setProfile(p); setError("");
    }).catch(() => { if (active) setError("기존 캐릭터 설정을 불러오지 못했어요. 다시 확인해 주세요."); });
    return () => { active = false; };
  }, [userId, attempt]);
  const save = useCallback(async (p: Profile | null) => {
    setSaving(true); setError("");
    try {
      const client = browserSupabase();
      if (!client) throw Error("not_configured");
      await writeAccountProfile(client, userId, p);
      if (!mounted.current) return false;
      if (p) saveProfile(p); else clearProfile();
      setProfile(p);
      return true;
    } catch { setError("캐릭터 설정을 저장하지 못했어요. 다시 시도해 주세요."); return false; }
    finally { setSaving(false); }
  }, [userId]);
  return { profile, error, saving, save, retry: () => setAttempt(n => n + 1) };
}
