"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { markMicrophoneNoticeSeen, microphoneAskStep, microphoneErrorMessage, microphoneNoticeSeen, microphonePermission, requestMicrophonePermission } from "@/lib/microphone-permission";
import Sheet from "./Sheet";
import { Icon } from "./art";
import { Button } from "./ui/Button";
import "./first-run.css";

const BLOCKED = "마이크가 차단돼 있어요. 브라우저의 사이트 설정에서 허용하거나, 글로 먼저 이야기할 수 있어요.";

/** 마이크 안내 시트. 홈에서 마이크 버튼을 처음 누를 때 홈 위에 작게 올라온다(써 보기 전에 미리 묻지 않는다).
 * 허용은 권한만 확인하고 스트림을 바로 끊는다(녹음·전송 없음). '지금은 글로'는 글 입력창을 연다. 바깥 누르기·Escape는 닫기만 한다. */
export function MicrophonePermissionSheet({ busy, error, onAllow, onText, onClose }: {
  busy: boolean; error: string; onAllow: () => void; onText: () => void; onClose: () => void;
}) {
  return <Sheet title="목소리로 이야기하려면 마이크가 필요해요" onClose={onClose} headerless slide locked={busy} className="mic-ask-sheet">
    <div className="mic-ask fr-scope">
      <span className="mic-ask-badge" aria-hidden="true"><Icon name="mic" size={30} /></span>
      <p className="mic-ask-title" aria-hidden="true">목소리로 이야기하려면<br />마이크가 필요해요</p>
      <p className="mic-ask-desc">권한만 확인하고, 녹음·전송하지 않아요.</p>
      {error && <p role="alert" className="fr-error">{error}</p>}
      {busy && <p role="status" className="fr-note">브라우저의 마이크 권한 창을 확인해 주세요.</p>}
      <Button tone="ink" fullWidth loading={busy} onClick={onAllow}>마이크 사용 허용</Button>
      <Button variant="plain" className="fr-link" disabled={busy} onClick={onText}>지금은 글로 이야기할게요</Button>
    </div>
  </Sheet>;
}

/** 홈의 마이크 버튼에 붙이는 안내 흐름. ask()는 권한이 이미 있거나 안내를 거쳐 허용했으면 바로 start를 부르고,
 * 아니면 시트를 띄운다(판단은 microphoneAskStep). 시트에서 허용하면 권한을 확인한 뒤 start를 부른다.
 * 글을 고르면 같은 클릭 안에서 시트를 닫고 글 입력창을 연 뒤 focusText로 입력칸에 포커스를 옮겨, 휴대폰 키보드가 바로 열린다. */
export function useMicrophoneAsk(start: () => void, toText: () => void, focusText?: () => void) {
  const [sheet, setSheet] = useState<{ busy: boolean; error: string } | null>(null);
  const checking = useRef(false);

  async function ask() {
    if (checking.current) return;
    const context = { seen: microphoneNoticeSeen(), supported: Boolean(navigator.mediaDevices?.getUserMedia) };
    if (microphoneAskStep(context) === "start") { start(); return; }
    checking.current = true;
    try {
      const step = microphoneAskStep({ ...context, permission: await microphonePermission(navigator) });
      if (step === "start") { markMicrophoneNoticeSeen(); start(); return; }
      setSheet({ busy: false, error: step === "blocked" ? BLOCKED : "" });
    } finally {
      checking.current = false;
    }
  }

  async function allow() {
    if (sheet?.busy) return;
    setSheet({ busy: true, error: "" });
    try {
      await requestMicrophonePermission(navigator.mediaDevices);
      markMicrophoneNoticeSeen();
      setSheet(null);
      start();
    } catch (error) {
      setSheet({ busy: false, error: microphoneErrorMessage(error) });
    }
  }

  const element = sheet && <MicrophonePermissionSheet busy={sheet.busy} error={sheet.error}
    onAllow={() => { void allow(); }}
    onText={() => { flushSync(() => { setSheet(null); toText(); }); focusText?.(); }}
    onClose={() => setSheet(null)} />;
  return { ask: () => { void ask(); }, sheet: element };
}
