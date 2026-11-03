"use client";

import { useEffect, useRef } from "react";

/** 아직 열지 않은 화면을 눌렀을 때 띄우는 '준비 중' 안내. 화면 코드는 그대로 두고 들어가는 길만 막는다. */
export default function ComingSoon({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); } };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="absolute inset-0 z-50 grid place-items-center bg-[#141C3C]/40 px-6 backdrop-blur-sm motion-safe:animate-fade" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="coming-soon-title" aria-describedby="coming-soon-body" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-[28px] bg-white p-6 text-[#1F2A55] shadow-xl motion-safe:animate-pop">
        <span className="inline-flex rounded-full bg-[#F2F4F8] px-2.5 py-1 text-t1 font-medium text-[#5A6478]">준비 중</span>
        <h2 id="coming-soon-title" className="mt-3 text-t6 font-bold">{title}</h2>
        <p id="coming-soon-body" className="mt-2 text-t3 text-pretty text-[#5A6478]">{body}</p>
        <p className="mt-4 rounded-r3 bg-[#FFF3F2] px-3.5 py-3 text-t2 text-pretty text-[#55525F]">
          지금 많이 힘들다면 <a href="tel:109" className="font-bold text-[#C42A23] underline underline-offset-2">109</a>에서 24시간 사람과 이야기할 수 있어요.
        </p>
        <button ref={closeRef} onClick={onClose} className="ui-press mt-5 min-h-12 w-full rounded-full bg-[#1F2A55] font-semibold text-white">확인</button>
      </div>
    </div>
  );
}
