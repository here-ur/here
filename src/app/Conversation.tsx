"use client";

import { useEffect, useRef } from "react";
import type { Msg } from "@/lib/log";
import { COLORS, type ColorId, type ShapeId, accentButton, josa } from "@/lib/onboarding";
import { Icon } from "./art";
import Buddy from "./Buddy";
import { Bloom } from "./HomeScreen";

// 대화 화면들: 통화(CallScreen), 글 대화(TextScreen), 끝난 뒤 요약(SummaryScreen).
// 홈과 같은 라이트 톤(흰 바탕 + 아래 번짐)이고, 상태와 동작은 page.tsx가 들고 있다.

type Who = { name: string; shape: ShapeId; color: ColorId };


/** full: 홈과 같은 번짐(통화). soft: 글이 많은 화면이라 아래만 은은하게 물든다(번짐을 잘라 쓰면 위쪽에 딱딱한 경계가 생긴다). */
function Shell({ children, color, bloom = "full" }: { children: React.ReactNode; color: ColorId; bloom?: "full" | "soft" }) {
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return (
    <main className="relative mx-auto h-dvh min-h-[640px] w-full max-w-[430px] overflow-clip bg-[#FAFCFE] text-[#111318]">
      {bloom === "full" ? (
        <Bloom color={color} />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[45%] origin-bottom motion-safe:animate-bloom"
          style={{ background: `radial-gradient(110% 75% at 50% 100%, ${c.base}77, ${c.blob2}33 55%, transparent 80%)` }}
        />
      )}
      {children}
    </main>
  );
}

function AiBadge() {
  return (
    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#1F2A55] shadow-[0_1px_6px_rgba(28,38,80,.1)]" title="AI예요">
      AI
    </span>
  );
}

/** 자살예방상담전화 109. 위기 표현이 보이면 어느 화면이든 맨 위에, 가장 눈에 띄게. */
export function Crisis109({ className = "" }: { className?: string }) {
  return (
    <div role="alert" className={`flex items-center justify-between gap-3 rounded-[20px] bg-white py-3 pr-3 pl-4 shadow-[0_8px_24px_rgba(194,54,43,.18)] ring-2 ring-[#D7261E] ring-inset ${className}`}>
      <span className="text-sm font-semibold">
        자살예방상담전화 <b className="ml-0.5 text-lg text-[#C42A23]">109</b>
        <small className="block text-[12.5px] font-medium text-[#55525F]">24시간 사람과 이야기할 수 있어요</small>
      </span>
      <a href="tel:109" className="flex h-11 shrink-0 items-center rounded-full bg-[#C42A23] px-4 text-sm font-bold text-white">
        전화하기
      </a>
    </div>
  );
}

function ClinicChip({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-[#1F2A55] shadow-[0_6px_18px_rgba(28,38,80,.12)]">
      <Icon name="pin" size={18} />
      가까운 정신건강의학과 보기
    </button>
  );
}

/** 말풍선 목록: 몽글이는 왼쪽 흰 말풍선(첫 말에 작은 얼굴), 나는 오른쪽 파란 말풍선 */
function Bubbles({ who, messages, live, thinking }: { who: Who; messages: Msg[]; live?: string; thinking?: boolean }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // 새 말이 오면 맨 아래로. (요즘 크롬은 scrollIntoView가 Promise를 돌려줘서, 이펙트가 그 값을 돌려주지 않게 감싼다)
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, live, thinking]);
  const rows: { role: Msg["role"]; content: string; typing?: boolean }[] = [...messages];
  if (live) rows.push({ role: "assistant", content: live });
  else if (thinking) rows.push({ role: "assistant", content: "", typing: true });
  return (
    <ol className="flex flex-col gap-2.5" aria-live="polite">
      {rows.map((m, i) => {
        const mine = m.role === "user";
        const first = !mine && rows[i - 1]?.role !== "assistant";
        return (
          <li key={i} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
            {!mine && (first ? <Buddy shape={who.shape} color={who.color} size={30} look={[0.3, 0.2]} /> : <span className="w-[30px] shrink-0" />)}
            <span className="sr-only">{mine ? "나:" : `${who.name}:`}</span>
            <p
              className={`max-w-[78%] px-4 py-2.5 text-[15.5px] leading-[1.5] ${
                mine
                  ? "rounded-[20px] rounded-br-md bg-linear-to-b from-[#3B76FF] to-[#1E4FE0] text-white shadow-[0_6px_16px_rgba(30,79,224,.25)]"
                  : "rounded-[20px] rounded-bl-md bg-white text-[#111318] shadow-[0_4px_14px_rgba(28,38,80,.08)]"
              }`}
            >
              {m.typing ? (
                <span className="flex gap-1 py-1.5" aria-label={`${who.name}가 생각하는 중`}>
                  {[0, 1, 2].map((d) => (
                    <i key={d} className="size-1.5 rounded-full bg-[#9AA3B8] motion-safe:animate-dot" style={{ animationDelay: `${d * 0.15}s` }} />
                  ))}
                </span>
              ) : (
                m.content
              )}
            </p>
          </li>
        );
      })}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}

