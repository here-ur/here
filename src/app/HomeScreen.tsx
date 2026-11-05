"use client";

import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Msg } from "@/lib/log";
import { ChatMarkdown } from "@/lib/chat-markdown";
import { safeSearchSource, type SearchSource } from "@/lib/web-search-protocol";
import { COLORS, type ColorId, type Profile, josa } from "@/lib/onboarding";
import { catExpression } from "@/lib/cat-expression";
import { companionBackground } from "@/lib/companion-theme";
import Buddy, { type BuddyState } from "./Buddy";
import { CalendarIcon } from "./Drawer";
import { Icon } from "./art";
import Sheet from "./Sheet";
import "./home-voice.css";
import "./home-chat.css";

// 글 버튼은 홈을 유지한 채 입력창만 펼친다. 음성 버튼은 같은 자리에서 확장한다.
// 파일 메타정보만 임시로 보관하며, 내용을 읽거나 서버로 보내지 않는다.
type SelectedFile = { key: string; name: string; size: number };

// 첨부 메뉴. 고른 종류에 맞춰 기기의 카메라·사진·파일 선택창을 연다(카메라는 지원하는 휴대폰에서만 바로 열린다).
const ATTACH_KINDS = [
  { id: "camera", label: "사진 찍기", accept: "image/*", capture: true, icon: <><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" /><circle cx="12" cy="12.5" r="3.2" /></> },
  { id: "photo", label: "사진 선택", accept: "image/*", capture: false, icon: <><rect x="4" y="4.5" width="16" height="15" rx="2.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" /></> },
  { id: "file", label: "파일 선택", accept: "", capture: false, icon: <><path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5Z" /><path d="M14 3.5v4h4" /></> },
] as const;

export type HomeVoiceControls = {
  state: BuddyState;
  connecting: boolean;
  listening: boolean;
  micOn: boolean;
  hasMic: boolean;
  statusText: string;
  error: string;
  caption?: string;
  sources?: SearchSource[];
  warning?: string;
  hearing?: boolean; // 사용자가 말하는 중(받아쓰기 중간 결과가 오는 동안)
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
export function Bloom({ color = "lavender", className = "h-[66%]", lively = false }: { color?: ColorId; className?: string; lively?: boolean }) {
  const id = `bloom${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden ${className}`} style={{ maskImage: "linear-gradient(to bottom, transparent, black 18%)" }}>
      <svg className="absolute inset-0 size-full origin-bottom motion-safe:animate-bloom" style={lively ? { animationDuration: "6s" } : undefined} viewBox="0 300 390 544" preserveAspectRatio="xMidYMax slice">
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
      <div className="absolute -inset-x-1/4 bottom-[-15%] h-[80%] motion-safe:animate-aurora-a" style={{ background: `radial-gradient(38% 42% at 32% 62%, ${c.blob2}66, transparent 70%)`, animationDuration: lively ? "9s" : undefined }} />
      <div className="absolute -inset-x-1/4 bottom-[-15%] h-[80%] motion-safe:animate-aurora-b" style={{ background: `radial-gradient(36% 40% at 70% 70%, ${c.blob1}55, transparent 70%)`, animationDuration: lively ? "12s" : undefined }} />
    </div>
  );
}

export default function HomeScreen({
  profile,
  greet,
  headline,
  onVoice,
  onText,
  onLibrary,
  onMenu,
  voice,
  chat,
  notice,
  spotlight,
  nudge,
  children,
}: {
  profile: Profile;
  greet: boolean; // 온보딩 직후 등장 모션
  headline?: string | null;
  spotlight?: React.ReactNode; // 기본 홈 위쪽에 작게 두는 것(오늘 해 볼 만한 것 시안). 대화 중에는 감춘다
  nudge?: React.ReactNode; // 대화를 마친 뒤 하단 버튼 위에 한 번 보여 주는 카드 시안
  onVoice: () => void;
  onText: () => void;
  onLibrary: () => void;
  onMenu: () => void;
  voice?: HomeVoiceControls;
  chat: HomeChatControls;
  notice?: React.ReactNode;
  children?: React.ReactNode; // 메뉴·시트처럼 홈 위에 겹치는 것
}) {
  const [showFiles, setShowFiles] = useState(false);
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [attachOpen, setAttachOpen] = useState(false);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const wasVoiceActive = useRef(Boolean(voice));
  const fileNoticeId = useId();
  const name = profile.companion;
  const expression = catExpression(chat.messages.findLast((message) => message.role === "user")?.content ?? "", Boolean(notice));
  const hasMessages = chat.open && !voice && (chat.messages.length > 0 || chat.sending);
  const chatting = chat.open && !voice; // 글 대화 중: 몽글이를 입력창 바로 위로 작게 옮긴다
  const resting = !chat.open && !voice; // 기본 홈: 글 없이 몽글이와 배경 움직임으로 대화를 권한다
  const bottomRef = useRef<HTMLDivElement>(null);
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
    // 입력창이 늘거나 오류·파일 줄이 생겨도 대화 목록이 하단 영역 바로 위에서 끝나게 한다.
    const frame = frameRef.current;
    const bottom = bottomRef.current;
    if (!frame || !bottom) return;
    const sync = () => frame.style.setProperty("--home-bottom-space", `${frame.clientHeight - bottom.offsetTop}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(frame);
    observer.observe(bottom);
    return () => observer.disconnect();
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
    if (!attachOpen) return;
    attachMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") { event.preventDefault(); setAttachOpen(false); attachButtonRef.current?.focus({ preventScroll: true }); }
        if (event.key === "Tab") setAttachOpen(false);
        return;
      }
      const target = event.target as Node;
      if (!attachMenuRef.current?.contains(target) && !attachButtonRef.current?.contains(target)) setAttachOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [attachOpen]);

  function pickAttachment(kind: (typeof ATTACH_KINDS)[number]) {
    const input = fileInputRef.current;
    if (attachOpen) {
      setAttachOpen(false);
      attachButtonRef.current?.focus({ preventScroll: true });
    }
    if (!input) return;
    if (kind.accept) input.accept = kind.accept; else input.removeAttribute("accept");
    if (kind.capture) input.setAttribute("capture", "environment"); else input.removeAttribute("capture");
    input.click();
  }

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
    <main ref={frameRef} className="app-frame home-screen text-cat-ink motion-safe:animate-fade" data-text-open={chat.open} data-has-messages={hasMessages} style={{ backgroundColor: companionBackground(profile.color) }}>
      {/* 온보딩의 빛이 하얗게 걷히며 홈이 나타난다 */}
      {greet && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 bg-white motion-safe:animate-unveil motion-reduce:hidden" />}

      <header className="home-header absolute inset-x-0 z-10 flex h-14 items-center justify-between px-gutter">
        <button onClick={onMenu} aria-label="메뉴" className="home-chrome-button ui-press grid size-12 place-items-center rounded-full">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <path d="M4.5 7h15M4.5 12h15M4.5 17h9" />
          </svg>
        </button>
        <span className="home-wordmark" aria-label="Here!">here<span aria-hidden="true">!</span></span>
        <button onClick={onLibrary} aria-label="라이브러리" className="home-chrome-button ui-press grid size-12 place-items-center rounded-full">
          <CalendarIcon />
        </button>
      </header>

      <div className={`home-intro absolute inset-x-gutter top-[18%] flex flex-col items-center text-center ${voice || hasMessages ? "home-intro-quiet" : ""}`} aria-hidden={Boolean(voice || hasMessages)}>
        {/* 실제 기억에 연결되는 문구가 있을 때만 표시. 기본 인사는 없음. */}
        {headline && <h1 className="min-h-[2.6em] max-w-80 whitespace-pre-line text-t9 leading-relaxed font-medium tracking-tight text-balance">{headline}</h1>}
      </div>

      {notice && <div className="home-safety absolute inset-x-gutter top-[18%] z-10">{notice}</div>}
      {spotlight && resting && !notice && <div className="absolute inset-x-gutter top-[calc(env(safe-area-inset-top)+76px)] z-10">{spotlight}</div>}

      {hasMessages && <div ref={messageListRef} className="home-messages" role="log" aria-label="대화 내용" aria-live="polite" aria-relevant="additions text">
        <p className="pt-1 text-center text-t1 text-cat-muted">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
        {chat.messages.map((message, index) => <div key={index} className="home-message" data-role={message.role}>
          <span className="sr-only">{message.role === "user" ? "나" : name}: </span>
          {message.role === "assistant" ? <div className="home-message-bubble"><ChatMarkdown content={message.content} /></div> : <p>{message.content}</p>}
        </div>)}
        {chat.sending && <div className="home-message" data-role="assistant">
          <span className="sr-only">{name}가 생각하는 중</span>
          <p className="flex items-center gap-1 py-4" aria-hidden="true">{[0, 1, 2].map((dot) => <i key={dot} className="size-1.5 rounded-full bg-cat-muted motion-safe:animate-dot" style={{ animationDelay: `${dot * 150}ms` }} />)}</p>
        </div>}
      </div>}

      <div className="home-character-wrap absolute inset-x-gutter top-[32%] flex flex-col items-center" data-hidden={chatting} aria-hidden={chatting}>
        <div className={`home-buddy ${voice ? "home-buddy-expanded" : ""}`}>
          <Buddy
            shape={profile.shape}
            color={profile.color}
            accessory={profile.accessory}
            size={248}
            expression={expression}
            state={voice?.state ?? chat.state}
            bob
            tap={chat.open && !voice ? chat.draft.length : undefined}
            hearing={voice ? Boolean(voice.hearing) : undefined}
            voice={Boolean(voice)}
          />
        </div>
        {voice && <div className="mt-5 max-w-full px-4 text-center">
          <p role="status" className="text-t4 font-medium text-cat-ink">{voice.error ? "연결하지 못했어요" : voice.statusText}</p>
          {voice.caption && !voice.error && <div className="mt-2 line-clamp-2 text-t3 text-cat-muted"><ChatMarkdown content={voice.caption.split("\n\n출처:")[0]} /></div>}
        </div>}
      </div>

      <div ref={bottomRef} className="home-bottom absolute inset-x-5 bottom-[max(32px,env(safe-area-inset-bottom))] flex flex-col gap-3">
        {voice?.sources && voice.sources.length > 0 && <nav aria-label="검색 출처" className="flex max-h-24 gap-2 overflow-auto rounded-r3 bg-white/90 px-3 py-2">
          {voice.sources.map(safeSearchSource).filter((source): source is SearchSource => Boolean(source)).map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-10 max-w-48 shrink-0 items-center rounded-r2 px-2 text-t3 text-cat-ink underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2"><span className="truncate">{source.title}</span></a>)}
        </nav>}
        {voice?.warning && !voice.error && <p role="status" className="rounded-r3 bg-white/90 px-4 py-3 text-t3 text-pretty text-cat-muted">{voice.warning}</p>}
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
            className="ui-press min-h-11 self-start rounded-full bg-white/70 px-4 text-t3 font-medium text-cat-ink"
          >
            선택한 파일 {files.length}개 · 기기에서만
          </button>
        )}
        {nudge && resting && <div>{nudge}</div>}
        {chatting && (
          <div aria-hidden="true" className="home-chat-buddy">
            <Buddy shape={profile.shape} color={profile.color} accessory={profile.accessory} size={68} expression={expression} state={chat.state} tap={chat.draft.length} />
          </div>
        )}
        <div role="group" aria-label={voice ? "음성 대화" : chat.open ? "메시지 작성" : "대화 시작"} className="home-actions">
          <form className="home-compose" data-open={chat.open} onSubmit={(event) => { event.preventDefault(); if (canSend && !chat.sending) chat.onSend(); }}>
          <button
            ref={attachButtonRef}
            type="button"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              setAttachOpen((open) => !open);
            }}
            aria-label="첨부"
            aria-haspopup="menu"
            aria-expanded={attachOpen}
            className="home-attach home-chrome-button ui-press grid size-14 shrink-0 place-items-center rounded-full"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className={`transition-transform duration-[var(--seed-duration-d4)] ${attachOpen ? "rotate-45" : ""}`}>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {attachOpen && (
            <div ref={attachMenuRef} role="menu" aria-label="첨부할 종류" className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-48 origin-bottom-left rounded-r4 bg-white p-1.5 shadow-[0_10px_32px_rgba(35,32,27,.12)] motion-safe:animate-pop">
              {ATTACH_KINDS.map((kind) => (
                <button key={kind.id} type="button" role="menuitem" onClick={() => pickAttachment(kind)} className="ui-press flex h-11 w-full items-center gap-3 rounded-r3 px-3 text-left text-t4 font-medium text-cat-ink hover:bg-cat-soft focus-visible:bg-cat-soft">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-cat-ink">{kind.icon}</svg>
                  {kind.label}
                </button>
              ))}
            </div>
          )}
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
              <button type="button" onClick={collapseText} tabIndex={chat.open ? 0 : -1} aria-label="입력창 닫기" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-cat-soft text-cat-ink"><Icon name="close" size={18} /></button>
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
              className="home-text-toggle home-chrome-button ui-press grid size-14 place-items-center rounded-full disabled:opacity-40"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v10a1.5 1.5 0 0 1-1.5 1.5H10l-6.5 4V6A1.5 1.5 0 0 1 5 4.5Z" />
              </svg>
            </button>
          </form>
          <div className="home-right-action" data-send={canSend}>
            <button type="button" onClick={chat.onSend} disabled={chat.sending || !canSend} tabIndex={canSend ? 0 : -1} aria-hidden={!canSend} aria-label="메시지 보내기" className="home-send ui-press grid size-14 place-items-center rounded-full bg-cat-ink text-white disabled:opacity-40"><Icon name="send" size={23} /></button>
            <div inert={canSend} aria-hidden={canSend} className="home-mic-action">
            <div className="home-voice-pill" data-expanded={Boolean(voice)}>
              <div className="home-voice-end" inert={!voice} aria-hidden={!voice}>
                <button type="button" onClick={voice?.onEnd} tabIndex={voice ? 0 : -1} aria-label="음성 대화 종료" className="ui-press grid size-12 shrink-0 place-items-center rounded-full bg-[#E5484D] text-white">
                  <Icon name="close" size={20} />
                </button>
                <span className="h-8 w-px shrink-0 bg-cat-line" />
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
                className="home-mic ui-press grid size-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
                data-off={Boolean(voice && !voice.micOn && !voice.error)}
              >
                <Icon name={voice && !voice.micOn && !voice.error ? "micOff" : "mic"} size={26} />
              </button>
            </div>
            </div>
          </div>
        </div>
        {!chatting && <p className="text-center text-t1 text-cat-muted">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>}
      </div>
      {voice?.listening && <div className="home-listening-wave" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 7) * -160}ms`, backgroundColor: "var(--color-cat-accent)" }} />)}</div>}
      {children}
      {!showFiles && filePicker}
      {showFiles && (
        <Sheet
          title="선택한 파일"
          onClose={() => setShowFiles(false)}
          footer={(
            <button
              type="button"
              onClick={() => pickAttachment(ATTACH_KINDS[2])}
              className="ui-press h-14 w-full rounded-full bg-cat-soft text-t5 font-bold text-cat-ink"
            >
              파일 더 선택하기
            </button>
          )}
        >
          {filePicker}
          <p id={fileNoticeId} className="mt-4 text-article-note text-pretty text-cat-muted">
            파일 전송 기능은 준비 중이에요. 선택한 파일 정보는 이 기기에서만 표시되며, 파일 내용은 읽거나 전송하지 않아요.
          </p>
          {files.length === 0 ? (
            <p role="status" className="py-8 text-center text-t4 text-cat-muted">선택한 파일이 없어요.</p>
          ) : (
            <ul aria-label="선택한 파일 목록" aria-describedby={fileNoticeId} className="mt-5 flex flex-col gap-3">
              {files.map((file) => (
                <li key={file.key} className="flex items-center gap-3 rounded-r4 bg-cat-soft py-3 pr-2 pl-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-t4 font-medium text-cat-ink" title={file.name}>{file.name}</p>
                    <p className="mt-1 text-t2 tabular-nums text-cat-muted">{file.size.toLocaleString("ko-KR")} B</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((item) => item.key !== file.key))}
                    aria-label={`${file.name} 선택 해제`}
                    className="ui-press grid size-11 shrink-0 place-items-center rounded-full text-cat-muted"
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
