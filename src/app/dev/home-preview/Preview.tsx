"use client";
import { useState } from "react";
import HomeScreen from "../../HomeScreen";
import { DEFAULT_COMPANION } from "@/lib/onboarding";
import { FIRST_HOME_OPENER, DEFAULT_HOME_OPENER } from "@/lib/home-opener";

export default function Preview() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"first" | "return" | "memory">("first");
  const headline = mode === "first" ? FIRST_HOME_OPENER : mode === "return" ? DEFAULT_HOME_OPENER : "요즘 아줄 어때?\n재밌는 일 있었어?";
  return <><div className="fixed left-2 top-2 z-50 flex gap-2 rounded-xl bg-white p-2 text-sm text-black shadow">
    {([ ["first", "첫 만남"], ["return", "재방문"], ["memory", "기억 연결"] ] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className="rounded-lg border px-3 py-2 aria-pressed:bg-slate-200">{label}</button>)}
  </div><HomeScreen
    profile={{ nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" }}
    greet={false} headline={headline}
    onVoice={() => {}} onText={() => setOpen(true)} onLog={() => {}} onMenu={() => {}}
    chat={{ open, draft, sending: false, error: "", state: "idle", onDraft: setDraft, onClose: () => setOpen(false), onSend: () => {}, messages: open ? [
      { role: "user", content: "테스트 화면: 내가 좋아하는 게임과 음료는?" },
      { role: "assistant", content: "가장 좋아하는 보드게임은 **아줄**, 음료는 **따뜻한 보리차**였어.\n\n- 타일 한 장\n- 이야기 한 조각\n\n| 게임 | 음료 |\n| --- | --- |\n| 아줄 | 따뜻한 보리차 |\n\n`테스트 코드`도 읽기 쉽게 보여." },
    ] : [] }}
  /></>;
}