const STATUS_FACE = {
  connecting: { look: [0, -0.4], mouth: "calm" },
  idle: { look: [0.15, 0.25], mouth: "smile" },
  listening: { look: [0, 0.1], mouth: "calm" },
  thinking: { look: [0.4, -0.5], mouth: "calm" },
  speaking: { look: [0.15, 0.2], mouth: "o" },
} as const;

function CallControl({ label, pressed, danger, disabled, onClick, children }: { label: string; pressed?: boolean; danger?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex w-[60px] flex-col items-center gap-1.5">
      <button
        onClick={onClick}
        disabled={disabled}
        aria-pressed={danger ? undefined : pressed}
        aria-label={label}
        className={`grid size-14 place-items-center rounded-full transition active:scale-95 disabled:opacity-40 ${
          danger
            ? "bg-[#E5484D] text-white shadow-[0_10px_24px_rgba(229,72,77,.4)]"
            : pressed
              ? "bg-[#1F2A55] text-white"
              : "bg-white/75 text-[#1F2A55] shadow-[0_6px_18px_rgba(28,38,80,.12)] backdrop-blur-md"
        }`}
      >
        {children}
      </button>
      <span className="text-xs font-medium text-[#1F2A55]" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}

export function CallScreen(p: {
  who: Who;
  status: keyof typeof STATUS_FACE;
  listening: boolean;
  statusText: string;
  error: string;
  clock: string;
  captions: boolean;
  caption?: string;
  crisis: boolean;
  suggest: boolean;
  sound: boolean;
  micOn: boolean;
  hasMic: boolean;
  onClinics: () => void;
  onSound: () => void;
  onMic: () => void;
  onText: () => void;
  onCaptions: () => void;
  onHangUp: () => void;
}) {
  const face = STATUS_FACE[p.status];
  return (
    <Shell color={p.who.color}>
      <header className="absolute inset-x-0 top-14 z-10 text-center">
        <p className="flex items-center justify-center gap-1.5 text-[17px] font-semibold">
          {p.who.name} <AiBadge />
        </p>
        <p className="mt-0.5 text-sm font-medium text-[#4A5160] tabular-nums">{p.clock}</p>
      </header>

      {p.crisis && <Crisis109 className="absolute inset-x-4 top-[118px] z-20" />}

      <div className={`absolute inset-x-0 flex flex-col items-center ${p.crisis ? "top-[210px]" : "top-[170px]"}`}>
        <div className="relative grid place-items-center">
          {p.listening && (
            <>
              <i aria-hidden="true" className="absolute size-[240px] rounded-full bg-white/50 motion-safe:animate-halo" />
              <i aria-hidden="true" className="absolute size-[240px] rounded-full bg-white/50 motion-safe:animate-halo [animation-delay:-1s]" />
            </>
          )}
          <Buddy shape={p.who.shape} color={p.who.color} size={230} look={face.look} mouth={face.mouth} bob={p.status === "speaking"} className="relative" />
        </div>
        <p role="status" className={`mt-4 text-xl font-semibold tracking-[-0.02em] ${p.error ? "text-[#C42A23]" : "text-[#14204A]"}`}>
          {p.statusText}
        </p>
        {p.status === "listening" && !p.error && <p className="mt-1 text-sm font-medium text-[#24306A]">말이 끝나면 {josa(p.who.name, "이", "가")} 답해요</p>}
        {p.captions && p.caption && (
          <p className="mx-6 mt-4 line-clamp-3 rounded-2xl bg-white/80 px-4 py-3 text-center text-[15px] leading-[1.5] shadow-[0_6px_18px_rgba(28,38,80,.1)] backdrop-blur-md">{p.caption}</p>
        )}
      </div>

      <div className="absolute inset-x-5 bottom-[130px] flex justify-center">{p.suggest && <ClinicChip onClick={p.onClinics} />}</div>

      <div className="absolute inset-x-0 bottom-9 flex justify-center gap-2.5">
        <CallControl label={p.sound ? "소리" : "소리 끔"} pressed={!p.sound} onClick={p.onSound}>
          <Icon name={p.sound ? "soundOn" : "soundOff"} size={24} />
        </CallControl>
        <CallControl label={p.micOn ? "마이크" : "음소거"} pressed={!p.micOn} disabled={!p.hasMic} onClick={p.onMic}>
          <Icon name={p.micOn ? "mic" : "micOff"} size={24} />
        </CallControl>
        <CallControl label="글로 쓰기" onClick={p.onText}>
          <Icon name="keyboard" size={24} />
        </CallControl>
        <CallControl label="자막" pressed={p.captions} onClick={p.onCaptions}>
          <Icon name="captions" size={24} />
        </CallControl>
        <CallControl label="끝내기" danger onClick={p.onHangUp}>
          <Icon name="hangUp" size={26} />
        </CallControl>
      </div>
    </Shell>
  );
}

export function TextScreen(p: {
  who: Who;
  messages: Msg[];
  live: string;
  thinking: boolean;
  error: string;
  connecting: boolean;
  crisis: boolean;
  suggest: boolean;
  hasMic: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  onClinics: () => void;
  onVoice: () => void;
  onBack: () => void;
}) {
  return (
    <Shell color={p.who.color} bloom="soft">
      <header className="absolute inset-x-0 top-14 z-10 flex items-center justify-between px-5">
        <button onClick={p.onBack} aria-label="대화 마치기" className="grid size-11 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)]">
          <Icon name="back" size={20} />
        </button>
        <p className="flex items-center gap-1.5 text-[17px] font-semibold">
          {p.who.name} <AiBadge />
        </p>
        <button
          onClick={p.onVoice}
          disabled={!p.hasMic}
          aria-label="통화로 바꾸기"
          className="grid size-11 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)] disabled:opacity-40"
        >
          <Icon name="phone" size={20} />
        </button>
      </header>
      <p className="absolute inset-x-0 top-[110px] text-center text-[11px] text-[#5A6478]">{josa(p.who.name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>

      {p.crisis && <Crisis109 className="absolute inset-x-4 top-[136px] z-20" />}

      <div className={`absolute inset-x-0 bottom-[104px] overflow-y-auto px-4 pb-3 ${p.crisis ? "top-[226px]" : "top-[140px]"}`}>
        <Bubbles who={p.who} messages={p.messages} live={p.live} thinking={p.thinking} />
        {p.suggest && (
          <div className="mt-4 flex justify-center">
            <ClinicChip onClick={p.onClinics} />
          </div>
        )}
      </div>

      <form
        className="absolute inset-x-4 bottom-8 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          p.onSend();
        }}
      >
        {p.error && <p className="px-2 text-center text-[13px] font-medium text-[#C42A23]">{p.error}</p>}
        <div className="flex h-[58px] items-center gap-2.5">
          <div className="liquid-glass glass-focus relative flex h-full min-w-0 flex-1 items-center rounded-full bg-white/70 px-5" style={{ "--accent": COLORS.find((x) => x.id === p.who.color)?.deep, "--focus-fill": 0.9 } as React.CSSProperties}>
            <label htmlFor="text-draft" className="sr-only">
              {p.who.name}에게 하고 싶은 말
            </label>
            <input
              id="text-draft"
              value={p.draft}
              onChange={(e) => p.onDraft(e.target.value)}
              maxLength={800}
              placeholder={`${p.who.name}에게 하고 싶은 말`}
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base text-[#1F2A55] outline-0 placeholder:text-[#5A6478]"
            />
          </div>
          <button
            aria-label="보내기"
            disabled={!p.draft.trim() || p.connecting}
            style={accentButton(p.who.color)}
            className="grid size-[58px] shrink-0 place-items-center rounded-full border border-white/50 text-white transition active:scale-95 disabled:opacity-40"
          >
            <Icon name="send" size={22} />
          </button>
        </div>
      </form>
    </Shell>
  );
}

export function SummaryScreen(p: { who: Who; messages: Msg[]; clock: string; crisis: boolean; suggest: boolean; onClinics: () => void; onClose: () => void }) {
  return (
    <Shell color={p.who.color} bloom="soft">
      <div className="absolute inset-x-0 top-0 bottom-[110px] overflow-y-auto px-4 pt-16 pb-4">
        <h1 className="px-1 text-2xl font-semibold tracking-[-0.03em]">오늘 나눈 이야기</h1>
        <p className="mt-1 px-1 text-sm text-[#5F6675]">{p.clock} · 기록은 이 기기의 브라우저에만 남아요</p>
        {p.crisis && <Crisis109 className="mt-4" />}
        <div className="mt-5">
          <Bubbles who={p.who} messages={p.messages} />
        </div>
      </div>
      <div className="absolute inset-x-5 bottom-8 flex flex-col gap-2">
        {p.suggest && (
          <button onClick={p.onClinics} className="h-14 rounded-full bg-white text-[15px] font-bold text-[#1F2A55] shadow-[0_6px_18px_rgba(28,38,80,.12)]">
            가까운 정신건강의학과 보기
          </button>
        )}
        <button onClick={p.onClose} className="h-14 rounded-full bg-[#141518] text-[15px] font-bold text-white">
          닫기
        </button>
      </div>
    </Shell>
  );
}
