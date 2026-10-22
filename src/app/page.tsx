"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasCrisisSignal } from "@/lib/crisis";
import { type Msg, type Session, saveSession } from "@/lib/log";
import { type Profile, parseProfile, profileRaw, saveProfile } from "@/lib/onboarding";
import { type Realtime, connectRealtime } from "@/lib/realtime";
import { Hills, Icon, Mongle } from "./art";
import HomeScreen from "./HomeScreen";
import Hospitals from "./Hospitals";
import Log from "./Log";
import Onboarding from "./Onboarding";

type Status = "connecting" | "idle" | "listening" | "thinking" | "speaking";

const HINT: Record<Status, string> = {
  connecting: "몽글이와 연결하는 중…",
  idle: "편하게 말해요. 몽글이가 듣고 있어요",
  listening: "듣고 있어요",
  thinking: "생각하는 중…",
  speaking: "몽글이가 말하는 중",
};

const clock = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/** 하늘 배경 + 언덕. 폰 한 장 너비로 가운데에 둔다. */
/** hills=false: 기록 화면처럼 하늘만 있는 배경 */
function Stage({ splash = false, hills = true, children }: { splash?: boolean; hills?: boolean; children: React.ReactNode }) {
  return (
    <main className="relative mx-auto h-dvh min-h-[640px] w-full max-w-[430px] overflow-clip bg-linear-to-b from-sky-top to-sky-bot">
      <div className="grain" />
      {hills && (
        <>
          <div className={`absolute -inset-x-12 h-[180px] rounded-[50%] bg-glow opacity-85 blur-[55px] ${splash ? "bottom-[124px]" : "bottom-[178px]"}`} />
          <Hills variant={splash ? "splash" : "talk"} className={`absolute inset-x-0 h-[324px] w-full ${splash ? "-bottom-[90px]" : "bottom-0"}`} />
        </>
      )}
      {children}
    </main>
  );
}

