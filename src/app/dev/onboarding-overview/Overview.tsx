"use client";

import Onboarding, { ONBOARDING_STEPS, type OnboardingStep } from "../../Onboarding";
import OnboardingStage from "../../OnboardingStage";
import "./overview.css";

// 단계마다 따로 시작한 캐릭터 만나기 화면. 각 칸은 그 자리에서 눌러 볼 수 있고, 다음 단계로도 넘어간다.
const LABELS: Record<OnboardingStep, [string, string]> = {
  promise: ["시작 전 약속", "AI라는 것 · 기록 보관 · 109 (동의 칸 없이 '알겠어요')"],
  name: ["내 이름", "아주 큰 이름 칸 · 귀퉁이에서 들여다보는 고양이"],
  birthday: ["생일", "숫자를 굴려서 고르기 · 만 14세 미만 안내"],
  gender: ["성별", "동전 고르기 · 여성 · 남성"],
  q1: ["질문 1 · 요즘 마음", "떠다니는 방울 고르기"],
  q2: ["질문 2 · 마음이 가는 것", "돌림판"],
  q3: ["질문 3 · 바라는 것", "고르면 고양이가 걸어온다"],
  q4: ["질문 4 · 곁에 있는 사람", "밀어서 고르기"],
  meet: ["만나서 데려가기", "첫마디 + 꾹 눌러 데려가기"],
  summary: ["들은 것 정리", "데려가기 장면의 끝: 고른 답을 되짚고 맞는지 확인"],
  naming: ["이름 짓기", "큰 이름 · 주사위 · 식빵 자세로 골골 · 저장"],
};

// 뒤 장면(데려가기·정리)이 실제처럼 보이도록 넣는 예시 답
const SAMPLE = { lately: "조금 지쳤어요", concern: "일·학업", want: "털어놓고, 들어 주면 좋겠어요", support: "가끔 있어요" };

const PREVIEW_BASICS = { needed: true, save: async () => "ok" as const };

export default function Overview() {
  return <div className="ob-overview">
    <header className="ob-overview-head">
      <h1>캐릭터 만나기 · 1번 톤</h1>
      <p>시트(로그인 → 기억 동의)가 끝난 뒤 이어지는 화면이에요. 칸마다 그 장면부터 눌러 볼 수 있어요.</p>
    </header>
    <div className="ob-overview-grid">
      {/* 맨 처음: 자는 고양이에게 다가가면 AI라고 밝힌다. */}
      <figure className="ob-overview-item">
        <figcaption><b>0. 만남</b><span>다가가면 깨서 AI라고 밝히고, 버튼이 내 대답이 된다</span></figcaption>
        <div className="ob-overview-frame"><OnboardingStage scene="open" onFinish={() => {}} /></div>
      </figure>
      {ONBOARDING_STEPS.map((step, index) => <figure key={step} className="ob-overview-item">
        <figcaption><b>{index + 1}. {LABELS[step][0]}</b><span>{LABELS[step][1]}</span></figcaption>
        <div className="ob-overview-frame"><Onboarding initialStep={step} initialAnswers={SAMPLE} basics={PREVIEW_BASICS} onDone={() => {}} /></div>
      </figure>)}
      {/* 질문 1에 '많이 힘들어요'를 고른 경우: 말투를 낮추고 109를 바로 보여 준다. */}
      <figure className="ob-overview-item">
        <figcaption><b>7′. 만나서 데려가기 · 많이 힘들어요</b><span>첫마디를 낮추고 109를 바로</span></figcaption>
        <div className="ob-overview-frame"><Onboarding initialStep="meet" initialAnswers={{ lately: "많이 힘들어요" }} onDone={() => {}} /></div>
      </figure>
    </div>
  </div>;
}
