"use client";

import { Switch } from "./ui/Controls";
import { Button } from "./ui/Button";
import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import "./drawer-menu.css";
import { type Profile, josa } from "@/lib/onboarding";
import { type QuotaStatus, quotaSummary } from "@/lib/quota-status";
import { Icon } from "./art";
import PasswordSetup from "./PasswordSetup";
import { getSfxEnabled, setSfxEnabled, subscribeSfx } from "@/lib/sfx";


// Figma 455:209의 메뉴. 동작은 기존 콜백을 유지하고 설정은 같은 패널에서 연다.
/** 메뉴·설정의 한 줄: Framework7 iOS 목록의 링크 줄(ListItem link).
 * List는 바로 아래 자식이 ListItem일 때만 <ul>로 감싸므로, 이 줄을 쓰는 List 안에는 <ul>을 직접 둔다.
 * href="#"은 Framework7이 기본 이동을 막고 라우터로 넘기지 않아서, 누르면 onClick만 실행된다. */
function MenuItem({ icon, title, onClick, danger, chevron = true }: { icon?: React.ReactNode; title: string; onClick: () => void; danger?: boolean; chevron?: boolean }) {
  return (
    <ListItem
      link="#"
      noChevron={!chevron}
      title={title}
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

/** 서버의 실제 남은 횟수. 디자인의 200번은 예시이며 계정 값을 고정하지 않는다. */
function QuotaLine({ status }: { status: QuotaStatus }) {
  const { chatLeft, voiceLeft, ratio, state } = quotaSummary(status);
  const reset = new Date(status.resetAt * 1000);
  const resetText = `${reset.getHours() < 12 ? "오전" : "오후"} ${reset.getHours() % 12 || 12}시${reset.getMinutes() ? ` ${reset.getMinutes()}분` : ""}에 다시 채워져요`;
  const counts = `글 ${chatLeft}번 · 음성 ${voiceLeft}번`;
  return (
    <div role="group" aria-label={`오늘 남은 대화: ${counts}${state === "out" ? `. 글 대화는 ${resetText}` : ""}`} className="here-menu-quota" data-state={state}>
      <span aria-hidden="true" className="here-menu-quota-track">
        <span className="here-menu-quota-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <p aria-hidden="true" className="here-menu-quota-label"><span>오늘 남은 대화</span><b>{chatLeft}번</b></p>
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

function MenuIcon({ name }: { name: "garden" | "library" | "friends" | "help" | "character" | "settings" }) {
  return <Image src={`/menu/${name}.svg`} alt="" width={24} height={24} />;
}

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
  allowPasswordSetup,
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
  allowPasswordSetup?: boolean;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const [view, setView] = useState<"menu" | "settings">("menu");
  const [wasOpen, setWasOpen] = useState(false);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [passwordView, setPasswordView] = useState<"closed" | "form" | "saved">("closed");
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setView("menu"); // 닫았다 다시 열면 항상 메뉴부터 보여 준다
      setPasswordView("closed");
    }
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
      <div className="here-menu-artwork" aria-hidden="true">
        <div className="here-menu-background"><Image src="/menu/sunlit-background.png" alt="" fill sizes="(max-width: 430px) 142vw, 611px" unoptimized /></div>
        <div className="here-menu-topShade" />
        <div className="here-menu-cat"><Image src="/home/main-cat.png" alt="" fill sizes="(max-width: 430px) 196vw, 843px" unoptimized /></div>
      </div>
      <div onClick={onClose} className="here-menu-dismiss absolute inset-0" aria-hidden="true" />
      <nav
        ref={panelRef}
        aria-label={view === "settings" ? "설정" : "메뉴"}
        role="dialog"
        aria-modal="true"
        inert={!open}
        data-view={view}
        className={`here-panel here-drawer here-list-compact absolute inset-y-0 left-0 flex w-[82%] max-w-[340px] flex-col overflow-y-auto rounded-r-r6 px-gutter pt-6 pb-5 transition-transform duration-300 ease-enter ${
          open ? "translate-x-0 shadow-[10px_0_40px_rgba(35,32,27,.12)]" : "-translate-x-full"
        }`}
      >
        {view === "menu" ? <>
          <div className="here-menu-primary">
            <List className="here-design-menu-list">
              <ul>
                <MenuItem onClick={onInsight} title="구름 정원" icon={<MenuIcon name="garden" />} chevron={false} />
                <MenuItem onClick={onLibrary} title="라이브러리" icon={<MenuIcon name="library" />} chevron={false} />
                <MenuItem onClick={onFriends} title="친구" icon={<MenuIcon name="friends" />} chevron={false} />
                <MenuItem onClick={onHelp} title="도움받기" icon={<MenuIcon name="help" />} chevron={false} />
              </ul>
            </List>
            <div className="here-menu-divider" aria-hidden="true"><span /></div>
            <List className="here-design-menu-list">
              <ul>
                <MenuItem onClick={onCustomize} title="캐릭터" icon={<MenuIcon name="character" />} chevron={false} />
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
        </> : <>
          <div className="flex items-center gap-2">
            <Button variant="plain" onClick={() => { setPasswordView("closed"); setView("menu"); }} aria-label="메뉴로 돌아가기" className="ui-press -ml-1.5 grid size-10 shrink-0 place-items-center rounded-full text-cat-ink hover:bg-cat-soft">
              <Icon name="back" size={20} />
            </Button>
            <h2 className="text-t5 font-bold text-cat-ink">설정</h2>
          </div>

          <List strong inset dividersIos className="mt-4">
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
              {allowPasswordSetup && <MenuItem onClick={() => setPasswordView("form")} title="비밀번호 설정" />}
              <MenuItem onClick={onSignOut} title="로그아웃" chevron={false} />
              <MenuItem onClick={onReset} title={`${name} 처음부터 다시 만들기`} danger chevron={false} />
            </ul>
          </List>
          {passwordView === "form" && <div className="mt-3 px-2">
            <p className="mb-3 text-t3 text-cat-muted">8자 이상으로 설정하면 다음 로그인부터 문자 없이 들어올 수 있어요.</p>
            <PasswordSetup onSaved={() => setPasswordView("saved")} />
          </div>}
          {passwordView === "saved" && <p role="status" className="mt-3 px-2 text-t3">비밀번호를 저장했어요.</p>}

          <p className="mt-auto px-2 pt-6 text-t2 text-cat-muted">{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
        </>}
        <Button variant="plain" onClick={onClose} aria-label="메뉴 닫기" className="here-drawer-close"><Icon name="close" size={18} /></Button>
      </nav>
    </div>
  );
}
