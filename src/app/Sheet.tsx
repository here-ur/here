"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./art";

const EXIT_MS = 150;
const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])';

/** 아래에서 올라오는 시트. 화면(main, relative) 안에 둔다. */
export default function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
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

  const requestClose = useCallback(() => {
    if (closeRequested.current) return;
    closeRequested.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finishClose();
    else setClosing(true);
  }, [finishClose]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(finishClose, EXIT_MS + 50);
    return () => window.clearTimeout(timer);
  }, [closing, finishClose]);

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
      className={`ui-transition absolute inset-0 z-40 flex items-end bg-[rgba(20,28,60,.32)] backdrop-blur-[2px] ${closing ? "opacity-0" : "motion-safe:animate-fade"}`}
      style={closing ? { transitionDuration: `${EXIT_MS}ms` } : undefined}
      onClick={requestClose}
      onTransitionEnd={(event) => {
        if (closing && event.target === event.currentTarget && event.propertyName === "opacity") finishClose();
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
        className={`ui-transition flex max-h-[88%] w-full flex-col overflow-hidden rounded-t-r6 bg-white pt-3 shadow-[0_-10px_40px_rgba(20,28,60,.15)] transition-[translate,opacity] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#1F2A55] ${closing ? "translate-y-3 opacity-0" : "motion-safe:animate-rise"}`}
        style={closing ? { transitionDuration: `${EXIT_MS}ms` } : undefined}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-[#D9DDE7]" />
        <div className="mb-1 flex shrink-0 items-center justify-between gap-3 px-5">
          <h2 id={titleId} className="text-t7 font-bold text-balance text-[#111318]">{title}</h2>
          <button onClick={requestClose} aria-label="닫기" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-[#F2F4F8] text-[#3D4559]">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-[#D9DDE7]/50 px-5 pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
