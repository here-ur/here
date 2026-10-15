"use client";

import { useState } from "react";
import { clearLog, loadLog } from "@/lib/log";
import { Icon } from "./art";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** 프로토타입 "내 기록"의 하루하루 탭. 대화를 날짜별 카드로 보여 준다. */
export default function Log({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState(loadLog);
  const today = new Date().toDateString();

  function clearAll() {
    if (!window.confirm("이 기기에 남은 기록을 모두 지울까요? 되돌릴 수 없어요.")) return;
    clearLog();
    setSessions([]);
  }

  return (
    <>
      <header className="absolute inset-x-5 top-14 flex h-11 items-center justify-between">
        <button onClick={onBack} aria-label="대화로 돌아가기" className="grid size-11 place-items-center rounded-[14px] bg-white/70">
          <Icon name="back" size={22} />
        </button>
        <h1 className="font-display text-xl">내 기록</h1>
        <span className="size-11" />
      </header>

      <div className="absolute inset-x-0 top-[116px] bottom-0 overflow-y-auto px-4 pb-10">
        {sessions.length === 0 ? (
          <p className="rounded-[24px] bg-white p-5 text-[15px] leading-relaxed text-ink-2">
            아직 기록이 없어요. 몽글이와 이야기하면 여기에 날짜별로 남아요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => {
              const d = new Date(s.startedAt);
              const said = s.messages.filter((m) => m.role === "user");
              return (
                <li key={s.id} className={`rounded-[24px] bg-white p-5 ${d.toDateString() === today ? "ring-2 ring-violet ring-inset" : ""}`}>
                  <div className="flex items-end gap-3">
                    <span className="flex flex-col items-center">
                      <b className="font-display text-[26px] leading-none">{d.getDate()}</b>
                      <span className="mt-1 text-[11px] text-ink-3">
                        {d.toDateString() === today ? "오늘" : `${d.getMonth() + 1}월 · ${WEEKDAY[d.getDay()]}`}
                      </span>
                    </span>
                    <span className="text-xs text-ink-3">
                      {d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-[17px] font-bold">{said[0]?.content}</p>
                  <details className="mt-3">
                    <summary className="cursor-pointer list-none text-sm font-bold text-violet">
                      대화 보기 · {said.length}번 말함
                    </summary>
                    <ol className="mt-3 flex flex-col gap-2">
                      {s.messages.map((m, i) => (
                        <li
                          key={i}
                          className={`max-w-[85%] rounded-[18px] px-3.5 py-2.5 text-[15px] leading-snug ${
                            m.role === "user" ? "self-end bg-violet text-white" : "self-start bg-violet-tint"
                          }`}
                        >
                          {m.content}
                        </li>
                      ))}
                    </ol>
                  </details>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-5 text-center text-xs leading-relaxed text-ink-3">
          기록은 이 기기의 브라우저에만 남고, 30일이 지나면 지워져요.
        </p>
        {sessions.length > 0 && (
          <button onClick={clearAll} className="mx-auto mt-2 block rounded-[10px] px-3 py-2 text-sm font-semibold text-ink-2">
            기록 모두 지우기
          </button>
        )}
      </div>
    </>
  );
}
