"use client";

import { Badge } from "./ui/Controls";
import { Button } from "./ui/Button";
import { useState } from "react";
import { COLORS, type ColorId } from "@/lib/onboarding";
import { type Practice, type PracticeKind, type WeekCheck } from "@/lib/practice";
import type { Who } from "./Conversation";
import Buddy from "./Buddy";
import { Icon } from "./art";
import Sheet from "./Sheet";
import "./practice.css";

// 대화 뒤 "해 볼 만한 작은 것" 시안. 제안은 날짜로 돌려 보여 줄 뿐 대화 내용으로 고르지 않고,
// 안 해도 아무 불이익이 없다. 체크는 이 기기에만 남는다. 목록·문구·시점은 팀이 정하기 전 임시값이다.

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function KindIcon({ kind, size = 22 }: { kind: PracticeKind; size?: number }) {
  const body = (() => {
    switch (kind) {
      case "breath": return <><path d="M4 9.5h9a2.5 2.5 0 1 0-2.5-2.5" /><path d="M4 14h12a2.8 2.8 0 1 1-2.8 2.8" /><path d="M4 18.5h5" /></>;
      case "write": return <><path d="m14.5 5 4.5 4.5L9 19.5H4.5V15Z" /><path d="m12.5 7 4.5 4.5" /></>;
      case "body": return <><path d="M12 3.5s6 6.3 6 10.4a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5Z" /></>;
      case "rest": return <><rect x="4" y="4.5" width="16" height="15" rx="2.5" /><path d="M4 12h16M12 4.5v15" /></>;
      default: return <><path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20Z" /></>;
    }
  })();
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{body}</svg>;
}

/** 홈 기본 상태에서 작게 보이는 형태. 오늘 것 몇 장을 옆으로 넘겨 보고, 한 것은 체크로 표시한다. */
export function PracticeMini({ practices, doneIds, onOpen }: { practices: Practice[]; doneIds: Set<string>; onOpen: (practice: Practice) => void }) {
  const remaining = practices.filter((p) => !doneIds.has(p.id)).length;
  return (
    <section aria-label="오늘 해 볼 만한 것" className="motion-safe:animate-screen-in">
      <div className="flex items-center justify-between px-1">
        <p className="text-t2 font-medium text-ios-secondary">오늘 해 볼 만한 것</p>
        <Badge className="tabular-nums">{remaining ? `${remaining}개 남음` : "오늘은 다 했어요"}</Badge>
      </div>
      <div className="practice-rail" role="list">
        {practices.map((p) => {
          const done = doneIds.has(p.id);
          return (
            <Button variant="plain" key={p.id} type="button" role="listitem" onClick={() => onOpen(p)} aria-label={`${p.title}, ${p.minutes}분${done ? ", 했어요" : ""}`} className="practice-chip ui-press flex h-14 items-center gap-3 rounded-r4 border border-white/70 bg-white/72 px-3.5 text-left shadow-[0_6px_18px_rgba(28,38,80,.06)] backdrop-blur-md">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${done ? "bg-[#1F2A55] text-white" : "bg-ios-group text-[#3D4559]"}`}>{done ? <Check /> : <KindIcon kind={p.kind} size={18} />}</span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-t4 font-medium ${done ? "text-ios-secondary line-through decoration-[#C5CAD6]" : "text-[#1F2A55]"}`}>{p.title}</span>
                <span className="block text-t1 text-ios-secondary">{p.minutes}분</span>
              </span>
            </Button>
          );
        })}
      </div>
    </section>
  );
}

