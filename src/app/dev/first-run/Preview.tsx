"use client";

import { useState } from "react";
import { MemoryConsentPreview } from "../../MemoryConsentGate";
import Onboarding from "../../Onboarding";
import { Icon } from "../../art";
import { Button } from "../../ui/Button";

// 로그인 뒤 첫 실행(기억 동의 → 캐릭터 만나기)을 로그인 없이 넘겨 보는 개발 화면. 마이크 안내는 홈에서 처음 마이크를 누를 때 나온다(/dev/microphone-permission).
// 로그인·가입 화면은 실제 AuthGate에 있어서, 로그아웃한 상태로 첫 화면(/)을 열어 확인한다.
type Stage = "consent" | "onboarding" | "done";
const STAGES: { id: Stage; label: string }[] = [
  { id: "consent", label: "1 기억 동의" },
  { id: "onboarding", label: "2 캐릭터 만나기" },
  { id: "done", label: "끝" },
];

export default function Preview() {
  const [stage, setStage] = useState<Stage>("consent");
  const [run, setRun] = useState(0);
  const [result, setResult] = useState("");
  const [controls, setControls] = useState(true);

  function open(next: Stage) {
    setRun((n) => n + 1);
    setStage(next);
    setResult("");
  }

  let screen;
  switch (stage) {
    case "consent":
      screen = <MemoryConsentPreview key={run} onAccept={() => open("onboarding")} onSignOut={() => open("consent")} />;
      break;
    case "onboarding":
      screen = <Onboarding key={run} onDone={(p) => { setResult(`이름 ${p.companion} · 목소리 ${p.voice} · 자리 ${p.color} · 대화 방식 ${p.style}`); setStage("done"); }} />;
      break;
    case "done":
      screen = <main className="app-frame flex flex-col items-center justify-center gap-4 bg-[#F5F2EB] px-gutter text-center">
        <p className="text-t6 font-bold">미리보기 끝</p>
        <p className="text-t4 text-[#6F6C65]">실제 앱에서는 여기서 홈으로 가요.</p>
        {result && <p className="text-t3 text-[#6F6C65]">{result}</p>}
        <Button tone="ink" onClick={() => open("consent")}>처음부터 다시</Button>
      </main>;
      break;
  }

  return <>
    {screen}
    {controls && <div className="fixed left-2 top-2 z-50 flex items-center gap-2 rounded-xl bg-white p-2 text-sm text-black shadow">
      <label htmlFor="first-run-stage" className="sr-only">미리보기 단계</label>
      <select id="first-run-stage" value={stage} onChange={(e) => open(e.target.value as Stage)} className="rounded-md bg-[#F4F1EA] px-1 py-0.5">
        {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <Button variant="plain" onClick={() => open("consent")} className="min-h-8 whitespace-nowrap px-1">처음부터</Button>
      <Button variant="plain" onClick={() => setControls(false)} aria-label="미리보기 도구 숨기기" className="grid size-8 place-items-center"><Icon name="close" size={16} /></Button>
    </div>}
  </>;
}
