"use client";

import { ListRow, Switch } from "./ui/Controls";
import { Button } from "./ui/Button";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type Profile, josa } from "@/lib/onboarding";
import { companionBackground } from "@/lib/companion-theme";
import { type QuotaStatus, quotaSummary } from "@/lib/quota-status";
import { type DayStat, effectiveSky, loadReport, localDate, monthView } from "@/lib/report";
import { Icon } from "./art";
import Buddy from "./Buddy";
import { SkyDot } from "./sky";
import { getSfxEnabled, setSfxEnabled, subscribeSfx } from "@/lib/sfx";


// 왼쪽에서 열리는 메뉴. Tolan 메뉴 구조를 참고하되, 성격 인사이트·먼저 연락하기는 넣지 않았다
// (진단처럼 읽힐 수 있거나, 서버 저장이 필요한 것). 대화량·하늘 같은 숫자는 기기에만 두는 리포트에서 보여 준다.
// 메뉴에는 자주 쓰는 것만 두고, 약관·버전·계정 동작은 같은 패널 안의 설정 화면으로 모은다.

function Row({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <li>
      <ListRow
        onClick={onClick}
        className="ui-press flex h-11 w-full items-center gap-3 rounded-r3 px-3 text-left text-t4 font-medium text-cat-ink hover:bg-cat-soft"
      >
        <span className="grid size-5 place-items-center">{icon}</span>
        {label}
      </ListRow>
    </li>
  );
}

const chevron = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-cat-muted">
    <path d="m9 6 6 6-6 6" />
  </svg>
);

/** 설정 화면의 한 줄. 링크·버튼·값 표시를 같은 모양으로 맞춘다. */
function SettingRow({ children, onClick, href, danger, trailing }: { children: React.ReactNode; onClick?: () => void; href?: string; danger?: boolean; trailing?: React.ReactNode }) {
  const className = `flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-t4 ${danger ? "text-[#C42A23]" : "text-cat-ink"}`;
  if (href) return <li><a href={href} className={`ui-press ${className} hover:bg-cat-paper`}>{children}{trailing}</a></li>;
  if (onClick) return <li><Button variant="plain" onClick={onClick} className={`ui-press ${className} hover:bg-cat-paper`}>{children}{trailing}</Button></li>;
  return <li className={className}>{children}{trailing}</li>;
}

/** 효과음 켬/끔. 이 기기에만 저장한다. 음성 대화 중에는 설정과 상관없이 쉰다. */
function SfxRow() {
  const on = useSyncExternalStore(subscribeSfx, getSfxEnabled, () => true);
  return (
    <li>
      <Switch checked={on} onCheckedChange={setSfxEnabled} data-sfx="none" className="ui-press flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-t4 text-cat-ink hover:bg-cat-paper">
        <span>효과음<span className="ml-2 text-t2 text-cat-muted">버튼·화면 전환</span></span>
      </Switch>
    </li>
  );
}

/** 내가 고른 몽글이의 프로필. 처음 이야기한 날부터 며칠째인지는 이 기기의 기록으로만 센다. */
function ProfileCard({ profile, days }: { profile: Profile; days: DayStat[] }) {
  const first = days.reduce<string | null>((min, d) => (min === null || d.date < min ? d.date : min), null);
  const together = first ? Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(`${first}T00:00:00`).getTime()) / 86_400_000) + 1 : null;
  return (
    <div className="mt-3 flex items-center gap-3 px-1">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: companionBackground(profile.color) }}>
        <Buddy shape={profile.shape} color={profile.color} accessory={profile.accessory} size={36} look={[0.15, 0.1]} bob />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-t4 font-bold text-cat-ink">{profile.companion}</b>
        <span className="block truncate text-t2 text-cat-muted">
          {profile.nickname ? `${profile.nickname}님의 ` : ""}AI 이야기 친구{together && <span style={{ color: "var(--color-cat-accent)" }}> · 함께한 지 {together}일째</span>}
        </span>
      </span>
    </div>
  );
}

