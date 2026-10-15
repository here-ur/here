"use client";

import { useRef, useState } from "react";
import { hasCrisisSignal } from "@/lib/crisis";
import { Hills, Icon, Mongle } from "./art";
import Hospitals from "./Hospitals";
import Sheet from "./Sheet";

type Msg = { role: "user" | "assistant"; content: string };
type Status = "idle" | "listening" | "thinking" | "speaking";

const GREETING = "안녕, 나는 몽글이야. 네 마음을 같이 정리하는 AI 친구야. 진단이나 치료는 사람 전문가가 해. 오늘은 어떤 하루였어?";

const HINT: Record<Status, string> = {
  idle: "가운데 버튼을 누르고 말해 줘",
  listening: "듣고 있어. 다 말했으면 한 번 더 눌러 줘",
  thinking: "몽글이가 생각하는 중",
  speaking: "몽글이가 말하는 중",
};

const TAIL = "M0 14C7 14 9 1 15 1C21 1 23 14 30 14Z";

/** 하늘 배경 + 언덕. 폰 한 장 너비로 가운데에 둔다. */
function Stage({ splash = false, children }: { splash?: boolean; children: React.ReactNode }) {
  return (
    <main className="relative mx-auto h-dvh min-h-[640px] w-full max-w-[430px] overflow-clip bg-linear-to-b from-sky-top to-sky-bot">
      <div className="grain" />
      <div className={`absolute -inset-x-12 h-[180px] rounded-[50%] bg-glow opacity-85 blur-[55px] ${splash ? "bottom-[124px]" : "bottom-[178px]"}`} />
      <Hills variant={splash ? "splash" : "talk"} className={`absolute inset-x-0 h-[324px] w-full ${splash ? "-bottom-[90px]" : "bottom-0"}`} />
      {children}
    </main>
  );
}

function Note({ icon, title, body }: { icon: "info" | "lock" | "phone"; title: string; body: string }) {
  return (
    <li className="flex items-center gap-3.5 rounded-[18px] bg-violet-tint px-4 py-3.5">
      <span className="grid size-[42px] shrink-0 place-items-center rounded-[13px] bg-white text-violet">
        <Icon name={icon} size={22} />
      </span>
      <span>
        <b className="block text-base">{title}</b>
        <span className="text-sm text-ink-2">{body}</span>
      </span>
    </li>
  );
}

