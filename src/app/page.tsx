"use client";

import { useRef, useState } from "react";
import { hasCrisisSignal } from "@/lib/crisis";
import Hospitals from "./Hospitals";

type Msg = { role: "user" | "assistant"; content: string };
type Status = "idle" | "listening" | "thinking" | "speaking";

const GREETING = "안녕, 나는 몽글이야. 오늘 어땠어? 편하게 말해 줘.";

const HINT: Record<Status, string> = {
  idle: "버튼을 누르고 말해 줘",
  listening: "듣고 있어. 다 말했으면 한 번 더 눌러 줘",
  thinking: "생각하는 중…",
  speaking: "몽글이가 말하는 중",
};

export default function Home() {
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

  async function speak(text: string) {
    if (!sound || !text) return;
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
      setError("마이크를 쓸 수 없어요. 글로 적어도 괜찮아.");
      setTyping(true);
    }
  }

  function start() {
    setStarted(true);
    speak(GREETING);
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
    setStatus("idle");
  }

  if (!started) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
        <h1 className="font-display text-6xl text-violet">Here!</h1>
        <p className="text-lg text-ink-2">오늘 마음은 어떤 색이야?</p>
        <button
          onClick={start}
          className="mt-8 w-full rounded-full bg-violet px-6 py-4 text-lg font-bold text-white shadow-lg active:scale-[.98]"
        >
          이야기 시작하기
        </button>
        <p className="text-sm text-ink-3">몽글이는 AI예요 · 진단과 치료는 전문가가 해요</p>
      </main>
    );
  }

  const busy = status === "thinking";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-6 pb-8">
      <header className="flex items-center justify-between">
        <button onClick={end} className="rounded-full bg-white/80 px-4 py-2 text-sm text-ink-2">
          대화 마치기
        </button>
        <p className="font-display text-xl">
          몽글이 <span className="ml-1 rounded-full bg-white px-2 py-0.5 align-middle font-sans text-xs font-bold text-violet">AI</span>
        </p>
        <span className="w-[88px]" />
      </header>

      {crisis && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-danger-tint p-4">
          <p className="text-sm text-ink-2">
            자살예방상담전화 <b className="text-lg text-danger">109</b>
            <br />
            24시간, 사람과 바로 이야기할 수 있어요
          </p>
          <a href="tel:109" className="shrink-0 rounded-full bg-danger px-4 py-2 font-bold text-white">
            전화하기
          </a>
        </div>
      )}

      <section className="mt-6 flex flex-1 flex-col gap-4" aria-live="polite">
        <div className="rounded-3xl rounded-tl-md bg-white p-5 shadow-sm">
          <p className="mb-1 text-xs font-bold text-violet">몽글이</p>
          <p className="text-lg leading-relaxed">{busy ? "…" : lastMongle}</p>
        </div>

        {suggest && (
          <button
            onClick={() => setShowHospitals(true)}
            className="rounded-2xl border border-violet/25 bg-violet-tint p-4 text-left"
          >
            <p className="font-bold text-violet">가까운 정신건강의학과 보기</p>
            <p className="text-sm text-ink-3">전화나 길 찾기로 바로 이어져요</p>
          </button>
        )}

        {lastMe && (
          <div className="ml-auto max-w-[85%] rounded-3xl rounded-tr-md bg-peach-2 p-4">
            <p className="mb-1 text-xs font-bold text-ink-3">나</p>
            <p>{lastMe}</p>
          </div>
        )}

        {error && <p className="text-center text-sm text-danger">{error}</p>}
      </section>

      {typing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
            setDraft("");
          }}
          className="mb-4 flex gap-2"
        >
          <label htmlFor="draft" className="sr-only">몽글이에게 할 말</label>
          <input
            id="draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={800}
            placeholder="여기에 적어 줘"
            className="flex-1 rounded-full bg-white px-5 py-3 outline-violet"
            enterKeyHint="send"
          />
          <button disabled={busy || !draft.trim()} className="rounded-full bg-violet px-5 font-bold text-white disabled:opacity-40">
            보내기
          </button>
        </form>
      )}

      <p className="mb-3 text-center text-sm text-ink-2">{HINT[status]}</p>
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            setSound(!sound);
            audio.current?.pause();
          }}
          aria-pressed={sound}
          className="w-20 rounded-2xl bg-white/90 py-3 text-sm"
        >
          {sound ? "소리 켬" : "소리 끔"}
        </button>
        <button
          onClick={toggleMic}
          disabled={busy}
          aria-label={status === "listening" ? "말하기 끝내기" : "말하기"}
          className={`grid size-21 place-items-center rounded-full text-3xl shadow-lg transition active:scale-95 disabled:opacity-50 ${
            status === "listening" ? "animate-pulse bg-violet text-white" : "bg-white text-violet"
          }`}
        >
          {status === "listening" ? "■" : "🎙"}
        </button>
        <button onClick={() => setTyping(!typing)} aria-pressed={typing} className="w-20 rounded-2xl bg-white/90 py-3 text-sm">
          글로 쓰기
        </button>
      </div>

      {showHospitals && <Hospitals onClose={() => setShowHospitals(false)} />}
    </main>
  );
}