/** 메뉴의 라이브러리 입구. 이 기기의 숫자로 이번 달 대화한 날과 최근 7일 하늘을 보여 준다. */
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
    <Button variant="plain" onClick={onClick} aria-label={`${month}월 라이브러리 보기, ${summary}`} className="ui-press relative mt-4 flex w-full flex-wrap items-center gap-x-3 gap-y-3 rounded-r4 bg-cat-soft p-4 text-left hover:bg-cat-line">
      <span aria-hidden="true" className="min-w-0 flex-1">
        <span className="block text-t1 text-cat-muted">{month}월 하늘</span>
        <b className="block truncate text-t3 font-bold text-cat-ink">{talked ? `${talked}일 이야기했어요` : "첫 이야기를 기다려요"}</b>
      </span>
      {/* 최근 7일. 맨 오른쪽이 오늘이고, 위기 표현이 있던 날은 하늘을 보여 주지 않는다. */}
      <span aria-hidden="true" className="flex w-full items-center gap-2">
        {week.map(({ day }, index) => {
          const sky = day && !day.crisis ? effectiveSky(day) : undefined;
          const today = index === 6 ? "ring-[1.5px] ring-cat-ink/30 ring-offset-1 ring-offset-cat-soft" : "";
          return sky
            ? <span key={index} className={`rounded-full ${today}`}><SkyDot id={sky} size={18} /></span>
            : <span key={index} className={`grid size-[18px] place-items-center rounded-full ${day ? "bg-cat-surface" : "border border-dashed border-cat-line"} ${today}`}>{day && <i className="size-1 rounded-full bg-cat-muted" />}</span>;
        })}
      </span>
      <span className="absolute top-4 right-3">{chevron}</span>
    </Button>
  );
}

/** 오늘 남은 대화량 한 줄. 평소엔 조용히, 적게 남으면 주황으로, 다 쓰면 다시 채워지는 시각을 알려 준다. */
function QuotaLine({ status }: { status: QuotaStatus }) {
  const { chatLeft, voiceLeft, ratio, state } = quotaSummary(status);
  const reset = new Date(status.resetAt * 1000);
  const resetText = `${reset.getHours() < 12 ? "오전" : "오후"} ${reset.getHours() % 12 || 12}시${reset.getMinutes() ? ` ${reset.getMinutes()}분` : ""}에 다시 채워져요`;
  const counts = `글 ${chatLeft}번 · 음성 ${voiceLeft}번`;
  return (
    <div role="group" aria-label={state === "out" ? `오늘 대화를 다 했어요. ${resetText}` : `오늘 남은 대화: ${counts}`} className="px-3 pt-2 pb-2">
      <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-cat-soft">
        <span className="block h-full rounded-full transition-[width] duration-[var(--seed-duration-d6)]" style={{ width: `${Math.round(ratio * 100)}%`, background: state === "low" ? "#E8A23C" : "var(--color-cat-ink)" }} />
      </span>
      <p aria-hidden="true" className={`mt-1.5 text-t1 tabular-nums ${state === "low" ? "text-[#B06A00]" : "text-cat-muted"}`}>
        {state === "out" ? `오늘 대화를 다 했어요 · ${resetText}` : `오늘 남은 대화 · ${counts}`}
      </p>
    </div>
  );
}

/** 라이브러리 아이콘. 라이브러리가 하늘 달력을 담아서 홈 헤더와 메뉴에서 같은 달력 모양을 쓴다. */
export function CalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

