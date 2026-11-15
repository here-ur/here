"use client";

import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { Icon } from "./art";
import { Button } from "./ui/Button";
import "./first-run.css";

// 캐릭터 만나기(온보딩)가 쓰는 첫 실행 틀과 장면 그림. 로그인·기억 동의 시트는 AuthGate·MemoryConsentGate, 환영 영상은 AuthScreen에 있다.
// 크림은 길 위 장면, room은 집 안 장면(이름 짓기·마지막 안내)이다.

const uid = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "");

export function FirstRunScreen({ tone, children, className = "", scroll = false, ...events }: {
  tone: "cream" | "room";
  children: ReactNode;
  className?: string;
  scroll?: boolean;
} & Pick<ComponentProps<"main">, "onFocus" | "onBlur">) {
  return <main className={`app-frame first-run first-run--${tone} ${scroll ? "app-frame-scrollable" : ""} ${className}`} {...events}>{children}</main>;
}

export function FirstRunTopBar({ onBack, backLabel = "뒤로", end }: { onBack?: () => void; backLabel?: string; end?: ReactNode }) {
  return (
    <div className="fr-topbar">
      {onBack
        ? <Button variant="plain" onClick={onBack} aria-label={backLabel} className="fr-round"><Icon name="back" size={22} /></Button>
        : <span className="size-11" aria-hidden="true" />}
      {end ?? <span className="size-11" aria-hidden="true" />}
    </div>
  );
}

/** 소리 켜고 끄기. 캐릭터 만나기의 배경 소리에만 쓴다.
 * 이름은 그대로 두고 눌림 상태(aria-pressed)로 꺼졌는지 알린다(이름까지 바꾸면 '소리 켜기, 선택됨'처럼 거꾸로 읽힌다). */
export function SoundToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <Button variant="plain" onClick={onToggle} aria-pressed={muted} aria-label="소리 끄기" className="fr-round">
      <Icon name={muted ? "soundOff" : "soundOn"} size={20} />
    </Button>
  );
}

export function FirstRunHeading({ eyebrow, title, description, cat, focusOnMount, className = "" }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** 캐릭터가 하는 말이면 더 크게 쓴다. */
  cat?: boolean;
  /** 장면이 바뀌어 나타날 때 제목으로 포커스를 옮겨, 화면 낭독기가 새 질문·말부터 읽게 한다. */
  focusOnMount?: boolean;
  className?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // 앞 장면이 통째로 사라져 포커스가 body로 떨어졌을 때만 옮긴다(다른 곳을 보고 있으면 빼앗지 않는다).
    const active = document.activeElement;
    if (focusOnMount && (!active || active === document.body)) headingRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  return (
    <header className={`fr-heading ${className}`}>
      {eyebrow && <p className="fr-eyebrow">{eyebrow}</p>}
      <h1 ref={headingRef} tabIndex={focusOnMount ? -1 : undefined} className={cat ? "fr-title fr-title--cat" : "fr-title"}>{title}</h1>
      {description && <p className="fr-desc">{description}</p>}
    </header>
  );
}

/** 바닥 버튼 자리. 장면의 맨 아래에 붙는다. */
export function FirstRunFooter({ children }: { children: ReactNode }) {
  return <div className="fr-footer">{children}</div>;
}

const TREE_TRUNK = "#C9A47F";

/** 길 장면의 풍경: 언덕 두 겹과 나무. 위쪽은 비워 두어 화면이 낮아도 글자 뒤로 가려지지 않는다. */
export function StreetLand({ className = "" }: { className?: string }) {
  const id = `land${uid(useId())}`;
  const peach = (x: number, y: number, w: number, h: number) => (
    <g transform={`translate(${x} ${y}) scale(${w / 40} ${h / 70})`}>
      <rect x="18" y="44" width="4" height="24" rx="2" fill={TREE_TRUNK} />
      <rect x="2" y="2" width="36" height="52" rx="18" fill={`url(#${id}-peach)`} />
    </g>
  );
  return (
    <svg className={`fr-land ${className}`} viewBox="0 0 390 360" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-back`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#FBD0AE" /><stop offset="1" stopColor="#FDE4CF" /></linearGradient>
        <linearGradient id={`${id}-front`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#FEE9D8" /><stop offset=".6" stopColor="#FFF5EC" /><stop offset="1" stopColor="#FFFBF7" /></linearGradient>
        <linearGradient id={`${id}-peach`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#FFC9A9" /><stop offset="1" stopColor="#EF8D66" /></linearGradient>
        <radialGradient id={`${id}-cream`} cx=".35" cy=".3" r=".8"><stop stopColor="#FFFAF3" /><stop offset="1" stopColor="#E9D1B8" /></radialGradient>
        <linearGradient id={`${id}-pine`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#7AC493" /><stop offset="1" stopColor="#3E8A5A" /></linearGradient>
      </defs>
      <path d="M0 78C70 34 150 44 214 98C252 130 302 118 390 58V360H0Z" fill={`url(#${id}-back)`} />
      <path d="M0 168C90 146 170 176 262 160C320 150 360 150 390 156V360H0Z" fill={`url(#${id}-front)`} />
      <g fill="rgb(170 110 70 / 14%)"><ellipse cx="34" cy="180" rx="20" ry="4" /><ellipse cx="76" cy="182" rx="12" ry="3" /><ellipse cx="338" cy="172" rx="30" ry="4.5" /></g>
      {peach(12, 104, 44, 77)}
      {peach(62, 134, 28, 49)}
      {peach(290, 118, 30, 52)}
      <g transform="translate(310 110) scale(.9)">
        <rect x="28" y="40" width="4" height="28" rx="2" fill={TREE_TRUNK} />
        <circle cx="30" cy="29" r="27" fill={`url(#${id}-cream)`} />
      </g>
      <g transform="translate(352 96) scale(.95)">
        <rect x="18" y="60" width="4" height="16" rx="2" fill="#B88B66" />
        <path d="M20 2 34 26Q35 29 31 29H9Q5 29 6 26Z M20 16 37 44Q38 47 34 47H6Q2 47 3 44Z M20 32 39 62Q40 65 36 65H4Q0 65 1 62Z" fill={`url(#${id}-pine)`} />
      </g>
    </svg>
  );
}

/** 고양이 앞을 가리는 둥근 나무(첫 질문에서 고양이가 나무 뒤에서 엿본다). */
export function FrontTree({ className = "" }: { className?: string }) {
  const id = `tree${uid(useId())}`;
  return (
    <svg className={`fr-tree fr-tree--front ${className}`} viewBox="0 0 60 70" aria-hidden="true">
      <defs><radialGradient id={id} cx=".35" cy=".3" r=".8"><stop stopColor="#FFFAF3" /><stop offset="1" stopColor="#E9D1B8" /></radialGradient></defs>
      <ellipse cx="30" cy="68" rx="20" ry="2.5" fill="rgb(150 95 55 / 18%)" />
      <rect x="28" y="40" width="4" height="28" rx="2" fill={TREE_TRUNK} />
      <circle cx="30" cy="29" r="27" fill={`url(#${id})`} />
    </svg>
  );
}
