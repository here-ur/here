"use client";

import Onboarding, { ONBOARDING_STEPS, type OnboardingStep } from "../../Onboarding";
import "./overview.css";

// 단계마다 따로 시작한 캐릭터 만나기 화면. 각 칸은 그 자리에서 눌러 볼 수 있고, 다음 단계로도 넘어간다.
const LABELS: Record<OnboardingStep, [string, string]> = {
  name: ["내 이름", "뭐라고 부르면 될까요? (자는 고양이)"],
  q1: ["질문 1", "나무 뒤에서 발 핥는 고양이"],
  q2: ["질문 2", "엎드려 째려보는 고양이"],
  meet: ["만나서 데려가기", "첫마디 + 꾹 눌러 데려가기 (앉아서 힐끔 보는 고양이)"],
  naming: ["이름 짓기", "식빵 자세로 골골"],
  safety: ["마지막 안내", "AI라는 것 · 기록 보관 · 109"],
};

export default function Overview() {
  return <div className="ob-overview">
    <header className="ob-overview-head">
      <h1>캐릭터 만나기 · 6단계</h1>
      <p>시트(로그인 → 기억 동의)가 끝난 뒤 이어지는 화면이에요. 고양이는 장면마다 한 가지 동작만 반복해요.</p>
    </header>
    <div className="ob-overview-grid">
      {ONBOARDING_STEPS.map((step, index) => <figure key={step} className="ob-overview-item">
        <figcaption><b>{index + 1}. {LABELS[step][0]}</b><span>{LABELS[step][1]}</span></figcaption>
        <div className="ob-overview-frame"><Onboarding initialStep={step} onDone={() => {}} /></div>
      </figure>)}
      {/* 질문 1에 '많이 힘들어요'를 고른 경우: 말투를 낮추고 109를 바로 보여 준다. */}
      <figure className="ob-overview-item">
        <figcaption><b>4′. 만나서 데려가기 · 많이 힘들어요</b><span>첫마디를 낮추고 109를 바로</span></figcaption>
        <div className="ob-overview-frame"><Onboarding initialStep="meet" initialAnswers={{ lately: "많이 힘들어요" }} onDone={() => {}} /></div>
      </figure>
    </div>
  </div>;
}