// 메뉴 아이콘은 모두 20px·선 굵기 1.7·글자와 같은 색으로 맞춰 글자 굵기(500)와 무게를 같게 한다.
const menuIcon = (paths: React.ReactNode) => <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>{paths}</svg>;
const ICONS = {
  insight: menuIcon(<><path d="M9.5 17.5h5M10.25 20.5h3.5" /><path d="M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6v.5h5V15c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 3.5Z" /></>),
  library: menuIcon(<><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>),
  friends: menuIcon(<><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.4c1.6.7 2.6 2.3 3 4.6" /></>),
  help: menuIcon(<><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8.5L4 21.5v-10a7.5 7.5 0 0 1 16 0Z" /><path d="M8.5 10.5h7M8.5 14h4.5" /></>),
  // 반쯤 감긴 눈과 뾰족한 귀를 가진 고양이
  character: menuIcon(<><path d="M5 10 4 3.5 9 6h6l5-2.5-1 6.5a7.8 7.8 0 0 1 1.5 4.5c0 4-3.8 6-8.5 6s-8.5-2-8.5-6A7.8 7.8 0 0 1 5 10Z" /><path d="M7 12h3M14 12h3M8.5 12v1M15.5 12v1" /></>),
  settings: menuIcon(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>),
};

export default function Drawer({
  open,
  profile,
  onClose,
  onInsight,
  onLibrary,
  onCustomize,
  onHelp,
  onFriends,
  onSignOut,
  onReset,
  loadQuota,
}: {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onInsight: () => void;
  onLibrary: () => void;
  onCustomize: () => void;
  onHelp: () => void;
  onFriends: () => void;
  onSignOut: () => void;
  onReset: () => void;
  loadQuota?: (signal: AbortSignal) => Promise<QuotaStatus | null>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<"menu" | "settings">("menu");
  const [wasOpen, setWasOpen] = useState(false);
  const [days, setDays] = useState<DayStat[]>([]);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDays(loadReport()); // 열 때마다 이 기기의 리포트 숫자를 다시 읽는다
    else setView("menu"); // 닫았다 다시 열면 항상 메뉴부터 보여 준다
  }
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const loadQuotaRef = useRef(loadQuota);
  useEffect(() => { loadQuotaRef.current = loadQuota; }, [loadQuota]);
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
    // 열 때마다 서버에서 오늘 남은 대화량을 새로 읽는다. 실패하면 줄을 감춘다.
    const load = loadQuotaRef.current;
    if (!open || !load) return;
    const controller = new AbortController();
    load(controller.signal).then((next) => { if (!controller.signal.aborted) setQuota(next); }, () => {});
    return () => controller.abort();
  }, [open]);
  useEffect(() => {
    // 메뉴 ↔ 설정을 오갈 때 바뀐 화면의 첫 버튼으로 포커스를 옮긴다.
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus({ preventScroll: true });
  }, [view, open]);
  const name = profile.companion;
  return (
    <div className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 here-panel-backdrop transition-opacity duration-300 ease-enter ${open ? "opacity-100" : "opacity-0"}`} />
      <nav
        ref={panelRef}
        aria-label={view === "settings" ? "설정" : "메뉴"}
        role="dialog"
        aria-modal="true"
        inert={!open}
        className={`here-panel absolute inset-y-0 left-0 flex w-[82%] max-w-[340px] flex-col overflow-y-auto rounded-r-r6 px-gutter pt-6 pb-5 transition-transform duration-300 ease-enter ${
          open ? "translate-x-0 shadow-[10px_0_40px_rgba(35,32,27,.12)]" : "-translate-x-full"
        }`}
      >
        {view === "menu" ? <>
          <div className="flex items-center justify-between pl-3">
            <span className="home-wordmark" aria-label="Here!">here<span aria-hidden="true">!</span></span>
            <Button variant="plain" onClick={onClose} aria-label="메뉴 닫기" className="ui-press grid size-10 shrink-0 place-items-center rounded-full bg-cat-soft text-cat-ink">
              <Icon name="close" size={18} />
            </Button>
          </div>

          <ProfileCard profile={profile} days={days} />

          <ReportCard days={days} onClick={onLibrary} />

          <ul className="mt-3 flex flex-col gap-0.5">
            <Row onClick={onInsight} label="구름 정원" icon={ICONS.insight} />
            <Row onClick={onLibrary} label="라이브러리" icon={ICONS.library} />
            <Row onClick={onFriends} label="친구" icon={ICONS.friends} />
            <Row onClick={onHelp} label="도움받기" icon={ICONS.help} />
            <li role="separator" aria-hidden="true" className="my-1.5 ml-3 h-px w-1/3 bg-cat-line" />
            <Row onClick={onCustomize} label="캐릭터" icon={ICONS.character} />
          </ul>


          <div className="mt-auto border-t border-cat-line pt-2">
            {quota && <QuotaLine status={quota} />}
            <ul className="flex flex-col gap-0.5">
              <li>
                <Button variant="plain" onClick={() => setView("settings")} className="ui-press flex h-11 w-full items-center gap-3 rounded-r3 px-3 text-left text-t4 font-medium text-cat-ink hover:bg-cat-soft">
                  <span className="grid size-5 place-items-center">{ICONS.settings}</span>
                  <span className="flex-1">설정</span>
                  {chevron}
                </Button>
              </li>
            </ul>
          </div>
        </> : <>
          <div className="flex items-center gap-2">
            <Button variant="plain" onClick={() => setView("menu")} aria-label="메뉴로 돌아가기" className="ui-press -ml-1.5 grid size-10 shrink-0 place-items-center rounded-full text-cat-ink hover:bg-cat-soft">
              <Icon name="back" size={20} />
            </Button>
            <h2 className="text-t5 font-bold text-cat-ink">설정</h2>
          </div>

          <ul className="mt-4 overflow-hidden rounded-r3 bg-cat-surface">
            {/* 문서가 아직 없어서 링크 자리만 둔다 */}
            <SettingRow href="#" trailing={chevron}>이용약관</SettingRow>
            <SettingRow href="#" trailing={chevron}>개인정보 처리방침</SettingRow>
            <SettingRow trailing={<span className="text-t3 tabular-nums text-cat-muted">0.1.0</span>}>앱 버전</SettingRow>
          </ul>

          <ul className="mt-3 overflow-hidden rounded-r3 bg-cat-surface">
            <SfxRow />
          </ul>

          <ul className="mt-3 overflow-hidden rounded-r3 bg-cat-surface">
            <SettingRow onClick={onSignOut}>로그아웃</SettingRow>
            <SettingRow onClick={onReset} danger>{name} 처음부터 다시 만들기</SettingRow>
          </ul>

          <p className="mt-auto px-2 pt-6 text-t2 text-cat-muted">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
        </>}
      </nav>
    </div>
  );
}
