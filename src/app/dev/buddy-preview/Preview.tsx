"use client";
import AudioPreview from "./AudioPreview";
import MeowPreview from "./MeowPreview";
import { useState } from "react";
import { catExpression } from "@/lib/cat-expression";
import Buddy, { type BuddyState } from "../../Buddy";
import "../../home-voice.css";

// 몽글이 상태 전환·작은 반응을 직접 눌러 보는 개발용 화면. 실제 연결·AI 호출은 없다.
const STATES: { id: BuddyState; label: string }[] = [
  { id: "idle", label: "기본" },
  { id: "attentive", label: "주목" },
  { id: "thinking", label: "생각" },
  { id: "speaking", label: "말하기" },
  { id: "listening", label: "듣기" },
];

const chip = (on: boolean) => `ui-press h-11 rounded-full px-4 text-t4 font-bold ${on ? "bg-cat-ink text-white" : "bg-white text-cat-ink"}`;

export default function Preview() {
  const [state, setState] = useState<BuddyState>("idle");
  const [draft, setDraft] = useState("");
  const [hearing, setHearing] = useState(false);
  const [voice, setVoice] = useState(false);
  const [accessory, setAccessory] = useState<string>();
  return (
    <main className="app-frame app-frame-scrollable bg-cat-paper px-gutter py-10 text-cat-ink">
      <h1 className="text-t6 font-bold">고양이 표정 미리보기</h1>
      <p className="mt-1 text-t3 text-cat-muted">기다릴 때는 짧게 걷고, 대화할 때는 멈춰요. 동작 줄이기에서는 표정만 바뀌어요.</p>
      <div className="mt-6 grid place-items-center">
        <div className={`home-buddy ${voice ? "home-buddy-expanded" : ""}`}>
          <Buddy stroll groundShadow accessory={accessory} size={300} expression={catExpression(draft)} state={state} bob tap={state === "attentive" ? draft.length : undefined} hearing={voice ? hearing : undefined} voice={voice} />
        </div>
      </div>
      <MeowPreview />
      <AudioPreview />
      <section className="mt-8">
        <h2 className="text-t4 font-bold">상태</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATES.map((s) => <button key={s.id} onClick={() => setState(s.id)} className={chip(state === s.id)}>{s.label}</button>)}
        </div>
        <p className="mt-2 text-t2 text-cat-muted">글 대화: 기본 → 주목 → 생각 → 기본 · 음성: 생각 → 말하기 → 듣기 → 생각</p>
      </section>
      <section className="mt-6">
        <label htmlFor="buddy-draft" className="text-t4 font-bold">이야기에 따른 표정</label>
        <input id="buddy-draft" value={draft} onFocus={() => setState("attentive")} onChange={(e) => setDraft(e.target.value)} placeholder="합격했어 / 오늘 너무 힘들어" className="mt-2 h-12 w-full rounded-r4 bg-white px-4 text-t5 outline-0 ring-1 ring-[#D9DDE7] focus:ring-2 focus:ring-[#1E4FE0]/40" />
      </section>
      <section className="mt-6">
        <h2 className="text-t4 font-bold">음성</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => { setVoice(true); setState("thinking"); }} className={chip(voice)}>음성 시작</button>
          <button onClick={() => { setState("listening"); setHearing((h) => !h); }} disabled={!voice} className={`${chip(hearing)} disabled:opacity-40`}>{hearing ? "말 멈추기" : "말 시작하기"}</button>
          <button onClick={() => { setVoice(false); setHearing(false); setState("idle"); }} disabled={!voice} className={`${chip(false)} disabled:opacity-40`}>음성 끝</button>
        </div>
      </section>
      <section className="mt-6 flex flex-wrap gap-2">
        {[undefined, "sprout", "hat", "scarf", "flowers", "crown", "rainbow"].map((item) => <button key={item ?? "none"} onClick={() => setAccessory(item)} className={chip(accessory === item)}>{item ?? "꾸미기 없음"}</button>)}
      </section>
      <div className="mt-6 flex items-center gap-4" aria-label="작은 캐릭터 미리보기">
        {[30, 36, 68].map((size) => <Buddy key={size} size={size} state={state} />)}
      </div>
    </main>
  );
}
