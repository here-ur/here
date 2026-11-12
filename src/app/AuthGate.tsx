"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeInviteCode, normalizePhone } from "@/lib/invite";
import { setLocalOwner } from "@/lib/local-scope";
import { browserSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkEntry, type Entry } from "@/lib/session-entry";
import Segmented from "framework7-react/components/segmented.js";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import MemoryConsentGate from "./MemoryConsentGate";

type Mode = "login" | "signup";
type Step = "phone" | "otp" | "invite";

export default function AuthGate({ children }: { children: (userId: string, signOut: () => Promise<void>) => React.ReactNode }) {
  const client = browserSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [invite, setInvite] = useState("");
  const [code, setCode] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stepInputRef = useRef<HTMLInputElement>(null);
  const checkGeneration = useRef(0);

  const enter = useCallback((result: Entry) => {
    setLoading(false);
    setBusy(false);
    setCheckFailed(result.kind === "retry");
    setLocalOwner(result.kind === "member" ? result.id : null);
    setUserId(result.kind === "member" ? result.id : null);
    if (result.kind === "invite") {
      setMode("signup"); setStep("invite");
      setVerifiedPhone(result.phone); setPhone(result.phone);
    } else if (result.kind === "login") {
      setMode("login"); setStep("phone"); setPhone(""); setVerifiedPhone(null);
      setInvite(""); setCode(""); setError("");
    }
  }, []);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const generation = ++checkGeneration.current;
    void checkEntry(client).then(result => { if (active && generation === checkGeneration.current) enter(result); });
    return () => { active = false; };
  }, [client, attempt, enter]);

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") { checkGeneration.current++; enter({ kind: "login" }); }
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && !userId && !busy && step === "phone") setAttempt(n => n + 1);
    });
    const recover = () => { if (checkFailed && !busy) setAttempt(n => n + 1); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("online", recover); window.removeEventListener("focus", recover); };
  }, [client, userId, busy, step, checkFailed, enter]);

  useEffect(() => {
    if (step !== "phone") stepInputRef.current?.focus();
  }, [step]);

  const signOut = useCallback(async () => {
    const result = await client?.auth.signOut({ scope: "local" });
    enter({ kind: result?.error ? "retry" : "login" });
  }, [client, enter]);

  async function sendOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    checkGeneration.current++;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) { setError("휴대폰 번호를 확인해 주세요."); return; }
    setBusy(true);
    setError("");
    if (mode === "signup") {
      const { data: available, error: inviteError } = await client.rpc("invite_available", { p_code: normalizeInviteCode(invite) });
      if (inviteError || available !== true) {
        setBusy(false);
        setStep("invite");
        setError("사용할 수 없는 초대코드예요. 다시 확인해 주세요.");
        return;
      }
    }
    const { error: otpError } = await client.auth.signInWithOtp({ phone: normalizedPhone, options: { shouldCreateUser: mode === "signup" } });
    setBusy(false);
    if (otpError) { setError("인증번호를 보내지 못했어요. 번호를 확인하고 잠시 후 다시 시도해 주세요."); return; }
    setVerifiedPhone(normalizedPhone);
    setCode("");
    setStep("otp");
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!client || !verifiedPhone || busy) return;
    checkGeneration.current++;
    setBusy(true);
    setError("");
    const { data, error: verifyError } = await client.auth.verifyOtp({ phone: verifiedPhone, token: code.trim(), type: "sms" });
    if (verifyError || !data.user) { setBusy(false); setError("인증번호가 맞지 않거나 만료됐어요."); return; }
    const entry = await checkEntry(client, data.user);
    if (entry.kind !== "invite" || mode !== "signup") {
      enter(entry);
      return;
    }
    const { data: redeemed, error: redeemError } = await client.rpc("redeem_invite", { p_code: normalizeInviteCode(invite) });
    if (redeemError) { enter({ kind: "retry" }); return; }
    if (redeemed !== true) {
      setBusy(false);
      setStep("invite");
      setError("사용할 수 없는 초대코드예요. 코드가 맞는지 확인하거나 다른 코드를 입력해 주세요.");
      return;
    }
    enter(await checkEntry(client, data.user));
  }

  async function redeemInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    const normalizedInvite = normalizeInviteCode(invite);
    if (!normalizedInvite) { setError("초대코드 16자리를 확인해 주세요."); return; }
    setBusy(true);
    setError("");
    if (!verifiedPhone) {
      const { data: available, error: inviteError } = await client.rpc("invite_available", { p_code: normalizedInvite });
      setBusy(false);
      if (inviteError || available !== true) { setError("사용할 수 없는 초대코드예요. 다시 확인해 주세요."); return; }
      setStep("phone");
      return;
    }
    // 휴대폰 인증 후 코드가 먼저 사용됐다면 문자 재전송 없이 새 코드로 마무리한다.
    const { data: redeemed, error: redeemError } = await client.rpc("redeem_invite", { p_code: normalizedInvite });
    if (redeemError) { enter({ kind: "retry" }); return; }
    if (redeemed !== true) {
      setBusy(false);
      setError("사용할 수 없는 초대코드예요. 다시 확인해 주세요.");
      return;
    }
    enter(await checkEntry(client));
  }

  async function goBack() {
    if (busy) return;
    setError("");
    if (step === "invite" && verifiedPhone) {
      await signOut();
      return;
    }
    if (step === "phone" && mode === "signup") { setStep("invite"); return; }
    setCode("");
    setVerifiedPhone(null);
    setStep("phone");
  }

  if (loading) return <main className="app-frame bg-ios-page" />;
  if (checkFailed) return <main className="app-frame flex flex-col items-center justify-center gap-4 px-7">
    <p role="alert">로그인 상태를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p>
    <Button variant="tonal" size="medium" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>다시 확인</Button>
  </main>;
  if (userId) return <MemoryConsentGate key={userId} userId={userId} signOut={signOut}>{children(userId, signOut)}</MemoryConsentGate>;

  const currentSteps: Step[] = mode === "login" ? ["phone", "otp"] : ["invite", "phone", "otp"];
  const stepNumber = currentSteps.indexOf(step) + 1;
  const title = step === "phone" ? (mode === "login" ? "다시 만나서 반가워요" : "휴대폰 번호로 인증해요")
    : step === "otp" ? "인증번호를 입력해 주세요" : "초대코드를 입력해 주세요";
  const description = step === "phone" ? (mode === "login" ? "문자로 받은 인증번호로 로그인해요." : "초대코드를 확인했어요. 휴대폰 번호를 입력해 주세요.")
    : step === "otp" ? `${phone}로 보낸 6자리 인증번호를 입력해 주세요.`
      : verifiedPhone ? "휴대폰 인증이 끝났어요. 다른 초대코드로 가입을 마무리해요." : "받은 초대코드를 먼저 입력해 주세요.";

  return <main className="app-frame flex min-h-dvh flex-col justify-center bg-[linear-gradient(170deg,#F8FBFF,#E6EFFF_65%,#DCD9FF)] px-7 py-12 text-[#1F2A55]">
    <div className="here-card mx-auto w-full max-w-sm p-7">
      <div className="mb-8 text-center"><span className="text-3xl font-bold">Here!</span><p className="mt-3 text-sm text-ios-secondary">초대받은 사람만 몽글이와 이야기할 수 있어요.</p></div>
      {!client ? <p role="status" className="text-center text-sm leading-6">로그인 설정이 아직 준비되지 않았어요.<br />Supabase 연결 후 이용할 수 있어요.</p> : <>
        {((mode === "login" && step === "phone") || (mode === "signup" && step === "invite" && !verifiedPhone)) ? <Segmented className="here-segmented mb-7 grid grid-cols-2 gap-2 rounded-full bg-ios-group p-1" {...{ role: "group", "aria-label": "로그인 방식" }}>
          {(["login", "signup"] as const).map((next) => <Button variant="plain" key={next} type="button" onClick={() => { setMode(next); setStep(next === "login" ? "phone" : "invite"); setError(""); }} aria-pressed={mode === next} className={`min-h-11 rounded-full text-sm font-semibold transition-[background-color,box-shadow,color,transform] duration-200 active:scale-[0.96] ${mode === next ? "bg-white shadow-sm" : "text-[#69728B]"}`}>{next === "login" ? "로그인" : "초대코드로 가입"}</Button>)}
        </Segmented> : <Button variant="plain" type="button" onClick={() => { void goBack(); }} className="mb-5 -ml-2 min-h-11 rounded-full px-2 text-sm font-medium text-ios-secondary hover:text-[#1F2A55] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6F4FF0]">← {step === "invite" ? "처음부터" : step === "otp" ? "번호 다시 입력" : "초대코드 다시 입력"}</Button>}
        <div className="mb-7" aria-label={`${mode === "login" ? "로그인" : "가입"} ${stepNumber}단계, 전체 ${currentSteps.length}단계`}>
          <div className="mb-5 flex gap-2" aria-hidden="true">{currentSteps.map((item, index) => <span key={item} className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${index < stepNumber ? "bg-[#6F4FF0]" : "bg-[#D8DDF0]"}`} />)}</div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-[#6F4FF0]">{stepNumber} / {currentSteps.length} · {step === "phone" ? "휴대폰 번호" : step === "otp" ? "인증번호" : "초대코드"}</p>
          <h1 className="text-balance text-2xl font-bold leading-snug">{title}</h1>
          <p className="mt-2 text-pretty text-sm leading-6 text-ios-secondary">{description}</p>
        </div>
        <form onSubmit={step === "phone" ? sendOtp : step === "otp" ? verifyOtp : redeemInvite} className="flex flex-col gap-4">
          {step === "phone" && <TextField label="휴대폰 번호" id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="01012345678" value={phone} onChange={(event) => setPhone(event.target.value)} error={error} required />}
          {step === "otp" && <TextField label="인증번호" ref={stepInputRef} id="sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 숫자" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} error={error} required />}
          {step === "invite" && <TextField label="초대코드" ref={stepInputRef} id="invite" autoCapitalize="characters" autoComplete="off" placeholder="초대코드 16자리" value={invite} onChange={(event) => setInvite(event.target.value.toUpperCase())} error={error} required />}
          <Button type="submit" fullWidth loading={busy} className="mt-3">{step === "invite" ? verifiedPhone ? "가입 완료하기" : "초대코드 확인" : step === "phone" ? "인증번호 받기" : mode === "login" ? "로그인하기" : "가입 완료하기"}</Button>
        </form>
      </>}
    </div>
  </main>;
}
