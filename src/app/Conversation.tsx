"use client";

import { useEffect, useRef, useState } from "react";
import { companionState } from "@/lib/companion-state";
import type { Msg } from "@/lib/log";
import { COLORS, type ColorId, type ShapeId, accentButton, josa } from "@/lib/onboarding";
import { Icon } from "./art";
import Buddy from "./Buddy";
import { Bloom } from "./HomeScreen";

// 대화 화면들: 글 대화(TextScreen), 끝난 뒤 요약(SummaryScreen).
// 홈과 같은 라이트 톤(흰 바탕 + 아래 번짐)이고, 상태와 동작은 page.tsx가 들고 있다.

export type Who = { name: string; shape: ShapeId; color: ColorId };


/** full: 홈과 같은 번짐(통화). soft: 글이 많은 화면이라 아래만 은은하게 물든다(번짐을 잘라 쓰면 위쪽에 딱딱한 경계가 생긴다). */
export function Shell({ children, color, bloom = "full" }: { children: React.ReactNode; color: ColorId; bloom?: "full" | "soft" }) {
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return (
    <main className="app-frame bg-[#FAFCFE] text-[#111318] motion-safe:animate-fade">
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
    <span className="rounded-full bg-white px-2 py-0.5 text-t1 font-bold text-[#1F2A55] shadow-[0_1px_6px_rgba(28,38,80,.1)]" title="AI예요">
      AI
    </span>
  );
}

/** 자살예방상담전화 109. 위기 표현이 보이면 어느 화면이든 맨 위에, 가장 눈에 띄게. */
export function Crisis109({ className = "" }: { className?: string }) {
  return (
    <div role="alert" className={`flex items-center justify-between gap-3 rounded-r5 bg-white py-3 pr-3 pl-4 shadow-[0_8px_24px_rgba(194,54,43,.18)] ring-2 ring-[#D7261E] ring-inset ${className}`}>
      <span className="text-sm font-semibold">
        자살예방상담전화 <b className="ml-0.5 text-lg text-[#C42A23]">109</b>
        <small className="block text-t2 font-medium text-[#55525F]">24시간 사람과 이야기할 수 있어요</small>
      </span>
      <a href="tel:109" className="ui-press flex h-11 shrink-0 items-center rounded-full bg-[#C42A23] px-4 text-sm font-bold text-white">
        전화하기
      </a>
    </div>
  );
}

function HelpChip({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="ui-press flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold text-[#1F2A55] shadow-[0_6px_18px_rgba(28,38,80,.12)]">
      <Icon name="help" size={18} />
      도움받기
    </button>
  );
}