function DockSide({ label, pressed, onClick, children }: { label: string; pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex w-[100px] flex-col items-center gap-1.5 pt-3.5">
      <button
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={label}
        className="grid size-14 place-items-center rounded-[18px] bg-white/90 text-ink aria-pressed:bg-ink aria-pressed:text-cream"
      >
        {children}
      </button>
      <span className="text-xs font-medium text-ink-2" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

export default function Home() {
  const [intro, setIntro] = useState(false);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [crisis, setCrisis] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [showHospitals, setShowHospitals] = useState(false);
  const [sound, setSound] = useState(true);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const recorder = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const lastMongle = messages.findLast((m) => m.role === "assistant")?.content ?? GREETING;
  const lastMe = messages.findLast((m) => m.role === "user")?.content;

  async function speak(text: string, on = sound) {
    if (!on || !text) return;
    audio.current?.pause();
    setStatus("speaking");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      const el = new Audio(URL.createObjectURL(await res.blob()));
      audio.current = el;
      el.onended = () => setStatus("idle");
      await el.play();
    } catch {
      setStatus("idle");
    }
  }

  async function send(text: string) {
    text = text.trim();
    if (!text) return;
    if (hasCrisisSignal(text)) setCrisis(true); // AI 답보다 먼저 109를 띄운다
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setStatus("thinking");
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      if (data.crisis) setCrisis(true);
      if (!res.ok || !data.reply) throw new Error(data.error);
      if (data.suggestHospital) setSuggest(true);
      setMessages([...next, { role: "assistant", content: data.reply }]);
      setStatus("idle");
      speak(data.reply);
    } catch (e) {
      setError((e as Error).message || "잠시 연결이 어려워요. 조금 뒤에 다시 해 줘.");
      setStatus("idle");
    }
  }

  async function toggleMic() {
    if (status === "listening") return recorder.current?.stop();
    audio.current?.pause();
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("thinking");
        const blob = new Blob(chunks, { type: rec.mimeType });
        const form = new FormData();
        form.append("audio", blob, rec.mimeType.includes("mp4") ? "voice.mp4" : "voice.webm");
        try {
          const res = await fetch("/api/stt", { method: "POST", body: form });
          const { text } = await res.json();
          if (!res.ok || !text) throw new Error();
          send(text);
        } catch {
          setError("잘 못 들었어. 한 번만 다시 말해 줄래?");
          setStatus("idle");
        }
      };
      recorder.current = rec;
      rec.start();
      setStatus("listening");
    } catch {
      setError("마이크를 쓸 수 없어서 글로 적을 수 있게 열어 뒀어.");
      setTyping(true);
    }
  }

  function begin() {
    setIntro(false);
    setStarted(true);
    speak(GREETING, sound);
  }

  function end() {
    audio.current?.pause();
    const rec = recorder.current;
    if (rec?.state === "recording") {
      rec.onstop = () => rec.stream.getTracks().forEach((t) => t.stop()); // 마친 대화는 보내지 않는다
      rec.stop();
    }
    setStarted(false);
    setMessages([]);
    setCrisis(false);
    setSuggest(false);
    setTyping(false);
    setError("");
    setStatus("idle");
  }

  if (!started) {
    return (
      <Stage splash>
        <h1 className="absolute inset-x-0 top-[104px] text-center font-display text-[60px] leading-[72px] tracking-[-0.01em]">Here!</h1>
        <p className="absolute inset-x-0 top-[182px] text-center text-lg font-semibold text-ink-2">오늘 마음은 어떤 색이야?</p>
        <Mongle className="absolute bottom-[150px] left-1/2 h-[min(440px,50dvh)] -translate-x-1/2" />
        <button
          onClick={() => setIntro(true)}
          className="absolute inset-x-6 bottom-[56px] h-[60px] rounded-[20px] bg-violet text-lg font-bold text-white shadow-violet transition active:scale-[.98]"
        >
          이야기 시작하기
        </button>
        <p className="absolute inset-x-0 bottom-[26px] text-center text-[12.5px] font-medium text-ink-3">
          몽글이는 AI예요 · 진단과 치료는 전문가가 해요
        </p>

        {intro && (
          <Sheet title="시작하기 전에" onClose={() => setIntro(false)}>
            <ul className="mt-4 flex flex-col gap-2.5">
              <Note icon="info" title="몽글이는 AI예요" body="진단과 치료는 사람 전문가가 해요." />
              <Note icon="lock" title="대화는 저장하지 않아요" body="대화를 마치면 바로 지워져요." />
              <Note icon="phone" title="위급할 때는 109" body="24시간 사람과 이야기할 수 있어요." />
            </ul>
            <label className="mt-4 flex gap-3 rounded-[18px] p-4 ring-[1.5px] ring-ink/10 ring-inset">
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="mt-0.5 size-5 accent-violet" />
              <span>
                <b className="block">몽글이 목소리로 듣기</b>
                <span className="text-sm text-ink-3">이어폰을 끼면 더 좋아요. 대화 중에도 켜고 끌 수 있어요.</span>
              </span>
            </label>
            <button onClick={begin} className="mt-5 h-[60px] w-full rounded-[20px] bg-ink text-lg font-bold text-cream active:scale-[.98]">
              시작하기
            </button>
          </Sheet>
        )}
      </Stage>
    );
  }

  const busy = status === "thinking";
  const listening = status === "listening";

  return (
    <Stage>
      <header className="absolute inset-x-5 top-14 flex h-11 items-center justify-between">
        <button onClick={end} aria-label="대화 마치기" className="grid size-11 place-items-center rounded-[14px] bg-white/70">
          <Icon name="down" size={22} />
        </button>
        <p className="flex items-center gap-[7px]">
          <span className="font-display text-xl">몽글이</span>
          <span className="rounded-[7px] bg-ink px-[7px] py-0.5 text-[11px] font-bold text-white" title="몽글이는 AI예요">AI</span>
        </p>
        <span className="size-11" />
      </header>

      {crisis && (
        <div role="alert" className="absolute inset-x-4 top-[108px] z-10 flex items-center justify-between gap-2 rounded-[14px] bg-white py-2 pr-2 pl-3.5 text-[13.5px] font-semibold ring-[1.5px] ring-danger ring-inset">
          <span>
            자살예방상담전화 <b className="ml-1 text-[17px] text-danger">109</b>
            <small className="block text-[11.5px] font-medium text-ink-3">24시간, 사람과 이야기할 수 있어요</small>
          </span>
          <a href="tel:109" className="flex h-9 items-center rounded-xl bg-danger-tint px-3.5 font-bold text-danger">
            전화하기
          </a>
        </div>
      )}

      <Mongle className="absolute top-[55px] left-1/2 h-[min(440px,52dvh)] -translate-x-1/2" />

      <section aria-live="polite" className="absolute inset-x-6 bottom-[218px] z-[2] flex flex-col justify-end gap-2.5">
        <div className="relative max-w-[322px] min-w-[204px] animate-pop self-start rounded-3xl bg-white px-5 pt-3.5 pb-[18px] shadow-bubble">
          <svg width="30" height="14" viewBox="0 0 30 14" className="absolute -top-[13px] left-[150px] text-white" aria-hidden="true">
            <path d={TAIL} fill="currentColor" />
          </svg>
          <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-violet">
            <span className="inline-flex h-3.5 items-center gap-0.5" aria-hidden="true">
              {[0, -0.2, -0.45, -0.1].map((d) => (
                <i
                  key={d}
                  className={`h-[5px] w-[2.4px] rounded-sm bg-current ${status === "speaking" ? "animate-wave" : ""}`}
                  style={{ animationDelay: `${d}s` }}
                />
              ))}
            </span>
            몽글이
          </p>
          <p className={`max-h-[150px] overflow-y-auto font-semibold whitespace-pre-wrap ${lastMongle.length > 60 ? "text-[17px] leading-[26px]" : "text-xl leading-[30px]"}`}>
            {busy ? "음…" : lastMongle}
          </p>
          {suggest && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setShowHospitals(true)} className="h-9 rounded-xl bg-violet-tint px-3.5 text-[13.5px] font-bold text-violet">
                가까운 정신건강의학과 보기
              </button>
            </div>
          )}
        </div>

        {typing && !busy ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
              setDraft("");
            }}
            className="relative w-[304px] max-w-full animate-pop self-end rounded-3xl bg-violet px-5 pt-3.5 pr-[60px] pb-[18px] text-white shadow-bubble"
          >
            <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[#f3efff]">
              <i className="size-2 rounded-full bg-[#ffd35c]" aria-hidden="true" />
              듣고 있어
            </p>
            <label htmlFor="draft" className="sr-only">몽글이에게 할 말</label>
            <textarea
              id="draft"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={800}
              placeholder="여기에 적어 줘"
              enterKeyHint="send"
              className="block w-full resize-none bg-transparent text-xl leading-[30px] font-semibold caret-[#ffd35c] outline-0 placeholder:text-white/70"
            />
            <button
              aria-label="보내기"
              disabled={busy || !draft.trim()}
              className="absolute right-3 bottom-3 grid size-10 place-items-center rounded-[14px] bg-white text-violet disabled:opacity-40"
            >
              <Icon name="send" size={20} />
            </button>
          </form>
        ) : (
          lastMe && (
            <div className="relative w-[304px] max-w-full animate-pop self-end rounded-3xl bg-violet px-5 pt-3.5 pb-[18px] text-white shadow-bubble">
              <svg width="30" height="14" viewBox="0 0 30 14" className="absolute -bottom-[13px] left-[118px] rotate-180 text-violet" aria-hidden="true">
                <path d={TAIL} fill="currentColor" />
              </svg>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-[#f3efff]">
                <i className="size-2 rounded-full bg-[#ffd35c]" aria-hidden="true" />나
              </p>
              <p className="line-clamp-4 text-xl leading-[30px] font-semibold">{lastMe}</p>
            </div>
          )
        )}
      </section>

      <p className={`absolute inset-x-0 bottom-[176px] text-center text-[13px] font-medium ${error ? "text-danger" : "text-ink-2"}`}>
        {error || HINT[status]}
      </p>

      <div className="absolute inset-x-0 bottom-[46px] flex items-start justify-center gap-[17px]">
        <DockSide
          label={sound ? "소리 켬" : "소리 끔"}
          pressed={!sound}
          onClick={() => {
            setSound(!sound);
            audio.current?.pause();
          }}
        >
          <Icon name={sound ? "soundOn" : "soundOff"} size={26} />
        </DockSide>

        <div className="relative grid size-[84px] place-items-center">
          {listening && (
            <>
              <i className="absolute -inset-6 animate-ring rounded-full bg-white/35" aria-hidden="true" />
              <i className="absolute -inset-3 animate-ring rounded-full bg-white/55 [animation-delay:-0.5s]" aria-hidden="true" />
            </>
          )}
          <button
            onClick={toggleMic}
            disabled={busy}
            aria-label={listening ? "말하기 끝내기" : "말하기"}
            className={`relative grid size-[84px] place-items-center rounded-full transition active:scale-[.96] disabled:opacity-50 ${
              listening ? "bg-violet text-white" : "bg-white text-violet ring-2 ring-violet/25 ring-inset"
            }`}
          >
            <Icon name={listening ? "stop" : "mic"} size={34} />
          </button>
        </div>

        <DockSide label="글로 쓰기" pressed={typing} onClick={() => setTyping(!typing)}>
          <Icon name="keyboard" size={26} />
        </DockSide>
      </div>

      {showHospitals && <Hospitals onClose={() => setShowHospitals(false)} />}
    </Stage>
  );
}
