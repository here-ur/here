"use client";
import { useEffect, useRef, useState } from "react";
import { waitForCatYawn } from "@/lib/cat-yawn";
import HomeScreen from "../../HomeScreen";
import Drawer from "../../Drawer";
import Customize from "../../Customize";
import Friends from "../../Friends";
import ComingSoon from "../../ComingSoon";
import ReportPreview from "../report-preview/Preview";
import HomeHint from "../../HomeHint";
import { DEFAULT_COMPANION, type Profile } from "@/lib/onboarding";

// 메뉴 아래 "오늘 남은 대화" 막대를 보려는 예시 숫자. 실제 앱은 /api/quota에서 받아 온다.
const SAMPLE_QUOTA = { chat: { limit: 200, used: 46 }, realtime: { limit: 60, used: 12 }, resetAt: Math.floor(Date.now() / 86400000 + 1) * 86400 };

export default function Preview() {
  const [menu, setMenu] = useState(false);
  const [screen, setScreen] = useState<"home" | "library" | "insight" | "friends">("home");
  const [showHelp, setShowHelp] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [profile, setProfile] = useState<Profile>({ nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" });
  const [previewControls, setPreviewControls] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [voice, setVoice] = useState(false); // 마이크 버튼으로 음성 모드 모양만 확인한다(실제 연결 없음, 하품은 실제와 같은 시간)
  const [micOn, setMicOn] = useState(true);
  // 실제 홈처럼 마이크를 누르면 2.4초 하품한 뒤 듣기 모양으로 넘어간다(연결·마이크 권한 없음). 동작 줄이기면 바로 넘어간다.
  const [yawning, setYawning] = useState(false);
  const yawnRequest = useRef<AbortController | null>(null);
  useEffect(() => () => yawnRequest.current?.abort(), []);
  async function startVoice() {
    yawnRequest.current?.abort();
    const controller = new AbortController();
    yawnRequest.current = controller;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setYawning(!reduced);
    try { await waitForCatYawn(controller.signal, reduced); } catch { return; }
    if (yawnRequest.current === controller) { yawnRequest.current = null; setYawning(false); }
  }
  function endVoice() { yawnRequest.current?.abort(); yawnRequest.current = null; setYawning(false); setVoice(false); }
  const [mode, setMode] = useState<"first" | "return" | "memory">("first");
  const [hint, setHint] = useState(true); // 첫 만남에서만 보이는 홈 첫 방문 안내
  const headline = mode === "memory" ? "그 종이접기, 요즘도 해?\n뭐 만들었는지 얘기 좀 해 봐." : null;
  function openScreen(next: typeof screen) {
    setMenu(false);
    setOpen(false);
    setVoice(false);
    setScreen(next);
  }

  if (screen === "friends") {
    const who = { name: profile.companion, shape: profile.shape, color: profile.color, accessory: profile.accessory };
    return <Friends who={who} onBack={() => openScreen("home")} preview />;
  }
  if (screen !== "home") {
    return <ReportPreview
      key={screen}
      initialMode={screen}
      onBack={() => openScreen("home")}
      onDecorate={() => { openScreen("home"); setCustomize(true); }}
    />;
  }

  return <>{previewControls && <div className="fixed left-2 top-2 z-50 flex gap-2 rounded-xl bg-white p-2 text-sm text-black shadow">
    {([ ["first", "첫 만남"], ["return", "재방문"], ["memory", "기억 연결"] ] as const).map(([value, label]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)} className="rounded-lg border px-3 py-2 aria-pressed:bg-slate-200">{label}</button>)}
    <button onClick={() => setPreviewControls(false)} aria-label="미리보기 도구 숨기기">×</button>
  </div>}<HomeScreen
    profile={profile}
    greet={false} headline={headline}
    nudge={mode === "first" && hint ? <HomeHint name={profile.companion} onDismiss={() => setHint(false)} /> : undefined}
    onVoice={() => { setHint(false); setOpen(false); setMicOn(true); setVoice(true); void startVoice(); }} onText={() => { setHint(false); setOpen(true); }} onMenu={() => { setHint(false); setMenu(true); }}
    voice={voice ? { state: yawning ? "yawning" : micOn ? "listening" : "idle", connecting: yawning, listening: !yawning && micOn, micOn, hasMic: true, statusText: yawning ? "" : micOn ? "듣고 있어요" : "마이크가 꺼져 있어요", error: "", onEnd: endVoice, onMic: () => setMicOn(!micOn) } : undefined}
    chat={{ open, draft, sending: false, error: "", state: "idle", onDraft: setDraft, onClose: () => setOpen(false), onSend: () => {}, messages: open ? [
      { role: "user", content: "테스트 화면: 내가 좋아하는 게임과 음료는?" },
      { role: "assistant", content: "가장 좋아하는 보드게임은 **아줄**, 음료는 **따뜻한 보리차**였어.\n\n- 타일 한 장\n- 이야기 한 조각\n\n| 게임 | 음료 |\n| --- | --- |\n| 아줄 | 따뜻한 보리차 |\n\n`테스트 코드`도 읽기 쉽게 보여." },
    ] : [] }}
  >
    <Drawer open={menu} profile={profile} onClose={() => setMenu(false)} onCustomize={() => { setMenu(false); setCustomize(true); }} onLibrary={() => openScreen("library")} onHelp={() => { setMenu(false); setShowHelp(true); }} onFriends={() => openScreen("friends")} onSignOut={() => setMenu(false)} onReset={() => setMenu(false)}
      loadQuota={async () => SAMPLE_QUOTA} />
    {showHelp && <ComingSoon
      title="도움받기를 준비하고 있어요"
      body="실제 상담사와 이야기할 수 있는 방법을 준비 중이에요. 열리면 이곳에서 알려 드릴게요."
      onClose={() => setShowHelp(false)}
    />}
    {customize && <Customize profile={profile} onClose={() => setCustomize(false)} onSave={(next) => { setProfile(next); return true; }} onChat={() => { setCustomize(false); setOpen(true); }} onGarden={() => { setCustomize(false); openScreen("insight"); }} />}
  </HomeScreen></>;
}
