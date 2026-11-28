"use client";

import { Checkbox, Switch } from "./ui/Controls";
import { Button } from "./ui/Button";
import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import "./drawer-menu.css";
import { type Profile, cleanNickname, josa } from "@/lib/onboarding";
import { TextField } from "./ui/TextField";
import { WITHDRAWAL_GRACE_DAYS } from "@/lib/member-withdrawal";
import { type QuotaStatus, quotaSummary, voiceTimeLeft } from "@/lib/quota-status";
import { Icon } from "./art";
import { getSfxEnabled, setSfxEnabled, subscribeSfx } from "@/lib/sfx";
import { SWIPE_IGNORE_SELECTOR, SWIPE_SETTLE_MS, swipeCloses, swipeOffset, swipeStart } from "@/lib/drawer-swipe";


// Figma 455:209의 메뉴. 동작은 기존 콜백을 유지하고 설정은 같은 패널에서 연다.
/** 메뉴·설정의 한 줄: Framework7 iOS 목록의 링크 줄(ListItem link).
 * List는 바로 아래 자식이 ListItem일 때만 <ul>로 감싸므로, 이 줄을 쓰는 List 안에는 <ul>을 직접 둔다.
 * href="#"은 Framework7이 기본 이동을 막고 라우터로 넘기지 않아서, 누르면 onClick만 실행된다. */
function MenuItem({ icon, title, after, onClick, danger, chevron = true }: { icon?: React.ReactNode; title: string; after?: string; onClick: () => void; danger?: boolean; chevron?: boolean }) {
  return (
    <ListItem
      link="#"
      noChevron={!chevron}
      title={title}
      after={after}
      className={danger ? "here-menu-danger" : undefined}
      onClick={(event: React.MouseEvent) => { event.preventDefault(); onClick(); }}
    >
      {icon && <span slot="media" className="here-menu-icon grid size-5 place-items-center text-cat-ink">{icon}</span>}
    </ListItem>
  );
}

/** 효과음 켬/끔. 이 기기에만 저장한다. 음성 대화 중에는 설정과 상관없이 쉰다.
 * 기존 Switch(키보드·스크린리더 동작 검증됨)를 Framework7 목록 한 줄 모양으로 둔다. */
function SfxRow() {
  const on = useSyncExternalStore(subscribeSfx, getSfxEnabled, () => true);
  return (
    <li>
      <Switch checked={on} onCheckedChange={setSfxEnabled} data-sfx="none" className="here-menu-row flex min-h-[var(--f7-list-item-min-height,44px)] w-full items-center justify-between gap-3 px-4 text-left text-cat-ink">
        <span className="text-t4 font-medium">효과음<span className="ml-2 text-t2 text-cat-muted">버튼·화면 전환</span></span>
      </Switch>
    </li>
  );
}

/** 서버의 실제 남은 횟수. 정상 답변과 진행 중 예약을 반영한다. */
function QuotaLine({ status }: { status: QuotaStatus }) {
  const { chatLeft, voiceLeft, ratio, state } = quotaSummary(status);
  const resetText = "한국 시간 자정에 다시 채워져요";
  const counts = `글 ${chatLeft}번${status.voice ? ` · 음성 오늘 ${voiceTimeLeft(status.voice.day)} · 이번 달 ${voiceTimeLeft(status.voice.month)}` : ` · 음성 ${voiceLeft}번`}`;
  return (
    <div role="group" aria-label={`오늘 남은 대화: ${counts}${state === "out" ? `. 글 대화는 ${resetText}` : ""}`} className="here-menu-quota" data-state={state}>
      <span aria-hidden="true" className="here-menu-quota-track">
        <span className="here-menu-quota-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <p aria-hidden="true" className="here-menu-quota-label"><span>오늘 남은 글 대화</span><b>{chatLeft}번</b></p>
      {status.voice && <>
        <p aria-hidden="true" className="here-menu-quota-label"><span>오늘 남은 음성</span><b>{voiceTimeLeft(status.voice.day)}</b></p>
        <p aria-hidden="true" className="here-menu-quota-label"><span>이번 달 남은 음성</span><b>{voiceTimeLeft(status.voice.month)}</b></p>
      </>}
    </div>
  );
}

/** 리포트(라이브러리) 아이콘. 리포트가 하늘 달력을 담아서 홈 헤더와 메뉴에서 같은 달력 모양을 쓴다. */
export function CalendarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </svg>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

type View = "menu" | "settings" | "name" | "withdraw";
const DEPTH: Record<View, number> = { menu: 0, settings: 1, name: 2, withdraw: 2 };

/** 설정 → 내 이름. 캐릭터 만나기의 이름 단계와 같은 기준(cleanNickname, 12자)으로 고양이가 부를 이름을 바꾼다.
 * onSave는 성공하면 true(설정으로 돌아간다), 실패하면 false. */
