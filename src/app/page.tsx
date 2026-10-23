"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasCrisisSignal } from "@/lib/crisis";
import { type Msg, type Session, saveSession } from "@/lib/log";
import { type Profile, clearProfile, josa, parseProfile, profileRaw, saveProfile } from "@/lib/onboarding";
import { type Realtime, connectRealtime } from "@/lib/realtime";
import { CallScreen, SummaryScreen, TextScreen } from "./Conversation";
import Customize from "./Customize";
import Drawer from "./Drawer";
import HomeScreen from "./HomeScreen";
import Hospitals from "./Hospitals";
import Log from "./Log";
import Onboarding from "./Onboarding";

type Status = "connecting" | "idle" | "listening" | "thinking" | "speaking";

const hint = (status: Status, name: string) =>
  ({
    connecting: `${josa(name, "과", "와")} 연결하는 중…`,
    idle: `편하게 말해요. ${josa(name, "이", "가")} 듣고 있어요`,
    listening: "듣고 있어요",
    thinking: "생각하는 중…",
    speaking: `${josa(name, "이", "가")} 말하는 중`,
  })[status];

const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

const noSubscribe = () => () => {};

export default function Home() {
  // 첫 실행이면 온보딩부터. 서버 렌더에서는 localStorage를 모르니 undefined로 비워 둔다.
  const storedProfile = useSyncExternalStore(noSubscribe, profileRaw, () => undefined);
  const [newProfile, setNewProfile] = useState<Profile | null>(null);
  const profile = newProfile ?? (storedProfile === undefined ? undefined : parseProfile(storedProfile));

  const [justMet, setJustMet] = useState(false); // 온보딩을 막 끝냈으면 홈에서 몽글이가 처음 인사한다
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [live, setLive] = useState(""); // 몽글이가 말하는 중인 문장
  const [status, setStatus] = useState<Status>("idle");
  const [crisis, setCrisis] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [showHospitals, setShowHospitals] = useState(false);
  const [sound, setSound] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [hasMic, setHasMic] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [captions, setCaptions] = useState(false); // 자막: 소리가 안 들릴 때를 위해
  const [elapsed, setElapsed] = useState(0);
  const [ended, setEnded] = useState(false); // 통화를 끝내고 대화 내용을 보는 중

  const rt = useRef<Realtime | null>(null);
  const session = useRef<Session | null>(null);

  useEffect(() => () => rt.current?.close(), []);

  const connecting = status === "connecting";
  useEffect(() => {
    if (!started || ended || connecting) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [started, ended, connecting]);


  function add(msg: Msg) {
    setMessages((prev) => {
      const next = [...prev, msg];
      if (session.current) saveSession({ ...session.current, messages: next });
      return next;
    });
  }

  function sendText(text: string) {
    text = text.trim();
    if (!text || !rt.current) return;
    if (hasCrisisSignal(text)) setCrisis(true); // 몽글이 답보다 먼저 109를 띄운다
    add({ role: "user", content: text });
    setStatus("thinking");
    rt.current.sendText(text);
  }

  /** 대화 시작. 홈의 글 칸에서 시작하면(firstText) 소리는 끄고 자막·글 입력을 켠 채로 그 글부터 보낸다. */
  async function begin(firstText?: string) {
    session.current = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, startedAt: Date.now(), messages: [] };
    setJustMet(false);
    setStarted(true);
    const quiet = Boolean(firstText);
    if (quiet) {
      setSound(false);
      setTyping(true);
      setCaptions(true);
    }
    setStatus("connecting");
    setError("");
    try {
      const conn = await connectRealtime({
        onStatus: setStatus,
        onUserPartial: (text) => hasCrisisSignal(text) && setCrisis(true),
        onUserText: (text) => {
          if (hasCrisisSignal(text)) setCrisis(true);
          add({ role: "user", content: text });
        },
        onAssistantPartial: setLive,
        onAssistantText: (text) => {
          setLive("");
          add({ role: "assistant", content: text });
        },
        onTool: (name) => (name === "show_crisis_help" ? setCrisis(true) : setSuggest(true)),
        onError: setError,
      }, { name: profile?.companion, voice: profile?.voice });
      rt.current = conn;
      conn.setSound(quiet ? false : sound);
      setHasMic(conn.hasMic);
      if (!conn.hasMic) {
        setMicOn(false);
        setTyping(true);
        setCaptions(true);
        if (!quiet) setError("마이크를 쓸 수 없어서 글로 적을 수 있게 열어 뒀어."); // 글로 시작했으면 알릴 필요 없다
      }
      setStatus("idle");
      if (firstText) sendText(firstText);
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
  }

  /** 통화 → 글 대화: 마이크와 소리를 끄고 같은 대화를 글로 이어 간다 */
  function toText() {
    rt.current?.setMic(false);
    rt.current?.setSound(false);
    setMicOn(false);
    setSound(false);
    setTyping(true);
  }

  /** 글 대화 → 통화: 마이크와 소리를 켠다 */
  function toVoice() {
    if (!hasMic) return;
    rt.current?.setMic(true);
    rt.current?.setSound(true);
    setMicOn(true);
    setSound(true);
    setTyping(false);
  }

  function hangUp() {
    rt.current?.close();
    rt.current = null;
    if (messages.some((m) => m.role === "user")) setEnded(true);
    else reset();
  }

  function reset() {
    setEnded(false);
    setElapsed(0);
    setCaptions(false);
    setStarted(false);
    setShowLog(false);
    session.current = null;
    setMessages([]);
    setLive("");
    setCrisis(false);
    setSuggest(false);
    setTyping(false);
    setMicOn(true);
    setError("");
    setStatus("idle");
  }

  if (profile === undefined) return <main className="mx-auto h-dvh w-full max-w-[430px] bg-[#FAFCFE]" />; // 저장소를 읽기 전 한순간

  if (profile === null) {
    return (
      <Onboarding
        onDone={(p) => {
          saveProfile(p);
          setNewProfile(p);
          setJustMet(true);
        }}
      />
    );
  }

  const who = { name: profile.companion, shape: profile.shape ?? "cloud", color: profile.color ?? "lavender" };
  const clinics = showHospitals && <Hospitals color={who.color} onClose={() => setShowHospitals(false)} />;

  if (showLog) return <Log who={who} onBack={() => setShowLog(false)} />;

  if (!started) {
    const me = { ...profile, shape: who.shape, color: who.color };
    return (
      <HomeScreen profile={me} greet={justMet} onVoice={() => begin()} onText={(t) => begin(t)} onLog={() => setShowLog(true)} onMenu={() => setShowMenu(true)}>
        <Drawer
          open={showMenu}
          profile={me}
          onClose={() => setShowMenu(false)}
          onLog={() => {
            setShowMenu(false);
            setShowLog(true);
          }}
          onCustomize={() => {
            setShowMenu(false);
            setCustomizing(true);
          }}
          onClinics={() => {
            setShowMenu(false);
            setShowHospitals(true);
          }}
          onReset={() => {
            if (!window.confirm(`${profile.companion} 설정을 지우고 처음부터 다시 할까요? 대화 기록은 그대로 남아요.`)) return;
            clearProfile();
            location.reload();
          }}
        />
        {customizing && (
          <Customize
            profile={me}
            onClose={() => setCustomizing(false)}
            onSave={(p) => {
              saveProfile(p);
              setNewProfile(p);
              setCustomizing(false);
            }}
          />
        )}
        {clinics}
      </HomeScreen>
    );
  }

  if (ended) {
    return (
      <>
        <SummaryScreen who={who} messages={messages} clock={`대화 ${clock(elapsed)}`} crisis={crisis} suggest={suggest} onClinics={() => setShowHospitals(true)} onClose={reset} />
        {clinics}
      </>
    );
  }

  if (typing) {
    return (
      <>
        <TextScreen
          who={who}
          messages={messages}
          live={live}
          thinking={status === "thinking" || connecting}
          error={error}
          connecting={connecting}
          crisis={crisis}
          suggest={suggest}
          hasMic={hasMic}
          draft={draft}
          onDraft={setDraft}
          onSend={() => {
            sendText(draft);
            setDraft("");
          }}
          onClinics={() => setShowHospitals(true)}
          onVoice={toVoice}
          onBack={hangUp}
        />
        {clinics}
      </>
    );
  }

  const listening = status === "listening" && micOn;
  const lastAssistant = live || messages.findLast((m) => m.role === "assistant")?.content;
  const statusText = error || (!micOn && status === "idle" ? "마이크가 꺼져 있어요" : hint(status, who.name));

  return (
    <>
      <CallScreen
        who={who}
        status={status}
        listening={listening}
        statusText={statusText}
        error={error}
        clock={connecting ? "연결 중" : clock(elapsed)}
        captions={captions}
        caption={lastAssistant}
        crisis={crisis}
        suggest={suggest}
        sound={sound}
        micOn={micOn}
        hasMic={hasMic}
        onClinics={() => setShowHospitals(true)}
        onSound={() => {
          setSound(!sound);
          rt.current?.setSound(!sound);
        }}
        onMic={() => {
          rt.current?.setMic(!micOn);
          setMicOn(!micOn);
        }}
        onText={toText}
        onCaptions={() => setCaptions(!captions)}
        onHangUp={hangUp}
      />
      {clinics}
    </>
  );
}