/** 말풍선 목록: 몽글이는 왼쪽 흰 말풍선(첫 말에 작은 얼굴), 나는 오른쪽 파란 말풍선 */
export function Bubbles({ who, messages, live, thinking, follow = true }: { who: Who; messages: Msg[]; live?: string; thinking?: boolean; follow?: boolean }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!follow) return;
    // 새 말이 오면 맨 아래로. (요즘 크롬은 scrollIntoView가 Promise를 돌려줘서, 이펙트가 그 값을 돌려주지 않게 감싼다)
    end.current?.scrollIntoView({ block: "end", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [follow, messages.length, live, thinking]);
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
              className={`max-w-[78%] whitespace-pre-wrap px-4 py-2.5 text-article-body motion-safe:animate-fade ${
                mine
                  ? "rounded-r5 rounded-br-r1_5 bg-linear-to-b from-[#3B76FF] to-[#1E4FE0] text-white shadow-[0_6px_16px_rgba(30,79,224,.25)]"
                  : "rounded-r5 rounded-bl-r1_5 bg-white text-[#111318] shadow-[0_4px_14px_rgba(28,38,80,.08)]"
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

export function TextScreen(p: {
  who: Who;
  messages: Msg[];
  live: string;
  thinking: boolean;
  error: string;
  sending: boolean;
  crisis: boolean;
  suggest: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onSend: () => void;
  onHelp: () => void;
  onVoice: () => void;
  onBack: () => void;
}) {
  const composer = useRef<HTMLTextAreaElement>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const empty = p.messages.length === 0 && !p.live && !p.thinking;
  const canSend = Boolean(p.draft.trim()) && !p.sending;
  const state = companionState({ error: Boolean(p.error), thinking: p.thinking, speaking: Boolean(p.live), composing: inputFocused || Boolean(p.draft.trim()) });

  useEffect(() => {
    const textarea = composer.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [p.draft]);

  return (
    <Shell color={p.who.color} bloom="soft">
      <div className="relative flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-gutter pt-6 pb-4">
          <button onClick={p.onBack} aria-label="대화 마치기" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)]">
            <Icon name="back" size={20} />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <Buddy shape={p.who.shape} color={p.who.color} size={32} state={state} />
            <div className="min-w-0">
              <h1 className="flex items-center gap-1.5 text-t6 font-bold"><span className="truncate">{p.who.name}</span> <AiBadge /></h1>
              <p className="mt-0.5 text-t2 text-[#5A6478]">글로 이야기하기</p>
            </div>
          </div>
          <button onClick={p.onVoice} disabled={p.sending} aria-label="음성으로 이야기하기" title="음성으로 이야기하기" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)] disabled:opacity-40">
            <Icon name="phone" size={20} />
          </button>
        </header>

        {p.crisis && <Crisis109 className="mx-4 mb-3 shrink-0" />}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pb-5" aria-label="대화 내용">
          {empty ? (
            <div className="flex min-h-full flex-col items-center justify-center px-3 pb-10 text-center">
              <Buddy shape={p.who.shape} color={p.who.color} size={100} state={state} />
              <h2 className="mt-3 text-t8 font-bold text-balance">{p.who.name}에게 편하게<br />이야기해 보세요</h2>
              <p className="mt-3 text-t4 text-pretty text-[#5A6478]">오늘 있었던 일도, 지금 드는 생각도 좋아요.</p>
            </div>
          ) : <Bubbles who={p.who} messages={p.messages} live={p.live} thinking={p.thinking} />}
          {p.suggest && <div className="mt-5 flex justify-center"><HelpChip onClick={p.onHelp} /></div>}
        </div>

        <form className="shrink-0 px-gutter pt-2 pb-[max(20px,env(safe-area-inset-bottom))]" aria-label="메시지 작성" onSubmit={(event) => {
          event.preventDefault();
          if (canSend) p.onSend();
        }}>
          {p.error && <p role="alert" className="mb-3 rounded-r3 bg-white/90 px-3 py-2 text-t3 text-pretty text-[#C42A23]">{p.error}</p>}
          <div className="glass-focus rounded-r6 bg-white p-3 shadow-[0_0_0_1px_rgba(28,38,80,.08),0_8px_28px_rgba(28,38,80,.08)]" style={{ "--accent": COLORS.find((color) => color.id === p.who.color)?.deep } as React.CSSProperties}>
            <label htmlFor="text-draft" className="sr-only">{p.who.name}에게 하고 싶은 말</label>
            <textarea
              ref={composer}
              id="text-draft"
              rows={1}
              value={p.draft}
              readOnly={p.sending}
              aria-busy={p.sending}
              onChange={(event) => p.onDraft(event.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
                event.preventDefault();
                if (canSend) p.onSend();
              }}
              maxLength={800}
              placeholder="메시지를 입력하세요"
              enterKeyHint="enter"
              autoComplete="off"
              className="block max-h-33 min-h-11 w-full resize-none overflow-y-auto bg-transparent px-1 pt-2 pb-3 text-article-body text-[#1F2A55] outline-0 placeholder:text-[#5A6478]"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="pl-1 text-t2 text-[#5A6478]">{p.sending ? "답변을 기다리고 있어요…" : "천천히 적어도 괜찮아요"}</span>
              <button aria-label="메시지 보내기" disabled={!canSend} style={accentButton(p.who.color)} className="ui-press grid size-11 shrink-0 place-items-center rounded-full text-white disabled:opacity-40">
                <Icon name="send" size={20} />
              </button>
            </div>
          </div>
          <p className="mt-3 text-center text-t1 text-[#5A6478]">{josa(p.who.name, "은", "는")} AI예요. 진단과 치료는 전문가가 해요.</p>
        </form>
      </div>
    </Shell>
  );
}

export function SummaryScreen(p: { who: Who; messages: Msg[]; clock: string; crisis: boolean; suggest: boolean; onHelp: () => void; onClose: () => void }) {
  return (
    <Shell color={p.who.color} bloom="soft">
      <div className="absolute inset-x-0 top-0 bottom-[110px] overflow-y-auto px-4 pt-16 pb-4">
        <h1 className="px-1 text-2xl font-semibold tracking-[-0.03em]">오늘 나눈 이야기</h1>
        <p className="mt-1 px-1 text-sm text-[#5F6675]">{p.clock} · 내 기록은 이 브라우저에 보관해요</p>
        {p.crisis && <Crisis109 className="mt-4" />}
        <div className="mt-5">
          <Bubbles who={p.who} messages={p.messages} />
        </div>
      </div>
      <div className="absolute inset-x-5 bottom-8 flex flex-col gap-2">
        {p.suggest && (
          <button onClick={p.onHelp} className="ui-press h-14 rounded-full bg-white text-t5 font-bold text-[#1F2A55] shadow-[0_6px_18px_rgba(28,38,80,.12)]">
            도움받기
          </button>
        )}
        <button onClick={p.onClose} className="ui-press h-14 rounded-full bg-[#141518] text-t5 font-bold text-white">
          닫기
        </button>
      </div>
    </Shell>
  );
}
