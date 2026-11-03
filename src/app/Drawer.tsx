"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, type Profile, josa } from "@/lib/onboarding";
import { type DayStat, effectiveSky, loadReport, localDate, monthView } from "@/lib/report";
import { Icon } from "./art";
import Buddy from "./Buddy";
import { SkyDot } from "./Report";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

// 왼쪽에서 열리는 메뉴. Tolan 메뉴 구조를 참고하되, 성격 인사이트·먼저 연락하기는 넣지 않았다
// (진단처럼 읽힐 수 있거나, 서버 저장이 필요한 것). 대화량·하늘 같은 숫자는 기기에만 두는 리포트에서 보여 준다.
// 메뉴에는 자주 쓰는 것과 109만 두고, 약관·버전·계정 동작은 같은 패널 안의 설정 화면으로 모은다.

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="ui-press flex h-11 w-full items-center gap-3 rounded-r3 px-3 text-left text-t4 font-medium text-[#1F2A55] hover:bg-[#F2F4F8]"
      >
        <span className="grid size-5 place-items-center text-[#3D4559]">{icon}</span>
        {label}
      </button>
    </li>
  );
}

const chevron = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#8A91A3]">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

/** 설정 화면의 한 줄. 링크·버튼·값 표시를 같은 모양으로 맞춘다. */
function SettingRow({ children, onClick, href, danger, trailing }: { children: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean; trailing?: React.ReactNode }) {
  const className = `flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-t4 ${danger ? "text-[#C42A23]" : "text-[#1F2A55]"}`;
  if (href) return <li><a href={href} className={`ui-press ${className} hover:bg-[#F7F8FB]`}>{children}{trailing}</a></li>;
  if (onClick) return <li><button onClick={onClick} className={`ui-press ${className} hover:bg-[#F7F8FB]`}>{children}{trailing}</button></li>;
  return <li className={className}>{children}{trailing}</li>;
}

/** 메뉴의 리포트 입구. 이 기기의 리포트 숫자로 이번 달 대화한 날과 최근 7일 하늘을 보여 준다. */
function ReportCard({ days, onClick }: { days: DayStat[]; onClick: () => void }) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const talked = monthView(days, now.getFullYear(), month).talked;
  const byDate = new Map(days.map((d) => [d.date, d]));
  const week = Array.from({ length: 7 }, (_, i) => {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i);
    return { at, day: byDate.get(localDate(at.getTime())) };
  });
  const summary = talked ? `${talked}일 이야기했어요` : "이번 달 첫 이야기를 기다려요";
  return (
    <button onClick={onClick} aria-label={`${month}월 리포트 보기, ${summary}`} className="ui-press mt-4 w-full rounded-r4 bg-[#F4F6FB] p-3.5 text-left hover:bg-[#EEF1F8]">
      <span aria-hidden="true" className="flex items-center justify-between text-t2 text-[#5A6478]">{month}월 리포트{chevron}</span>
      <b aria-hidden="true" className="block text-t5 font-bold text-[#1F2A55]">{summary}</b>
      <span aria-hidden="true" className="mt-3 flex justify-between">
        {week.map(({ at, day }, index) => {
          // 위기 표현이 있던 날은 리포트처럼 하늘을 보여 주지 않는다.
          const sky = day && !day.crisis ? effectiveSky(day) : undefined;
          return (
            <span key={index} className="flex flex-col items-center gap-1">
              {sky ? <SkyDot id={sky} size={26} /> : <span className={`grid size-[26px] place-items-center rounded-full ${day ? "bg-white" : "border border-dashed border-[#D5DAE5]"}`}>{day && <i className="size-1.5 rounded-full bg-[#9AA2B5]" />}</span>}
              <span className={`text-t1 ${index === 6 ? "font-bold text-[#1F2A55]" : "text-[#8A91A3]"}`}>{index === 6 ? "오늘" : WEEKDAY[at.getDay()]}</span>
            </span>
          );
        })}
      </span>
    </button>
  );
}

