"use client";

import { useState } from "react";
import { clearLog, loadLog } from "@/lib/log";
import { COLORS, josa } from "@/lib/onboarding";
import { Icon } from "./art";
import Buddy from "./Buddy";
import { Bubbles, Shell, type Who } from "./Conversation";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 내 기록: 대화를 날짜별 카드로 보여 준다. 기록은 이 기기의 브라우저에만 있다. */
export default function Log({ who, onBack }: { who: Who; onBack: () => void }) {
  // 몽글이 인사만 있고 내가 한 말이 없는 대화(마이크가 막혔을 때 등)는 보여 주지 않는다. 저장된 건 그대로 둔다.
  const [sessions, setSessions] = useState(() => loadLog().filter((s) => s.messages.some((m) => m.role === "user")));
  const today = new Date().toDateString();
  const deep = COLORS.find((c) => c.id === who.color)?.deep;

  function clearAll() {
    if (!window.confirm("이 기기에 남은 기록을 모두 지울까요? 되돌릴 수 없어요.")) return;
    clearLog();
    setSessions([]);
  }

  return (
    <Shell color={who.color} bloom="soft">
      <header className="absolute inset-x-0 top-14 z-10 flex items-center justify-between px-5">
        <button onClick={onBack} aria-label="처음 화면으로" className="grid size-11 place-items-center rounded-full bg-white text-[#1F2A55] shadow-[0_3px_14px_rgba(28,38,80,.08)]">
          <Icon name="back" size={20} />
        </button>
        <h1 className="text-[17px] font-semibold">내 기록</h1>
        <span className="size-11" />
      </header>

      <div className="absolute inset-x-0 top-[112px] bottom-0 overflow-y-auto px-4 pb-10">
        <p className="mb-4 text-center text-xs text-[#5A6478]">지난 30일 동안 나눈 이야기</p>

        {sessions.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <Buddy shape={who.shape} color={who.color} size={130} look={[0, 0.3]} mouth="calm" bob />
            <p className="mt-4 text-[15px] leading-relaxed text-[#3D4559]">
              아직 기록이 없어요.
              <br />
              {josa(who.name, "과", "와")} 이야기하면 여기에 날짜별로 남아요.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => {
              const d = new Date(s.startedAt);
              const said = s.messages.filter((m) => m.role === "user");
              const isToday = d.toDateString() === today;
              return (
                <li
                  key={s.id}
                  className="rounded-[24px] bg-white p-5 shadow-[0_6px_20px_rgba(28,38,80,.07)]"
                  style={isToday ? { boxShadow: `0 6px 20px rgba(28,38,80,.07), inset 0 0 0 2px ${deep}55` } : undefined}
                >
                  <div className="flex items-baseline gap-2.5">
                    <b className="text-[26px] leading-none font-semibold tracking-[-0.02em]">{d.getDate()}</b>
                    <span className="text-[13px] font-medium text-[#3D4559]">{isToday ? "오늘" : `${d.getMonth() + 1}월 · ${WEEKDAY[d.getDay()]}`}</span>
                    <span className="ml-auto text-xs text-[#5A6478]">{d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}</span>
                  </div>
                  {/* 옆에서 엿보는 노출을 줄이려고 첫 마디는 한 줄만 */}
                  <p className="mt-3 truncate text-[15px] text-[#1F2A55]">{said[0]?.content}</p>
                  <details className="group mt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[#1F2A55] [&::-webkit-details-marker]:hidden">
                      대화 보기 · {said.length}번 말함
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="transition group-open:rotate-180">
                        <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <div className="mt-3 rounded-[18px] bg-[#F5F7FB] p-3">
                      <Bubbles who={who} messages={s.messages} follow={false} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#5A6478]">
          <Icon name="lock" size={14} />
          기록은 이 기기의 브라우저에만 남고, 30일이 지나면 지워져요.
        </p>
        {sessions.length > 0 && (
          <button onClick={clearAll} className="mx-auto mt-2 block h-11 px-3 text-sm font-medium text-[#3D4559] underline underline-offset-4">
            기록 모두 지우기
          </button>
        )}
      </div>
    </Shell>
  );
}
