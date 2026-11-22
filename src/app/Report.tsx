"use client";

import { Tab } from "./ui/Controls";
import { Button } from "./ui/Button";
import { useEffect, useId, useRef, useState } from "react";
import { type Session, loadLog, loadStoredSessions } from "@/lib/log";
import { gardenWeather } from "@/lib/garden";
import { josa } from "@/lib/onboarding";
import {
  type DayStat,
  type Insights,
  type SkyId,
  MOOD_LABEL,
  SKY_IDS,
  applySkyResults,
  effectiveSky,
  insights,
  loadReport,
  loadSkyChoice,
  localDate,
  monthView,
  msgTime,
  pendingSkyDays,
  reportMonths,
  requestReportSky,
  saveReport,
  saveSkyChoice,
  setMySky,
  syncReport,
} from "@/lib/report";
import { ACTIVITY_CHANGED } from "@/lib/activity-outbox";
import { Icon } from "./art";
import { Crisis109, Shell, type Who } from "./Conversation";
import Garden from "./Garden";
import SkyBackdrop from "./SkyBackdrop";
import Sheet from "./Sheet";
import { MOOD_LOOK, MoodFace } from "./mood";
import "./report.css";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

// 화면에는 날씨 대신 표정으로 보여 준다. 안쪽 이름(sky)은 저장 형식과 맞춰 그대로 둔다.
const skyLabel = (id: SkyId) => MOOD_LABEL[id];

function hourLabel(hour: number) {
  const h = hour % 24;
  const period = h >= 5 && h < 11 ? "아침" : h >= 11 && h < 17 ? "낮" : h >= 17 && h < 22 ? "저녁" : "밤";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return { period, text: `${twelve}시` };
}

function peakText(start: number) {
  const a = hourLabel(start);
  const b = hourLabel(start + 2);
  return `${a.period} ${a.text}~${a.period === b.period ? "" : `${b.period} `}${b.text}에 가장 많이 이야기했어요`;
}

function dateParts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d, weekday: new Date(y, m - 1, d).getDay() };
}

// 구름 정원(보류 중)의 위 줄. 리포트는 아래 TopBar를 쓴다.
const GardenHeader = ({ title, back, onBack }: { title: string; back: string; onBack: () => void }) => (
  <header className="here-navbar absolute inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-10 flex h-14 items-center justify-between px-gutter">
    <Button variant="plain" onClick={onBack} aria-label={back} className="ui-press grid size-12 place-items-center rounded-full bg-white/72 text-[#1F2A55] shadow-[0_2px_10px_rgba(28,38,80,.05)] backdrop-blur-md">
      <Icon name="back" size={22} />
    </Button>
    <h1 className="text-t6 font-bold outline-none">{title}</h1>
    <span className="size-12" />
  </header>
);

/** 리포트 화면의 바탕: 메뉴·캐릭터 화면과 같은 종이색에 잉크 글자. */
function Page({ children }: { children: React.ReactNode }) {
  return <main className="app-frame report-page motion-safe:animate-fade">{children}</main>;
}

const TopBar = ({ title, back, onBack, headingRef }: { title: string; back: string; onBack: () => void; headingRef?: React.Ref<HTMLHeadingElement> }) => (
  <header className="report-top">
    <Button variant="plain" onClick={onBack} aria-label={back} className="report-back ui-press">
      <Icon name="back" size={22} />
    </Button>
    <h1 ref={headingRef} tabIndex={-1} className="report-title">{title}</h1>
  </header>
);

// 화면이 열리거나 탭을 바꿀 때 카드가 위에서부터 차례로 올라온다(동작 줄이기에서는 움직이지 않는다).
const STAGGER = "motion-safe:[&>*]:animate-screen-in [&>*:nth-child(2)]:[animation-delay:50ms] [&>*:nth-child(3)]:[animation-delay:100ms] [&>*:nth-child(4)]:[animation-delay:150ms] [&>*:nth-child(n+5)]:[animation-delay:200ms]";

