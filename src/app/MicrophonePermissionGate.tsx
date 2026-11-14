"use client";

import { Button } from "./ui/Button";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { markMicrophoneNoticeSeen, microphoneErrorMessage, microphoneNoticeSeen, microphonePermission, requestMicrophonePermission } from "@/lib/microphone-permission";
import Buddy, { type BuddyState } from "./Buddy";
import { CatRings, FirstRunFooter, FirstRunHeading, FirstRunScreen } from "./FirstRun";
import { DEFAULT_COMPANION, josa } from "@/lib/onboarding";

export function MicrophonePermissionNotice({ busy, error, onAllow, onSkip }: {
  busy: boolean; error: string; onAllow: () => void; onSkip: () => void;
}) {
  // 고양이는 화면 상태만 보고 움직인다. 허용 버튼에 손이 가면 그쪽을 보고(attentive), 브라우저 권한 창을 기다리는 동안은
  // 생각하는 얼굴(thinking)이다. 이 화면에서는 마이크를 켜지 않으므로 듣는 상태(listening)는 쓰지 않는다.
  const [eyeing, setEyeing] = useState(false);
  const state: BuddyState = busy ? "thinking" : eyeing ? "attentive" : "idle";
  const watch = {
    onPointerEnter: () => setEyeing(true), onPointerLeave: () => setEyeing(false),
    onFocus: () => setEyeing(true), onBlur: () => setEyeing(false),
  };
  return <FirstRunScreen tone="white" scroll className="fr-mic-screen">
    <div className="fr-topbar" aria-hidden="true" />
    <div className="fr-mic flex flex-1 flex-col items-center justify-center gap-7 py-4">
      <CatRings size={260}><div className="fr-mic-cat"><Buddy size={200} state={state} groundShadow /></div></CatRings>
      <FirstRunHeading title="목소리로도 이야기해요"
        description={<>음성 버튼을 누르면 {josa(DEFAULT_COMPANION, "이", "가")} 먼저 인사해요.<br />지금은 권한만 확인하고, 녹음·전송하지 않아요.</>} />
    </div>
    <FirstRunFooter>
      {error && <p role="alert" className="fr-error">{error}</p>}
      {busy && <p role="status" className="fr-note">브라우저의 마이크 권한 창을 확인해 주세요.</p>}
      <Button type="button" tone="ink" loading={busy} onClick={onAllow} fullWidth {...watch}>마이크 사용 허용</Button>
      <Button variant="tonal" tone="ink" type="button" onClick={onSkip} fullWidth className="fr-ghost">나중에 할게요</Button>
    </FirstRunFooter>
  </FirstRunScreen>;
}

export default function MicrophonePermissionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "notice" | "ready">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    let cancelled = false;
    // Never wait indefinitely for a browser-specific Permissions implementation.
    const timer = setTimeout(() => { if (!cancelled) setState(microphoneNoticeSeen() ? "ready" : "notice"); }, 1000);
    void (async () => {
      if (microphoneNoticeSeen() || !navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) setState("ready");
        clearTimeout(timer);
        return;
      }
      const permission = await microphonePermission(navigator);
      if (cancelled) return;
      clearTimeout(timer);
      if (microphoneNoticeSeen()) { setState("ready"); return; }
      if (permission === "granted") markMicrophoneNoticeSeen();
      if (permission === "denied") setError("마이크가 차단돼 있어요. 브라우저의 사이트 설정에서 허용하거나, 글로 먼저 이야기할 수 있어요.");
      setState(permission === "granted" ? "ready" : "notice");
    })();
    return () => { cancelled = true; active.current = false; clearTimeout(timer); };
  }, []);

  function skip() {
    markMicrophoneNoticeSeen();
    setState("ready");
  }
  async function allow() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError("");
    try {
      await requestMicrophonePermission(navigator.mediaDevices);
      markMicrophoneNoticeSeen();
      if (active.current) setState("ready");
    } catch (error) {
      if (active.current) setError(microphoneErrorMessage(error));
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (state === "ready") return children;
  if (state === "checking") return <main className="app-frame bg-white" aria-busy="true" aria-label="앱 준비 중" />;
  return <MicrophonePermissionNotice busy={busy} error={error} onAllow={() => { void allow(); }} onSkip={skip} />;
}
