"use client";

import Onboarding, { ONBOARDING_STEPS, type OnboardingStep } from "../../Onboarding";
import "./overview.css";

// 단계마다 따로 시작한 캐릭터 만나기 화면. 각 칸은 그 자리에서 눌러 볼 수 있고, 다음 단계로도 넘어간다.
const LABELS: Record<OnboardingStep, [string, string]> = {
  promise: ["시작 전 약속", "AI라는 것 · 기록 보관 · 109 (고양이 없음)"],
  name: ["내 이름", "뭐라고 부르면 될까요? (자는 고양이)"],
  q1: ["질문 1 · 요즘 마음", "나무 뒤에서 발 핥는 고양이"],
  q2: ["질문 2 · 마음이 가는 것", "슬쩍 고개를 내민 고양이"],
  q3: ["질문 3 · 바라는 것", "한 발짝 다가온 고양이"],
  q4: ["질문 4 · 곁에 있는 사람", "바로 옆에 앉은 고양이"],
  meet: ["만나서 데려가기", "첫마디 + 꾹 눌러 데려가기 (앉아서 힐끔 보는 고양이)"],
  summary: ["들은 것 정리", "고른 답을 되짚고 맞는지 확인"],
  naming: ["이름 짓기", "식빵 자세로 골골 · 저장"],
};

// 뒤 장면(데려가기·정리)이 실제처럼 보이도록 넣는 예시 답
const SAMPLE = { lately: "조금 지쳤어요", concern: "일·학업", want: "털어놓고, 들어 주면 좋겠어요", support: "가끔 있어요" };

export default function Overview() {
  return <div className="ob-overview">
    <header className="ob-overview-head">
      <h1>캐릭터 만나기 · 9단계</h1>
      <p>시트(로그인 → 기억 동의)가 끝난 뒤 이어지는 화면이에요. 고양이는 장면마다 한 가지 동작만 반복해요.</p>
    </header>
    <div className="ob-overview-grid">
      {ONBOARDING_STEPS.map((step, index) => <figure key={step} className="ob-overview-item">
        <figcaption><b>{index + 1}. {LABELS[step][0]}</b><span>{LABELS[step][1]}</span></figcaption>
        <div className="ob-overview-frame"><Onboarding initialStep={step} initialAnswers={SAMPLE} onDone={() => {}} /></div>
      </figure>)}
      {/* 질문 1에 '많이 힘들어요'를 고른 경우: 말투를 낮추고 109를 바로 보여 준다. */}
      <figure className="ob-overview-item">
        <figcaption><b>7′. 만나서 데려가기 · 많이 힘들어요</b><span>첫마디를 낮추고 109를 바로</span></figcaption>
        <div className="ob-overview-frame"><Onboarding initialStep="meet" initialAnswers={{ lately: "많이 힘들어요" }} onDone={() => {}} /></div>
      </figure>
    </div>
  </div>;
}
