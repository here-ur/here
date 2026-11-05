"use client";
import { useState } from "react";
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

const chip = (on: boolean) => `ui-press h-11 rounded-full px-4 text-t4 font-bold ${on ? "bg-[#1F2A55] text-white" : "bg-white text-[#1F2A55]"}`;

export default function Preview() {
  const [state, setState] = useState<BuddyState>("idle");
  const [draft, setDraft] = useState("");
  const [hearing, setHearing] = useState(false);
  const [voice, setVoice] = useState(false);
  const [accessory, setAccessory] = useState<string>();
  return (
    <main className="app-frame overflow-y-auto bg-[#FAFCFE] px-gutter py-10 text-[#1F2A55]">
      <h1 className="text-t6 font-bold">몽글이 모션 미리보기</h1>
      <p className="mt-1 text-t3 text-[#5A6478]">상태를 바꾸면 연결 동작이 한 번 붙어요. 동작 줄이기 설정에서는 움직이지 않아요.</p>
      <div className="mt-6 grid place-items-center">
        <div className={`home-buddy ${voice ? "home-buddy-expanded" : ""}`}>
          <Buddy accessory={accessory} size={200} state={state} bob tap={state === "attentive" ? draft.length : undefined} hearing={voice ? hearing : undefined} voice={voice} />
        </div>
      </div>
      <section className="mt-8">
        <h2 className="text-t4 font-bold">상태</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATES.map((s) => <button key={s.id} onClick={() => setState(s.id)} className={chip(state === s.id)}>{s.label}</button>)}
        </div>
        <p className="mt-2 text-t2 text-[#5A6478]">글 대화: 기본 → 주목 → 생각 → 기본 · 음성: 생각 → 말하기 → 듣기 → 생각</p>
      </section>
      <section className="mt-6">
        <label htmlFor="buddy-draft" className="text-t4 font-bold">주목 상태에서 글자 치기</label>
        <input id="buddy-draft" value={draft} onFocus={() => setState("attentive")} onChange={(e) => setDraft(e.target.value)} placeholder="여기에 써 보세요" className="mt-2 h-12 w-full rounded-r4 bg-white px-4 text-t5 outline-0 ring-1 ring-[#D9DDE7] focus:ring-2 focus:ring-[#1E4FE0]/40" />
      </section>
      <section className="mt-6">
        <h2 className="text-t4 font-bold">음성</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => { setVoice(true); setState("thinking"); }} className={chip(voice)}>음성 시작</button>
          <button onClick={() => { setState("listening"); setHearing((h) => !h); }} disabled={!voice} className={`${chip(hearing)} disabled:opacity-40`}>{hearing ? "말 멈추기" : "말 시작하기"}</button>
          <button onClick={() => { setVoice(false); setHearing(false); setState("idle"); }} disabled={!voice} className={`${chip(false)} disabled:opacity-40`}>음성 끝(작별)</button>
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