function NameView({ current, companion, onBack, onSave }: { current: string; companion: string; onBack: () => void; onSave: (nickname: string) => Promise<boolean> }) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cleaned = cleanNickname(value);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!cleaned) { setError("글자나 숫자로 적어 주세요."); return; }
    if (cleaned === current) { onBack(); return; }
    setBusy(true); setError("");
    const ok = await onSave(cleaned).catch(() => false);
    if (ok) { onBack(); return; }
    setBusy(false); setError("이름을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
  }
  return <>
    <div className="here-settings-header flex items-center gap-2">
      <Button variant="plain" onClick={onBack} disabled={busy} aria-label="설정으로 돌아가기" className="ui-press grid size-10 shrink-0 place-items-center rounded-full text-cat-ink hover:bg-cat-soft">
        <Icon name="back" size={20} />
      </Button>
      <h2 className="text-t5 font-bold text-cat-ink">내 이름</h2>
    </div>
    <form noValidate onSubmit={submit} className="here-withdraw">
      <TextField label="불러 줄 이름" value={value} maxLength={12} autoComplete="nickname" enterKeyHint="done" readOnly={busy}
        onChange={(e) => { setValue(e.target.value); setError(""); }} error={error || undefined}
        help={error ? undefined : `${josa(companion, "이", "가")} 이 이름으로 불러요.`} aria-invalid={error ? true : undefined} />
      <Button type="submit" tone="ink" fullWidth loading={busy} disabled={!value.trim()} className="here-withdraw-submit">저장</Button>
    </form>
  </>;
}

/** 설정 → 회원탈퇴. 무엇이 언제 지워지는지 보여 주고, 확인 칸을 고른 뒤에만 탈퇴할 수 있다.
 * onWithdraw는 성공하면 true(곧 로그아웃되어 환영 화면으로 간다), 실패하면 false. */
function WithdrawView({ name, onBack, onWithdraw }: { name: string; onBack: () => void; onWithdraw: () => Promise<boolean> }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!checked || busy) return;
    setBusy(true); setError("");
    const ok = await onWithdraw().catch(() => false);
    // 성공하면 로그아웃이 이 화면을 닫으므로 버튼을 그대로 진행 중으로 둔다.
    if (!ok) { setBusy(false); setError("탈퇴를 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
  }
  return <>
    <div className="here-settings-header flex items-center gap-2">
      <Button variant="plain" onClick={onBack} disabled={busy} aria-label="설정으로 돌아가기" className="ui-press grid size-10 shrink-0 place-items-center rounded-full text-cat-ink hover:bg-cat-soft">
        <Icon name="back" size={20} />
      </Button>
      <h2 className="text-t5 font-bold text-cat-ink">회원탈퇴</h2>
    </div>
    <div className="here-withdraw">
      <p className="here-withdraw-lead">탈퇴하기 전에 확인해 주세요</p>
      <ul className="here-withdraw-list">
        <li>탈퇴하면 모든 기기에서 바로 로그아웃돼요.</li>
        <li>{WITHDRAWAL_GRACE_DAYS}일 안에 다시 로그인하면 탈퇴를 취소할 수 있어요.</li>
        <li>{WITHDRAWAL_GRACE_DAYS}일이 지나면 탈퇴가 확정되고, 그 뒤 1년 동안은 같은 카카오·구글·이메일 계정으로 다시 로그인하거나 가입할 수 없어요.</li>
        <li>서버에 있는 기억·대화 기록 같은 계정 정보는 탈퇴가 확정된 뒤 1년 동안 보관하고 모두 파기해요. 보관하는 동안 {josa(name, "과", "와")}의 대화에 쓰지 않아요.</li>
        <li>이 기기에 있는 대화 기록과 리포트는 바로 지워요. 탈퇴를 취소해도 돌아오지 않아요.</li>
      </ul>
      <Checkbox label="위 내용을 확인했어요" checked={checked} disabled={busy} onChange={(e) => setChecked(e.target.checked)} className="here-withdraw-check" />
      {error && <p role="alert" className="here-withdraw-error">{error}</p>}
      <Button tone="ink" fullWidth disabled={!checked} loading={busy} onClick={() => { void submit(); }} className="here-withdraw-submit">탈퇴하기</Button>
    </div>
  </>;
}

function MenuIcon({ name }: { name: "library" | "friends" | "help" | "character" | "settings" }) {
  return <Image src={`/menu/${name}.svg`} alt="" width={24} height={24} />;
}

