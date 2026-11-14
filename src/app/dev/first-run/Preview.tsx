"use client";

import { useState, type FormEvent } from "react";
import AuthScreen, { type AuthMode, type AuthStep } from "../../AuthScreen";
import { MemoryConsentPreview } from "../../MemoryConsentGate";
import { MicrophonePermissionNotice } from "../../MicrophonePermissionGate";
import Onboarding from "../../Onboarding";
import Welcome from "../../Welcome";
import { Icon } from "../../art";
import { Button } from "../../ui/Button";

type Stage = "welcome" | "signup" | "login" | "consent" | "mic" | "onboarding" | "done";
const STAGES: { id: Stage; label: string }[] = [
  { id: "welcome", label: "1 환영" },
  { id: "signup", label: "2 가입" },
  { id: "login", label: "2 로그인" },
  { id: "consent", label: "3 기억 동의" },
  { id: "mic", label: "3 마이크 안내" },
  { id: "onboarding", label: "4–6 캐릭터 만나기" },
  { id: "done", label: "끝" },
];

export default function Preview() {
  const [stage, setStage] = useState<Stage>("welcome");
  const [run, setRun] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<AuthStep>("invite");
  const [phone, setPhone] = useState("");
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");
  const [controls, setControls] = useState(true);

  function open(next: Stage) {
    setRun((n) => n + 1);
    setStage(next);
    setStep(next === "login" ? "phone" : "invite");
    setPhone(""); setInvite(""); setCode(""); setResult("");
    if (next === "welcome") setAgreed(false);
  }

  const mode: AuthMode = stage === "login" ? "login" : "signup";
  function submit(event: FormEvent) {
    event.preventDefault();
    if (step === "invite") setStep("phone");
    else if (step === "phone") setStep("otp");
    else open("consent");
  }
  function back() {
    if (step === "otp") setStep("phone");
    else if (step === "phone" && mode === "signup") setStep("invite");
    else open("welcome");
  }

  let screen;
  switch (stage) {
    case "welcome":
      screen = <Welcome agreed={agreed} onAgreedChange={setAgreed} onSignup={() => open("signup")} onLogin={() => open("login")} />;
      break;
    case "signup":
    case "login":
      screen = <AuthScreen mode={mode} step={step} verifiedPhone={null} phone={phone} invite={invite} code={code} error="" busy={false}
        onPhone={setPhone} onInvite={setInvite} onCode={setCode} onSubmit={submit} onBack={back} />;
      break;
    case "consent":
      screen = <MemoryConsentPreview onAccept={() => open("mic")} onSignOut={() => open("welcome")} />;
      break;
    case "mic":
      screen = <MicrophonePermissionNotice busy={false} error="" onAllow={() => open("onboarding")} onSkip={() => open("onboarding")} />;
      break;
    case "onboarding":
      screen = <Onboarding key={run} onDone={(p) => { setResult(`이름 ${p.companion} · 목소리 ${p.voice} · 자리 ${p.color} · 대화 방식 ${p.style}`); setStage("done"); }} />;
      break;
    case "done":
      screen = <main className="app-frame flex flex-col items-center justify-center gap-4 bg-[#F5F2EB] px-gutter text-center">
        <p className="text-t6 font-bold">미리보기 끝</p>
        <p className="text-t4 text-[#6F6C65]">실제 앱에서는 여기서 홈으로 가고, 고양이가 먼저 한마디 해요.</p>
        {result && <p className="text-t3 text-[#6F6C65]">{result}</p>}
        <Button tone="ink" onClick={() => open("welcome")}>처음부터 다시</Button>
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
      <Button variant="plain" onClick={() => open("welcome")} className="min-h-8 whitespace-nowrap px-1">처음부터</Button>
      <Button variant="plain" onClick={() => setControls(false)} aria-label="미리보기 도구 숨기기" className="grid size-8 place-items-center"><Icon name="close" size={16} /></Button>
    </div>}
  </>;
}
