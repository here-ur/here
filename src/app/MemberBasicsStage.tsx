"use client";

import { useState } from "react";
import OnboardingStage, { type StageSnapshot } from "./OnboardingStage";
import { basicsFromAnswers, basicsSaveError } from "@/lib/member-basics";
import type { MemberBasics } from "./member-basics-context";

/** 이미 캐릭터가 있는데 성별·생년월일이 비어 있는 회원: 홈 앞에서 생일·성별 장면만 연다. */
export default function MemberBasicsStage({ basics, nickname, signOut }: { basics: MemberBasics; nickname: string; signOut: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function finish(snapshot: StageSnapshot) {
    const values = basicsFromAnswers(snapshot.answers);
    if (saving || !values) return;
    setSaving(true); setError("");
    try {
      const result = await basics.save(values.gender, values.birthDate);
      if (result !== "ok") setError(basicsSaveError(result));
    } catch { setError(basicsSaveError("failed")); }
    finally { setSaving(false); }
  }
  return <OnboardingStage scene="birthday" scenes={["birthday", "gender"]} initial={{ nickname }} saving={saving} saveError={error} onFinish={(s) => { void finish(s); }} onSignOut={signOut} />;
}
