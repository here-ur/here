"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLORS,
  DEFAULT_COMPANION,
  QUESTIONS,
  SHAPES,
  VOICES,
  type Answers,
  type ColorId,
  type Profile,
  type ShapeId,
  type VoiceId,
  cleanName,
  describeStyle,
  josa,
  matchStyle,
} from "@/lib/onboarding";
import * as sfx from "@/lib/sound";
import Buddy from "./Buddy";

// Tolan의 온보딩 구조를 빌린 첫 실행 흐름. 어두운 우주에서 몽글이를 찾고, 처음 만나는 순간부터 밝아진다.
// 알림 권한 화면은 MVP 밖(알림 기능 없음)이라 뺐다.
type Step = "splash" | "name" | "safety" | "finding" | "match" | "shape" | "color" | "voice" | "naming" | "hold" | "burst" | "reveal";

const HOLD_MS = 1400;
const LEAVE_MS = 200;


function Next({ onClick, label = "다음", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-label={label} className="liquid-glass grid size-[84px] place-items-center rounded-full text-white transition active:scale-95 disabled:[&>svg]:opacity-40">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9.5 5.5l6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="뒤로" className="absolute top-14 left-5 grid size-11 place-items-center rounded-full bg-white/15 text-white">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14.5 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto max-w-[320px] animate-fade rounded-xl bg-[#28263a]/85 px-4 py-2.5 text-center text-[15px] leading-[22px] font-medium text-white">
      {children}
    </p>
  );
}

function Title({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="absolute inset-x-6 top-[112px] text-center">
      <h1 className="text-[22px] leading-[1.35] font-bold tracking-[-0.02em] text-white">{children}</h1>
      {sub && <p className="mt-2 text-sm text-[#a9a6ba]">{sub}</p>}
    </div>
  );
}

/** 몽글이가 아직 모양을 갖추기 전의 흐릿한 빛 덩어리 */
function LightCloud({ level }: { level: number }) {
  const blobs = [
    ["#ffb3c7", -40, -30, 120],
    ["#ffd59e", 30, -10, 110],
    ["#a8d4ff", -20, 40, 100],
    ["#d7c2ff", 40, 50, 90],
    ["#fff2a8", 0, 0, 80],
  ] as const;
  return (
    <div aria-hidden="true" className="relative size-[260px] motion-safe:animate-drift" style={{ opacity: 0.55 + level * 0.2 }}>
      {blobs.map(([c, x, y, s]) => (
        <span
          key={c}
          className="absolute top-1/2 left-1/2 rounded-full blur-2xl"
          style={{ background: c, width: s + level * 20, height: s + level * 20, transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
        />
      ))}
    </div>
  );
}

export default function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [step, setStep] = useState<Step>("splash");
  const [nickname, setNickname] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [shape, setShape] = useState<ShapeId>("cloud");
  const [color, setColor] = useState<ColorId>("lavender");
  const [voice, setVoice] = useState<VoiceId>("marin");
  const [companion, setCompanion] = useState(DEFAULT_COMPANION);
  const [muted, setMuted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRiser = useRef<() => void>(() => {});

  useEffect(() => () => sfx.stopPad(), []);

  const name = nickname.trim() || "친구";
  const style = matchStyle(answers);
  const matched = describeStyle(style, answers);
    const qIndex = QUESTIONS.findIndex((q) => !answers[q.id]);

  function switchShape(dir: number) {
    const i = (SHAPES.findIndex((x) => x.id === shape) + dir + SHAPES.length) % SHAPES.length;
    sfx.pick(i);
    setShape(SHAPES[i].id);
  }

  // 화면 전환: 지금 화면이 잠깐 흐려지며 사라지고(LEAVE_MS), 다음 화면이 위로 살짝 떠오르며 나타난다.
  function go(next: Step, sound = true) {
    if (leaving) return; // 전환 중에 한 번 더 누르면 무시
    if (sound) sfx.tick();
    setLeaving(true);
    setTimeout(() => {
      setStep(next);
      setLeaving(false);
    }, LEAVE_MS);
  }

  function start() {
    sfx.unlock(); // 첫 탭에서 소리를 연다
    sfx.startPad();
    go("name");
  }

  function answer(id: string, value: string, i: number) {
    sfx.pick(i);
    const next = { ...answers, [id]: value };
    setAnswers(next);
    if (QUESTIONS.every((q) => next[q.id])) setTimeout(() => go("match", false), 900);
  }

  function holdStart() {
    setHolding(true);
    sfx.buzz(20);
    stopRiser.current = sfx.riser(HOLD_MS);
    holdTimer.current = setTimeout(meet, HOLD_MS);
  }

  function holdEnd() {
    if (!holdTimer.current) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    stopRiser.current();
    setHolding(false);
  }

  function meet() {
    holdTimer.current = null;
    stopRiser.current();
    sfx.buzz([40, 60, 120]);
    sfx.burst();
    sfx.stopPad();
    setStep("burst");
    setTimeout(() => setStep("reveal"), 1300);
  }

  function finish() {
    sfx.tick();
    onDone({ nickname: nickname.trim(), companion: cleanName(companion), shape, color, voice, style });
  }

  const dark = step !== "splash" && step !== "reveal";
  const screen = leaving ? "screen-leave" : "screen-enter";

  return (
    <main
      className={`relative mx-auto h-dvh min-h-[640px] w-full max-w-[430px] overflow-clip text-white ${
        dark ? "bg-linear-to-b from-[#0b0a1a] via-[#141029] to-[#241d3d]" : ""
      }`}
    >
      {/* Liquid Glass 굴절: 유리 뒤 배경을 가장자리에서 살짝 휘게 한다(크롬 계열만, 사파리는 흐림·반사광만) */}
      <svg aria-hidden="true" className="absolute size-0">
        <filter id="liquid-refract" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.012" numOctaves="2" seed="7" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
          <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {dark && (
        <>
          <div className="stars" aria-hidden="true" />
          <div aria-hidden="true" className="absolute -bottom-16 left-1/2 h-[120px] w-[220px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,214,150,.8),rgba(255,150,200,.5)_45%,rgba(140,170,255,.3)_70%,transparent)] blur-2xl" />
          <button
            onClick={() => {
              setMuted(!muted);
              sfx.setMuted(!muted);
            }}
            aria-pressed={muted}
            aria-label={muted ? "소리 켜기" : "소리 끄기"}
            className="absolute top-14 right-5 z-10 grid size-11 place-items-center rounded-full bg-white/10 text-white/80"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3.6 9.6h3.1l4.4-3.6c.5-.4 1.2 0 1.2.6v10.8c0 .6-.7 1-1.2.6l-4.4-3.6H3.6c-.5 0-.9-.4-.9-.9v-3c0-.5.4-.9.9-.9z" fill="currentColor" />
              {muted ? (
                <path d="M16.2 9.6l4.8 4.8M21 9.6l-4.8 4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M15.6 9.2a4 4 0 0 1 0 5.6M18.4 6.6a7.8 7.8 0 0 1 0 10.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </>
      )}

      {step === "splash" && (
        <button onClick={start} className={`absolute inset-0 grid place-items-center bg-[#f7f6f2] ${leaving ? "screen-leave" : ""}`} aria-label="시작">
          <span className="flex animate-fade items-center gap-2.5 text-[28px] font-bold tracking-[-0.02em] text-[#1e1d2b]">
            <Buddy size={52} look={[0.3, 0.1]} /> Here!
          </span>
          <span className="absolute bottom-16 text-sm text-[#6e6c7e]">눌러서 시작하기</span>
        </button>
      )}

      {step === "name" && (
        <form
          className={`absolute inset-0 ${screen}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (nickname.trim()) go("safety");
          }}
        >
          <Title>뭐라고 부르면 될까요?</Title>
          <label htmlFor="nickname" className="sr-only">이름이나 별명</label>
          <input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={12}
            placeholder="이름이나 별명"
            autoComplete="nickname"
            enterKeyHint="next"
            className="absolute inset-x-8 top-[206px] h-[58px] rounded-full bg-[#ecebf1] text-center text-[19px] font-semibold tracking-[-0.02em] text-[#1b1830] outline-0 placeholder:text-[#6b6979]"
          />
          <p className="absolute inset-x-6 top-[282px] text-center text-xs leading-[1.6] text-[#8c89a0]">
            계속하면 이용약관과 개인정보 처리방침에 동의하게 돼요.
            <br />
            몽글이는 AI예요.
          </p>
          <div className="absolute inset-x-0 top-[600px] flex justify-center">
            <Next onClick={() => go("safety")} disabled={!nickname.trim()} />
          </div>
        </form>
      )}

      {step === "safety" && (
        <div className={`absolute inset-0 ${screen}`}>
          <p className="absolute inset-x-0 top-[64px] flex justify-center">
            <span className="flex items-center gap-1.5 rounded-full bg-[#f4f2ea] py-2 pr-4 pl-3 text-sm font-semibold text-[#1e1d2b]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" fill="#1e1d2b" />
                <path d="M7.5 12.5l3 3 6-6.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              반가워요, {name}님
            </span>
          </p>
          <Title>시작하기 전에 세 가지만요</Title>
          <ul className="absolute inset-x-5 top-[236px] flex flex-col gap-1 rounded-[24px] border border-white/10 bg-white/[.06] p-2 backdrop-blur-md">
            <li className="rounded-2xl px-4 py-3.5">
              <b className="block text-[15px]">몽글이는 AI예요</b>
              <span className="text-[13px] text-[#c4c1d4]">진단과 치료는 사람 전문가가 해요.</span>
            </li>
            <li className="rounded-2xl px-4 py-3.5">
              <b className="block text-[15px]">기록은 이 기기에만</b>
              <span className="text-[13px] text-[#c4c1d4]">대화 기록은 이 기기의 브라우저에만 남아요.</span>
            </li>
            <li>
              <a href="tel:109" className="flex items-center justify-between gap-3 rounded-2xl bg-[#c42a33]/20 px-4 py-3.5 ring-1 ring-[#ff8b92]/40 ring-inset">
                <span>
                  <b className="block text-[15px]">
                    위급할 때는 <span className="text-[#ffb3b8]">109</span>
                  </b>
                  <span className="text-[13px] text-[#e6c8cb]">24시간 사람과 이야기할 수 있어요</span>
                </span>
                <span className="shrink-0 rounded-full bg-[#c42a33] px-3.5 py-2 text-sm font-bold">전화</span>
              </a>
            </li>
          </ul>
          <div className="absolute inset-x-0 top-[600px] flex justify-center">
            <Next onClick={() => go("finding")} />
          </div>
        </div>
      )}

      {step === "finding" && (
        <div className={`absolute inset-0 ${screen}`}>
          <p className="absolute inset-x-0 top-[66px] text-center text-[13px] font-semibold tracking-[.12em] text-white/85">몽글이를 찾는 중</p>
          <div className="absolute inset-x-0 top-[150px] flex justify-center">
            {qIndex >= 0 ? (
              <LightCloud level={Object.keys(answers).length} />
            ) : (
              <div className="grid size-[260px] place-items-center">
                <Buddy shape={shape} color={color} size={220} look={[0, -0.6]} mouth="o" className="animate-pop" />
              </div>
            )}
          </div>
          <div className="absolute inset-x-5 bottom-10 flex flex-col gap-4">
            {qIndex >= 0 ? (
              <>
                <Caption key={qIndex}>
                  {qIndex === 0 && `몽글이는 ${name}님과 이야기하면서 모양을 갖춰요. `}
                  {QUESTIONS[qIndex].text}
                </Caption>
                <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={QUESTIONS[qIndex].text}>
                  {QUESTIONS[qIndex].options.map((o, i) => (
                    <button
                      key={o}
                      onClick={() => answer(QUESTIONS[qIndex].id, o, i)}
                      className="h-11 rounded-full border border-white/20 bg-white/10 px-4 text-[15px] font-medium backdrop-blur-md transition active:scale-95"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <Caption>고마워요. 이제 몽글이가 보여요.</Caption>
            )}
          </div>
        </div>
      )}

      {step === "match" && (
        <div className={`absolute inset-0 ${screen}`}>
          <Title>이렇게 곁에 있을게요</Title>
          <div className="absolute inset-x-0 top-[196px] flex justify-center">
            <Buddy shape={shape} color={color} size={170} look={[0.2, 0.25]} bob />
          </div>
          <div className="absolute inset-x-6 top-[372px] rounded-[28px] border border-white/10 bg-white/[.07] px-6 py-6 text-center backdrop-blur-md">
            <p className="text-sm text-[#c4c1d4]">{name}님에게 어울리는 몽글이는</p>
            <p className="mt-1.5 text-[22px] font-bold tracking-[-0.02em]">{matched.name}</p>
            <p className="mt-3 text-[15px] leading-relaxed text-[#e4e2ee]">{matched.summary}</p>
          </div>
          <div className="absolute inset-x-0 top-[640px] flex justify-center">
            <Next onClick={() => go("shape")} />
          </div>
        </div>
      )}

      {step === "shape" && (
        <div className={`absolute inset-0 ${screen}`}>
          <Back onClick={() => go("match")} />
          <Title sub="언제든 바꿀 수 있어요.">몽글이는 어떤 모습이 좋을까요?</Title>
          <div className="absolute inset-x-0 top-[250px] flex items-center justify-between px-5">
            <button onClick={() => switchShape(-1)} aria-label="이전 모습" className="grid size-11 place-items-center rounded-full bg-white/15 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M14.5 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Buddy shape={shape} color={color} size={210} key={shape} look={[0, 0.2]} className="animate-pop" />
            <button onClick={() => switchShape(1)} aria-label="다음 모습" className="grid size-11 place-items-center rounded-full bg-white/15 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9.5 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="absolute inset-x-0 top-[500px] flex justify-center gap-2" role="radiogroup" aria-label="몽글이 모습">
            {SHAPES.map((x, i) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={shape === x.id}
                onClick={() => {
                  sfx.pick(i);
                  setShape(x.id);
                }}
                className={`h-11 rounded-full px-5 text-[15px] font-semibold transition ${shape === x.id ? "bg-white text-[#1e1d2b]" : "bg-white/10 text-white"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 top-[640px] flex justify-center">
            <Next onClick={() => go("color")} />
          </div>
        </div>
      )}

      {step === "color" && (
        <div className={`absolute inset-0 ${screen}`}>
          <Back onClick={() => go("shape")} />
          <Title sub="언제든 바꿀 수 있어요.">몽글이는 어떤 빛이면 좋을까요?</Title>
          <div className="absolute inset-x-0 top-[290px] flex justify-center">
            <Buddy shape={shape} color={color} size={210} key={color} look={[0, 0.2]} className="animate-pop" />
          </div>
          <p className="absolute inset-x-0 top-[490px] text-center text-[15px] font-semibold">{COLORS.find((c) => c.id === color)!.label}</p>
          <div className="absolute inset-x-0 top-[530px] flex justify-center gap-4" role="radiogroup" aria-label="몽글이 빛">
            {COLORS.map((c, i) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={color === c.id}
                aria-label={c.label}
                onClick={() => {
                  sfx.pick(i);
                  setColor(c.id);
                }}
                className={`size-11 rounded-full p-1.5 ${color === c.id ? "ring-2 ring-white" : ""}`}
              >
                <span className="block size-full rounded-full" style={{ background: `linear-gradient(160deg, ${c.light}, ${c.base} 70%, ${c.blob1})` }} />
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 top-[640px] flex justify-center">
            <Next onClick={() => go("voice")} />
          </div>
        </div>
      )}

      {step === "voice" && (
        <div className={`absolute inset-0 ${screen}`}>
          <Back onClick={() => go("color")} />
          <Title sub="언제든 바꿀 수 있어요.">어떤 목소리가 좋을까요?</Title>
          <div className="absolute inset-x-0 top-[250px] flex justify-center">
            <Buddy shape={shape} color={color} size={160} look={[0, 0.6]} mouth="o" bob />
          </div>
          <div className="absolute inset-x-6 top-[420px] flex items-end justify-between" role="radiogroup" aria-label="몽글이 목소리">
            {VOICES.map((v, i) => (
              <button
                key={v.id}
                role="radio"
                aria-checked={voice === v.id}
                aria-label={`${v.label}, ${v.desc}`}
                onClick={() => {
                  sfx.pick(i);
                  setVoice(v.id);
                }}
                className="grid size-12 place-items-center"
                style={{ marginBottom: Math.round(Math.sin((i / 5) * Math.PI) * -30) + 30 }}
              >
                <span
                  className={`block size-9 rounded-[38%] transition ${voice === v.id ? "scale-110 bg-white shadow-[0_0_24px_rgba(255,255,255,.7)]" : "bg-white/35"}`}
                />
              </button>
            ))}
          </div>
          <p className="absolute inset-x-0 top-[540px] text-center text-[15px]">
            <b>{VOICES.find((v) => v.id === voice)!.label}</b>
            <span className="text-[#c4c1d4]"> · {VOICES.find((v) => v.id === voice)!.desc}</span>
          </p>
          <div className="absolute inset-x-0 top-[640px] flex justify-center">
            <Next onClick={() => go("naming")} />
          </div>
        </div>
      )}

      {step === "naming" && (
        <form
          className={`absolute inset-0 ${screen}`}
          onSubmit={(e) => {
            e.preventDefault();
            go("hold");
          }}
        >
          <Back onClick={() => go("voice")} />
          <Title sub="언제든 바꿀 수 있어요.">몽글이 이름은 뭐로 할까요?</Title>
          <div className="absolute inset-x-0 top-[330px] flex justify-center">
            <Buddy shape={shape} color={color} size={170} look={[0.1, 0.65]} />
          </div>
          <div className="absolute inset-x-5 bottom-10 flex h-[58px] items-center rounded-full bg-[#f4f2ea] pr-2 pl-6">
            <label htmlFor="companion" className="sr-only">몽글이 이름</label>
            <input
              id="companion"
              value={companion}
              onChange={(e) => setCompanion(e.target.value)}
              maxLength={10}
              enterKeyHint="done"
              className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-[#1e1d2b] outline-0"
            />
            <button aria-label="정하기" className="grid size-11 place-items-center rounded-full bg-[#1e1d2b] text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 12.5l4 4 8-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      )}

      {step === "hold" && (
        <div className={`absolute inset-0 ${screen}`}>
          <div className="absolute inset-x-0 top-[200px] flex justify-center">
            <button
              aria-label={`${cleanName(companion)} 만나기`}
              onPointerDown={holdStart}
              onPointerUp={holdEnd}
              onPointerLeave={holdEnd}
              onPointerCancel={holdEnd}
              onClick={(e) => e.detail === 0 && meet()} // 키보드로 누르면 바로 만난다
              onContextMenu={(e) => e.preventDefault()}
              className="relative grid size-[260px] touch-none place-items-center rounded-full select-none"
            >
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.28),rgba(255,255,255,0))] transition-transform ease-out"
                style={{ transform: holding ? "scale(1.12)" : "scale(1)", transitionDuration: holding ? `${HOLD_MS}ms` : "300ms" }}
              />
              <svg aria-hidden="true" className="absolute inset-0 -rotate-90" viewBox="0 0 260 260">
                <circle
                  cx="130"
                  cy="130"
                  r="126"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={792}
                  strokeDashoffset={holding ? 0 : 792}
                  style={{ transition: `stroke-dashoffset ${holding ? HOLD_MS : 250}ms linear` }}
                />
              </svg>
              <Buddy shape={shape} color={color} size={210} look={[0, holding ? -0.3 : 0.1]} mouth={holding ? "o" : "calm"} />
            </button>
          </div>
          <p className="absolute inset-x-0 top-[500px] flex items-center justify-center gap-2 text-[15px]">
            <span className="-rotate-6 rounded-full bg-white px-3 py-1 font-bold text-[#1e1d2b]">꾹</span>
            &amp;
            <span className="rounded-full bg-white px-3 py-1 font-bold text-[#1e1d2b] ring-4 ring-white/30">누르고</span>
          </p>
          <p className="absolute inset-x-0 top-[546px] text-center text-[15px] font-medium">{josa(cleanName(companion), "을", "를")} 만나요</p>
        </div>
      )}

      {step === "burst" && <div aria-hidden="true" className="absolute inset-0 animate-burst bg-[radial-gradient(circle,#fff_0%,#fff_35%,#f3eefc_60%,#d9d4ea_100%)]" />}

      {step === "reveal" && (
        <div className={`absolute inset-0 ${screen} bg-[radial-gradient(circle_at_50%_45%,#efede8,#d2d0cb)] text-[#1e1d2b]`}>
          <p className="absolute inset-x-0 top-[80px] text-center text-[13px] font-semibold tracking-[.12em] text-[#45434e]">처음 만나는</p>
          <h1 className="absolute inset-x-0 top-[104px] text-center font-serif text-[56px] font-bold">{cleanName(companion)}</h1>
          <div className="absolute inset-x-0 top-[280px] flex justify-center">
            <Buddy shape={shape} color={color} size={220} look={[0.25, 0.2]} mouth="tongue" bob />
          </div>
          <div className="absolute inset-x-5 bottom-28">
            <Caption>
              안녕, {name}! 나는 {josa(cleanName(companion), "이야", "야")}. 만나서 반가워.
            </Caption>
          </div>
          <button onClick={finish} className="absolute bottom-10 left-1/2 h-12 -translate-x-1/2 rounded-full bg-[#1e1d2b] px-7 text-[15px] font-bold text-white">
            시작하기
          </button>
        </div>
      )}
    </main>
  );
}