function CallButton({ label, pressed, danger, disabled, onClick, children }: { label: string; pressed?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex w-[72px] flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-pressed={pressed}
        aria-label={label}
        className={`grid size-[60px] place-items-center rounded-full transition active:scale-95 disabled:opacity-40 ${
          danger ? "bg-danger text-white" : pressed ? "bg-ink text-cream" : "bg-white/85 text-ink"
        }`}
      >
        {children}
      </button>
      <span className="text-xs font-medium text-ink-2" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

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
        setError("마이크를 쓸 수 없어서 글로 적을 수 있게 열어 뒀어.");
      }
      setStatus("idle");
      if (firstText) sendText(firstText);
    } catch (e) {
      setError((e as Error).message);
      setStatus("idle");
    }
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

  if (showLog) {
    return (
      <Stage hills={false}>
        <Log onBack={() => setShowLog(false)} />
      </Stage>
    );
  }

  if (!started) {
    return <HomeScreen profile={profile} greet={justMet} onVoice={() => begin()} onText={(t) => begin(t)} onLog={() => setShowLog(true)} />;
  }

  if (ended) {
    return (
      <Stage hills={false}>
        <div className="absolute inset-0 overflow-y-auto px-5 pt-16 pb-32">
          <h1 className="font-display text-2xl">오늘 나눈 이야기</h1>
          <p className="mt-1 text-sm text-ink-3">통화 {clock(elapsed)} · 기록은 이 기기에만 남아요</p>
          {crisis && (
            <a href="tel:109" className="mt-4 flex items-center justify-between rounded-[18px] bg-white p-4 ring-[1.5px] ring-danger ring-inset">
              <span className="text-sm font-semibold">
                자살예방상담전화 <b className="text-danger">109</b>
                <small className="block font-medium text-ink-3">24시간, 사람과 이야기할 수 있어요</small>
              </span>
              <span className="rounded-xl bg-danger-tint px-3.5 py-2 text-sm font-bold text-danger">전화하기</span>
            </a>
          )}
          <ol className="mt-5 flex flex-col gap-2.5">
            {messages.map((m, i) => (
              <li
                key={i}
                className={`max-w-[85%] rounded-[18px] px-4 py-2.5 text-[15px] leading-[22px] ${
                  m.role === "user" ? "self-end bg-violet text-white" : "self-start bg-white"
                }`}
              >
                {m.content}
              </li>
            ))}
          </ol>
        </div>
        <div className="absolute inset-x-5 bottom-8 flex gap-2">
          {suggest && (
            <button onClick={() => setShowHospitals(true)} className="h-14 flex-1 rounded-[20px] bg-violet-tint font-bold text-violet">
              가까운 병원 보기
            </button>
          )}
          <button onClick={reset} className="h-14 flex-1 rounded-[20px] bg-ink text-lg font-bold text-cream">
            닫기
          </button>
        </div>
        {showHospitals && <Hospitals onClose={() => setShowHospitals(false)} />}
      </Stage>
    );
  }

  const listening = status === "listening" && micOn;
  const lastAssistant = live || messages.findLast((m) => m.role === "assistant")?.content;
  const statusText = error || (!micOn && status === "idle" ? "마이크가 꺼져 있어요" : HINT[status]);

  return (
    <Stage>
      <header className="absolute inset-x-5 top-14 flex h-11 items-center justify-between">
        <span className="size-11" />
        <div className="text-center">
          <p className="flex items-center justify-center gap-[7px]">
            <span className="font-display text-xl">몽글이</span>
            <span className="rounded-[7px] bg-ink px-[7px] py-0.5 text-[11px] font-bold text-white" title="몽글이는 AI예요">AI</span>
          </p>
          <p className="text-xs font-medium text-ink-2 tabular-nums">{connecting ? "연결 중" : clock(elapsed)}</p>
        </div>
        <button
          onClick={() => setCaptions(!captions)}
          aria-pressed={captions}
          aria-label="자막"
          className="grid size-11 place-items-center rounded-[14px] bg-white/70 aria-pressed:bg-ink aria-pressed:text-cream"
        >
          <Icon name="captions" size={22} />
        </button>
      </header>

      {crisis && (
        <div role="alert" className="absolute inset-x-4 top-[116px] z-10 flex items-center justify-between gap-2 rounded-[14px] bg-white py-2 pr-2 pl-3.5 text-[13.5px] font-semibold ring-[1.5px] ring-danger ring-inset">
          <span>
            자살예방상담전화 <b className="ml-1 text-[17px] text-danger">109</b>
            <small className="block text-[11.5px] font-medium text-ink-3">24시간, 사람과 이야기할 수 있어요</small>
          </span>
          <a href="tel:109" className="flex h-9 items-center rounded-xl bg-danger-tint px-3.5 font-bold text-danger">
            전화하기
          </a>
        </div>
      )}

      <div className="absolute inset-x-0 top-[calc(50%_-_250px)] flex flex-col items-center">
        <div className="relative grid place-items-center">
          {listening && (
            <>
              <i className="absolute size-[min(300px,36dvh)] animate-halo rounded-full bg-white/60" aria-hidden="true" />
              <i className="absolute size-[min(300px,36dvh)] animate-halo rounded-full bg-white/60 [animation-delay:-1s]" aria-hidden="true" />
            </>
          )}
          <Mongle className={`relative h-[min(340px,40dvh)] ${status === "speaking" ? "animate-bob" : ""}`} />
        </div>
        <p role="status" className={`-mt-6 text-[15px] font-medium ${error ? "text-danger" : "text-ink-2"}`}>
          {statusText}
        </p>
        {captions && lastAssistant && (
          <p className="mx-8 mt-3 line-clamp-3 text-center text-[15px] leading-[22px] text-ink">{lastAssistant}</p>
        )}
      </div>

      <div className="absolute inset-x-5 bottom-[132px] flex flex-col items-center gap-3">
        {suggest && (
          <button onClick={() => setShowHospitals(true)} className="h-10 rounded-full bg-white/90 px-4 text-[14px] font-bold text-violet shadow-bubble">
            가까운 정신건강의학과 보기
          </button>
        )}
        {typing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendText(draft);
              setDraft("");
            }}
            className="flex w-full items-center gap-2 rounded-full bg-white/90 p-1.5 pl-4 shadow-bubble"
          >
            <label htmlFor="draft" className="sr-only">몽글이에게 할 말</label>
            <input
              id="draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={800}
              placeholder="글로 적어도 돼요"
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[16px] outline-0"
            />
            <button aria-label="보내기" disabled={!draft.trim() || connecting} className="grid size-10 place-items-center rounded-full bg-violet text-white disabled:opacity-40">
              <Icon name="send" size={18} />
            </button>
          </form>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-[34px] flex justify-center gap-3">
        <CallButton
          label={sound ? "소리" : "소리 끔"}
          pressed={!sound}
          onClick={() => {
            setSound(!sound);
            rt.current?.setSound(!sound);
          }}
        >
          <Icon name={sound ? "soundOn" : "soundOff"} size={24} />
        </CallButton>
        <CallButton
          label={micOn ? "마이크" : "음소거"}
          pressed={!micOn}
          disabled={!hasMic}
          onClick={() => {
            rt.current?.setMic(!micOn);
            setMicOn(!micOn);
          }}
        >
          <Icon name={micOn ? "mic" : "micOff"} size={24} />
        </CallButton>
        <CallButton label="글로 쓰기" pressed={typing} onClick={() => setTyping(!typing)}>
          <Icon name="keyboard" size={24} />
        </CallButton>
        <CallButton label="끝내기" danger onClick={hangUp}>
          <Icon name="hangUp" size={26} />
        </CallButton>
      </div>

      {showHospitals && <Hospitals onClose={() => setShowHospitals(false)} />}
    </Stage>
  );
}
