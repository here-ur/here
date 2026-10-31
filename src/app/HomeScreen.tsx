"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Msg } from "@/lib/log";
import { ChatMarkdown } from "@/lib/chat-markdown";
import { COLORS, type ColorId, type Profile, josa } from "@/lib/onboarding";
import Buddy, { type BuddyState } from "./Buddy";
import { Icon } from "./art";
import Sheet from "./Sheet";
import "./home-voice.css";
import "./home-chat.css";

// 글 버튼은 홈을 유지한 채 입력창만 펼친다. 음성 버튼은 같은 자리에서 확장한다.
// 파일 메타정보만 임시로 보관하며, 내용을 읽거나 서버로 보내지 않는다.
type SelectedFile = { key: string; name: string; size: number };

export type HomeVoiceControls = {
  state: BuddyState;
  connecting: boolean;
  listening: boolean;
  micOn: boolean;
  hasMic: boolean;
  statusText: string;
  error: string;
  caption?: string;
  warning?: string;
  onEnd: () => void;
  onMic: () => void;
};

export type HomeChatControls = {
  open: boolean;
  messages: Msg[];
  draft: string;
  sending: boolean;
  error: string;
  state: BuddyState;
  onDraft: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
};

/** 아래에서 올라오는 오돌토돌한 번짐. 고른 몽글이 빛의 색을 연하게 써서 캐릭터와 어울리게 하고,
 * 천천히 숨 쉬듯 부풀며 그 안에서 두 색이 오로라처럼 흐른다. */
