"use client";

import { useEffect, useRef, useState } from "react";
import { COUNSELING_TOPICS, counselorsForTopic, type Counselor, type CounselingTopic } from "@/lib/counselors";
import { COLORS, type ColorId } from "@/lib/onboarding";
import { Icon } from "./art";
import { Crisis109 } from "./Conversation";
import CounselorCallScreen from "./CounselorCallScreen";
import HelpIntro from "./HelpIntro";
import Sheet from "./Sheet";

function ProfilePlaceholder({ counselor, large = false }: { counselor: Counselor; large?: boolean }) {
  const palette = COLORS.find((color) => color.id === counselor.color)!;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full ${large ? "size-20" : "size-14"}`}
      style={{ background: palette.light, color: palette.deep }}
    >
      <svg width={large ? 42 : 30} height={large ? 42 : 30} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="10" r="5" fill="currentColor" opacity=".65" />
        <path d="M6 28v-2a10 10 0 0 1 20 0v2" fill="currentColor" opacity=".4" />
      </svg>
    </span>
  );
}

export default function GetHelp({ color, crisis, onBack }: { color: ColorId; crisis: boolean; onBack: () => void }) {
  const [showIntro, setShowIntro] = useState(true);
  const [topic, setTopic] = useState<CounselingTopic>("전체");
  const [activeCounselor, setActiveCounselor] = useState<Counselor | null>(null);
  const [callCounselor, setCallCounselor] = useState<Counselor | null>(null);
  const profileButtons = useRef(new Map<string, HTMLButtonElement>());
  const callReturnId = useRef<string | null>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const palette = COLORS.find((item) => item.id === color) ?? COLORS[0];
  const counselors = counselorsForTopic(topic);

  useEffect(() => {
    if (callCounselor || showIntro) return;
    if (callReturnId.current) {
      profileButtons.current.get(callReturnId.current)?.focus();
      callReturnId.current = null;
    } else {
      listHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [callCounselor, showIntro]);

  if (callCounselor) {
    return <CounselorCallScreen counselor={callCounselor} crisis={crisis} onEnd={() => setCallCounselor(null)} />;
  }

  if (showIntro) {
    return <HelpIntro color={color} crisis={crisis} onBack={onBack} onContinue={() => setShowIntro(false)} />;
  }

  return (
    <main className="app-frame bg-[#FAFCFE] text-[#111318]">
      <div className="flex h-full flex-col motion-safe:animate-fade">
        <header className="flex shrink-0 items-center justify-between px-gutter pt-6 pb-3">
          <button onClick={() => setShowIntro(true)} aria-label="상담 안내로 돌아가기" className="ui-press grid size-11 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)]">
            <Icon name="back" size={20} />
          </button>
          <h1 ref={listHeadingRef} tabIndex={-1} className="rounded-r2 text-t6 font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1F2A55]">도움받기</h1>
          <span className="size-11" aria-hidden="true" />
        </header>

        {crisis && <Crisis109 className="mx-4 mb-3 shrink-0" />}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pb-6">
          <section className="pt-5 pb-6" aria-labelledby="help-heading">
            <h2 id="help-heading" className="text-t9 font-bold tracking-[-0.02em] text-balance">어떤 이야기를<br />나누고 싶나요?</h2>
            <p className="mt-3 text-t4 text-pretty text-[#5A6478]">상담 주제와 소개를 보고<br />나에게 맞는 상담사를 골라보세요.</p>
          </section>

          <div role="group" aria-label="상담 주제" className="flex gap-1.5 pb-6">
            {COUNSELING_TOPICS.map((item) => (
              <button
                key={item}
                aria-pressed={topic === item}
                onClick={() => setTopic(item)}
                className={`ui-press min-h-11 flex-1 whitespace-nowrap rounded-full px-2 text-t3 font-bold ${topic === item ? "bg-[#1F2A55] text-white" : "bg-[#F2F4F8] text-[#5A6478]"}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-t5 font-bold" id="counselor-list-title">상담사 둘러보기</h2>
            <span className="rounded-r1 bg-[#F2F4F8] px-2 py-1 text-t2 font-medium text-[#5A6478]">예시 프로필</span>
          </div>
          <p className="sr-only" role="status">{topic} 주제의 예시 상담사 {counselors.length}명</p>
          <ul aria-labelledby="counselor-list-title" className="flex flex-col gap-3">
            {counselors.map((counselor) => (
              <li key={counselor.id} className="motion-safe:animate-fade">
                <button
                  ref={(button) => {
                    if (button) profileButtons.current.set(counselor.id, button);
                    else profileButtons.current.delete(counselor.id);
                  }}
                  onClick={(event) => { event.currentTarget.focus({ preventScroll: true }); setActiveCounselor(counselor); }}
                  aria-label={`${counselor.name} 상담사 프로필 보기, 예시 프로필`}
                  aria-haspopup="dialog"
                  className="ui-press block w-full cursor-pointer rounded-r5 bg-white p-4 text-left shadow-[0_0_0_1px_rgba(28,38,80,.07),0_4px_16px_rgba(28,38,80,.03)] hover:bg-[#FAFCFE]"
                >
                  <span className="flex items-center gap-3">
                    <ProfilePlaceholder counselor={counselor} />
                    <span className="min-w-0 flex-1">
                      <span className="text-t6 font-bold">{counselor.name}</span>
                      <span className="ml-1.5 text-t3 text-[#5A6478]">상담사</span>
                      <span className="mt-1 block text-t2 text-[#5A6478]">{counselor.topics.join(" · ")}</span>
                    </span>
                    <span className="rotate-180 text-[#5A6478]" aria-hidden="true"><Icon name="back" size={18} /></span>
                  </span>
                  <span className="mt-4 block whitespace-pre-line text-t5 font-medium text-[#1F2A55]">{counselor.introduction}</span>
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {counselor.tags.map((tag) => <span key={tag} className="rounded-r1 bg-[#F2F4F8] px-2 py-1 text-t2 text-[#5A6478]">{tag}</span>)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-t2 text-pretty text-[#5A6478]">지금 보이는 이름과 소개는 디자인 확인용 예시예요. 실제 상담사 정보가 아니며, 상담 연결·예약은 아직 제공하지 않아요.</p>
        </div>

      </div>

      {activeCounselor && (
        <Sheet
          title="상담사 프로필"
          onClose={() => setActiveCounselor(null)}
          footer={
            <button
              type="button"
              onClick={() => {
                callReturnId.current = activeCounselor.id;
                setCallCounselor(activeCounselor);
                setActiveCounselor(null);
              }}
              aria-label={`${activeCounselor.name} 상담사와 이야기하기, 통화 미리보기`}
              className="ui-press flex h-13 w-full items-center justify-center gap-2 rounded-r4 text-t5 font-bold text-white"
              style={{ backgroundColor: palette.deep }}
            >
              <Icon name="phone" size={20} /> 이야기하기
            </button>
          }
        >
          <div className="flex items-center gap-4 pt-5">
            <ProfilePlaceholder counselor={activeCounselor} large />
            <div>
              <span className="text-t2 font-medium text-[#5A6478]">예시 프로필</span>
              <h3 className="mt-1 text-t8 font-bold">{activeCounselor.name} <span className="text-t4 font-medium text-[#5A6478]">상담사</span></h3>
              <p className="mt-1 text-t3 text-[#5A6478]">{activeCounselor.topics.join(" · ")}</p>
            </div>
          </div>
          <h4 className="mt-6 whitespace-pre-line text-t7 font-bold text-[#1F2A55]">{activeCounselor.introduction}</h4>
          <p className="mt-3 text-t5 text-pretty text-[#5A6478]">{activeCounselor.approach}</p>
          <div className="mt-5 flex flex-wrap gap-2">{activeCounselor.tags.map((tag) => <span key={tag} className="rounded-r2 bg-[#F2F4F8] px-3 py-2 text-t3 text-[#5A6478]">{tag}</span>)}</div>
          <div className="mt-6 rounded-r3 bg-[#F2F4F8] p-4 text-t3 text-pretty text-[#5A6478]">실제 상담사 정보가 아닌 디자인 확인용 예시예요. 상담 연결·예약 기능은 준비 전이에요.</div>
        </Sheet>
      )}
    </main>
  );
}
