"use client";

import { TextArea } from "./ui/Controls";
import { Button } from "./ui/Button";
import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import type { Msg } from "@/lib/log";
import { ChatMarkdown } from "@/lib/chat-markdown";
import { safeSearchSource, type SearchSource } from "@/lib/web-search-protocol";
import { COLORS, type ColorId, type Profile, josa } from "@/lib/onboarding";
import { catExpression } from "@/lib/cat-expression";
import Buddy, { type BuddyState } from "./Buddy";
import PoseCat from "./PoseCat";
import { useCatReactions } from "./use-cat-reactions";
import { Icon } from "./art";
import "./home-voice.css";
import "./home-chat.css";
import "./home-scene.css";

// 글 버튼은 홈을 유지한 채 입력창만 펼친다. 음성 버튼은 같은 자리에서 확장한다.
// 첨부(+)와 오른쪽 위 라이브러리 버튼은 11/11 회의에서 홈에서 빼기로 했다. 라이브러리는 메뉴로 들어간다.
// 홈은 메뉴 버튼·몽글이·하단 버튼만 남긴다. 몽글이가 AI라는 안내는 온보딩·메뉴·대화 기록에서 보여 준다.
// 거실 배경과 러그 위 고양이의 배치는 home-scene.css에서 관리한다.
// 하단 버튼 줄은 기본·글·음성 어느 상태에서도 같은 높이에 둔다(시선이 오르내리지 않게).

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
  history?: { loaded: boolean; loading: boolean; hasMore: boolean; error: string; onOlder: () => Promise<void> };
  draft: string;
  sending: boolean;
  error: string;
  state: BuddyState;
  onDraft: (value: string) => void;
  onSend: () => void;
  onRetry?: () => void;
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
  onMenu,
  menuButtonRef,
  voice,
  chat,
  notice,
  spotlight,
  nudge,
  banner,
  children,
  outputLevel,
  outputShape,
}: {
  outputLevel?: React.RefObject<number>;
  outputShape?: React.RefObject<import("@/lib/mouth-shape").MouthShape>;
  profile: Profile;
  greet: boolean; // 온보딩 직후 등장 모션
  headline?: string | null;
  spotlight?: React.ReactNode; // 기본 홈 위쪽에 작게 두는 것(오늘 해 볼 만한 것 시안). 대화 중에는 감춘다
  nudge?: React.ReactNode; // 쉬는 동안 하단 버튼 바로 위에 보여 주는 작은 카드(지금은 홈 첫 방문 안내 HomeHint)
  banner?: { text: string; error?: boolean }; // 메뉴에서 한 일의 진행·실패를 하단 버튼 위에 알린다(지금은 처음부터 다시 만들기)
  onVoice: () => void;
  onText: () => void;
  onMenu: () => void;
  menuButtonRef?: React.Ref<HTMLButtonElement>;
  voice?: HomeVoiceControls;
  chat: HomeChatControls;
  notice?: React.ReactNode;
  children?: React.ReactNode; // 메뉴·시트처럼 홈 위에 겹치는 것
}) {
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const chatButtonRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const frameRef = useRef<HTMLElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const wasVoiceActive = useRef(Boolean(voice));
  const name = profile.companion;
  const expression = catExpression(chat.messages.findLast((message) => message.role === "user")?.content ?? "", Boolean(notice));
  const hasMessages = chat.open && !voice && (chat.messages.length > 0 || chat.sending || Boolean(chat.history));
  const chatting = chat.open && !voice; // 글 대화 중: 몽글이를 입력창 바로 위로 작게 옮긴다
  const yawning = voice?.state === "yawning"; // 음성을 열기 직전 하품(dev #39). 끝나면 연결 상태로 넘어간다
  // 처음 들어갈 때는 하품을 마친 뒤 커진다. 이미 커진 뒤(오류 뒤 다시 시도)의 하품은 그 크기 그대로 한다.
  const [grown, setGrown] = useState(false);
  const expanded = Boolean(voice) && (!yawning || grown);
  if (expanded !== grown) setGrown(expanded);
  const resting = !chat.open && !voice; // 기본 홈: 글 없이 몽글이와 배경 움직임으로 대화를 권한다
  const bottomRef = useRef<HTMLDivElement>(null);
  const canSend = chat.open && Boolean(chat.draft.trim());

  // 쉬는 홈에서만 고양이가 혼자 논다: 가끔 뭔가 발견한 듯 눈이 동그래지고, 심심하면 발을 핥고, 오래 두면 웅크려 잔다.
  // 누르면 깜짝 놀랐다가 귀찮다는 듯 울고(세 번 연달아면 하악), 자고 있으면 째려보며 깬다. 대화 중에는 기존 Buddy 상태를 그대로 쓴다.
  const [napping, setNapping] = useState(false);
  const [catPokes, setCatPokes] = useState(0);
  const homeCat = useCatReactions(resting && napping ? "sleep" : "base");
  const { notice: catNotice, play: catPlay } = homeCat;
  useEffect(() => {
    if (!resting || napping) return;
    const timers = [
      window.setTimeout(catNotice, 14000),
      window.setTimeout(() => catPlay([["groom", 4400]]), 32000),
      window.setTimeout(() => setNapping(true), 75000),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [resting, napping, catPokes, catNotice, catPlay]);
  function pokeCat() {
    setCatPokes((n) => n + 1);
    if (napping) { setNapping(false); catPlay([["glare", 1800]]); return; }
    homeCat.tap();
  }
  function wakeForTalk() { setNapping(false); homeCat.reset(); }

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
    // 입력창이 늘거나 오류 줄이 생겨도 대화 목록이 하단 영역 바로 위에서 끝나게 한다.
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

  useLayoutEffect(() => {
    const input = composerRef.current;
    if (!input) return;
    const resize = () => {
      // Empty drafts always use the shared single-line height. A placeholder can
      // wrap while the voice capsule collapses; it must not make the field taller.
      input.style.height = "";
      if (input.value) input.style.height = `${Math.min(input.scrollHeight, 104)}px`;
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      // Remeasure actual text after width transitions or viewport changes, while
      // ignoring the height changes made by resize itself.
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [chat.draft, chat.open]);

  const beforePrepend = useRef<{ height: number; top: number } | null>(null);
  const lastVisibleMessage = useRef<string | undefined>(undefined);
  const followBottom = useRef(true);
  const wheelAt = useRef(0);
  const touchStart = useRef<number | null>(null);
  const lastMessage = chat.messages.at(-1);
  const lastKey = lastMessage?.id ?? (lastMessage ? `${lastMessage.role}:${lastMessage.content}` : undefined);
  useLayoutEffect(() => {
    const list = messageListRef.current;
    if (!list) { lastVisibleMessage.current = undefined; return; }
    if (beforePrepend.current && !chat.history?.loading) {
      list.scrollTop = beforePrepend.current.top + list.scrollHeight - beforePrepend.current.height;
      beforePrepend.current = null;
    } else if (lastKey !== lastVisibleMessage.current && (followBottom.current || !lastVisibleMessage.current)) {
      list.scrollTop = list.scrollHeight;
    }
    lastVisibleMessage.current = lastKey;
  }, [lastKey, chat.messages.length, chat.history?.loading, chat.open]);
  async function older() {
    const list = messageListRef.current;
    if (!list || !chat.history || chat.history.loading || beforePrepend.current) return;
    if (chat.history.loaded && !chat.history.hasMore && !chat.history.error) return;
    beforePrepend.current = { height: list.scrollHeight, top: list.scrollTop };
    await chat.history.onOlder();
  }

  function expandText() {
    // 사용자 클릭 안에서 포커스를 옮겨 모바일에서도 키보드가 바로 열린다.
    wakeForTalk();
    flushSync(onText);
    composerRef.current?.focus({ preventScroll: true });
  }

  function collapseText() {
    composerRef.current?.blur();
    flushSync(chat.onClose);
    chatButtonRef.current?.focus({ preventScroll: true });
  }

  return (
    <main ref={frameRef} className="app-frame home-screen home-scene text-cat-ink motion-safe:animate-fade" data-text-open={chat.open} data-has-messages={hasMessages}>
      <div className="home-scene-artwork" aria-hidden="true">
        <div className="home-scene-background">
          <Image src="/home/sunlit-living-room.png" alt="" fill sizes="(max-width: 430px) 100vw, 430px" preload />
        </div>
      </div>
      {/* 온보딩의 빛이 하얗게 걷히며 홈이 나타난다 */}
      {greet && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 bg-white motion-safe:animate-unveil motion-reduce:hidden" />}

      <header className="home-header absolute inset-x-0 z-10 flex h-14 items-center justify-between px-gutter">
        <Button ref={menuButtonRef} variant="plain" onClick={onMenu} aria-label="메뉴" className="home-chrome-button ui-press grid size-12 place-items-center rounded-full">
          <Icon name="menu" size={22} />
        </Button>
      </header>

      <div className={`home-intro absolute inset-x-gutter top-[18%] flex flex-col items-center text-center ${voice || hasMessages ? "home-intro-quiet" : ""}`} aria-hidden={Boolean(voice || hasMessages)}>
        {/* 실제 기억에 연결되는 문구가 있을 때만 표시. 기본 인사는 없음. */}
        {headline && <h1 className="min-h-[2.6em] max-w-80 whitespace-pre-line text-t8 leading-relaxed font-medium tracking-tight text-balance">{headline}</h1>}
      </div>

      {notice && <div className="home-safety absolute inset-x-gutter top-[18%] z-10">{notice}</div>}
      {spotlight && resting && !notice && <div className="absolute inset-x-gutter top-[calc(env(safe-area-inset-top)+76px)] z-10">{spotlight}</div>}

      {hasMessages && <div ref={messageListRef} className="home-messages" role="log" aria-label="대화 내용" aria-live="off" tabIndex={0}
        onScroll={e => { const el=e.currentTarget; followBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<80; }}
        onWheel={e => { const now=Date.now(); const fresh=now-wheelAt.current>180; wheelAt.current=now; if(e.deltaY<0 && e.currentTarget.scrollTop<=4 && fresh) void older(); }}
        onTouchStart={e => { touchStart.current=e.currentTarget.scrollTop<=4?e.touches[0].clientY:null; }}
        onTouchEnd={e => { if(touchStart.current!==null && e.changedTouches[0].clientY-touchStart.current>45) void older(); touchStart.current=null; }}>
        {chat.history && <div className="home-history-status">
          {chat.history.loading ? <span role="status">이전 대화 불러오는 중…</span> : chat.history.error ?
            <Button variant="plain" onClick={()=>void older()}>{chat.history.error}</Button> : chat.history.hasMore ?
            <Button variant="plain" onClick={()=>void older()}>위로 한 번 더 올려 이전 대화 보기</Button> :
            <span>{chat.messages.length ? "최근 30일 대화의 시작이에요" : "이야기를 시작하면 여기에 대화가 남아요"}</span>}
        </div>}
        {chat.messages.map((message, index) => <Fragment key={message.id ?? index}>
          {message.at && (index===0 || new Date(message.at).toDateString()!==new Date(chat.messages[index-1].at??0).toDateString()) &&
            <time className="home-history-date" dateTime={new Date(message.at).toISOString()}>{new Date(message.at).toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'})}</time>}
          <div className="home-message" data-role={message.role}>
          <span className="sr-only">{message.role === "user" ? "나" : name}: </span>
          {message.role === "assistant" ? <div className="home-message-bubble"><ChatMarkdown content={message.content} /></div> : <p>{message.content}</p>}
        </div></Fragment>)}
        {chat.sending && <div className="home-message" data-role="assistant">
          <span className="sr-only">{name}가 생각하는 중</span>
          <p className="flex items-center gap-1 py-4" aria-hidden="true">{[0, 1, 2].map((dot) => <i key={dot} className="size-1.5 rounded-full bg-cat-muted motion-safe:animate-dot" style={{ animationDelay: `${dot * 150}ms` }} />)}</p>
        </div>}
      </div>}

      <div className="home-character-wrap absolute inset-x-gutter flex flex-col items-center" data-hidden={chatting} aria-hidden={chatting}>
        {/* 하품(음성 열기 전 2.4초) 동안은 키우지 않고 제자리에서 하품만 한다. 연결을 시작하면 그때 커진다. */}
        <div className={`home-buddy ${expanded ? "home-buddy-expanded" : ""}`}>
          <button type="button" className="home-cat-tap" onClick={pokeCat} disabled={!resting} aria-label={`${name} 건드려 보기`}>
            <PoseCat
              pose={resting ? homeCat.pose : "base"}
              fx={resting ? homeCat.fx : undefined}
              cue={homeCat.cue}
              size={320}
              yawning={yawning}
              buddy={{
                shape: profile.shape,
                color: profile.color,
                accessory: profile.accessory,
                outputLevel, outputShape,
                expression,
                // 하품 동안 기본 자세는 감춰지므로 평소(idle) 표정 그대로 두어, 바꿔 끼우는 순간 눈 모양이 달라 보이지 않게 한다.
                state: yawning ? "idle" : voice?.state ?? chat.state,
                bob: true,
                tap: chat.open && !voice ? chat.draft.length : undefined,
                hearing: voice ? Boolean(voice.hearing) : undefined,
                voice: Boolean(voice),
              }}
            />
          </button>
        </div>
        {voice && <div className="home-voice-caption max-w-full px-4 text-center">
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
        {chat.onRetry && !voice && <Button variant="tonal" type="button" onClick={chat.onRetry}>답변 다시 받기</Button>}
        {banner && <p key={banner.error ? "alert" : "status"} role={banner.error ? "alert" : "status"} className={`rounded-r3 bg-white/90 px-4 py-3 text-t3 text-pretty ${banner.error ? "text-[#C42A23]" : "text-cat-muted"}`}>{banner.text}</p>}
        {nudge && resting && <div>{nudge}</div>}
        {chatting && (
          <div aria-hidden="true" className="home-chat-buddy">
            <Buddy shape={profile.shape} color={profile.color} accessory={profile.accessory} size={112} outputLevel={outputLevel} outputShape={outputShape} expression={expression} state={chat.state} tap={chat.draft.length} />
          </div>
        )}
        <div role="group" aria-label={voice ? "음성 대화" : chat.open ? "메시지 작성" : "대화 시작"} className="home-actions">
          <form className="home-compose" data-open={chat.open} onSubmit={(event) => { event.preventDefault(); if (canSend) chat.onSend(); }}>
            <div className="home-compose-content" inert={!chat.open} aria-hidden={!chat.open}>
              <Button variant="plain" type="button" onClick={collapseText} tabIndex={chat.open ? 0 : -1} aria-label="입력창 닫기" className="home-compose-close ui-press grid shrink-0 place-items-center rounded-full"><Icon name="close" size={18} /></Button>
              <label htmlFor="home-text-draft" className="sr-only">{name}에게 하고 싶은 말</label>
              <TextArea ref={composerRef} id="home-text-draft" rows={1} maxLength={800} value={chat.draft} tabIndex={chat.open ? 0 : -1} placeholder={`${name}에게 이야기해요…`} autoComplete="off" enterKeyHint="send"
                onChange={(event) => chat.onDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") { event.preventDefault(); collapseText(); return; }
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
                  event.preventDefault();
                  if (canSend) chat.onSend();
                }}
              />
            </div>
            <Button variant="tonal"
              ref={chatButtonRef}
              type="button"
              onClick={expandText}
              disabled={voice?.connecting}
              tabIndex={chat.open ? -1 : 0}
              aria-label="글로 이야기하기"
              aria-expanded={chat.open}
              aria-controls="home-text-draft"
              aria-hidden={chat.open}
              className="home-text-toggle home-action-icon ui-press grid size-14 place-items-center rounded-full disabled:opacity-40"
            >
              <Icon name="help" />
            </Button>
          </form>
          <div className="home-right-action" data-send={canSend}>
            <Button variant="plain" type="button" onClick={chat.onSend} disabled={!canSend} tabIndex={canSend ? 0 : -1} aria-hidden={!canSend} aria-label="메시지 보내기" className="home-send ui-press grid size-14 place-items-center rounded-full bg-cat-ink text-white disabled:opacity-40"><Icon name="send" size={23} /></Button>
            <div inert={canSend} aria-hidden={canSend} className="home-mic-action">
            <div className="home-voice-pill" data-expanded={Boolean(voice)}>
              <div className="home-voice-end" inert={!voice} aria-hidden={!voice}>
                <Button variant="plain" type="button" id="home-voice-end" onClick={voice?.onEnd} tabIndex={voice ? 0 : -1} aria-label="음성 대화 종료" className="ui-press grid size-12 shrink-0 place-items-center rounded-full bg-[#E5484D] text-white">
                  <Icon name="close" size={20} />
                </Button>
                <span className="h-8 w-px shrink-0 bg-cat-line" />
              </div>
              <Button variant="fill"
                ref={micButtonRef}
                type="button"
                onClick={voice ? voice.onMic : () => { wakeForTalk(); onVoice(); }}
                disabled={chat.sending || Boolean(voice && (voice.connecting || (!voice.hasMic && !voice.error)))}
                tabIndex={canSend ? -1 : 0}
                // 이름이 지금 할 일(끄기·켜기)을 말하므로 aria-pressed는 두지 않는다. 함께 쓰면 '마이크 끄기, 선택됨'처럼 상태가 거꾸로 읽힌다.
                aria-label={voice ? voice.error ? "음성 연결 다시 시도" : voice.micOn ? "마이크 끄기" : "마이크 켜기" : `${josa(name, "과", "와")} 음성 대화 시작`}
                aria-expanded={Boolean(voice)}
                className="home-mic home-action-icon ui-press grid size-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
                data-off={Boolean(voice && !voice.micOn && !voice.error)}
              >
                <Icon name={voice && !voice.micOn && !voice.error ? "micOff" : "mic"} size={26} />
              </Button>
            </div>
            </div>
          </div>
        </div>
      </div>
      {voice?.listening && <div className="home-listening-wave" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ animationDelay: `${(index % 7) * -160}ms`, backgroundColor: "var(--color-cat-accent)" }} />)}</div>}
      {children}
    </main>
  );
}