export function Bloom({ color = "lavender", className = "h-[66%]" }: { color?: ColorId; className?: string }) {
  const id = `bloom${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden ${className}`} style={{ maskImage: "linear-gradient(to bottom, transparent, black 18%)" }}>
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
  headline,
  onVoice,
  onText,
  onLog,
  onMenu,
  voice,
  chat,
  notice,
  children,
}: {
  profile: Profile;
  greet: boolean; // 온보딩을 막 끝냈으면 몽글이가 처음 인사한다
  headline?: string | null;
  onVoice: () => void;
  onText: () => void;
  onLog: () => void;
  onMenu: () => void;
  voice?: HomeVoiceControls;
  chat: HomeChatControls;
  notice?: React.ReactNode;
  children?: React.ReactNode; // 메뉴·시트처럼 홈 위에 겹치는 것
}) {
  const [showFiles, setShowFiles] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [greeting, setGreeting] = useState(greet);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const wasVoiceActive = useRef(Boolean(voice));
  const fileNoticeId = useId();
  const name = profile.companion;
  const nick = profile.nickname || "친구";
  const hasMessages = chat.open && !voice && (chat.messages.length > 0 || chat.sending);
  const canSend = chat.open && Boolean(chat.draft.trim());

  useEffect(() => {
    if (wasVoiceActive.current && !voice && !chat.open) micButtonRef.current?.focus({ preventScroll: true });
    wasVoiceActive.current = Boolean(voice);
  }, [voice, chat.open]);

  useEffect(() => {
    if (!chat.open) return;
    const frame = requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [chat.open]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncHeight = () => frameRef.current?.style.setProperty("--home-visible-height", `${viewport?.height ?? window.innerHeight}px`);
    syncHeight();
    viewport?.addEventListener("resize", syncHeight);
    window.addEventListener("resize", syncHeight);
    return () => {
      viewport?.removeEventListener("resize", syncHeight);
      window.removeEventListener("resize", syncHeight);
    };
  }, []);

  useEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
  }, [chat.draft, chat.open]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [chat.messages.length, chat.sending]);

  function expandText() {
    // 사용자 클릭 안에서 포커스를 옮겨 모바일에서도 키보드가 바로 열린다.
    flushSync(onText);
    composerRef.current?.focus({ preventScroll: true });
  }

  function collapseText() {
    composerRef.current?.blur();
    flushSync(chat.onClose);
    chatButtonRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (!greeting) return;
    const t = setTimeout(() => setGreeting(false), 6000);
    return () => clearTimeout(t);
  }, [greeting]);

  const filePicker = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      hidden
      tabIndex={-1}
      aria-label="첨부할 파일 선택"
      onChange={(event) => {
        const selected = Array.from(event.currentTarget.files ?? []).map((file) => ({
          key: `${file.name}:${file.size}:${file.lastModified}`,
          name: file.name,
          size: file.size,
        }));
        event.currentTarget.value = "";
        if (!selected.length) return;
        setFiles((current) => Array.from(new Map([...current, ...selected].map((file) => [file.key, file])).values()));
        setShowFiles(true);
      }}
    />
  );

  return (
    <main ref={frameRef} className="app-frame home-screen bg-[#FAFCFE] text-[#111318] motion-safe:animate-fade" data-text-open={chat.open} data-has-messages={hasMessages}>
      <Bloom color={profile.color} />
      {/* 온보딩의 빛이 하얗게 걷히며 홈이 나타난다 */}
      {greet && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 bg-white motion-safe:animate-unveil motion-reduce:hidden" />}

      <header className="home-header absolute inset-x-0 top-12 z-10 flex h-14 items-center justify-between px-gutter">
        <button onClick={onMenu} aria-label="메뉴" className="ui-press grid size-14 place-items-center rounded-full bg-white shadow-[0_3px_18px_rgba(28,38,80,.055),0_1px_2px_rgba(28,38,80,.03)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M4.5 7h15M4.5 12h15M4.5 17h9" />
          </svg>
        </button>
        <span className="flex items-center gap-1.5">
          <Buddy shape={profile.shape} color={profile.color} size={30} look={[0.2, 0.1]} />
          <span className="text-t7 font-medium">Here!</span>
        </span>
        <button onClick={onLog} aria-label="내 기록" className="ui-press grid size-14 place-items-center rounded-full bg-white shadow-[0_3px_18px_rgba(28,38,80,.055),0_1px_2px_rgba(28,38,80,.03)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.6 12.2A8.5 8.5 0 1 0 6.2 5.9" />
            <path d="M3.4 4.6v4h4" />
            <path d="M12 7.6V12l3 2" />
          </svg>
        </button>
      </header>

      <div className={`home-intro absolute inset-x-gutter top-[18%] flex flex-col items-center gap-6 text-center ${voice || hasMessages ? "home-intro-quiet" : ""}`} aria-hidden={Boolean(voice || hasMessages)}>
        <span className="inline-flex h-8 items-center rounded-full bg-white px-4 text-t4 text-[#2A2E36] shadow-[0_2px_12px_rgba(28,38,80,.05),0_0_0_1px_rgba(28,38,80,.03)]">
          AI 이야기 친구
        </span>
        <h1 className="min-h-[2.6em] whitespace-pre-line text-t12 font-medium text-balance">
          {headline || "오늘 하루,\n어떤 이야기를 해 볼까?"}
        </h1>
      </div>

      {notice && <div className="home-safety absolute inset-x-gutter top-[18%] z-10">{notice}</div>}

      {hasMessages && <div ref={messageListRef} className="home-messages" role="log" aria-label="대화 내용" aria-live="polite" aria-relevant="additions text">
        {chat.messages.map((message, index) => <div key={index} className="home-message" data-role={message.role}>
          <span className="sr-only">{message.role === "user" ? "나" : name}: </span>
          {message.role === "assistant" ? <div className="home-message-bubble"><ChatMarkdown content={message.content} /></div> : <p>{message.content}</p>}
        </div>)}
        {chat.sending && <div className="home-message" data-role="assistant">
          <span className="sr-only">{name}가 생각하는 중</span>
          <p className="flex items-center gap-1 py-4" aria-hidden="true">{[0, 1, 2].map((dot) => <i key={dot} className="size-1.5 rounded-full bg-[#5A6478] motion-safe:animate-dot" style={{ animationDelay: `${dot * 150}ms` }} />)}</p>
        </div>}
      </div>}

      <div className="home-character-wrap absolute inset-x-gutter top-[44%] flex flex-col items-center">
        {greeting && !voice && !chat.open && !hasMessages && (
          <button
            onClick={() => setGreeting(false)}
            className="ui-press mb-2 max-w-full rounded-r4 bg-white/90 px-4 py-3 text-t5 font-medium text-[#1e1d2b] shadow-[0_8px_24px_rgba(40,60,140,.18)] motion-safe:animate-pop"
          >
            안녕, {nick}! 나는 {josa(name, "이야", "야")}.
          </button>
        )}
        <div className={`home-buddy ${voice ? "home-buddy-expanded" : ""}`}>
          <Buddy shape={profile.shape} color={profile.color} size={170} state={voice?.state ?? chat.state} mouth={greeting && !voice && !chat.open ? "tongue" : undefined} bob />
        </div>
        {voice && <div className="mt-5 max-w-full px-4 text-center">
          <p role="status" className="text-t4 font-medium text-[#1F2A55]">{voice.error ? "연결하지 못했어요" : voice.statusText}</p>
          {voice.caption && !voice.error && <p className="mt-2 line-clamp-2 text-t3 text-[#5A6478]">{voice.caption}</p>}
        </div>}
      </div>

      <div className="home-bottom absolute inset-x-5 bottom-[max(32px,env(safe-area-inset-bottom))] flex flex-col gap-3">
        {voice?.warning && !voice.error && <p role="status" className="rounded-r3 bg-white/90 px-4 py-3 text-t3 text-pretty text-[#5A6478]">{voice.warning}</p>}
        {voice?.error && <p role="alert" className="rounded-r3 bg-white/90 px-4 py-3 text-t3 text-pretty text-[#C42A23]">{voice.error}</p>}
        {chat.error && !voice && <p role="alert" className="rounded-r3 bg-white/90 px-4 py-3 text-t3 text-pretty text-[#C42A23]">{chat.error}</p>}
        {files.length > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              setShowFiles(true);
            }}
            aria-haspopup="dialog"
            className="ui-press min-h-11 self-start rounded-full bg-white/70 px-4 text-t3 font-medium text-[#1F2A55]"
          >
            선택한 파일 {files.length}개 · 기기에서만
          </button>
        )}
        <div role="group" aria-label={voice ? "음성 대화" : chat.open ? "메시지 작성" : "대화 시작"} className="home-actions">
          <form className="home-compose" data-open={chat.open} onSubmit={(event) => { event.preventDefault(); if (canSend && !chat.sending) chat.onSend(); }}>
          <button
            type="button"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              fileInputRef.current?.click();
            }}
            aria-label="파일 첨부"
            className="home-attach ui-press grid size-14 shrink-0 place-items-center rounded-full text-[#1F2A55]"
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 4v16M4 12h16" />
            </svg>
          </button>
            <div className="home-compose-content" inert={!chat.open} aria-hidden={!chat.open}>
              <label htmlFor="home-text-draft" className="sr-only">{name}에게 하고 싶은 말</label>
              <textarea ref={composerRef} id="home-text-draft" rows={1} maxLength={800} value={chat.draft} readOnly={chat.sending} tabIndex={chat.open ? 0 : -1} aria-busy={chat.sending} placeholder={`${name}에게 이야기해요…`} autoComplete="off" enterKeyHint="send"
                onChange={(event) => chat.onDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") { event.preventDefault(); collapseText(); return; }
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
                  event.preventDefault();
                  if (canSend && !chat.sending) chat.onSend();
                }}
              />
              <button type="button" onClick={collapseText} tabIndex={chat.open ? 0 : -1} aria-label="입력창 닫기" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-[#F2F4F8] text-[#1F2A55]"><Icon name="close" size={18} /></button>
            </div>
            <button
              ref={chatButtonRef}
              type="button"
              onClick={expandText}
              disabled={voice?.connecting}
              tabIndex={chat.open ? -1 : 0}
              aria-label="글로 이야기하기"
              aria-expanded={chat.open}
              aria-controls="home-text-draft"
              aria-hidden={chat.open}
              className="home-text-toggle ui-press grid size-14 place-items-center rounded-full text-[#1F2A55] disabled:opacity-40"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v10a1.5 1.5 0 0 1-1.5 1.5H10l-6.5 4V6A1.5 1.5 0 0 1 5 4.5Z" />
              </svg>
            </button>
          </form>
          <div className="home-right-action" data-send={canSend}>
            <button type="button" onClick={chat.onSend} disabled={chat.sending || !canSend} tabIndex={canSend ? 0 : -1} aria-hidden={!canSend} aria-label="메시지 보내기" className="home-send ui-press grid size-14 place-items-center rounded-full bg-[#1E4FE0] text-white disabled:opacity-40"><Icon name="send" size={23} /></button>
            <div inert={canSend} aria-hidden={canSend} className="home-mic-action">
            <div className="home-voice-pill" data-expanded={Boolean(voice)}>
              <div className="home-voice-end" inert={!voice} aria-hidden={!voice}>
                <button type="button" onClick={voice?.onEnd} tabIndex={voice ? 0 : -1} aria-label="음성 대화 종료" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-[#E5484D] text-white">
                  <Icon name="close" size={20} />
                </button>
                <span className="h-8 w-px shrink-0 bg-[#D9DDE7]" />
              </div>
              <button
                ref={micButtonRef}
                type="button"
                onClick={voice ? voice.onMic : onVoice}
                disabled={chat.sending || Boolean(voice && (voice.connecting || (!voice.hasMic && !voice.error)))}
                tabIndex={canSend ? -1 : 0}
                aria-label={voice ? voice.error ? "음성 연결 다시 시도" : voice.micOn ? "마이크 끄기" : "마이크 켜기" : `${josa(name, "과", "와")} 음성 대화 시작`}
                aria-expanded={Boolean(voice)}
                aria-pressed={voice && !voice.error ? voice.micOn : undefined}
                className="ui-press grid size-14 shrink-0 place-items-center rounded-full text-[#1F2A55] disabled:opacity-40"
              >
                <Icon name={voice && !voice.micOn && !voice.error ? "micOff" : "mic"} size={28} />
              </button>
            </div>
            </div>
          </div>
        </div>
        <p className="text-center text-t1 text-[#5A6478]">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
      </div>
      {voice?.listening && <div className="home-listening-wave" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 7) * -160}ms`, backgroundColor: COLORS.find((color) => color.id === profile.color)?.deep }} />)}</div>}
      {children}
      {!showFiles && filePicker}
      {showFiles && (
        <Sheet
          title="선택한 파일"
          onClose={() => setShowFiles(false)}
          footer={(
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="ui-press h-14 w-full rounded-full bg-[#F2F4F8] text-t5 font-bold text-[#1F2A55]"
            >
              파일 더 선택하기
            </button>
          )}
        >
          {filePicker}
          <p id={fileNoticeId} className="mt-4 text-article-note text-pretty text-[#5A6478]">
            파일 전송 기능은 준비 중이에요. 선택한 파일 정보는 이 기기에서만 표시되며, 파일 내용은 읽거나 전송하지 않아요.
          </p>
          {files.length === 0 ? (
            <p role="status" className="py-8 text-center text-t4 text-[#5A6478]">선택한 파일이 없어요.</p>
          ) : (
            <ul aria-label="선택한 파일 목록" aria-describedby={fileNoticeId} className="mt-5 flex flex-col gap-3">
              {files.map((file) => (
                <li key={file.key} className="flex items-center gap-3 rounded-r4 bg-[#F2F4F8] py-3 pr-2 pl-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-t4 font-medium text-[#1F2A55]" title={file.name}>{file.name}</p>
                    <p className="mt-1 text-t2 tabular-nums text-[#5A6478]">{file.size.toLocaleString("ko-KR")} B</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((item) => item.key !== file.key))}
                    aria-label={`${file.name} 선택 해제`}
                    className="ui-press grid size-11 shrink-0 place-items-center rounded-full text-[#5A6478]"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <path d="m6 6 12 12M18 6 6 18" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </main>
  );
}