// 계정에 저장한 대화 숫자를 두 화면으로 나눠 보여 준다.
// 구름 정원(mode "insight", 보류 중): 쌓이는 이야기·씨앗·도감·앨범. 탭 없이 한 화면이고 예전 모양 그대로다.
// 리포트(mode "library"): 인사이트(이번 주·이어서 이야기한 날·지금까지) · 한 달(표정 달력과 그달 숫자) · 하루하루.
// 마음 점검·상담 같은 탭은 팀 결정 전이라 넣지 않는다.
export type ReportMode = "insight" | "library";
const TABS = [
  { id: "summary", label: "인사이트" },
  { id: "month", label: "한 달" },
  { id: "days", label: "하루하루" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** 하루 중 내가 가장 많이 말한 시각. 말한 시각이 없으면 null. */
function busiestHour(hours: number[]) {
  const max = Math.max(0, ...hours);
  return max ? hours.indexOf(max) : null;
}
const AI_NOTE = "AI가 고른 표정 · 진단이 아니에요";

export type ReportViewProps = {
  syncError?: string;
  mode: ReportMode;
  who: Who;
  days: DayStat[];
  sessions: Session[];
  now: number;
  choice: "on" | "off" | null;
  skyState: "idle" | "picking" | "failed";
  onBack: () => void;
  onPickSky: (date: string, sky: SkyId | undefined) => void;
  onChoice: (choice: "on" | "off") => void;
  onArchive?: () => void;
  onSeed?: (opener: string) => void;
  onDecorate?: () => void;
};

/** 큰 숫자 하나와 단위. 다섯 글자가 넘으면 조금 줄인다. */
function Big({ value, unit }: { value: number; unit: string }) {
  const text = value.toLocaleString("ko-KR");
  return <dd className="report-big" data-long={text.length >= 5 || undefined}>{text}<small>{unit}</small></dd>;
}

/** 리포트·구름 정원 화면. 저장·요청은 하지 않아서 개발 미리보기에서도 그대로 쓴다. */
export function ReportView(props: ReportViewProps) {
  if (props.mode === "insight") return <GardenScreen {...props} />;
  return <LibraryView {...props} />;
}

function GardenScreen({ syncError, who, days, now, onBack, onSeed, onDecorate }: ReportViewProps) {
  return (
    <Shell color={who.color} bloom="soft">
      {/* 정원은 화면 전체에 움직이는 하늘을 깔고, 카드를 반투명하게 띄운다. */}
      <SkyBackdrop weather={gardenWeather(days, now)} color={who.color} />
      <GardenHeader title="구름 정원" back="처음 화면으로" onBack={onBack} />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+80px)] bottom-0 overflow-y-auto px-gutter pb-10">
        {syncError && <p role="status" className="mb-3 text-t2 text-ios-secondary">{syncError}</p>}
        <div className={STAGGER}><Garden who={who} days={days} now={now} onSeed={onSeed} onDecorate={onDecorate} /></div>
        <p className="mt-6 flex items-start justify-center gap-text text-t2 text-pretty text-ios-secondary">
          <Icon name="lock" size={14} />
          최근 30일 대화는 홈의 글 대화에서 볼 수 있어요. 날짜별 숫자와 하늘 기록은 계정에 최대 1년 남아요.
        </p>
      </div>
    </Shell>
  );
}

