"use client";

import { useSyncExternalStore } from "react";
import type { DayStat, SkyId } from "@/lib/report";
import { DEFAULT_COMPANION } from "@/lib/onboarding";
import Garden from "../../Garden";

// 구름 정원 확인용 개발 화면. 디자이너가 내보낸 Spline 주소를 ?spline=주소 로 붙이면 3D 장면에 변수가 들어가는지 볼 수 있다.
// ?level=1~5 로 식물 수를 바꿔 레벨별 모습을, ?accessory=hat 처럼 꾸미기를 확인한다.
const NOW = new Date(2026, 10, 10, 12).getTime();
const SKIES: SkyId[] = ["sunny", "rain", "cloudy", "cozy", "wind", "thunder"];
const WORDS: Record<string, number>[] = [{ 회의: 2 }, { 친구: 1 }, { 산책: 1 }, { 게임: 1 }, { 생각: 1 }, { 회의: 1, 친구: 1 }];
const COUNTS = [0, 3, 8, 16, 28, 44];

function sampleDays(level: number): DayStat[] {
  return Array.from({ length: COUNTS[level] ?? 16 }, (_, i) => {
    const d = new Date(2026, 10, 9 - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date, said: 3, replies: 3, hours: Array(24).fill(0), words: WORDS[i % WORDS.length], crisis: false, ai: SKIES[i % SKIES.length] };
  });
}

export default function Preview() {
  const search = useSyncExternalStore(() => () => {}, () => location.search, () => null);
  if (search === null) return <main className="app-frame bg-[#FAFCFE]" />;
  const params = new URLSearchParams(search);
  const level = Math.min(5, Math.max(1, Number(params.get("level")) || 3));
  return (
    <main className="app-frame app-frame-scrollable bg-[#FAFCFE] px-gutter py-6">
      <Garden
        who={{ name: DEFAULT_COMPANION, shape: "cloud", color: "lavender", accessory: params.get("accessory") ?? undefined }}
        days={sampleDays(level)}
        now={NOW}
        splineUrl={params.get("spline") ?? undefined}
      />
    </main>
  );
}
