"use client";

import { useEffect, useId, useState } from "react";
import { COLORS, type ColorId, type Profile, accentButton, josa } from "@/lib/onboarding";
import Buddy from "./Buddy";

// 홈: 캔버스 v6 「라이트 + 입력창」 시안. 흰 바탕 아래로 오돌토돌한 보라·파랑 번짐이 올라오고,
// 고른 몽글이가 그 위에 떠 있다. 아래 한 자리에서 글로 쓰거나(칸) 바로 통화한다(파란 마이크).

/** 아래에서 올라오는 오돌토돌한 번짐. 고른 몽글이 빛의 색을 연하게 써서 캐릭터와 어울리게 하고,
 * 천천히 숨 쉬듯 부풀며 그 안에서 두 색이 오로라처럼 흐른다. */
export function Bloom({ color = "lavender", className = "h-[66%]" }: { color?: ColorId; className?: string }) {
  const id = `bloom${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden ${className}`}>
      <svg className="absolute inset-0 size-full origin-bottom motion-safe:animate-bloom" viewBox="0 300 390 544" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id={`${id}-g`} gradientUnits="userSpaceOnUse" cx="195" cy="857" r="475">
            <stop offset="0" stopColor={c.blob1} stopOpacity="0.62" />
            <stop offset="0.4" stopColor={c.base} stopOpacity="0.55" />
            <stop offset="0.72" stopColor={c.base} stopOpacity="0.46" />
            <stop offset="0.84" stopColor={c.blob2} stopOpacity="0.4" />
            <stop offset="0.91" stopColor={c.blob2} stopOpacity="0.26" />
            <stop offset="0.96" stopColor={c.light} stopOpacity="0.2" />
            <stop offset="1" stopColor={c.light} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}-b`} gradientUnits="userSpaceOnUse" x1="0" y1="750" x2="0" y2="844">
            <stop offset="0" stopColor={c.light} stopOpacity="0" />
            <stop offset="1" stopColor={c.light} stopOpacity="0.7" />
          </linearGradient>
          {/* 번짐 가장자리를 오돌토돌하게: 노이즈로 픽셀을 살짝 흩뿌린다 */}
          <filter id={`${id}-n`} filterUnits="userSpaceOnUse" x="-40" y="260" width="470" height="640" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="11" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="50" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <rect x="-40" y="280" width="470" height="620" fill={`url(#${id}-g)`} filter={`url(#${id}-n)`} />
        <rect x="0" y="750" width="390" height="94" fill={`url(#${id}-b)`} />
      </svg>
      {/* 번짐 안에서 아주 느리게 흐르는 두 색 */}
      <div className="absolute -inset-x-1/4 bottom-[-15%] h-[80%] motion-safe:animate-aurora-a" style={{ background: `radial-gradient(38% 42% at 32% 62%, ${c.blob2}66, transparent 70%)` }} />
      <div className="absolute -inset-x-1/4 bottom-[-15%] h-[80%] motion-safe:animate-aurora-b" style={{ background: `radial-gradient(36% 40% at 70% 70%, ${c.blob1}55, transparent 70%)` }} />
    </div>
  );
}