export default function Drawer({
  open,
  profile,
  onClose,
  onLibrary,
  onCustomize,
  onHelp,
  onFriends,
  onSignOut,
  onReset,
  onSaveNickname,
  onWithdraw,
  loadQuota,
}: {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onLibrary: () => void;
  onCustomize: () => void;
  onHelp: () => void;
  onFriends: () => void;
  onSignOut: () => void;
  /** 개발·테스트용 온보딩 다시 보기. 운영에서는 넘기지 않아 줄이 보이지 않는다. */
  onReset?: () => void;
  onSaveNickname: (nickname: string) => Promise<boolean>;
  onWithdraw: () => Promise<boolean>;
  loadQuota?: (signal: AbortSignal) => Promise<QuotaStatus | null>;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [view, setViewState] = useState<View>("menu");
  // 메뉴 → 설정 → 회원탈퇴: 안으로 들어가면 오른쪽에서 들어오고, 돌아가면 왼쪽에서 들어온다.
  const [viewDir, setViewDir] = useState<"forward" | "back" | null>(null);
  const setView = (next: View) => { setViewDir(DEPTH[next] > DEPTH[view] ? "forward" : "back"); setViewState(next); };
  const [wasOpen, setWasOpen] = useState(false);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setViewState("menu"); setViewDir(null); // 닫았다 다시 열면 항상 메뉴부터(움직임 없이) 보여 준다
    }
  }
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // 왼쪽으로 밀어 닫기: 옆으로 10px 넘게 밀면 패널이 손가락을 따라오고, 30% 넘게 밀거나 빠르게 튕기면 닫힌다.
  // 세로로 움직이면 목록 스크롤로 두고, 밀고 난 뒤의 클릭은 메뉴 항목에 전달하지 않는다. 판단 기준은 src/lib/drawer-swipe.ts에 있다.
  const drag = useRef<{ id: number; x: number; y: number; dx: number; at: number; active: boolean } | null>(null);
  const swiped = useRef(false);
  // 밀어 닫은 뒤 패널을 원래 스타일로 되돌리는 타이머. 그 사이에 다시 열면 지운다.
  const settle = useRef<number | undefined>(undefined);
  const swipe = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (!open || event.button !== 0) return;
      // 입력칸에서 글자를 고르느라 옆으로 끄는 건 밀어 닫기로 보지 않는다.
      if (event.target instanceof Element && event.target.closest(SWIPE_IGNORE_SELECTOR)) return;
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, at: performance.now(), active: false };
      swiped.current = false;
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      const panel = panelRef.current;
      if (!d || d.id !== event.pointerId || !panel) return;
      const dx = event.clientX - d.x;
      const dy = event.clientY - d.y;
      if (!d.active) {
        const start = swipeStart(dx, dy);
        if (start === "scroll") { drag.current = null; return; }
        if (start === "wait") return;
        d.active = true;
        swiped.current = true;
        try { panel.setPointerCapture(event.pointerId); } catch { /* 이미 끝난 포인터면 붙잡지 않고 계속 따라간다 */ }
        panel.style.transition = "none";
      }
      d.dx = swipeOffset(dx);
      panel.style.translate = `${d.dx}px 0`;
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      const panel = panelRef.current;
      drag.current = null;
      if (!d?.active || !panel) return;
      // 밀기 바로 뒤의 클릭 한 번만 막고, 그 뒤 키보드·보조기기 동작은 그대로 통과시킨다.
      window.setTimeout(() => { swiped.current = false; }, 0);
      const close = swipeCloses(d.dx, performance.now() - d.at, panel.offsetWidth, event.type !== "pointerup");
      panel.style.transition = "";
      // 닫을 때는 지금 자리에서 끝까지 미끄러져 나가고, 아니면 제자리로 돌아온다.
      panel.style.translate = close ? "-100% 0" : "";
      window.clearTimeout(settle.current);
      if (close) {
        onClose();
        settle.current = window.setTimeout(() => { panel.style.translate = ""; }, SWIPE_SETTLE_MS);
      }
    },
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
  };
  // 밀어 닫은 직후 다시 열면 남아 있는 '-100%' 위치가 열림 스타일(translate-x-0)을 덮어 패널이 화면 밖에 남는다.
  // 열릴 때 타이머를 지우고 위치를 바로 되돌려, 보통 열 때처럼 미끄러져 들어오게 한다.
  useEffect(() => {
    if (!open) return;
    window.clearTimeout(settle.current);
    if (panelRef.current) panelRef.current.style.translate = "";
  }, [open]);
  useEffect(() => () => window.clearTimeout(settle.current), []);
  const loadQuotaRef = useRef(loadQuota);
  useEffect(() => { loadQuotaRef.current = loadQuota; }, [loadQuota]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const controls = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []);
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
    // 열림 스타일과 inert가 반영된 다음 메뉴·설정의 첫 항목으로 포커스를 옮긴다.
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, open]);
  const name = profile.companion;
  return (
    <div className="here-menu-overlay absolute inset-0 z-40" data-open={open} aria-hidden={!open} inert={!open}>
      {/* 메뉴 뒤에는 지금 홈이 그대로 비친다(예전에는 옛 홈 그림을 따로 깔아서 홈 배경이 바뀐 뒤 옛 화면이 보였다). */}
      <div className="here-menu-scrim" aria-hidden="true" />
      <div onClick={onClose} className="here-menu-dismiss absolute inset-0" aria-hidden="true" />
      <nav
        ref={panelRef}
        aria-label={view === "withdraw" ? "회원탈퇴" : view === "name" ? "내 이름" : view === "settings" ? "설정" : "메뉴"}
        role="dialog"
        aria-modal="true"
        inert={!open}
        data-view={view}
        {...swipe}
        onPointerCancel={swipe.onPointerUp}
        className={`here-panel here-drawer here-list-compact absolute inset-y-0 left-0 flex w-[82%] max-w-[340px] flex-col overflow-y-auto rounded-r-r6 px-gutter pt-6 pb-5 transition-transform duration-300 ease-enter ${
          open ? "translate-x-0 shadow-[10px_0_40px_rgba(35,32,27,.12)]" : "-translate-x-full"
        }`}
      >
        <div key={view} className="here-drawer-view" data-view={view} data-dir={viewDir ?? undefined}>
        {view === "menu" ? <>
          <div className="here-menu-primary">
            <List className="here-design-menu-list">
              <ul>
                <MenuItem onClick={onLibrary} title="리포트" icon={<MenuIcon name="library" />} chevron={false} />
                <MenuItem onClick={onFriends} title="친구" icon={<MenuIcon name="friends" />} chevron={false} />
                <MenuItem onClick={onHelp} title="도움받기" icon={<MenuIcon name="help" />} chevron={false} />
              </ul>
            </List>
            <div className="here-menu-divider" aria-hidden="true"><span /></div>
            <List className="here-design-menu-list">
              <ul>
                <MenuItem onClick={onCustomize} title="캐릭터 꾸미기" icon={<MenuIcon name="character" />} chevron={false} />
              </ul>
            </List>
          </div>

          <div className="here-menu-footer">
            <List className="here-design-menu-list">
              <ul>
                <MenuItem onClick={() => setView("settings")} title="설정" icon={<MenuIcon name="settings" />} chevron={false} />
              </ul>
            </List>
            {quota ? <QuotaLine status={quota} /> : <div className="here-menu-quota" aria-hidden="true" />}
          </div>
        </> : view === "withdraw" ? <WithdrawView name={name} onBack={() => setView("settings")} onWithdraw={onWithdraw} />
        : view === "name" ? <NameView current={profile.nickname} companion={name} onBack={() => setView("settings")} onSave={onSaveNickname} /> : <>
          <div className="here-settings-header flex items-center gap-2">
            <Button variant="plain" onClick={() => setView("menu")} aria-label="메뉴로 돌아가기" className="ui-press grid size-10 shrink-0 place-items-center rounded-full text-cat-ink hover:bg-cat-soft">
              <Icon name="back" size={20} />
            </Button>
            <h2 className="text-t5 font-bold text-cat-ink">설정</h2>
          </div>

          <List strong inset className="mt-4">
            <ul>
              <MenuItem onClick={() => setView("name")} title="내 이름" after={profile.nickname || "정하지 않음"} />
            </ul>
          </List>

          <List strong inset dividersIos className="mt-3">
            <ul>
              {/* 문서가 아직 없어서 링크 자리만 둔다 */}
              <MenuItem onClick={() => {}} title="이용약관" />
              <MenuItem onClick={() => {}} title="개인정보 처리방침" />
              <ListItem title="앱 버전" after="0.1.0" />
            </ul>
          </List>

          <List strong inset className="mt-3">
            <ul>
              <SfxRow />
            </ul>
          </List>

          <List strong inset dividersIos className="mt-3">
            <ul>
              <MenuItem onClick={onSignOut} title="로그아웃" chevron={false} />
              {onReset && <MenuItem onClick={onReset} title={`${name} 처음부터 다시 만들기 (개발용)`} danger chevron={false} />}
            </ul>
          </List>

          <p className="here-settings-note mt-auto pt-6 text-t2 text-cat-muted">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
          {/* 회원탈퇴는 눈에 띄지 않게 맨 아래 작은 회색 글자로만 둔다(2026-11-25, 사용자 결정). */}
          <Button variant="plain" onClick={() => setView("withdraw")} className="here-settings-withdraw">회원탈퇴</Button>
        </>}
        </div>
        {/* 화면에는 닫기 버튼을 두지 않는다(바깥 누르기·왼쪽으로 밀기·Escape로 닫는다). 키보드로 포커스하면 나타난다. */}
        <Button variant="plain" onClick={onClose} aria-label="메뉴 닫기" className="here-drawer-close"><Icon name="close" size={18} /></Button>
      </nav>
    </div>
  );
}
