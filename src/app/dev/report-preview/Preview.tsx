"use client";
import { useState } from "react";
import type { Session } from "@/lib/log";
import { type DayStat, type SkyId, setMySky } from "@/lib/report";
import { DEFAULT_COMPANION } from "@/lib/onboarding";
import { type ReportMode, ReportView } from "../../Report";

// API·저장소 없이 리포트 화면을 확인하는 개발용 미리보기. 시안과 같은 2026년 10월·11월 예시다.
// 오늘은 11월 5일 목요일: 이번 주(11월 1~7일)에 표정이 있는 날·아직 없는 날·오늘·오지 않은 날이 모두 보인다.
const NOW = new Date(2026, 10, 5, 21, 30).getTime();
const at = (m: number, d: number, h: number, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const hours = (...pairs: [number, number][]) => { const list = Array(24).fill(0); for (const [h, n] of pairs) list[h] = n; return list; };

const SKIES: [number, SkyId | null, number][] = [
  [2, "sunny", 5], [5, "cloudy", 6], [6, "cloudy", 4], [8, "cozy", 5], [12, "rain", 7], [13, "cloudy", 6], [15, "sunny", 4],
  [16, null, 5], [19, "wind", 5], [20, "thunder", 8], [22, "cloudy", 6], [26, "cozy", 5], [27, "rain", 7], [28, "cloudy", 6], [30, "sunny", 7],
];

const DAYS: DayStat[] = [
  ...SKIES.map(([d, sky, said]): DayStat => ({
    date: `2026-10-${String(d).padStart(2, "0")}`,
    said,
    replies: said,
    hours: d % 3 === 0 ? hours([20, said]) : d % 3 === 1 ? hours([22, said - 1], [23, 1]) : hours([13, 1], [19, said - 1]),
    words: d === 16 ? {} : { 회의: d % 2 ? 1 : 2, 팀장님: d % 3 ? 1 : 2, 기획안: 1, 주말: d > 20 ? 1 : 0, 산책: d % 4 ? 0 : 2, 잠: d % 5 ? 0 : 2 },
    crisis: d === 16,
    ...(sky ? { ai: d === 26 ? "rain" : sky } : {}),
    ...(d === 26 ? { mine: "cozy" as SkyId } : {}),
  })),
  { date: "2026-11-01", said: 4, replies: 4, hours: hours([21, 4]), words: { 휴식: 1 }, crisis: false, ai: "none" },
  { date: "2026-11-02", said: 6, replies: 6, hours: hours([8, 2], [22, 4]), words: { 회의: 2, 산책: 1 }, crisis: false, ai: "sunny" },
  { date: "2026-11-03", said: 3, replies: 3, hours: hours([23, 3]), words: { 주말: 2, 산책: 1 }, crisis: false, ai: "cloudy", mine: "cozy" },
  { date: "2026-11-04", said: 5, replies: 5, hours: hours([20, 5]), words: { 회의: 1, 잠: 2 }, crisis: false, ai: "rain" },
  { date: "2026-11-05", said: 2, replies: 2, hours: hours([21, 2]), words: { 산책: 1 }, crisis: false },
];

const SESSIONS: Session[] = [
  { id: "s28", startedAt: at(10, 28, 22, 40), messages: [
    { role: "user", content: "오늘 회의에서 내 기획안이 또 밀렸어.", at: at(10, 28, 22, 40) },
    { role: "assistant", content: "또 밀렸구나. 조금 더 들려줄래?", at: at(10, 28, 22, 41) },
    { role: "user", content: "팀장님이 다음 주에 따로 얘기하자는데 벌써 신경 쓰여.", at: at(10, 28, 22, 43) },
    { role: "assistant", content: "그 얘기가 마음에 계속 남는구나. 뭐가 제일 걸려?", at: at(10, 28, 22, 44) },
  ] },
  { id: "s01", startedAt: at(11, 1, 21, 12), messages: [
    { role: "user", content: "오늘은 그냥 좀 쉬고 싶어", at: at(11, 1, 21, 12) },
    { role: "assistant", content: "그래, 오늘은 푹 쉬자. 뭐 하면서 쉬면 좋을 것 같아?", at: at(11, 1, 21, 13) },
  ] },
];

// 빈 상태 확인용: quiet는 이번 주(11월)에 이야기가 없고, empty는 이야기한 날이 하나도 없다.
const SAMPLES = { full: DAYS, quiet: DAYS.filter((day) => day.date < "2026-11-01"), empty: [] };

export default function Preview({ initialMode = "library", sample = "full", onBack, onDecorate }: {
  initialMode?: ReportMode;
  sample?: keyof typeof SAMPLES;
  onBack?: () => void;
  onDecorate?: () => void;
} = {}) {
  const [days, setDays] = useState(SAMPLES[sample]);
  const [choice, setChoice] = useState<"on" | "off" | null>(null);
  // 뒤로 버튼을 누르면 인사이트 ↔ 라이브러리를 바꿔 본다.
  const [mode, setMode] = useState<ReportMode>(initialMode);
  return (
    <ReportView
      key={mode}
      mode={mode}
      who={{ name: DEFAULT_COMPANION, shape: "cloud", color: "lavender" }}
      days={days}
      sessions={SESSIONS}
      now={NOW}
      choice={choice}
      skyState="idle"
      onBack={onBack ?? (() => setMode((m) => (m === "library" ? "insight" : "library")))}
      onDecorate={onDecorate}
      onArchive={() => {}}
      onChoice={setChoice}
      onPickSky={(date, sky) => setDays((current) => setMySky(current, date, sky))}
    />
  );
}
