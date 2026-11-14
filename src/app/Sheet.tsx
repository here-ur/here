"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { Icon } from "./art";

const EXIT_MS = 150;
const SLIDE_EXIT_MS = 260;
const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

/** 아래에서 올라오는 시트. 화면(main, relative) 안에 둔다.
 * onBack이 있으면 제목 앞에 뒤로 가기 버튼을 둔다. dismissible이 false면 닫기 버튼·바깥 누르기·Escape로 닫히지 않는다.
 * locked면 버튼은 그대로 두고 누를 수만 없게 한다(보내는 중에 버튼이 사라져 제목 줄이 흔들리지 않게).
 * slide면 화면 아래에서 끝까지 밀려 올라오고 닫을 때 아래로 내려간다(키 큰 시트용). 아니면 살짝 떠오르고 흐려지며 닫힌다.
 * keyboardAware면 휴대폰 키보드가 가린 높이(--sheet-kb)와 보이는 높이(--sheet-vvh)를 시트에 알려, 화면 쪽 CSS가 버튼을 키보드 위로 올린다.
 * appear가 false면 열리는 움직임 없이 그 자리에 바로 있다(앞 화면의 시트에서 내용만 이어질 때).
 * headerless면 제목 줄 없이 본문만 보인다(제목은 화면 낭독기에만 읽힌다). 바깥 누르기·Escape로는 그대로 닫힌다. */
export default function Sheet({ title, onClose, children, footer, onBack, backLabel = "뒤로", dismissible = true, locked = false, slide = false, keyboardAware = false, appear: appearProp = true, headerless = false, className = "" }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
  backLabel?: string;
  dismissible?: boolean;
  locked?: boolean;
  slide?: boolean;
  keyboardAware?: boolean;
  appear?: boolean;
  headerless?: boolean;
  className?: string;
}) {
  const [appear] = useState(appearProp);
  const exitMs = slide ? SLIDE_EXIT_MS : EXIT_MS;
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const closeRequested = useRef(false);
  const closed = useRef(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const finishClose = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onCloseRef.current();
  }, []);

  const canClose = useRef(dismissible && !locked);
  useEffect(() => { canClose.current = dismissible && !locked; }, [dismissible, locked]);
  const requestClose = useCallback(() => {
    if (closeRequested.current || !canClose.current) return;
    closeRequested.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finishClose();
    else setClosing(true);
  }, [finishClose]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finishClose, exitMs + 50);
    return () => window.clearTimeout(timer);
  }, [closing, finishClose, exitMs]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const overlay = overlayRef.current;
    if (!keyboardAware || !viewport || !overlay) return;
    // 키보드가 올라오면 보이는 영역(visual viewport)이 줄어든다. 화면 아래에서 가려진 높이와 보이는 높이를 넘겨 준다.
    const sync = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      overlay.style.setProperty("--sheet-vvh", `${viewport.height}px`);
      overlay.style.setProperty("--sheet-kb", `${covered}px`);
      overlay.toggleAttribute("data-keyboard", covered > 80);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, [keyboardAware]);

  useEffect(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return;

    // Strict Mode의 재실행에서도 시트 자체가 아닌 원래 열기 버튼을 기억한다.
    if (!returnFocusRef.current && document.activeElement instanceof HTMLElement && !panel.contains(document.activeElement)) {
      returnFocusRef.current = document.activeElement;
    }
    const siblings = Array.from(overlay.parentElement?.children ?? []).filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== overlay && !element.inert,
    );
    siblings.forEach((element) => { element.inert = true; });
    panel.focus({ preventScroll: true });

    function keepFocus(event: FocusEvent) {
      if (event.target instanceof Node && !panel!.contains(event.target)) panel!.focus({ preventScroll: true });
    }
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      siblings.forEach((element) => { element.inert = false; });
      const previous = returnFocusRef.current;
      if (previous?.isConnected && !previous.closest("[inert]") && previous.getClientRects().length) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      // overflow-clip: 아래에서 올라오는 중인 시트가 화면(main)에 스크롤을 만들지 않게 자른다.
      // 닫을 때 배경은 애니메이션으로 흐려진다. 여는 애니메이션(animate-fade)을 떼는 순간과 겹쳐 transition은 시작되지 않고 바로 사라졌다.
      className={`ui-transition absolute inset-0 z-40 flex items-end overflow-clip bg-[rgba(35,32,27,.28)] backdrop-blur-[2px] ${closing ? "here-scrim-out" : appear ? "motion-safe:animate-fade" : ""}`}
      style={closing ? { animationDuration: `${exitMs}ms` } : undefined}
      onClick={requestClose}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) finishClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            requestClose();
          }
          if (event.key !== "Tab") return;
          const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
            .filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0);
          const first = focusable[0];
          const last = focusable.at(-1);
          if (!first || !last) {
            event.preventDefault();
            event.currentTarget.focus();
          } else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
            event.preventDefault();
            first.focus();
          }
        }}
        className={`here-sheet ${className} ui-transition flex max-h-[88%] w-full flex-col overflow-hidden rounded-t-r6 bg-cat-surface pt-3 shadow-[0_-10px_40px_rgba(35,32,27,.12)] transition-[translate,opacity] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-cat-ink ${
          slide ? (closing ? "here-sheet--out" : appear ? "here-sheet--slide" : "") : closing ? "translate-y-3 opacity-0" : appear ? "motion-safe:animate-rise" : ""}`}
        style={closing ? { transitionDuration: `${exitMs}ms` } : undefined}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-cat-line" />
        {/* 제목 줄은 높이 44px로 고정한다. 아이콘 버튼은 배경 없는 글자 버튼(here-sheet-icon)이고, 잠긴 동안에도 자리를 지킨다. */}
        {headerless ? <h2 id={titleId} className="sr-only">{title}</h2> : <div className="mb-1 flex min-h-11 shrink-0 items-center gap-1 px-5">
          {onBack && <Button variant="plain" onClick={onBack} disabled={locked} aria-label={backLabel} className="here-sheet-icon -ml-2.5">
            <Icon name="back" size={22} />
          </Button>}
          <h2 id={titleId} className="mr-auto text-t7 font-bold text-balance text-cat-ink">{title}</h2>
          {dismissible
            ? <Button variant="plain" onClick={requestClose} disabled={locked} aria-label="닫기" className="here-sheet-icon -mr-2.5">
              <Icon name="close" size={20} />
            </Button>
            : <span aria-hidden="true" className="size-11 shrink-0" />}
        </div>}
        <div className="min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-cat-line/50 px-5 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
