"use client";

import { Button } from "./ui/Button";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { markMicrophoneNoticeSeen, microphoneErrorMessage, microphoneNoticeSeen, microphonePermission, requestMicrophonePermission } from "@/lib/microphone-permission";
import Buddy from "./Buddy";

export function MicrophonePermissionNotice({ busy, error, onAllow, onSkip }: {
  busy: boolean; error: string; onAllow: () => void; onSkip: () => void;
}) {
  return <main className="app-frame app-frame-scrollable flex flex-col bg-ios-page px-gutter py-8 text-[#1F2A55]">
    <p className="text-t5 font-bold">Here!</p>
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      <div aria-hidden="true"><Buddy shape="cloud" color="lavender" size={180} state="idle" bob /></div>
      <h1 className="mt-6 text-balance text-t7 font-bold">목소리로도 이야기해요</h1>
      <p className="mt-4 max-w-xs text-pretty text-t4 leading-relaxed text-ios-secondary">마이크를 허용해 두면, 홈에서 음성 버튼을 눌렀을 때 몽글이가 먼저 인사해요.</p>
      <p className="mt-5 max-w-xs text-pretty text-t3 leading-relaxed text-ios-secondary">지금은 권한만 확인해요.<br />음성 대화를 시작하기 전에는 녹음하거나 전송하지 않아요.</p>
    </div>
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-r3 bg-white px-4 py-3 text-t3 leading-relaxed text-[#C2362B]">{error}</p>}
      {busy && <p role="status" className="text-center text-t3 text-ios-secondary">브라우저의 마이크 권한 창을 확인해 주세요.</p>}
      <Button type="button" loading={busy} onClick={onAllow} fullWidth>마이크 사용 허용</Button>
      <Button variant="tonal" type="button" onClick={onSkip} fullWidth>나중에 할게요</Button>
    </div>
  </main>;
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
  if (state === "checking") return <main className="app-frame bg-ios-page" aria-busy="true" aria-label="앱 준비 중" />;
  return <MicrophonePermissionNotice busy={busy} error={error} onAllow={() => { void allow(); }} onSkip={skip} />;
}
