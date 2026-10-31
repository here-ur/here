"use client";

import { useEffect, useRef } from "react";
import { COLORS, type Profile, josa } from "@/lib/onboarding";
import { Icon } from "./art";
import Buddy from "./Buddy";

// 왼쪽에서 열리는 메뉴. Tolan 메뉴 구조를 참고하되, 성격 인사이트·먼저 연락하기·하루 대화량은 넣지 않았다
// (진단처럼 읽힐 수 있거나, 서버 저장이 필요하거나, 아직 정하지 않은 것).

function Row({ icon, label, onClick, current }: { icon: React.ReactNode; label: string; onClick: () => void; current?: boolean }) {
  return (
    <li>
      <button
        onClick={onClick}
        aria-current={current ? "page" : undefined}
        className="ui-press flex h-13 w-full items-center gap-3.5 rounded-r4 px-3.5 text-left text-t5 font-medium text-[#1F2A55] hover:bg-[#F2F4F8] aria-[current=page]:bg-[#F2F4F8]"
      >
        <span className="grid size-6 place-items-center text-[#3D4559]">{icon}</span>
        {label}
      </button>
    </li>
  );
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export default function Drawer({
  open,
  profile,
  onClose,
  onLog,
  onCustomize,
  onHelp,
  onInvite,
  onSignOut,
  onReset,
}: {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onLog: () => void;
  onCustomize: () => void;
  onHelp: () => void;
  onInvite: () => void;
  onSignOut: () => void;
  onReset: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
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
  const name = profile.companion;
  const tile = COLORS.find((c) => c.id === profile.color)?.light;
  return (
    <div className={`absolute inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-[rgba(20,28,60,.32)] backdrop-blur-[2px] transition-opacity duration-300 ease-enter ${open ? "opacity-100" : "opacity-0"}`} />
      <nav
        ref={panelRef}
        aria-label="메뉴"
        role="dialog"
        aria-modal="true"
        inert={!open}
        className={`absolute inset-y-0 left-0 flex w-[82%] max-w-[340px] flex-col overflow-y-auto rounded-r-r6 bg-white px-gutter pt-8 pb-6 shadow-[10px_0_40px_rgba(20,28,60,.15)] transition-transform duration-300 ease-enter ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 px-1.5">
            <span className="grid size-14 place-items-center rounded-r4" style={{ background: tile }}>
              <Buddy shape={profile.shape} color={profile.color} size={50} look={[0.2, 0.2]} />
            </span>
            <span>
              <b className="block text-t6 font-bold tracking-[-0.02em]">{name}</b>
              <span className="text-t3 text-[#5A6478]">{profile.nickname ? `${profile.nickname}님의 ${name}` : `나의 ${name}`}</span>
            </span>
          </div>
          <button onClick={onClose} aria-label="메뉴 닫기" className="ui-press grid size-11 shrink-0 place-items-center rounded-full bg-[#F2F4F8] text-[#3D4559]">
            <Icon name="close" size={18} />
          </button>
        </div>

        <ul className="mt-7 flex flex-col gap-1">
          <Row
            current
            onClick={onClose}
            label="홈"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
                <path d="M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
              </svg>
            }
          />
          <Row
            onClick={onLog}
            label="내 기록"
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
                <path d="M3.6 12.2A8.5 8.5 0 1 0 6.2 5.9" />
                <path d="M3.4 4.6v4h4" />
                <path d="M12 7.6V12l3 2" />
              </svg>
            }
          />
          <Row
            onClick={onCustomize}
            label={`${name} 바꾸기`}
            icon={
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
                <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9z" />
                <path d="M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
              </svg>
            }
          />
          <Row onClick={onHelp} label="도움받기" icon={<Icon name="help" size={22} />} />
          <Row onClick={onInvite} label="친구 초대" icon={<span aria-hidden="true" className="text-2xl leading-none">＋</span>} />
        </ul>

        <a href="tel:109" className="ui-press mt-6 flex items-center justify-between gap-3 rounded-r5 bg-[#FFF3F2] p-4 ring-1 ring-[#F2B8B3] ring-inset">
          <span>
            <b className="block text-t5 font-bold text-[#111318]">
              위급할 때는 <span className="text-[#C42A23]">109</span>
            </b>
            <span className="text-t2 text-[#55525F]">24시간 사람과 이야기할 수 있어요</span>
          </span>
          <span className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-[#C42A23] px-3.5 text-sm font-bold text-white">
            <Icon name="phone" size={16} />
            전화
          </span>
        </a>

        <div className="mt-auto flex flex-col gap-3 px-2 pt-6 text-t3 text-[#5A6478]">
          <p className="flex gap-3">
            {/* 문서가 아직 없어서 링크 자리만 둔다 */}
            <a href="#" className="underline-offset-4 hover:underline">
              이용약관
            </a>
            <a href="#" className="underline-offset-4 hover:underline">
              개인정보 처리방침
            </a>
          </p>
          <p>{josa(name, "은", "는")} AI예요 · 진단과 치료는 전문가가 해요</p>
          <div className="flex items-center justify-between">
            <span>버전 0.1.0</span>
            <button onClick={onReset} className="ui-press h-11 font-medium text-[#3D4559] underline underline-offset-4">
              처음부터 다시 하기
            </button>
          </div>
          <button onClick={onSignOut} className="ui-press self-start py-2 text-sm font-medium text-[#5A6478] underline underline-offset-4">로그아웃</button>
        </div>
      </nav>
    </div>
  );
}