function LibraryView({ syncError, who, days, sessions, now, choice, skyState, onBack, onPickSky, onChoice }: ReportViewProps) {
  const months = reportMonths(days, now);
  const [monthIndex, setMonthIndex] = useState(months.length - 1);
  const [tab, setTab] = useState<TabId>("summary");
  const tabId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  // 탭을 바꾸면 새 탭의 맨 위부터 보여 준다.
  function showTab(next: TabId) {
    setTab(next);
    scrollRef.current?.scrollTo({ top: 0 });
  }
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnDate = useRef<string | null>(null);

  // 화면이 바뀌면 제목으로, 달 화면으로 돌아오면 누른 날짜로 포커스를 옮긴다.
  useEffect(() => {
    if (openDate) { headingRef.current?.focus({ preventScroll: true }); return; }
    const date = returnDate.current;
    if (!date) return;
    document.querySelector<HTMLButtonElement>(`[data-report-date="${date}"]`)?.focus({ preventScroll: true });
  }, [openDate]);

  const today = localDate(now);
  function openDay(date: string) {
    returnDate.current = date;
    setOpenDate(date);
  }

  if (openDate) {
    const day = days.find((d) => d.date === openDate);
    return (
      <DayView
        who={who}
        date={openDate}
        day={day}
        sessions={sessions}
        today={today}
        choice={choice}
        sheet={sheet}
        headingRef={headingRef}
        onBack={() => { setSheet(false); setOpenDate(null); }}
        onSheet={setSheet}
        onPickSky={onPickSky}
      />
    );
  }

  const index = Math.min(Math.max(monthIndex, 0), months.length - 1);
  const current = months[index];
  const monthNav = (
    <div className="report-month">
      <h2 aria-live="polite">{current.year}년 {current.month}월</h2>
      <div className="report-month-nav">
        <Button variant="plain" onClick={() => setMonthIndex(Math.max(0, index - 1))} disabled={index <= 0} aria-label="이전 달" className="report-round ui-press">
          <Icon name="back" size={18} />
        </Button>
        <Button variant="plain" onClick={() => setMonthIndex(Math.min(months.length - 1, index + 1))} disabled={index >= months.length - 1} aria-label="다음 달" className="report-round ui-press">
          <span className="rotate-180"><Icon name="back" size={18} /></span>
        </Button>
      </div>
    </div>
  );

  return (
    <Page>
      <TopBar title="리포트" back="처음 화면으로" onBack={onBack} headingRef={headingRef} />
      <div role="tablist" aria-label="리포트 종류" className="report-tabs motion-safe:animate-screen-in">
        {TABS.map((t, i) => (
          <Tab
            key={t.id}
            id={`${tabId}-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`${tabId}-panel`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => showTab(t.id)}
            onKeyDown={(event) => {
              if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
              event.preventDefault();
              const next = TABS[(i + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
              showTab(next.id);
              document.getElementById(`${tabId}-${next.id}`)?.focus();
            }}
            className="report-tab ui-press"
          >
            {t.label}
          </Tab>
        ))}
      </div>
      <div ref={scrollRef} className="report-scroll">
        {syncError && <p role="status" className="report-status">{syncError}</p>}
        <div key={tab} id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`} className={`report-stack ${STAGGER}`}>
          {tab === "summary" && <Summary view={insights(days, now)} choice={choice} skyState={skyState} onChoice={onChoice} onOpen={openDay} onTalk={onBack} />}
          {tab === "month" && <>
            {monthNav}
            <MonthPanel days={days} year={current.year} month={current.month} today={today} choice={choice} skyState={skyState} onChoice={onChoice} onOpen={openDay} />
          </>}
          {tab === "days" && <>
            {monthNav}
            <DaysPanel days={days} year={current.year} month={current.month} today={today} onOpen={openDay} />
          </>}
        </div>
        <p className="report-foot">
          <Icon name="lock" size={14} />
          최근 30일 대화는 홈의 글 대화에서 볼 수 있어요. 날짜별 숫자와 표정 기록은 계정에 최대 1년 남아요.
        </p>
      </div>
    </Page>
  );
}

/** 표정을 AI가 골라 둘지 묻는 안내. 리포트를 처음 연 사람이 어느 탭에서든 보게 인사이트(이번 주 카드 안)와 한 달에 함께 둔다. */
function SkyChoice({ onChoice, inset = false }: { onChoice: (choice: "on" | "off") => void; inset?: boolean }) {
  const id = useId();
  return (
    <section className={inset ? "report-choice" : "report-card"} aria-labelledby={id}>
      <h3 id={id} className={inset ? "report-choice-title" : "report-card-title"}>그날 표정을 AI가 골라 둘까요?</h3>
      <p className="report-text mt-1.5">
        지난 날마다 그날 내가 한 말을 보고 {SKY_IDS.map(skyLabel).join("·")} 중 하나를 골라요. 이때 그날 내가 한 말을 AI 서비스로 한 번 더 보내요. 진단이 아니고, 언제든 직접 고칠 수 있어요.
      </p>
      <div className="mt-3.5 flex gap-2">
        <Button onClick={() => onChoice("on")} tone="ink" size="medium" className="flex-1">괜찮아요</Button>
        <Button onClick={() => onChoice("off")} tone="ink" variant="tonal" size="medium" className="flex-1">AI로 고르지 않기</Button>
      </div>
    </section>
  );
}

/** 표정 아래 한 줄: AI가 골랐다는 표시, 고르는 중·실패, 꺼 두었을 때 다시 켜기. */
function SkyNote({ choice, skyState, onChoice, className = "" }: { choice: "on" | "off" | null; skyState: "idle" | "picking" | "failed"; onChoice: (choice: "on" | "off") => void; className?: string }) {
  if (choice === "off") {
    return <p className={`report-fine ${className}`}>날짜를 눌러 직접 고를 수 있어요 · <Button variant="plain" onClick={() => onChoice("on")} className="report-link ui-press">AI로 고르기 켜기</Button></p>;
  }
  return (
    <p className={`report-fine ${className}`}>
      {AI_NOTE} · 눌러서 바꿀 수 있어요
      {skyState === "picking" && <span role="status"> · 표정을 고르는 중…</span>}
      {skyState === "failed" && <span role="status"> · 표정을 다 고르지 못했어요</span>}
    </p>
  );
}

/** 인사이트: 이번 주 표정, 최근 30일에 많았던 표정·자주 한 말, 지금까지의 숫자. 날짜별 숫자에서만 세고 해석하지 않는다. */
function Summary({ view, choice, skyState, onChoice, onOpen, onTalk }: {
  view: Insights; choice: "on" | "off" | null; skyState: "idle" | "picking" | "failed";
  onChoice: (choice: "on" | "off") => void; onOpen: (date: string) => void; onTalk: () => void;
}) {
  const first = dateParts(view.week[0].date);
  const last = dateParts(view.week[6].date);
  const range = `${first.m}월 ${first.d}일 – ${first.m === last.m ? "" : `${last.m}월 `}${last.d}일`;
  const { current, record } = view.streak;
  const since = view.since ? dateParts(view.since) : null;

  return <>
    <section className="report-card report-hero" aria-labelledby="report-week">
      {/* eslint-disable-next-line @next/next/no-img-element -- 9KB짜리 꾸밈 그림이라 이미지 최적화를 거치지 않는다 */}
      <img className="report-hero-cat" src="/characters/motion/purr.webp" alt="" width={428} height={281} draggable={false} />
      <div className="report-hero-text">
        <p className="report-eyebrow">{range}</p>
        <h2 id="report-week" className="report-headline">
          {view.weekTalked ? <>이번 주엔<br /><b>{view.weekTalked}</b>일 이야기했어요</>
            : view.totalDays ? <>이번 주엔 아직<br />이야기하지 않았어요</>
            : <>아직 이야기한<br />날이 없어요</>}
        </h2>
        {/* 이어서 이야기한 날은 한 줄로만. 쉬어서 0이 되면 아무 말도 하지 않는다(독촉·벌칙 없음). */}
        {current >= 2 && <p className="report-hero-sub">{current}일째 이어서 이야기하고 있어요</p>}
      </div>
      {!view.totalDays && (
        <div className="report-hero-cta">
          <Button tone="ink" size="medium" onClick={onTalk}>이야기하러 가기</Button>
        </div>
      )}
      <ol className="report-week" aria-label="이번 주 표정">
        {view.week.map((cell) => {
          const { m, d } = dateParts(cell.date);
          const name = `${m}월 ${d}일 ${WEEKDAY_FULL[cell.weekday]}${cell.today ? ", 오늘" : ""}`;
          const isToday = cell.today || undefined;
          const sky = cell.day && !cell.day.crisis ? effectiveSky(cell.day) : undefined;
          const label = <span aria-hidden="true" className="report-week-day" data-today={isToday}>{WEEKDAY[cell.weekday]}</span>;
          if (!cell.day) {
            return (
              <li key={cell.date}>
                <span role="img" aria-label={`${name}, ${cell.future ? "아직 오지 않은 날" : "이야기하지 않은 날"}`} className="report-week-cell">
                  <span className="report-week-mark" data-kind={cell.future ? "future" : "rest"} data-today={isToday} />
                </span>
                {label}
              </li>
            );
          }
          const state = cell.day.crisis ? "109 안내가 있었던 날" : sky ? `${skyLabel(sky)}, ${cell.day.mine ? "내가 고친 표정" : "AI가 고른 표정"}` : "표정을 아직 고르지 않음, 눌러서 고를 수 있어요";
          return (
            <li key={cell.date}>
              <Button variant="plain" data-report-date={cell.date} onClick={() => onOpen(cell.date)} aria-current={cell.today ? "date" : undefined} aria-label={`${name}, ${state}`} className="report-week-cell ui-press">
                {cell.day.crisis ? <span className="report-week-mark" data-kind="crisis" data-today={isToday}>109</span>
                  : sky ? <span className="report-week-mark" data-kind="mood" data-today={isToday}><MoodFace id={sky} size={36} /></span>
                  : <span className="report-week-mark" data-kind="plus" data-today={isToday}><Icon name="add" size={15} /></span>}
              </Button>
              {label}
            </li>
          );
        })}
      </ol>
      {/* 동의를 묻기 전에는 AI가 표정을 고르지 않는다. 처음 여는 탭이라 여기서 묻는다. */}
      {view.totalDays > 0 && (choice === null
        ? <SkyChoice onChoice={onChoice} inset />
        : <SkyNote choice={choice} skyState={skyState} onChoice={onChoice} className="report-hero-note" />)}
    </section>

    {(view.moods.length > 0 || view.words.length > 0) && (
      <section className="report-card" aria-labelledby="report-recent">
        <h3 id="report-recent" className="report-card-title">최근 30일</h3>
        {view.moods.length > 0 && <>
          <p className="report-label mt-3.5">많았던 표정</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {view.moods.map((mood) => (
              <li key={mood.id} className="report-chip report-chip-mood"><MoodFace id={mood.id} size={24} />{skyLabel(mood.id)} <span>{mood.count}일</span></li>
            ))}
          </ul>
        </>}
        {view.words.length > 0 && <>
          <p className="report-label mt-4">자주 한 말</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {view.words.map((w) => <li key={w.word} className="report-chip">{w.word} <span>{w.count}번</span></li>)}
          </ul>
        </>}
        <p className="report-fine mt-3.5">
          {view.moods.length > 0 && "표정은 AI가 고른 것이고 진단이 아니에요. "}
          {view.words.length > 0 && "자주 한 말은 AI에 보내지 않아요."}
        </p>
      </section>
    )}

    <div className="report-section">
      <h3>지금까지</h3>
      {since && <span>{view.capped ? "최근 1년 기록에서 세요" : `${since.m}월 ${since.d}일부터 ${view.sinceDays}일째`}</span>}
    </div>
    <dl className="report-grid">
      <div className="report-stat">
        <dt>대화한 날</dt>
        <Big value={view.totalDays} unit="일" />
        <dd className="report-stat-cap">지난 7일 {view.recentDays}일</dd>
      </div>
      <div className="report-stat">
        <dt>내가 한 말</dt>
        <Big value={view.totalSaid} unit="번" />
        <dd className="report-stat-cap">지난 7일 {view.recentSaid.toLocaleString("ko-KR")}번</dd>
      </div>
      <div className="report-stat">
        <dt>가장 길게 이어진 날</dt>
        <Big value={record} unit="일" />
        <dd className="report-stat-cap">{current >= 2 ? `지금 ${current}일째` : "쉬어 가도 줄지 않아요"}</dd>
      </div>
      <div className="report-stat">
        <dt>자주 이야기한 때</dt>
        <dd className="report-big" data-word data-empty={!view.busiest || undefined}>{view.busiest?.label ?? "—"}</dd>
        <dd className="report-stat-cap">{view.busiest ? `최근 30일 · ${view.busiest.count.toLocaleString("ko-KR")}번` : "이야기가 쌓이면 보여요"}</dd>
      </div>
    </dl>
  </>;
}

/** 한 달: 표정 달력과 그달의 숫자(표정별 날 수 · 자주 한 말 · 시간대). */
function MonthPanel({ days, year, month, today, choice, skyState, onChoice, onOpen }: {
  days: DayStat[]; year: number; month: number; today: string; choice: "on" | "off" | null; skyState: "idle" | "picking" | "failed";
  onChoice: (choice: "on" | "off") => void; onOpen: (date: string) => void;
}) {
  const view = monthView(days, year, month);
  const enough = view.talked >= 3;
  const first = new Date(year, month - 1, 1).getDay();
  const length = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const byDate = new Map(view.days.map((d) => [d.date, d]));
  const maxSky = Math.max(1, ...view.skies.map((s) => s.count));
  const maxBucket = Math.max(1, ...view.buckets.map((b) => b.count));
  const peakBucket = view.buckets.reduce((a, b) => (b.count > a.count ? b : a), view.buckets[0]);
  const pad = (n: number) => String(n).padStart(2, "0");

  return <>
    {choice === null && <SkyChoice onChoice={onChoice} />}

    <section className="report-card" aria-labelledby="report-calendar">
      <h3 id="report-calendar" className="report-card-title">표정 달력</h3>
      <table className="report-cal mt-3">
        <caption className="sr-only">{year}년 {month}월 표정 달력. 이야기한 날을 누르면 그날을 볼 수 있어요.</caption>
        <thead>
          <tr>{WEEKDAY.map((w, i) => <th key={w} scope="col" abbr={WEEKDAY_FULL[i]}>{w}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map((d, di) => {
                if (!d) return <td key={di} />;
                const date = `${year}-${pad(month)}-${pad(d)}`;
                const day = byDate.get(date);
                const isToday = date === today || undefined;
                // 날마다 위에 표정 자리, 아래에 작은 날짜. 이야기한 날만 누를 수 있다.
                const num = <span className="report-cal-num" data-today={isToday} data-dim={!day || undefined}>{d}</span>;
                if (!day) {
                  return <td key={di} aria-current={isToday ? "date" : undefined}><span className="report-cal-cell"><span className="report-cal-slot" data-kind="none" />{num}</span></td>;
                }
                const sky = day.crisis ? undefined : effectiveSky(day);
                const state = day.crisis ? "109 안내가 있었던 날" : sky ? `${skyLabel(sky)}, ${day.mine ? "내가 고친 표정" : "AI가 고른 표정"}` : "표정을 아직 고르지 않음";
                return (
                  <td key={di}>
                    <Button variant="plain"
                      data-report-date={date}
                      onClick={() => onOpen(date)}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={`${month}월 ${d}일 ${WEEKDAY_FULL[di]}, ${state}`}
                      className="report-cal-cell ui-press"
                    >
                      {day.crisis ? <span className="report-cal-slot" data-kind="crisis">109</span>
                        : sky ? <span className="report-cal-slot"><MoodFace id={sky} size={32} /></span>
                        : <span className="report-cal-slot" data-kind="plus"><Icon name="add" size={13} /></span>}
                      {num}
                    </Button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {choice !== null && <SkyNote choice={choice} skyState={skyState} onChoice={onChoice} className="mt-2" />}
    </section>

    <dl className="report-duo">
      <div className="report-tile">
        <dt>{month}월에 대화한 날</dt>
        <Big value={view.talked} unit="일" />
      </div>
      <div className="report-tile">
        <dt>{month}월에 내가 한 말</dt>
        <Big value={view.said} unit="번" />
      </div>
    </dl>

    {view.skies.length > 0 && (
      <section className="report-card" aria-labelledby="report-skies">
        <h3 id="report-skies" className="report-card-title">표정별 날 수</h3>
        <ul className="mt-3 flex flex-col gap-2.5">
          {view.skies.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <MoodFace id={s.id} size={28} />
              <span className="w-14 text-t3 font-semibold text-cat-ink">{skyLabel(s.id)}</span>
              <span aria-hidden="true" className="h-2.5 flex-1 overflow-hidden rounded-full bg-cat-paper">
                <span className="block h-full rounded-full" style={{ width: `${(s.count / maxSky) * 100}%`, background: MOOD_LOOK[s.id].bg }} />
              </span>
              <span className="w-8 text-right text-t3 tabular-nums text-[#4A4741]">{s.count}일</span>
            </li>
          ))}
        </ul>
      </section>
    )}

    <section className="report-card" aria-labelledby="report-words">
      <div className="report-card-head">
        <h3 id="report-words" className="report-card-title">자주 한 말</h3>
        <span className="report-card-side">계정의 대화에서 세요</span>
      </div>
      {enough && view.words.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {view.words.map((w) => <li key={w.word} className="report-chip">{w.word} <span>{w.count}번</span></li>)}
        </ul>
      ) : (
        <p className="report-text mt-3 text-cat-muted">이야기가 더 쌓이면 자주 한 말을 보여 줄게요.</p>
      )}
      <p className="report-fine mt-3">AI에는 보내지 않아요. 단어만 세서 가끔 어색한 말이 나올 수 있어요.</p>
    </section>

    {enough && (
      <section className="report-card" aria-labelledby="report-hours">
        <h3 id="report-hours" className="report-card-title">이야기한 시간대</h3>
        <p className="report-fine mt-1">내가 말한 때로 셌어요.</p>
        <ul className="mt-4 grid grid-cols-4 items-end gap-3">
          {view.buckets.map((b) => (
            <li key={b.id} className="flex flex-col items-center gap-1.5">
              <span className="text-t2 tabular-nums text-[#4A4741]">{b.count}번</span>
              <span aria-hidden="true" className="flex h-20 w-7 items-end overflow-hidden rounded-full bg-cat-paper">
                <span className="block w-full rounded-full" style={{ height: `${Math.max(10, (b.count / maxBucket) * 100)}%`, background: b.id === peakBucket.id && b.count ? "var(--rp-ink)" : "var(--rp-line)" }} />
              </span>
              <span className="text-t3 font-semibold text-cat-ink">{b.label}</span>
            </li>
          ))}
        </ul>
        {view.peak !== null && <p className="report-text mt-3">{peakText(view.peak)}</p>}
      </section>
    )}
  </>;
}

/** 하루하루: 그달에 이야기한 날을 최근 순으로. */
function DaysPanel({ days, year, month, today, onOpen }: { days: DayStat[]; year: number; month: number; today: string; onOpen: (date: string) => void }) {
  const list = [...monthView(days, year, month).days].reverse();
  if (!list.length) return <p className="report-text py-8 text-center text-cat-muted">{month}월엔 이야기한 날이 없어요.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((day) => {
        const { m, d, weekday } = dateParts(day.date);
        const sky = day.crisis ? undefined : effectiveSky(day);
        const hour = busiestHour(day.hours);
        const when = hour === null ? "" : ` · ${hourLabel(hour).period} ${hourLabel(hour).text}쯤`;
        return (
          <li key={day.date}>
            <Button variant="plain" data-report-date={day.date} onClick={() => onOpen(day.date)} className="report-row ui-press">
              {day.crisis ? (
                <span className="grid h-9 shrink-0 place-items-center rounded-full bg-[#FFE8E6] px-2 text-t1 font-bold text-[#C42A23]">109</span>
              ) : sky ? (
                <MoodFace id={sky} size={36} />
              ) : (
                <span className="size-9 shrink-0 rounded-full border-[1.5px] border-dashed border-[#B5AEA2]" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-t4 font-bold text-cat-ink">
                  {m}월 {d}일 {WEEKDAY_FULL[weekday]}{day.date === today && <span className="ml-1.5 rounded-full bg-cat-ink px-1.5 py-0.5 text-t1 font-bold text-white">오늘</span>}
                </span>
                <span className="text-t2 tabular-nums text-cat-muted">
                  {day.crisis ? "109 안내가 나왔던 날" : sky ? skyLabel(sky) : "표정 없음"} · 내가 한 말 {day.said}번{when}
                </span>
              </span>
              <span className="rotate-180 text-cat-muted"><Icon name="back" size={16} /></span>
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function DayView({
  who, date, day, sessions, today, choice, sheet, headingRef, onBack, onSheet, onPickSky,
}: {
  who: Who; date: string; day?: DayStat; sessions: Session[]; today: string; choice: "on" | "off" | null; sheet: boolean;
  headingRef: React.Ref<HTMLHeadingElement>; onBack: () => void; onSheet: (open: boolean) => void; onPickSky: (date: string, sky: SkyId | undefined) => void;
}) {
  const { m, d, weekday } = dateParts(date);
  const sky = day && effectiveSky(day);
  const saidTimes = sessions.flatMap((s) => s.messages.filter((msg) => msg.role === "user").map((msg) => msgTime(msg, s))).filter((t) => localDate(t) === date);
  const started = saidTimes.length ? new Date(Math.min(...saidTimes)) : null;
  return (
    <Page>
      <TopBar title={`${m}월 ${d}일 ${WEEKDAY_FULL[weekday]}`} back="리포트로" onBack={onBack} headingRef={headingRef} />
      <div className="report-scroll">
        <div className={`report-stack ${STAGGER}`}>
          <section className="report-card" aria-label="그날의 표정">
            {day?.crisis ? (
              <>
                <Crisis109 className="w-full" />
                <p className="report-text mt-3">이날은 힘든 이야기가 있어서 표정을 고르지 않았어요. 대화 내용도 AI에 보내지 않았어요.</p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  {sky ? <MoodFace id={sky} size={64} /> : <span className="size-16 shrink-0 rounded-full border-2 border-dashed border-[#B5AEA2]" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-t2 font-semibold text-cat-muted">그날의 표정</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-t8 font-extrabold tracking-tight text-cat-ink">
                      {sky ? skyLabel(sky) : "아직 없어요"}
                      {sky && <span className="rounded-full bg-cat-paper px-2 py-0.5 text-t1 font-bold text-cat-muted">{day?.mine ? "내가 고침" : "AI가 고름"}</span>}
                    </p>
                  </div>
                  <Button variant="plain" onClick={() => onSheet(true)} className="report-pill ui-press">
                    {sky ? "바꾸기" : "직접 고르기"}
                  </Button>
                </div>
                <p className="report-fine mt-4 rounded-[14px] bg-cat-paper p-3 text-[#4A4741]">
                  {sky && day?.mine ? "내가 고친 표정이에요. " : ""}
                  {sky && !day?.mine ? "AI가 그날 내가 한 말을 보고 고른 표정이에요 · 진단이 아니에요. " : ""}
                  {!sky && date >= today && choice === "on" ? "오늘 표정은 하루가 지나면 AI가 골라 둘게요. " : ""}
                  {!sky && day?.ai === "none" ? "이날은 표정을 고르기 애매해서 비워 뒀어요. " : ""}
                  {!sky ? "AI가 고르는 표정은 진단이 아니에요. " : ""}
                  {choice === "off" ? "AI로 고르기를 꺼 두어서 직접 고를 수 있어요." : "표정을 고를 때 그날 내가 한 말을 AI 서비스로 한 번 더 보내요."}
                </p>
              </>
            )}
          </section>

          <dl className="report-duo">
            <div className="report-tile">
              <dt>내가 한 말</dt>
              <Big value={day?.said ?? 0} unit="번" />
            </div>
            <div className="report-tile">
              <dt>대화 시작</dt>
              <dd className="report-big" data-word data-empty={!started || undefined}>{started ? started.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }) : "—"}</dd>
            </div>
          </dl>
        </div>

        <p className="report-foot">{josa(who.name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
      </div>
      {sheet && day && !day.crisis && (
        <SkySheet date={date} day={day} onClose={() => onSheet(false)} onPick={(next) => { onPickSky(date, next); onSheet(false); }} />
      )}
    </Page>
  );
}

function SkySheet({ date, day, onClose, onPick }: { date: string; day: DayStat; onClose: () => void; onPick: (sky: SkyId | undefined) => void }) {
  const [picked, setPicked] = useState<SkyId | undefined>(effectiveSky(day));
  const name = useId();
  const { m, d, weekday } = dateParts(date);
  const ai = day.ai && day.ai !== "none" ? day.ai : undefined;
  return (
    <Sheet
      title="표정 바꾸기"
      className="report-sheet"
      onClose={onClose}
      footer={(
        <div className="flex flex-col gap-2">
          <Button onClick={() => onPick(picked)} disabled={!picked || picked === effectiveSky(day)} tone="ink" fullWidth>이 표정으로 바꾸기</Button>
          {day.mine && <Button variant="plain" onClick={() => onPick(undefined)} className="ui-press h-12 w-full rounded-full bg-cat-soft text-t4 font-bold text-cat-ink">{ai ? "AI가 고른 표정으로 되돌리기" : "고른 표정 지우기"}</Button>}
        </div>
      )}
    >
      <p className="text-t3 text-pretty text-[#4A4741]">AI가 고른 표정을 내가 고칠 수 있어요. 고친 표정을 리포트에 써요. AI가 고른 표정은 진단이 아니에요.</p>
      <fieldset className="mt-4">
        <legend className="mb-2 text-t3 font-bold text-[#4A4741]">{m}월 {d}일 {WEEKDAY_FULL[weekday]}의 표정</legend>
        <div className="grid grid-cols-3 gap-2">
          {SKY_IDS.map((id) => (
            <label
              key={id}
              className="ui-press relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[18px] bg-cat-paper has-checked:bg-white has-checked:shadow-[inset_0_0_0_2px_var(--color-cat-ink)] has-focus-visible:ring-2 has-focus-visible:ring-cat-ink/40"
            >
              <input type="radio" name={name} value={id} checked={picked === id} onChange={() => setPicked(id)} className="sr-only" />
              <MoodFace id={id} size={44} />
              <span className="text-t4 font-semibold text-cat-ink">{skyLabel(id)}</span>
              {ai === id && <span className="absolute top-1.5 right-1.5 rounded-full bg-white px-1.5 text-t1 font-bold text-cat-muted shadow-[0_1px_4px_rgba(41,41,39,.12)]">AI가 고름</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-t2 text-cat-muted">바꾼 표정은 계정에 저장돼 다른 기기에서도 이어져요.</p>
    </Sheet>
  );
}

/** 인사이트·라이브러리: 열 때 원문을 날짜별 숫자로 옮기고, 허락했으면 지난 날 하늘을 한 번에 골라 둔다. */
export default function Report({ syncError, mode, who, onBack, accessToken, onSeed, onDecorate }: { syncError?: string; mode: ReportMode; who: Who; onBack: () => void; accessToken: () => Promise<string>; onSeed?: (opener: string) => void; onDecorate?: () => void }) {
  const [now] = useState(() => Date.now());
  const [sessions] = useState<Session[]>(() => loadLog());
  const [days, setDays] = useState<DayStat[]>(() => syncReport(loadStoredSessions(), Date.now(), [who.name]));
  const [choice, setChoice] = useState(() => loadSkyChoice());
  const [skyState, setSkyState] = useState<"idle" | "picking" | "failed">("idle");
  const tokenRef = useRef(accessToken);
  useEffect(() => {
    const update = () => { setDays(loadReport()); setChoice(loadSkyChoice()); };
    window.addEventListener(ACTIVITY_CHANGED, update);
    return () => window.removeEventListener(ACTIVITY_CHANGED, update);
  }, []);
  useEffect(() => { tokenRef.current = accessToken; }, [accessToken]);

  useEffect(() => {
    if (choice !== "on") return;
    const pending = pendingSkyDays(loadReport(), sessions, now);
    if (!pending.length) return;
    const controller = new AbortController();
    const asked = pending.map((p) => p.date);
    // Strict Mode가 효과를 두 번 실행해도 요청은 한 번만 나가게, 실제 요청은 다음 틱에 시작한다.
    const timer = window.setTimeout(async () => {
      setSkyState("picking");
      try {
        const results = await requestReportSky(pending, controller.signal, await tokenRef.current());
        const next = applySkyResults(loadReport(), asked, results, Date.now());
        saveReport(next);
        setDays(next);
        setSkyState(results.length === asked.length ? "idle" : "failed");
      } catch {
        if (controller.signal.aborted) return;
        // 실패한 날은 몇 시간 뒤에 다시 물어본다(실패한 요청도 할당량을 쓴다). 429의 Retry-After보다 길게 쉰다.
        const next = applySkyResults(loadReport(), asked, [], Date.now());
        saveReport(next);
        setDays(next);
        setSkyState("failed");
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [choice, sessions, now]);


  return (
    <ReportView
      syncError={syncError}
      mode={mode}
      onSeed={onSeed}
      onDecorate={onDecorate}
      who={who}
      days={days}
      sessions={sessions}
      now={now}
      choice={choice}
      skyState={skyState}
      onBack={onBack}
      onChoice={(next) => { saveSkyChoice(next); setChoice(next); }}
      onPickSky={(date, sky) => {
        const next = setMySky(loadReport(), date, sky);
        saveReport(next);
        setDays(next);
      }}
    />
  );
}