function Check({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5.5 12.5 4 4 9-9" /></svg>;
}

/** 대화를 마친 뒤 홈에 한 장 보여 주는 카드. 하기·나중에·닫기. */
export function PracticeCard({ practice, name, onDo, onLater, onClose }: { practice: Practice; name: string; onDo: () => void; onLater: () => void; onClose: () => void }) {
  return (
    <section aria-labelledby="practice-card-title" className="rounded-r5 border border-white/70 bg-white/92 p-4 shadow-[0_10px_32px_rgba(28,38,80,.12)] backdrop-blur-md motion-safe:animate-rise">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ios-group text-[#1F2A55]"><KindIcon kind={practice.kind} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-t1 text-ios-secondary">{name}와 이야기한 뒤 해 볼 만한 작은 것</p>
          <h2 id="practice-card-title" className="mt-0.5 text-t5 font-bold text-[#1F2A55]">{practice.title}</h2>
          <p className="mt-0.5 text-t2 text-ios-secondary">{practice.minutes}분 · 안 해도 괜찮아요</p>
        </div>
        <Button variant="plain" type="button" onClick={onClose} aria-label="이 제안 닫기" className="ui-press -mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-full text-ios-secondary"><Icon name="close" size={18} /></Button>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" onClick={onDo} tone="neutral" size="medium" className="flex-1">해 볼게요</Button>
        <Button type="button" onClick={onLater} tone="neutral" variant="tonal" size="medium">나중에</Button>
      </div>
    </section>
  );
}

/** 하기를 누르면 열리는 시트. 숨 고르기는 원이 숨 쉬고, 나머지는 짧은 단계만 보여 준다. */
export function PracticeSheet({ practice, color, done, onDone, onClose }: { practice: Practice; color: ColorId; done: boolean; onDone: () => void; onClose: () => void }) {
  const c = COLORS.find((x) => x.id === color) ?? COLORS[0];
  return (
    <Sheet
      title={practice.title}
      onClose={onClose}
      footer={done
        ? <Button variant="plain" type="button" onClick={onClose} className="ui-press h-14 w-full rounded-full bg-ios-group text-t5 font-bold text-[#1F2A55]">닫기</Button>
        : <div className="flex flex-col gap-2">
          <Button type="button" onClick={onDone} data-sfx="success" tone="neutral" fullWidth>다 했어요</Button>
          <Button variant="plain" type="button" onClick={onClose} className="ui-press h-11 w-full rounded-full text-t4 font-medium text-ios-secondary">다음에 할게요</Button>
        </div>}
    >
      <p className="mt-1 text-t2 text-ios-secondary">{practice.minutes}분 · 안 해도 괜찮아요</p>
      {practice.kind === "breath" && (
        <div className="relative mx-auto mt-6 grid h-40 place-items-center" aria-hidden="true">
          <div className="breath-ring" style={{ "--breath-base": c.base, "--breath-light": c.light } as React.CSSProperties} />
          <div className="absolute inset-0 grid place-items-center text-t4 font-bold text-[#1F2A55]">
            <span className="breath-in col-start-1 row-start-1">들이쉬고</span>
            <span className="breath-out col-start-1 row-start-1">내쉬어요</span>
          </div>
        </div>
      )}
      <ol className="mt-5 flex flex-col gap-2.5">
        {practice.steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3 text-t4 text-[#1F2A55]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ios-group text-t1 font-bold tabular-nums text-ios-secondary">{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>
      {done && <p role="status" className="practice-done-pop mt-5 rounded-r3 bg-ios-group px-4 py-3 text-center text-t4 font-medium text-[#1F2A55]">오늘 한 번 했어요 ✓</p>}
      <p className="mt-5 text-t1 text-pretty text-ios-secondary">체크는 이 기기에만 남고, 여기서 떠올린 내용은 어디에도 저장하지 않아요.</p>
    </Sheet>
  );
}

/** 이번 주 요일 체크와 쌓인 실천 수. 글 없이 색으로만: 이야기한 날은 연하게, 실천한 날은 진하게 칠한다.
 * 스트릭·연속 일수는 두지 않고, 쉰 날은 빈 원이다. 불꽃 옆 숫자는 줄지 않는 누적 수다. */
export function WeekChecks({ who, checks, total, cheer, className = "" }: { who: Who; checks: WeekCheck[]; total: number; cheer: number; className?: string }) {
  const c = COLORS.find((x) => x.id === who.color) ?? COLORS[0];
  return (
    <section aria-labelledby="week-checks-title" className={className} style={{ "--practice-deep": c.deep, "--practice-tint": c.light } as React.CSSProperties}>
      <div className="flex items-center gap-3">
        <div className="shrink-0"><Buddy shape={who.shape} color={who.color} accessory={who.accessory} size={44} cheer={cheer} /></div>
        <h2 id="week-checks-title" className="min-w-0 flex-1 text-t5 font-bold text-[#1F2A55]">이번 주</h2>
        <p className="flex items-center gap-1 text-t6 font-bold tabular-nums text-[#1F2A55]" aria-label={`쌓인 실천 ${total}번`}>
          <Flame /><span>{total}</span>
        </p>
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-1" aria-label="이번 주 요일별 체크">
        {checks.map((x) => (
          <li key={x.date} className="flex flex-col items-center gap-1.5" aria-label={`${WEEKDAY[x.weekday]}요일${x.today ? " 오늘" : ""}${x.talked ? ", 이야기함" : ""}${x.practiced ? ", 실천함" : ""}`}>
            <span className="practice-day" data-talked={x.talked} data-practiced={x.practiced} data-today={x.today} aria-hidden="true" />
            <span className={`text-t1 ${x.today ? "font-bold text-[#1F2A55]" : "text-[#8A91A3]"}`}>{WEEKDAY[x.weekday]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Flame({ size = 20 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="#F0735A" aria-hidden="true"><path d="M12.6 2.5c.3 3.2 2.3 4.9 3.9 6.6 1.6 1.7 2.5 3.4 2.5 5.4a7 7 0 0 1-14 0c0-2.3 1-4 2.3-5.3.3 1.3 1 2.1 2 2.5-.3-2.8.6-6.3 3.3-9.2Zm-.6 9.7c-1.6 1.6-2.4 3-2.4 4.2a2.4 2.4 0 0 0 4.8 0c0-1.2-.6-2.3-2.4-4.2Z" /></svg>;
}

/** 시안 미리보기에서 카드→시트→체크 흐름을 묶는 작은 상태. 실제 저장은 lib/practice의 markDone 등이 맡는다. */
export function usePracticeSheet() {
  const [open, setOpen] = useState<Practice | null>(null);
  return { open, show: setOpen, close: () => setOpen(null) };
}