/** 리포트 진입 아이콘. 리포트가 하늘 달력이라 홈 헤더와 메뉴에서 같은 달력 모양을 쓴다. */
export function CalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export default function Drawer({
  open,
  profile,
  onClose,
  onReport,
  onCustomize,
  onHelp,
  onInvite,
  onSignOut,
  onReset,
}: {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onReport: () => void;
  onCustomize: () => void;
  onHelp: () => void;
  onInvite: () => void;
  onSignOut: () => void;
  onReset: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<"menu" | "settings">("menu");
  const [wasOpen, setWasOpen] = useState(false);
  const [days, setDays] = useState<DayStat[]>([]);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDays(loadReport()); // 열 때마다 이 기기의 리포트 숫자를 다시 읽는다
    else setView("menu"); // 닫았다 다시 열면 항상 메뉴부터 보여 준다
  }
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const controls = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
    controls()[0]?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) {
        event.preventDefault(); first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    // 메뉴 ↔ 설정을 오갈 때 바뀐 화면의 첫 버튼으로 포커스를 옮긴다.
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus({ preventScroll: true });
  }, [view, open]);
  const name = profile.companion;
  const tile = COLORS.find((c) => c.id === profile.color)?.light;
  return (
    <div className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-[rgba(20,28,60,.32)] backdrop-blur-[2px] transition-opacity duration-300 ease-enter ${open ? "opacity-100" : "opacity-0"}`} />
      <nav
        ref={panelRef}
        aria-label={view === "settings" ? "설정" : "메뉴"}
        role="dialog"
        aria-modal="true"
        inert={!open}
        className={`absolute inset-y-0 left-0 flex w-[82%] max-w-[340px] flex-col overflow-y-auto rounded-r-r6 px-gutter pt-6 pb-5 shadow-[10px_0_40px_rgba(20,28,60,.15)] transition-transform duration-300 ease-enter ${view === "settings" ? "bg-[#F7F8FB]" : "bg-white"} ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {view === "menu" ? <>
          <div className="flex items-start gap-2">
            <button onClick={onCustomize} aria-label={`${name} 모습·목소리 바꾸기`} className="ui-press flex min-w-0 flex-1 items-center gap-2.5 rounded-r4 p-1.5 pr-2 text-left hover:brightness-[.98]" style={{ background: tile }}>
              <span className="grid size-11 shrink-0 place-items-center rounded-r3 bg-white">
                <Buddy shape={profile.shape} color={profile.color} size={38} look={[0.2, 0.2]} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-t5 font-bold text-[#1F2A55]">{name}</b>
                <span className="text-t2 text-[#5A6478]">모습·목소리 바꾸기</span>
              </span>
              {chevron}
            </button>
            <button onClick={onClose} aria-label="메뉴 닫기" className="ui-press grid size-10 shrink-0 place-items-center rounded-full bg-[#F2F4F8] text-[#3D4559]">
              <Icon name="close" size={18} />
            </button>
          </div>

          <ReportCard days={days} onClick={onReport} />

          <ul className="mt-3 flex flex-col gap-0.5">
            <Row
              onClick={onInvite}
              label="친구 초대"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
                  <circle cx="10" cy="8" r="3.5" />
                  <path d="M3.5 19.5c.8-3.4 3.3-5.5 6.5-5.5 1.5 0 2.9.5 4 1.3M18 13v6M15 16h6" />
                </svg>
              }
            />
            <Row onClick={onHelp} label="도움받기" icon={<Icon name="help" size={20} />} />
          </ul>


          <div className="mt-auto border-t border-[#E6E8EF] pt-2">
            <ul className="flex flex-col gap-0.5">
              <li>
                <a href="tel:109" className="ui-press flex h-11 w-full items-center gap-3 rounded-r3 px-3 text-t4 font-medium text-[#1F2A55] hover:bg-[#FFF3F2]">
                  <span className="grid size-5 place-items-center text-[#C42A23]"><Icon name="phone" size={18} /></span>
                  <span className="flex-1">위급할 때는 <span className="text-[#C42A23]">109</span></span>
                  <span className="text-t2 font-normal text-[#8A91A3]">24시간 전화</span>
                </a>
              </li>
              <li>
                <button onClick={() => setView("settings")} className="ui-press flex h-11 w-full items-center gap-3 rounded-r3 px-3 text-left text-t4 font-medium text-[#1F2A55] hover:bg-[#F2F4F8]">
                  <span className="grid size-5 place-items-center text-[#3D4559]">
                    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
                    </svg>
                  </span>
                  <span className="flex-1">설정</span>
                  {chevron}
                </button>
              </li>
            </ul>
          </div>
        </> : <>
          <div className="flex items-center gap-2">
            <button onClick={() => setView("menu")} aria-label="메뉴로 돌아가기" className="ui-press -ml-1.5 grid size-10 shrink-0 place-items-center rounded-full text-[#1F2A55] hover:bg-[#ECEEF3]">
              <Icon name="back" size={20} />
            </button>
            <h2 className="text-t5 font-bold text-[#1F2A55]">설정</h2>
          </div>

          <ul className="mt-4 overflow-hidden rounded-r3 bg-white">
            {/* 문서가 아직 없어서 링크 자리만 둔다 */}
            <SettingRow href="#" trailing={chevron}>이용약관</SettingRow>
            <SettingRow href="#" trailing={chevron}>개인정보 처리방침</SettingRow>
            <SettingRow trailing={<span className="text-t3 tabular-nums text-[#8A91A3]">0.1.0</span>}>앱 버전</SettingRow>
          </ul>

          <ul className="mt-3 overflow-hidden rounded-r3 bg-white">
            <SettingRow onClick={onSignOut}>로그아웃</SettingRow>
            <SettingRow onClick={onReset} danger>{name} 처음부터 다시 만들기</SettingRow>
          </ul>

          <p className="mt-auto px-2 pt-6 text-t2 text-[#8A91A3]">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
        </>}
      </nav>
    </div>
  );
}