export default function HomeScreen({
  profile,
  greet,
  onVoice,
  onText,
  onLog,
}: {
  profile: Profile;
  greet: boolean; // 온보딩을 막 끝냈으면 몽글이가 처음 인사한다
  onVoice: () => void;
  onText: (text: string) => void;
  onLog: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [greeting, setGreeting] = useState(greet);
  const name = profile.companion;
  const nick = profile.nickname || "친구";

  useEffect(() => {
    if (!greeting) return;
    const t = setTimeout(() => setGreeting(false), 6000);
    return () => clearTimeout(t);
  }, [greeting]);

  return (
    <main className="relative mx-auto h-dvh min-h-[640px] w-full max-w-[430px] overflow-clip bg-[#FAFCFE] text-[#111318]">
      <Bloom color={profile.color} />
      {/* 온보딩의 빛이 하얗게 걷히며 홈이 나타난다 */}
      {greet && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 bg-white motion-safe:animate-unveil motion-reduce:hidden" />}

      <header className="absolute inset-x-0 top-14 z-10 flex h-[54px] items-center justify-between pr-[18px] pl-5">
        <span className="flex items-center gap-2">
          <Buddy shape={profile.shape} color={profile.color} size={34} look={[0.2, 0.1]} />
          <span className="text-[21px] font-medium tracking-[-0.025em]">Here!</span>
        </span>
        <button onClick={onLog} aria-label="내 기록" className="grid size-[54px] place-items-center rounded-full bg-white shadow-[0_3px_18px_rgba(28,38,80,.055),0_1px_2px_rgba(28,38,80,.03)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.6 12.2A8.5 8.5 0 1 0 6.2 5.9" />
            <path d="M3.4 4.6v4h4" />
            <path d="M12 7.6V12l3 2" />
          </svg>
        </button>
      </header>

      <div className="absolute inset-x-0 top-[150px] flex flex-col items-center gap-6 text-center">
        <span className="inline-flex h-8 items-center rounded-full bg-white px-[15px] text-sm text-[#2A2E36] shadow-[0_2px_12px_rgba(28,38,80,.05),0_0_0_1px_rgba(28,38,80,.03)]">
          AI 이야기 친구
        </span>
        <h1 className="text-[32px] leading-[1.25] font-medium tracking-[-0.035em]">
          오늘 하루,
          <br />
          어떤 이야기를 해 볼까?
        </h1>
      </div>

      <div className="absolute inset-x-0 top-[44%] flex flex-col items-center">
        {greeting && (
          <button
            onClick={() => setGreeting(false)}
            className="mb-2 animate-pop rounded-2xl bg-white/90 px-4 py-2.5 text-[15px] font-medium text-[#1e1d2b] shadow-[0_8px_24px_rgba(40,60,140,.18)]"
          >
            안녕, {nick}! 나는 {josa(name, "이야", "야")}.
          </button>
        )}
        <Buddy shape={profile.shape} color={profile.color} size={170} look={greeting ? [0.1, -0.2] : [0.15, 0.3]} mouth={greeting ? "tongue" : "smile"} bob className={greet ? "animate-pop" : ""} />
      </div>

      <div className="absolute inset-x-5 bottom-8 flex flex-col items-center gap-3">
        <p id="home-hint" className="text-[13px] font-medium text-[#1F2A55]">
          마이크를 누르면 {josa(name, "과", "와")} 통화해요
        </p>
        <form
          aria-label={`${name}에게 말 걸기`}
          className="flex h-[60px] w-full items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) onText(draft.trim());
          }}
        >
          <div className="liquid-glass relative flex h-[60px] min-w-0 flex-1 items-center rounded-full bg-white/55 px-6 focus-within:ring-2 focus-within:ring-white">
            <label htmlFor="home-text" className="sr-only">
              {name}에게 글로 이야기하기
            </label>
            <input
              id="home-text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={800}
              placeholder="글로 적어도 돼요…"
              enterKeyHint="send"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-base text-[#1F2A55] outline-0 placeholder:text-[#5A6478]"
            />
          </div>
          <button
            type="button"
            onClick={onVoice}
            aria-label={`${josa(name, "과", "와")} 통화하기`}
            aria-describedby="home-hint"
            style={accentButton(profile.color)}
            className="grid size-[60px] shrink-0 place-items-center rounded-full border border-white/50 text-white transition active:scale-95"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="8.6" y="2.8" width="6.8" height="11.6" rx="3.4" stroke="currentColor" strokeWidth="1.8" />
              <path d="M5.2 11.2a6.8 6.8 0 0 0 13.6 0M12 18v3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </form>
        <p className="text-[11px] text-[#5A6478]">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
      </div>
    </main>
  );
}
