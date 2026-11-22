"use client";

import type { SkyId } from "@/lib/report";

// 리포트는 그날 이야기의 결을 날씨 대신 표정으로 보여 준다(2026-11-22).
// 흔한 이모지 대신 앱 고양이(검은 털, 호박색 눈)의 얼굴로 그린다. 안쪽 값(sunny 등)과 AI가 고르는 기준은 그대로이고,
// 화면 이름은 lib/report.ts의 MOOD_LABEL이다. 색만으로 구분하지 않게 표정마다 눈 모양이 다르다. bg는 얼굴 뒤 동그라미와 막대 색.
const FUR = "#2B2A28";
const EYE = "#F4B544";
const TEAR = "#A9CCFF";

export const MOOD_LOOK: Record<SkyId, { bg: string; eyes: React.ReactNode }> = {
  // 즐거움: 웃는 눈(∩)
  sunny: { bg: "#FFD86B", eyes: <path d="M7.9 14.7Q9.2 12.5 10.5 14.7M13.5 14.7Q14.8 12.5 16.1 14.7" stroke={EYE} /> },
  // 편안함: 편히 감은 눈(∪)
  cozy: { bg: "#FFC3A1", eyes: <path d="M7.9 13.7Q9.2 15.6 10.5 13.7M13.5 13.7Q14.8 15.6 16.1 13.7" stroke={EYE} /> },
  // 지침: 반쯤 감긴 눈
  cloudy: { bg: "#CDD3DE", eyes: <path d="M7.8 13.9h2.8M13.4 13.9h2.8M8.4 13.9q.8 1.5 1.6 0M14 13.9q.8 1.5 1.6 0" stroke={EYE} /> },
  // 속상함: 처진 눈썹, 동그란 눈, 눈물 한 방울
  rain: { bg: "#B3CBF4", eyes: <><path d="M8 12.2l2.2-.8M16 12.2l-2.2-.8" stroke={EYE} /><circle cx="9.2" cy="14.4" r="1.15" fill={EYE} /><circle cx="14.8" cy="14.4" r="1.15" fill={EYE} /><path d="M16.3 15.6q1.2 1.7 0 2.4q-1.2-.7 0-2.4Z" fill={TEAR} /></> },
  // 화남: 째려보는 눈(앱의 째려보는 고양이와 같은 느낌)
  thunder: { bg: "#CFC1F6", eyes: <path d="M7.6 13l3.1 1.1q-.2 1.8-1.7 1.7q-1.5-.2-1.4-2.8ZM16.4 13l-3.1 1.1q.2 1.8 1.7 1.7q1.5-.2 1.4-2.8Z" fill={EYE} /> },
  // 정신없음: 휘둥그레진 눈
  wind: { bg: "#A9DECF", eyes: <><circle cx="9.2" cy="14.2" r="1.6" stroke={EYE} /><circle cx="14.8" cy="14.2" r="1.6" stroke={EYE} /></> },
};

// 24칸 안의 고양이 머리: 두 귀와 둥근 얼굴.
const HEAD = "M5.6 4.6L10.1 8.5Q12 7.9 13.9 8.5L18.4 4.6L18.7 11.6A7.4 6.2 0 1 1 5.3 11.6Z";

/** 동그라미 위의 고양이 얼굴 하나. 꾸밈 그림이라 이름은 옆 글자나 aria-label로 알린다. */
export function MoodFace({ id, size = 28 }: { id: SkyId; size?: number }) {
  const look = MOOD_LOOK[id];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="12" fill={look.bg} />
      <path d={HEAD} fill={FUR} stroke={FUR} strokeWidth="1" strokeLinejoin="round" />
      <g fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{look.eyes}</g>
    </svg>
  );
}
