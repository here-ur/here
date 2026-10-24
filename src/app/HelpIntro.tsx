"use client";

import { useEffect, useRef } from "react";
import { COLORS, type ColorId } from "@/lib/onboarding";
import { Icon } from "./art";

const CRISIS_PHONE_LINK = "tel:+82109?oai_link_source=model_response_hotline";
const STEPS = [
  { title: "상담 안내", description: "진행 방식과 이용 정보를 확인해요." },
  { title: "상담사 찾기", description: "주제와 소개를 보고 상담사를 골라요." },
  { title: "연결 대기", description: "선택한 상담사와 연결될 때까지 기다려요." },
  { title: "앱 내 음성 상담", description: "AI의 참여 없이 사람 상담사와 이야기해요." },
  { title: "상담 종료", description: "이야기를 마치면 통화를 종료해요." },
] as const;

/** 확정되지 않은 상담 운영 정보는 안내만 하고, 동의나 공유 설정을 수집하지 않는다. */
export default function HelpIntro({ color, crisis, onBack, onContinue }: { color: ColorId; crisis: boolean; onBack: () => void; onContinue: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const palette = COLORS.find((item) => item.id === color) ?? COLORS[0];

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="app-frame flex flex-col bg-[#FAFCFE] text-[#111318] motion-safe:animate-fade">
      <header className="flex shrink-0 items-center justify-between gap-3 px-gutter pt-6 pb-3">
        <button type="button" onClick={onBack} aria-label="도움받기 나가기" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)]">
          <Icon name="back" size={20} />
        </button>
        <span className="text-t6 font-bold">상담 안내</span>
        <button type="button" onClick={onContinue} className="ui-press min-h-11 shrink-0 rounded-r2 px-2 text-t4 font-medium text-[#5A6478]">건너뛰기</button>
      </header>

      {crisis && (
        <div role="alert" className="mx-4 mb-3 flex shrink-0 items-center justify-between gap-3 rounded-r5 bg-white p-3 ring-2 ring-[#D7261E] ring-inset">
          <p className="text-t4 font-bold text-[#1F2A55]">위급할 때는 <span className="text-[#C42A23]">109</span></p>
          <a href={CRISIS_PHONE_LINK} className="ui-press flex h-11 shrink-0 items-center rounded-full bg-[#C42A23] px-4 text-t4 font-bold text-white">전화하기</a>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-gutter pb-6">
        <section className="pt-5" aria-labelledby="help-intro-heading">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-t3 font-medium" style={{ backgroundColor: palette.light, color: palette.deep }}>
            <Icon name="phone" size={16} /> 사람 상담사와 음성으로
          </span>
          <h1 ref={headingRef} id="help-intro-heading" tabIndex={-1} className="mt-4 rounded-r2 text-t10 font-bold text-balance focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#1F2A55]">
            상담은 이렇게<br />진행돼요
          </h1>
          <p className="mt-3 text-article-note text-pretty text-[#5A6478]">상담사를 고르고 앱 안에서 이야기하는<br />과정을 먼저 살펴보세요.</p>
          <p className="mt-5 rounded-r3 bg-[#F2F4F8] p-4 text-article-note text-pretty text-[#5A6478]">현재는 화면 미리보기예요. 실제 상담사 연결은 아직 제공하지 않으며, 아래 과정은 준비 중이에요.</p>
        </section>

        <ol aria-label="준비 중인 상담 진행 과정" className="mt-6 flex flex-col gap-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full text-t3 font-bold tabular-nums" style={{ backgroundColor: palette.light, color: palette.deep }}>{index + 1}</span>
              <div className="min-w-0 pt-1">
                <h2 className="text-t5 font-bold text-[#1F2A55]">{step.title}</h2>
                <p className="mt-1 text-article-note text-pretty text-[#5A6478]">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <section aria-labelledby="help-details-heading" className="mt-8 rounded-r5 bg-white p-4 shadow-[0_0_0_1px_rgba(28,38,80,.07),0_4px_16px_rgba(28,38,80,.03)]">
          <h2 id="help-details-heading" className="text-t5 font-bold text-[#1F2A55]">이용 전에 확인해 주세요</h2>
          <dl className="mt-5 flex flex-col gap-5">
            <div>
              <dt className="text-t4 font-bold text-[#1F2A55]">상담사 자격</dt>
              <dd className="mt-1 text-article-note text-pretty text-[#5A6478]">자격 확인 기준은 준비 중이에요. 정해지면 안내할게요.</dd>
            </div>
            <div>
              <dt className="text-t4 font-bold text-[#1F2A55]">운영 시간·비용</dt>
              <dd className="mt-1 text-article-note text-pretty text-[#5A6478]">정해지면 이용 전에 안내할게요.</dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 text-t4 font-bold text-[#1F2A55]">마음 리포트 공유 <span className="rounded-r1 bg-[#F2F4F8] px-2 py-1 text-t2 font-medium text-[#5A6478]">선택</span></dt>
              <dd className="mt-1 text-article-note text-pretty text-[#5A6478]">원할 때만 공유하는 기능을 준비 중이에요. 공유 범위는 정해지면 안내할게요. 지금은 리포트를 공유하지 않아요.</dd>
            </div>
          </dl>
        </section>

        <a href={CRISIS_PHONE_LINK} className="ui-press mt-5 flex min-h-11 items-center justify-between gap-3 rounded-r3 bg-white px-4 py-3 text-t4 font-bold text-[#C42A23]">
          <span>위급할 때는 109</span>
          <Icon name="phone" size={18} />
        </a>
      </div>

      <footer className="shrink-0 border-t border-[#D9DDE7]/50 bg-[#FAFCFE] px-gutter pt-4 pb-[max(24px,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onContinue} className="ui-press h-13 w-full rounded-r4 text-t5 font-bold text-white" style={{ backgroundColor: palette.deep }}>상담사 둘러보기</button>
      </footer>
    </main>
  );
}
