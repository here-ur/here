"use client";
import { useState } from "react";
import HomeScreen from "../../HomeScreen";
import Drawer from "../../Drawer";
import Customize from "../../Customize";
import { DEFAULT_COMPANION, type Profile } from "@/lib/onboarding";

export default function Preview() {
  const [menu, setMenu] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [profile, setProfile] = useState<Profile>({ nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" });
  const [previewControls, setPreviewControls] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [voice, setVoice] = useState(false); // 마이크 버튼으로 음성 모드 모양만 확인한다(실제 연결 없음)
  const [micOn, setMicOn] = useState(true);
  const [mode, setMode] = useState<"first" | "return" | "memory">("first");
  const headline = mode === "memory" ? "그 종이접기, 요즘도 해?\n뭐 만들었는지 얘기 좀 해 봐." : null;
  return <>{previewControls && <div className="fixed left-2 top-2 z-50 flex gap-2 rounded-xl bg-white p-2 text-sm text-black shadow">
    {([ ["first", "첫 만남"], ["return", "재방문"], ["memory", "기억 연결"] ] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className="rounded-lg border px-3 py-2 aria-pressed:bg-slate-200">{label}</button>)}
    <button onClick={() => setPreviewControls(false)} aria-label="미리보기 도구 숨기기">×</button>
  </div>}<HomeScreen
    profile={profile}
    greet={false} headline={headline}
    onVoice={() => { setOpen(false); setMicOn(true); setVoice(true); }} onText={() => setOpen(true)} onLibrary={() => {}} onMenu={() => setMenu(true)}
    voice={voice ? { state: micOn ? "listening" : "idle", connecting: false, listening: micOn, micOn, hasMic: true, statusText: micOn ? "듣고 있어요" : "마이크가 꺼져 있어요", error: "", onEnd: () => setVoice(false), onMic: () => setMicOn(!micOn) } : undefined}
    chat={{ open, draft, sending: false, error: "", state: "idle", onDraft: setDraft, onClose: () => setOpen(false), onSend: () => {}, messages: open ? [
      { role: "user", content: "테스트 화면: 내가 좋아하는 게임과 음료는?" },
      { role: "assistant", content: "가장 좋아하는 보드게임은 **아줄**, 음료는 **따뜻한 보리차**였어.\n\n- 타일 한 장\n- 이야기 한 조각\n\n| 게임 | 음료 |\n| --- | --- |\n| 아줄 | 따뜻한 보리차 |\n\n`테스트 코드`도 읽기 쉽게 보여." },
    ] : [] }}
  >
    <Drawer open={menu} profile={profile} onClose={() => setMenu(false)} onCustomize={() => { setMenu(false); setCustomize(true); }} onLibrary={() => setMenu(false)} onInsight={() => setMenu(false)} onHelp={() => setMenu(false)} onFriends={() => setMenu(false)} onSignOut={() => setMenu(false)} onReset={() => setMenu(false)} />
    {customize && <Customize profile={profile} onClose={() => setCustomize(false)} onSave={(next) => { setProfile(next); setCustomize(false); }} />}
  </HomeScreen></>;
}
