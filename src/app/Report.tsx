"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type Session, loadLog, loadStoredSessions } from "@/lib/log";
import { COLORS, josa } from "@/lib/onboarding";
import {
  type DayStat,
  type SkyId,
  SKIES,
  applySkyResults,
  dayMessages,
  effectiveSky,
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
import { Icon } from "./art";
import Buddy from "./Buddy";
import { Bubbles, Crisis109, Shell, type Who } from "./Conversation";
import Log from "./Log";
import Sheet from "./Sheet";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAY_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

// 하늘은 색뿐 아니라 모양으로도 구분한다. 시안(R1~R6)과 같은 그림이다.
const SKY_LOOK: Record<SkyId, { tint: string; ink: string; paths: React.ReactNode }> = {
  sunny: { tint: "#FFF1C2", ink: "#B07A00", paths: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2M5.5 5.5l1.6 1.6M16.9 16.9l1.6 1.6M5.5 18.5l1.6-1.6M16.9 7.1l1.6-1.6" /></> },
  cozy: { tint: "#FFE3D3", ink: "#C4572E", paths: <><circle cx="9" cy="9" r="3.4" /><path d="M9 2.6v1.6M2.6 9h1.6M4.5 4.5l1.1 1.1M13.5 4.5l-1.1 1.1" /><path d="M8 19.5h9a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 8.2 13 3.3 3.3 0 0 0 8 19.5Z" /></> },
  cloudy: { tint: "#E6EAF2", ink: "#5B677E", paths: <path d="M7 18.5h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.4A3.4 3.4 0 0 0 7 18.5Z" /> },
  rain: { tint: "#DCE8FF", ink: "#2F62C9", paths: <><path d="M7 14.5h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 14.5Z" /><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" /></> },
  thunder: { tint: "#EAE2FF", ink: "#5E49D8", paths: <><path d="M7 14.5h10a3.6 3.6 0 0 0 .4-7.2 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 14.5Z" /><path d="M12.5 15.5l-2 3.5h3l-2 3.5" /></> },
  wind: { tint: "#DDF4EE", ink: "#0F7A66", paths: <path d="M3 9h11a2.5 2.5 0 1 0-2.5-2.5M3 13h15a2.5 2.5 0 1 1-2.5 2.5M3 17h7" /> },
};

const skyLabel = (id: SkyId) => SKIES.find((s) => s.id === id)?.label ?? "";

function SkyIcon({ id, size = 18 }: { id: SkyId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={SKY_LOOK[id].ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {SKY_LOOK[id].paths}
    </svg>
  );
}

function SkyDot({ id, size = 28 }: { id: SkyId; size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size, background: SKY_LOOK[id].tint }}>
      <SkyIcon id={id} size={Math.round(size * 0.64)} />
    </span>
  );
}

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

const Header = ({ title, back, onBack, headingRef }: { title: string; back: string; onBack: () => void; headingRef?: React.Ref<HTMLHeadingElement> }) => (
  <header className="absolute inset-x-0 top-12 z-10 flex items-center justify-between px-gutter">
    <button onClick={onBack} aria-label={back} className="ui-press grid size-11 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)]">
      <Icon name="back" size={20} />
    </button>
    <h1 ref={headingRef} tabIndex={-1} className="text-t6 font-bold outline-none">{title}</h1>
    <span className="size-11" />
  </header>
);

const card = "rounded-r6 bg-white p-5 shadow-[0_6px_20px_rgba(28,38,80,.07)]";
const AI_NOTE = "하늘은 AI가 그날 내가 한 말을 보고 골랐어요 · 진단이 아니에요 · 눌러서 고칠 수 있어요";

export type ReportViewProps = {
  who: Who;
  days: DayStat[];
  sessions: Session[];
  now: number;
  choice: "on" | "off" | null;
  skyState: "idle" | "picking" | "failed";
  onBack: () => void;
  onPickSky: (date: string, sky: SkyId | undefined) => void;
  onChoice: (choice: "on" | "off") => void;
  onArchive: () => void;
};

/** 리포트 화면(달·하루·하늘 바꾸기). 저장·요청은 하지 않아서 개발 미리보기에서도 그대로 쓴다. */
export function ReportView({ who, days, sessions, now, choice, skyState, onBack, onPickSky, onChoice, onArchive }: ReportViewProps) {
  const months = reportMonths(days, now);
  const [monthIndex, setMonthIndex] = useState(months.length - 1);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnDate = useRef<string | null>(null);
  const deep = COLORS.find((c) => c.id === who.color)?.deep ?? "#6A55E6";

  // 화면이 바뀌면 제목으로, 달 화면으로 돌아오면 누른 날짜로 포커스를 옮긴다.
  useEffect(() => {
    if (openDate) { headingRef.current?.focus({ preventScroll: true }); return; }
    const date = returnDate.current;
    if (!date) return;
    document.querySelector<HTMLButtonElement>(`[data-report-date="${date}"]`)?.focus({ preventScroll: true });
  }, [openDate]);

  if (openDate) {
    const day = days.find((d) => d.date === openDate);
    return (
      <DayView
        who={who}
        date={openDate}
        day={day}
        sessions={sessions}
        today={localDate(now)}
        choice={choice}
        sheet={sheet}
        headingRef={headingRef}
        deep={deep}
        onBack={() => { setSheet(false); setOpenDate(null); }}
        onSheet={setSheet}
        onPickSky={onPickSky}
      />
    );
  }

  const current = months[Math.min(Math.max(monthIndex, 0), months.length - 1)];
  const view = monthView(days, current.year, current.month);
  const enough = view.talked >= 3;
  const first = new Date(current.year, current.month - 1, 1).getDay();
  const length = new Date(current.year, current.month, 0).getDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const byDate = new Map(view.days.map((d) => [d.date, d]));
  const today = localDate(now);
  const maxSky = Math.max(1, ...view.skies.map((s) => s.count));
  const maxBucket = Math.max(1, ...view.buckets.map((b) => b.count));
  const peakBucket = view.buckets.reduce((a, b) => (b.count > a.count ? b : a), view.buckets[0]);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Shell color={who.color} bloom="soft">
      <Header title="리포트" back="처음 화면으로" onBack={onBack} headingRef={headingRef} />
      <div className="absolute inset-x-0 top-28 bottom-0 overflow-y-auto px-gutter pb-10">
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setMonthIndex((i) => Math.max(0, i - 1))} disabled={monthIndex <= 0} aria-label="이전 달" className="ui-press grid size-11 place-items-center rounded-full text-[#1F2A55] disabled:opacity-30">
            <Icon name="back" size={18} />
          </button>
          <h2 aria-live="polite" className="min-w-32 text-center text-t5 font-bold tabular-nums">{current.year}년 {current.month}월</h2>
          <button onClick={() => setMonthIndex((i) => Math.min(months.length - 1, i + 1))} disabled={monthIndex >= months.length - 1} aria-label="다음 달" className="ui-press grid size-11 place-items-center rounded-full text-[#1F2A55] disabled:opacity-30">
            <span className="rotate-180"><Icon name="back" size={18} /></span>
          </button>
        </div>

        <p className="mt-2 flex items-center justify-center gap-2 text-t4 text-[#3D4559]">
          <Buddy shape={who.shape} color={who.color} size={32} look={[0.2, 0.2]} />
          {view.talked ? `${current.month}월엔 ${view.talked}일 이야기했어` : `${current.month}월엔 아직 이야기하지 않았어`}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          {[
            ["대화한 날", view.talked, "일"],
            ["내가 한 말", view.said, "번"],
          ].map(([label, value, unit]) => (
            <div key={label} className="rounded-r5 bg-white px-3 py-4 text-center shadow-[0_4px_16px_rgba(28,38,80,.05)]">
              <dt className="text-t2 text-[#5A6478]">{label}</dt>
              <dd className="mt-1 text-t8 font-bold tabular-nums text-[#1F2A55]">{value}<span className="ml-0.5 text-t3 font-medium">{unit}</span></dd>
            </div>
          ))}
        </dl>

        {choice === null && (
          <section className={`${card} mt-4`} aria-labelledby="report-sky-choice">
            <h3 id="report-sky-choice" className="text-t5 font-bold text-[#1F2A55]">그날 하늘을 AI가 골라 둘까요?</h3>
            <p className="mt-2 text-t3 text-pretty text-[#3D4559]">
              지난 날마다 그날 내가 한 말을 보고 맑음·포근·흐림·비·천둥·바람 중 하나를 골라요. 이때 그날 내가 한 말을 AI 서비스로 한 번 더 보내요. 진단이 아니고, 언제든 직접 고칠 수 있어요.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => onChoice("on")} className="ui-press h-11 flex-1 rounded-full bg-[#1F2A55] text-t4 font-bold text-white">괜찮아요</button>
              <button onClick={() => onChoice("off")} className="ui-press h-11 flex-1 rounded-full bg-[#F2F4F8] text-t4 font-bold text-[#1F2A55]">AI로 고르지 않기</button>
            </div>
          </section>
        )}

        <section className={`${card} mt-4`} aria-labelledby="report-calendar">
          <div className="flex items-baseline justify-between">
            <h3 id="report-calendar" className="text-t5 font-bold text-[#1F2A55]">하늘 달력</h3>
            {skyState === "picking" && <span role="status" className="text-t2 text-[#5A6478]">하늘을 고르는 중…</span>}
            {skyState === "failed" && <span role="status" className="text-t2 text-[#5A6478]">하늘을 다 고르지 못했어요</span>}
          </div>
          <table className="mt-3 w-full table-fixed border-separate border-spacing-y-1 text-center">
            <caption className="sr-only">{current.year}년 {current.month}월 하늘 달력. 날짜를 누르면 그날을 볼 수 있어요.</caption>
            <thead>
              <tr>{WEEKDAY.map((w, i) => <th key={w} scope="col" abbr={WEEKDAY_FULL[i]} className="pb-1 text-t2 font-medium text-[#5A6478]">{w}</th>)}</tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((d, di) => {
                    if (!d) return <td key={di} />;
                    const date = `${current.year}-${pad(current.month)}-${pad(d)}`;
                    const day = byDate.get(date);
                    const sky = day && effectiveSky(day);
                    if (!day) return <td key={di} className={`h-12 align-top text-t3 tabular-nums ${date === today ? "font-bold text-[#1F2A55]" : "text-[#A3AABB]"}`} aria-current={date === today ? "date" : undefined}><span className="inline-grid size-7 place-items-center">{d}</span></td>;
                    const state = day.crisis ? "109 안내가 있었던 날" : sky ? `${skyLabel(sky)}, ${day.mine ? "내가 고친 하늘" : "AI가 고른 하늘"}` : "하늘을 아직 고르지 않음";
                    return (
                      <td key={di} className="h-12 align-top">
                        <button
                          data-report-date={date}
                          onClick={() => { returnDate.current = date; setOpenDate(date); }}
                          aria-current={date === today ? "date" : undefined}
                          aria-label={`${current.month}월 ${d}일 ${WEEKDAY_FULL[di]}, ${state}`}
                          className="ui-press relative mx-auto flex min-h-11 w-full flex-col items-center gap-0.5 rounded-r3 py-0.5"
                        >
                          {day.crisis ? (
                            <span className="grid h-7 place-items-center rounded-full bg-[#FFE8E6] px-1.5 text-t1 font-bold text-[#C42A23]">109</span>
                          ) : sky ? (
                            <SkyDot id={sky} />
                          ) : (
                            <span className="size-7 rounded-full border-[1.5px] border-dashed border-[#B8BFCC]" />
                          )}
                          <span className={`text-t1 tabular-nums ${date === today ? "font-bold" : ""} text-[#3D4559]`}>{d}</span>
                          {day.mine && <span aria-hidden="true" className="absolute top-0 right-1 size-1.5 rounded-full bg-[#1F2A55]" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-t2 text-[#5A6478]">
            <li className="flex items-center gap-1.5"><span aria-hidden="true" className="size-1.5 rounded-full bg-[#1F2A55]" />내가 고친 하늘</li>
            <li className="flex items-center gap-1.5"><span aria-hidden="true" className="rounded-full bg-[#FFE8E6] px-1 text-t1 font-bold text-[#C42A23]">109</span>109 안내가 나왔던 날</li>
          </ul>
          <p className="mt-3 rounded-r3 bg-[#F2F4F8] p-3 text-t2 text-pretty text-[#3D4559]">
            {AI_NOTE}
            {choice === "on" && <><br />하늘을 고를 때 그날 내가 한 말을 AI 서비스로 한 번 더 보내요. 오늘 하늘은 하루가 지나면 골라요.</>}
            {choice === "off" && <><br />AI로 고르기를 꺼 두었어요. 날짜를 눌러 직접 고를 수 있어요. <button onClick={() => onChoice("on")} className="ui-press font-bold text-[#1F2A55] underline underline-offset-4">AI로 고르기 켜기</button></>}
          </p>
        </section>

        {view.skies.length > 0 && (
          <section className={`${card} mt-4`} aria-labelledby="report-skies">
            <h3 id="report-skies" className="text-t5 font-bold text-[#1F2A55]">하늘별 날 수</h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {view.skies.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <SkyDot id={s.id} size={26} />
                  <span className="w-9 text-t3 font-medium text-[#1F2A55]">{s.label}</span>
                  <span aria-hidden="true" className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#F2F4F8]">
                    <span className="block h-full rounded-full" style={{ width: `${(s.count / maxSky) * 100}%`, background: SKY_LOOK[s.id].ink }} />
                  </span>
                  <span className="w-8 text-right text-t3 tabular-nums text-[#3D4559]">{s.count}일</span>
                </li>
              ))}
            </ul>
            {view.noSky > 0 && <p className="mt-3 text-t2 text-[#5A6478]">하늘이 없는 {view.noSky}일은 빼고 셌어요.</p>}
          </section>
        )}

        <section className={`${card} mt-4`} aria-labelledby="report-words">
          <div className="flex items-baseline justify-between">
            <h3 id="report-words" className="text-t5 font-bold text-[#1F2A55]">자주 한 말</h3>
            <span className="text-t2 text-[#5A6478]">이 기기에서만 세요</span>
          </div>
          {enough && view.words.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {view.words.map((w) => (
                <li key={w.word} className="rounded-full bg-[#F2F4F8] px-3 py-2 text-t3 text-[#1F2A55]">
                  {w.word} <span className="tabular-nums text-[#5A6478]">{w.count}번</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-t3 text-[#5A6478]">이야기가 더 쌓이면 자주 한 말을 보여 줄게요.</p>
          )}
          <p className="mt-3 text-t2 text-[#5A6478]">AI에는 보내지 않아요. 단어만 세서 가끔 어색한 말이 나올 수 있어요.</p>
        </section>

        {enough && (
          <section className={`${card} mt-4`} aria-labelledby="report-hours">
            <h3 id="report-hours" className="text-t5 font-bold text-[#1F2A55]">이야기한 시간대</h3>
            <p className="mt-1 text-t2 text-[#5A6478]">내가 말한 때로 셌어요.</p>
            <ul className="mt-4 grid grid-cols-4 items-end gap-3">
              {view.buckets.map((b) => (
                <li key={b.id} className="flex flex-col items-center gap-1.5">
                  <span className="text-t2 tabular-nums text-[#3D4559]">{b.count}번</span>
                  <span aria-hidden="true" className="flex h-20 w-full items-end overflow-hidden rounded-t-r3 bg-[#F2F4F8]">
                    <span className="block w-full rounded-t-r3" style={{ height: `${Math.max(6, (b.count / maxBucket) * 100)}%`, background: b.id === peakBucket.id && b.count ? deep : "#C9CFDB" }} />
                  </span>
                  <span className="text-t3 font-medium text-[#1F2A55]">{b.label}</span>
                </li>
              ))}
            </ul>
            {view.peak !== null && <p className="mt-3 text-t3 text-[#3D4559]">{peakText(view.peak)}</p>}
          </section>
        )}

        <button onClick={onArchive} className="ui-press mt-4 flex min-h-14 w-full items-center justify-between rounded-r5 bg-white px-5 text-left shadow-[0_4px_16px_rgba(28,38,80,.05)]">
          <span className="text-t5 font-bold text-[#1F2A55]">대화 기록 보기 <span className="ml-1 text-t3 font-medium text-[#5A6478]">최근 30일</span></span>
          <span className="rotate-180 text-[#5A6478]"><Icon name="back" size={18} /></span>
        </button>

        <p className="mt-6 flex items-start justify-center gap-text text-t2 text-pretty text-[#5A6478]">
          <Icon name="lock" size={14} />
          대화 원문은 이 기기에 30일, 날짜별 숫자(하늘·자주 한 말 포함)는 최대 1년 남아요. 서버에는 저장하지 않아요.
        </p>
      </div>
    </Shell>
  );
}

function DayView({
  who, date, day, sessions, today, choice, sheet, headingRef, deep, onBack, onSheet, onPickSky,
}: {
  who: Who; date: string; day?: DayStat; sessions: Session[]; today: string; choice: "on" | "off" | null; sheet: boolean;
  headingRef: React.Ref<HTMLHeadingElement>; deep: string; onBack: () => void; onSheet: (open: boolean) => void; onPickSky: (date: string, sky: SkyId | undefined) => void;
}) {
  const { m, d, weekday } = dateParts(date);
  const sky = day && effectiveSky(day);
  const messages = dayMessages(sessions, date);
  const saidTimes = sessions.flatMap((s) => s.messages.filter((msg) => msg.role === "user").map((msg) => msgTime(msg, s))).filter((t) => localDate(t) === date);
  const started = saidTimes.length ? new Date(Math.min(...saidTimes)) : null;
  return (
    <Shell color={who.color} bloom="soft">
      <Header title={`${m}월 ${d}일 ${WEEKDAY_FULL[weekday]}`} back="리포트로" onBack={onBack} headingRef={headingRef} />
      <div className="absolute inset-x-0 top-28 bottom-0 overflow-y-auto px-gutter pb-10">
        <section className={card} aria-label="그날의 하늘">
          {day?.crisis ? (
            <>
              <Crisis109 className="w-full" />
              <p className="mt-3 text-t3 text-pretty text-[#3D4559]">이날은 힘든 이야기가 있어서 하늘을 고르지 않았어요. 대화 내용도 AI에 보내지 않았어요.</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {sky ? <SkyDot id={sky} size={64} /> : <span className="size-16 shrink-0 rounded-full border-2 border-dashed border-[#B8BFCC]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-t2 text-[#5A6478]">그날의 하늘</p>
                  <p className="mt-0.5 flex items-center gap-2 text-t7 font-bold text-[#1F2A55]">
                    {sky ? skyLabel(sky) : "아직 없어요"}
                    {sky && <span className="rounded-full bg-[#F2F4F8] px-2 py-0.5 text-t1 font-bold text-[#5A6478]">{day?.mine ? "내가 고침" : "AI가 고름"}</span>}
                  </p>
                </div>
                <button onClick={() => onSheet(true)} className="ui-press h-11 shrink-0 rounded-full bg-[#F2F4F8] px-4 text-t4 font-bold text-[#1F2A55]">
                  {sky ? "바꾸기" : "직접 고르기"}
                </button>
              </div>
              <p className="mt-4 rounded-r3 bg-[#F2F4F8] p-3 text-t2 text-pretty text-[#3D4559]">
                {sky && day?.mine ? "내가 고친 하늘이에요. " : ""}
                {sky && !day?.mine ? "AI가 그날 내가 한 말을 보고 고른 하늘이에요 · 진단이 아니에요. " : ""}
                {!sky && date >= today && choice === "on" ? "오늘 하늘은 하루가 지나면 AI가 골라 둘게요. " : ""}
                {!sky && day?.ai === "none" ? "이날은 하늘을 고르기 애매해서 비워 뒀어요. " : ""}
                {!sky ? "AI가 고르는 하늘은 진단이 아니에요. " : ""}
                {choice === "off" ? "AI로 고르기를 꺼 두어서 직접 고를 수 있어요." : "하늘을 고를 때 그날 내가 한 말을 AI 서비스로 한 번 더 보내요."}
              </p>
            </>
          )}
        </section>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-r5 bg-white px-4 py-4 shadow-[0_4px_16px_rgba(28,38,80,.05)]">
            <dt className="text-t2 text-[#5A6478]">내가 한 말</dt>
            <dd className="mt-1 text-t7 font-bold tabular-nums text-[#1F2A55]">{day?.said ?? 0}번</dd>
          </div>
          <div className="rounded-r5 bg-white px-4 py-4 shadow-[0_4px_16px_rgba(28,38,80,.05)]">
            <dt className="text-t2 text-[#5A6478]">대화 시작</dt>
            <dd className="mt-1 text-t7 font-bold tabular-nums text-[#1F2A55]">{started ? started.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" }) : "—"}</dd>
          </div>
        </dl>

        <section className={`${card} mt-4`} aria-labelledby="report-day-talk">
          <h2 id="report-day-talk" className="text-t5 font-bold text-[#1F2A55]">그날 대화</h2>
          {messages.length ? (
            <details className="group mt-3">
              <summary className="ui-press flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-r2 text-t4 font-bold text-[#1F2A55] [&::-webkit-details-marker]:hidden">
                대화 보기 · {day?.said ?? 0}번 말함
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="ui-transition group-open:rotate-180">
                  <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </summary>
              <div className="mt-3 rounded-r4 bg-[#F5F7FB] p-3 motion-safe:animate-fade">
                <Bubbles who={who} messages={messages} follow={false} />
              </div>
            </details>
          ) : (
            <p className="mt-3 rounded-r3 bg-[#F2F4F8] p-3 text-t3 text-pretty text-[#3D4559]">30일이 지나 대화 원문은 사라지고 숫자만 남아 있어요.</p>
          )}
        </section>
        <p className="mt-6 text-center text-t1 text-[#5A6478]">{josa(who.name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
      </div>
      {sheet && day && !day.crisis && (
        <SkySheet date={date} day={day} deep={deep} onClose={() => onSheet(false)} onPick={(next) => { onPickSky(date, next); onSheet(false); }} />
      )}
    </Shell>
  );
}

function SkySheet({ date, day, deep, onClose, onPick }: { date: string; day: DayStat; deep: string; onClose: () => void; onPick: (sky: SkyId | undefined) => void }) {
  const [picked, setPicked] = useState<SkyId | undefined>(effectiveSky(day));
  const name = useId();
  const { m, d, weekday } = dateParts(date);
  const ai = day.ai && day.ai !== "none" ? day.ai : undefined;
  return (
    <Sheet
      title="하늘 바꾸기"
      onClose={onClose}
      footer={(
        <div className="flex flex-col gap-2">
          <button onClick={() => onPick(picked)} disabled={!picked || picked === effectiveSky(day)} className="ui-press h-14 w-full rounded-full bg-[#1F2A55] text-t5 font-bold text-white disabled:opacity-40">이 하늘로 바꾸기</button>
          {day.mine && <button onClick={() => onPick(undefined)} className="ui-press h-12 w-full rounded-full bg-[#F2F4F8] text-t4 font-bold text-[#1F2A55]">{ai ? "AI가 고른 하늘로 되돌리기" : "고른 하늘 지우기"}</button>}
        </div>
      )}
    >
      <p className="text-t3 text-pretty text-[#3D4559]">AI가 고른 하늘을 내가 고칠 수 있어요. 고친 하늘을 리포트에 써요. AI가 고른 하늘은 진단이 아니에요.</p>
      <fieldset className="mt-4">
        <legend className="mb-2 text-t3 font-bold text-[#3D4559]">{m}월 {d}일 {WEEKDAY_FULL[weekday]}의 하늘</legend>
        <div className="grid grid-cols-3 gap-2">
          {SKIES.map((s) => (
            <label
              key={s.id}
              className="ui-press relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-r4 bg-[#F5F7FB] has-checked:bg-white has-focus-visible:ring-2 has-focus-visible:ring-[#1E4FE0]/40"
              style={picked === s.id ? { boxShadow: `inset 0 0 0 2px ${deep}` } : undefined}
            >
              <input type="radio" name={name} value={s.id} checked={picked === s.id} onChange={() => setPicked(s.id)} className="sr-only" />
              <SkyDot id={s.id} size={44} />
              <span className="text-t4 font-medium text-[#1F2A55]">{s.label}</span>
              {ai === s.id && <span className="absolute top-1.5 right-1.5 rounded-full bg-white px-1.5 text-t1 font-bold text-[#5A6478] shadow-[0_1px_4px_rgba(28,38,80,.1)]">AI가 고름</span>}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-3 text-t2 text-[#5A6478]">바꾼 하늘은 이 기기에만 남아요.</p>
    </Sheet>
  );
}

/** 리포트: 열 때 원문을 날짜별 숫자로 옮기고, 허락했으면 지난 날 하늘을 한 번에 골라 둔다. */
export default function Report({ who, onBack, accessToken }: { who: Who; onBack: () => void; accessToken: () => Promise<string> }) {
  const [now] = useState(() => Date.now());
  const [sessions, setSessions] = useState<Session[]>(() => loadLog());
  const [days, setDays] = useState<DayStat[]>(() => syncReport(loadStoredSessions(), Date.now(), [who.name]));
  const [choice, setChoice] = useState(() => loadSkyChoice());
  const [skyState, setSkyState] = useState<"idle" | "picking" | "failed">("idle");
  const [archive, setArchive] = useState(false);
  const tokenRef = useRef(accessToken);
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

  if (archive) {
    return <Log who={who} title="대화 기록" back="리포트로" onBack={() => setArchive(false)} onCleared={() => { setSessions([]); setDays([]); }} />;
  }

  return (
    <ReportView
      who={who}
      days={days}
      sessions={sessions}
      now={now}
      choice={choice}
      skyState={skyState}
      onBack={onBack}
      onArchive={() => setArchive(true)}
      onChoice={(next) => { saveSkyChoice(next); setChoice(next); }}
      onPickSky={(date, sky) => {
        const next = setMySky(loadReport(), date, sky);
        saveReport(next);
        setDays(next);
      }}
    />
  );
}
