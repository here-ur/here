"use client";

import { useEffect, useRef, useState } from "react";
import { type Counselor } from "@/lib/counselors";
import { COLORS } from "@/lib/onboarding";
import { Icon } from "./art";
import { Crisis109 } from "./Conversation";

/** 실제 연결·녹음·오디오 출력 없이 상담사 통화 화면의 조작만 확인한다. */
export default function CounselorCallScreen({ counselor, crisis, onEnd }: { counselor: Counselor; crisis: boolean; onEnd: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [micPreview, setMicPreview] = useState(false);
  const [speakerPreview, setSpeakerPreview] = useState(false);
  const palette = COLORS.find((item) => item.id === counselor.color) ?? COLORS[0];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [counselor.id]);

  const controls = [
    { name: "마이크", enabled: micPreview, iconOn: "mic" as const, iconOff: "micOff" as const, onClick: () => setMicPreview((value) => !value) },
    { name: "스피커", enabled: speakerPreview, iconOn: "soundOn" as const, iconOff: "soundOff" as const, onClick: () => setSpeakerPreview((value) => !value) },
  ];

  return (
    <main
      className="app-frame flex flex-col bg-[#FAFCFE] text-[#111318] motion-safe:animate-fade"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onEnd();
        }
      }}
    >
      <header className="flex shrink-0 items-center justify-between px-gutter pt-6 pb-3">
        <button type="button" onClick={onEnd} aria-label="도움받기 목록으로" className="ui-press grid size-11 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)]">
          <Icon name="back" size={20} />
        </button>
        <span className="rounded-full px-3 py-2 text-t3 font-bold" style={{ color: palette.deep, backgroundColor: palette.light }}>통화 미리보기</span>
        <span className="size-11" aria-hidden="true" />
      </header>

      {crisis && <Crisis109 className="mx-4 mb-3 shrink-0" />}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6">
        <div className="flex min-h-full flex-col items-center justify-center py-8 text-center">
          <div aria-hidden="true" className="grid size-36 shrink-0 place-items-center rounded-full" style={{ backgroundColor: palette.light, color: palette.deep }}>
            <svg width="72" height="72" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="10" r="5" fill="currentColor" opacity=".65" />
              <path d="M6 28v-2a10 10 0 0 1 20 0v2" fill="currentColor" opacity=".4" />
            </svg>
          </div>
          <p className="mt-5 text-t2 font-medium text-[#5A6478]">예시 프로필</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 rounded-r2 text-t10 font-bold text-balance focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1F2A55]">
            {counselor.name} <span className="text-t5 font-medium text-[#5A6478]">상담사</span>
          </h1>
          <p className="mt-2 text-t4 text-[#5A6478]">{counselor.topics.join(" · ")}</p>
          <div className="mt-6 w-full rounded-r5 bg-[#F2F4F8] px-4 py-5">
            <p className="text-t5 font-bold text-[#1F2A55]">연결되지 않았어요</p>
            <p className="mt-2 text-article-note text-pretty text-[#5A6478]">실제 상담사에게 연결되지 않는<br />통화 화면 미리보기예요.</p>
          </div>
        </div>
      </div>

      <footer className="shrink-0 px-6 pt-4 pb-8">
        <p className="mb-4 text-center text-t3 font-medium text-[#5A6478]">버튼 미리보기</p>
        <div role="group" aria-label="통화 버튼 미리보기" className="grid grid-cols-3 items-start gap-4">
          {controls.map((control) => (
            <button
              key={control.name}
              type="button"
              onClick={control.onClick}
              aria-label={`${control.name} 미리보기`}
              aria-pressed={control.enabled}
              className="ui-press flex min-w-0 flex-col items-center gap-2 rounded-r4 text-[#1F2A55]"
            >
              <span className="ui-transition grid size-16 place-items-center rounded-full" style={{ backgroundColor: control.enabled ? palette.deep : "#F2F4F8", color: control.enabled ? "#FFFFFF" : "#1F2A55" }}>
                <span className="relative size-6" aria-hidden="true">
                  <span className={`ui-transition absolute inset-0 ${control.enabled ? "scale-100 opacity-100 blur-0" : "scale-[0.25] opacity-0 blur-[4px]"}`}><Icon name={control.iconOn} /></span>
                  <span className={`ui-transition absolute inset-0 ${control.enabled ? "scale-[0.25] opacity-0 blur-[4px]" : "scale-100 opacity-100 blur-0"}`}><Icon name={control.iconOff} /></span>
                </span>
              </span>
              <span className="text-t3 font-medium">{control.name} {control.enabled ? "켜짐" : "꺼짐"}</span>
            </button>
          ))}
          <button type="button" onClick={onEnd} aria-label="통화 미리보기 종료" className="ui-press flex flex-col items-center gap-2 rounded-r4 text-[#1F2A55]">
            <span className="grid size-16 place-items-center rounded-full bg-[#C42A23] text-white"><Icon name="hangUp" size={28} /></span>
            <span className="text-t3 font-medium">종료</span>
          </button>
        </div>
        <p className="mt-5 text-center text-t2 text-pretty text-[#5A6478]">버튼을 눌러도 녹음되거나 소리가 나지 않아요.</p>
      </footer>
    </main>
  );
}
