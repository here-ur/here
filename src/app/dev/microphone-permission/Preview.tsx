"use client";
import { useState } from "react";
import HomeScreen from "../../HomeScreen";
import { MicrophonePermissionSheet } from "../../MicrophoneAsk";
import { DEFAULT_COMPANION, type Profile } from "@/lib/onboarding";

// 홈에서 마이크를 처음 눌렀을 때 올라오는 마이크 안내 시트. 실제 권한은 요청하지 않는다.
const PROFILE: Profile = { nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" };
const CHAT = { open: false, draft: "", sending: false, error: "", state: "idle" as const, onDraft: () => {}, onClose: () => {}, onSend: () => {}, messages: [] };

export default function Preview() {
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState("");
  return <HomeScreen profile={PROFILE} greet={false} headline={null} onVoice={() => { setMessage(""); setOpen(true); }} onText={() => {}} onMenu={() => {}} chat={CHAT}>
    {open && <MicrophonePermissionSheet busy={false} error={message}
      onAllow={() => setMessage("미리보기: 실제 마이크 권한을 요청하지 않아요.")}
      onText={() => setOpen(false)} onClose={() => setOpen(false)} />}
  </HomeScreen>;
}
