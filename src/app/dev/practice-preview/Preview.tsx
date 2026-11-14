"use client";
import { useState } from "react";
import { DEFAULT_COMPANION } from "@/lib/onboarding";
import { type DayStat, localDate } from "@/lib/report";
import { type Practice, type PracticeLog, dailyPractices, isDone, markClosed, markDone, markLater, nextPractice, practiceTotal, weekChecks } from "@/lib/practice";
import { gardenWeather } from "@/lib/garden";
import HomeScreen from "../../HomeScreen";
import { Crisis109, Shell } from "../../Conversation";
import Garden from "../../Garden";
import SkyBackdrop from "../../SkyBackdrop";
import { PracticeCard, PracticeMini, PracticeSheet, WeekChecks } from "../../Practice";
import { Icon } from "../../art";

// 대화 뒤 작은 실천·요일 체크 시안을 저장소·API 없이 보는 개발용 미리보기.
// 기록은 이 화면의 상태로만 두고 localStorage에 쓰지 않는다(markDone 등은 계정이 없으면 저장을 건너뛴다).
const NOW = new Date(2026, 10, 4, 21, 30).getTime(); // 2026-11-04 수요일 밤
const TODAY = localDate(NOW);
const hours = (h: number, n: number) => { const list = Array(24).fill(0); list[h] = n; return list; };
const DAYS: DayStat[] = [
  { date: "2026-10-27", said: 5, replies: 5, hours: hours(21, 5), words: { 회의: 2, 기획안: 1 }, crisis: false, ai: "cloudy" },
  { date: "2026-10-29", said: 4, replies: 4, hours: hours(22, 4), words: { 산책: 2, 주말: 1 }, crisis: false, ai: "sunny" },
  { date: "2026-10-31", said: 6, replies: 6, hours: hours(20, 6), words: { 친구: 2, 영화: 1 }, crisis: false, ai: "cozy" },
  { date: "2026-11-02", said: 3, replies: 3, hours: hours(22, 3), words: { 잠: 2 }, crisis: false, ai: "rain" },
  { date: "2026-11-03", said: 7, replies: 7, hours: hours(21, 7), words: { 팀장님: 2, 회의: 2 }, crisis: false, ai: "wind" },
  { date: TODAY, said: 4, replies: 4, hours: hours(21, 4), words: { 휴식: 1 }, crisis: false },
];
const SEED_LOG: PracticeLog = { done: { "2026-10-29": ["water"], "2026-11-02": ["breath", "window"], "2026-11-03": ["shoulders"] }, later: {}, closed: {} };
const PROFILE = { nickname: "", companion: DEFAULT_COMPANION, shape: "cloud", color: "lavender", voice: "marin", style: "listen" } as const;
const WHO = { name: DEFAULT_COMPANION, shape: "cloud", color: "lavender" } as const;

const SCENES = [
  { id: "rest", label: "홈 기본" },
  { id: "after", label: "대화 뒤" },
  { id: "crisis", label: "위기 뒤" },
  { id: "insight", label: "구름 정원" },
] as const;
type Scene = (typeof SCENES)[number]["id"];

export default function Preview() {
  const [scene, setScene] = useState<Scene>("after");
  const [log, setLog] = useState<PracticeLog>(SEED_LOG);
  const [sheet, setSheet] = useState<Practice | null>(null);
  const [cardOpen, setCardOpen] = useState(true);
  const [cheer, setCheer] = useState(0);
  const today = dailyPractices(TODAY);
  const doneIds = new Set(log.done[TODAY] ?? []);
  const suggestion = nextPractice(log, NOW);

  function finish(practice: Practice) {
    setLog((current) => markDone(current, practice.id, NOW));
    setCheer((n) => n + 1);
    setCardOpen(false); // 하나 했으면 바로 다음 카드를 들이밀지 않는다
  }

  const sheetEl = sheet && <PracticeSheet practice={sheet} color={PROFILE.color} done={isDone(log, sheet.id, NOW)} onDone={() => finish(sheet)} onClose={() => setSheet(null)} />;
  const switcher = (
    <div role="tablist" aria-label="시안 장면" className="pointer-events-auto fixed top-2 left-1/2 z-[60] flex -translate-x-1/2 gap-0.5 rounded-full bg-[#1F2A55]/90 p-1 text-t1 font-medium text-white shadow-lg backdrop-blur-md">
      {SCENES.map((s) => <button key={s.id} role="tab" aria-selected={scene === s.id} onClick={() => { setScene(s.id); setCardOpen(true); }} className="whitespace-nowrap rounded-full px-3 py-1.5 aria-selected:bg-white aria-selected:text-[#1F2A55]">{s.label}</button>)}
    </div>
  );

  if (scene === "insight") {
    const checks = weekChecks(DAYS, log, NOW);
    return (
      <>
        {switcher}
        <Shell color={WHO.color} bloom="soft">
          <SkyBackdrop weather={gardenWeather(DAYS, NOW)} color={WHO.color} />
          <header className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex h-14 items-center px-gutter">
            <button aria-label="처음 화면으로" className="ui-press grid size-12 place-items-center rounded-full bg-white/60 text-[#1F2A55] backdrop-blur-md"><Icon name="back" size={22} /></button>
            <h1 className="absolute inset-x-0 text-center text-t6 font-bold text-[#1F2A55]">구름 정원</h1>
          </header>
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+80px)] bottom-0 overflow-y-auto px-gutter pb-10">
            <WeekChecks who={WHO} checks={checks} total={practiceTotal(log)} cheer={cheer} className="rounded-r6 border border-white/70 bg-white/72 p-5 shadow-[0_8px_28px_rgba(28,38,80,.07)] backdrop-blur-xl motion-safe:animate-screen-in" />
            {/* 제안 카드는 홈에만 둔다. 인사이트는 쌓인 것(요일 체크·정원)만 보여 준다. */}
            <div className="mt-3"><Garden who={WHO} days={DAYS} now={NOW} /></div>
          </div>
        </Shell>
      </>
    );
  }

  const after = scene === "after" && cardOpen && suggestion;
  return (
    <>
      {switcher}
      <HomeScreen
        profile={PROFILE}
        greet={false}
        onVoice={() => {}} onText={() => {}} onMenu={() => {}}
        chat={{ open: false, draft: "", sending: false, error: "", state: "idle", onDraft: () => {}, onClose: () => {}, onSend: () => {}, messages: [] }}
        notice={scene === "crisis" ? <Crisis109 /> : undefined}
        spotlight={scene === "rest" ? <PracticeMini practices={today} doneIds={doneIds} onOpen={setSheet} /> : undefined}
        nudge={after ? (
          <PracticeCard
            practice={suggestion}
            name={PROFILE.companion}
            onDo={() => setSheet(suggestion)}
            onLater={() => setLog((current) => markLater(current, suggestion.id, NOW))}
            onClose={() => { setLog((current) => markClosed(current, suggestion.id, NOW)); setCardOpen(false); }}
          />
        ) : undefined}
      >
        {sheetEl}
      </HomeScreen>
    </>
  );
}
