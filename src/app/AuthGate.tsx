"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePhone } from "@/lib/invite";
import { setLocalOwner } from "@/lib/local-scope";
import { browserSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkEntry, type Entry } from "@/lib/session-entry";
import { consentDisplayStorage, hasConsentDisplayHint } from "@/lib/consent-display-cache";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import AuthScreen from "./AuthScreen";
import Sheet from "./Sheet";
import { movePage } from "./page-move";
import "./first-run.css";
import MemoryConsentGate from "./MemoryConsentGate";
import PasswordSetup from "./PasswordSetup";

type Mode = "login" | "signup";
type Step = "password" | "phone" | "otp" | "new-password";

export default function AuthGate({ children }: { children: (userId: string, signOut: () => Promise<void>) => React.ReactNode }) {
  const client = browserSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("password");
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeAction, setWelcomeAction] = useState<Mode | null>(null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 시트 안에서 단계가 바뀔 때 새 내용이 들어오는 방향
  const [direction, setDirection] = useState<"open" | "forward" | "back">("open");
  // 방금 시트에서 로그인·가입을 마쳤으면 기억 동의가 같은 시트에서 이어진다.
  const [continueSheet, setContinueSheet] = useState(false);
  const stepInputRef = useRef<HTMLInputElement>(null);
  const welcomeActionRef = useRef<HTMLButtonElement>(null);
  const checkGeneration = useRef(0);

  const enter = useCallback((result: Entry) => {
    setLoading(false);
    setBusy(false);
    setPassword("");
    setCheckFailed(result.kind === "retry");
    setLocalOwner(result.kind === "member" ? result.id : null);
    setUserId(result.kind === "member" ? result.id : null);
    // 시트에서 이어 가기는 회원으로 들어갈 때만 유지한다(로그아웃·재시도·가입 계속이면 지운다).
    if (result.kind !== "member") setContinueSheet(false);
    if (result.kind === "signup") {
      setShowWelcome(false);
      setMode("signup"); setStep("new-password");
      setVerifiedPhone(result.phone); setPhone(result.phone);
    } else if (result.kind === "login") {
      setShowWelcome(true);
      setMode("login"); setStep("password"); setPhone(""); setVerifiedPhone(null);
      setCode(""); setError("");
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
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && !userId && !busy && step === "password") setAttempt(n => n + 1);
    });
    const recover = () => { if (checkFailed && !busy) setAttempt(n => n + 1); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("online", recover); window.removeEventListener("focus", recover); };
  }, [client, userId, busy, step, checkFailed, enter]);

  useEffect(() => {
    if (!loading && showWelcome && welcomeAction) welcomeActionRef.current?.focus();
    if (loading || showWelcome) return;
    // 시트는 열릴 때 자기 자신에 포커스를 두므로, 올라오는 동작이 끝난 뒤 첫 입력칸으로 옮긴다.
    // 움직이는 중에 스크롤로 입력칸을 찾아가면 화면 전체가 튀어서, 스크롤 없이 포커스만 옮긴다.
    const wait = direction === "open" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 480 : 0;
    const timer = window.setTimeout(() => stepInputRef.current?.focus({ preventScroll: true }), wait);
    return () => window.clearTimeout(timer);
  }, [step, showWelcome, loading, welcomeAction, direction]);

  const signOut = useCallback(async () => {
    const result = await client?.auth.signOut({ scope: "local" });
    enter({ kind: result?.error ? "retry" : "login" });
  }, [client, enter]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) { setError("휴대폰 번호를 확인해 주세요."); return; }
    checkGeneration.current++;
    setBusy(true);
    setError("");
    try {
      const { data, error: signInError } = await client.auth.signInWithPassword({ phone: normalizedPhone, password });
      if (signInError || !data.user) {
        setError(signInError?.code === "invalid_credentials"
          ? "휴대폰 번호와 비밀번호를 확인해 주세요."
          : "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      const entry = await checkEntry(client, data.user);
      if (entry.kind === "member") await finishInSheet(entry);
      else { setDirection("forward"); enter(entry); }
    } catch {
      setError("로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function afterSms(entry: Entry) {
    setDirection("forward");
    if (entry.kind !== "member") { enter(entry); return; }
    setBusy(false);
    setCode("");
    setStep("new-password");
  }

  async function sendOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    checkGeneration.current++;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) { setError("휴대폰 번호를 확인해 주세요."); return; }
    setBusy(true);
    setError("");
    try {
      const { error: otpError } = await client.auth.signInWithOtp({ phone: normalizedPhone, options: { shouldCreateUser: mode === "signup" } });
      if (otpError) { setError("인증번호를 보내지 못했어요. 번호를 확인하고 잠시 후 다시 시도해 주세요."); return; }
      setDirection("forward");
      setVerifiedPhone(normalizedPhone);
      setCode("");
      setStep("otp");
    } catch {
      setError("인증번호를 보내지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!client || !verifiedPhone || busy) return;
    if (!/^\d{6}$/.test(code.trim())) { setError("인증번호 6자리를 입력해 주세요."); return; }
    checkGeneration.current++;
    setBusy(true);
    setError("");
    try {
      const { data, error: verifyError } = await client.auth.verifyOtp({ phone: verifiedPhone, token: code.trim(), type: "sms" });
      if (verifyError || !data.user) { setError("인증번호가 맞지 않거나 만료됐어요."); return; }
      afterSms(await checkEntry(client, data.user));
    } catch {
      setError("인증을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  // 시트 안의 뒤로 가기: 인증번호 → 번호, 번호(비밀번호 재설정) → 로그인. 첫 단계에서는 뒤로 가기 대신 닫기만 있다.
  function goBack() {
    if (busy) return;
    setDirection("back");
    setError("");
    setCode("");
    setVerifiedPhone(null);
    setStep(step === "otp" ? "phone" : "password");
  }

  // 시트가 닫히는 동작이 끝나면 환영 화면만 남긴다.
  function closeSheet() {
    setShowWelcome(true);
    setError("");
    setPassword("");
    setCode("");
    setVerifiedPhone(null);
  }

  // 비밀번호를 저장하면 회원 확인을 바로 하고, 로그인과 같은 전환으로 다음 화면에 넘어간다(사진 화면을 다시 거치지 않는다).
  async function finishPasswordSetup() {
    if (!client) return;
    const generation = ++checkGeneration.current;
    setBusy(true);
    const entry = await checkEntry(client);
    if (generation !== checkGeneration.current) return;
    if (entry.kind === "member") await finishInSheet(entry);
    else enter(entry);
  }

  // 로그인·가입을 마쳤을 때: 이 기기에서 이미 동의한 회원이면 시트가 작아지며 바로 다음 화면으로 넘어가고,
  // 아니면 시트를 그대로 두고 기억 동의를 같은 자리에서 잇는다. 마이크 권한은 홈에서 처음 마이크를 누를 때 묻는다.
  async function finishInSheet(entry: Extract<Entry, { kind: "member" }>) {
    if (hasConsentDisplayHint(consentDisplayStorage(), entry.id)) { await movePage("enter", () => enter(entry)); return; }
    setContinueSheet(true);
    enter(entry);
  }

  function openForm(next: Step, nextMode: Mode = "login") {
    setDirection(showWelcome ? "open" : "forward");
    setWelcomeAction(nextMode);
    setMode(nextMode);
    setStep(next);
    setPassword("");
    setError("");
    setShowWelcome(false);
  }

  if (loading) return <AuthScreen loading />;
  if (checkFailed) return <main className="app-frame flex flex-col items-center justify-center gap-4 px-7">
    <p role="alert">로그인 상태를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p>
    <Button variant="tonal" size="medium" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>다시 확인</Button>
  </main>;
  if (userId) return <MemoryConsentGate key={userId} userId={userId} signOut={signOut} continueSheet={continueSheet}>{children(userId, signOut)}</MemoryConsentGate>;

  const currentSteps: Step[] = mode === "signup" ? ["phone", "otp", "new-password"]
    : step === "password" ? ["password"] : ["phone", "otp", "new-password"];
  const stepNumber = currentSteps.indexOf(step) + 1;
  // 로그인·가입은 환영 화면 위로 올라오는 시트다. 문구는 짧게, 이름표는 입력칸 위에 따로 둔다.
  const copy = {
    password: { title: "로그인", description: "", submit: "로그인" },
    phone: mode === "signup"
      ? { title: "휴대폰 번호로 가입", description: "로그인할 때 아이디로 써요.", submit: "인증번호 받기" }
      : { title: "비밀번호 재설정", description: "가입한 번호로 인증번호를 보내 드려요.", submit: "인증번호 받기" },
    otp: { title: "인증번호 입력", description: `${phone}로 보낸 6자리를 입력해 주세요.`, submit: "확인" },
    "new-password": { title: "비밀번호 설정", description: "", submit: "" },
  }[step];
  const canGoBack = step === "otp" || (step === "phone" && mode === "login");
  const digits = code.padEnd(6, " ").slice(0, 6).split("");

  const sheet = !showWelcome && <Sheet title={copy.title} onClose={closeSheet} className="auth-sheet" slide keyboardAware locked={busy}
    onBack={canGoBack ? goBack : undefined} backLabel={step === "otp" ? "번호 다시 입력" : "로그인으로 돌아가기"}
    dismissible={step !== "new-password"}>
    <div key={step} className="fr-scope auth-sheet-step" data-direction={direction}>
      {(currentSteps.length > 1 || copy.description) && <div className="auth-sheet-meta">
        {currentSteps.length > 1 && <span className="fr-steps" role="img" aria-label={`${mode === "login" ? "비밀번호 재설정" : "가입"} ${stepNumber}/${currentSteps.length}단계`}>
          {currentSteps.map((item, index) => <i key={item} data-done={index < stepNumber || undefined} />)}
        </span>}
        {copy.description && <p className="auth-sheet-desc">{copy.description}</p>}
      </div>}
      {/* 비밀번호 재설정·가입 모두 새 비밀번호를 정해야 끝난다('나중에'는 두지 않는다). 그만두려면 로그아웃한다. */}
      {step === "new-password" ? <PasswordSetup sheet onSaved={() => { void finishPasswordSetup(); }} signup={mode === "signup"} onCancel={signOut} />
      : <form onSubmit={step === "password" ? signIn : step === "phone" ? sendOtp : verifyOtp} className="auth-sheet-form" aria-describedby={error ? "auth-error" : undefined}>
        <div className="auth-sheet-fields">
          {/* 이름표는 입력칸 위에 따로 두고, 입력칸 안에는 예시만 흐리게 보인다. */}
          {(step === "phone" || step === "password") && <TextField label="휴대폰 번호" variant="plain" ref={stepInputRef} id="phone" name="phone" type="tel" inputMode="tel"
            autoComplete={step === "password" ? "username" : "tel"} placeholder="01012345678" value={phone} onChange={(event) => setPhone(event.target.value)} required disabled={busy} inputClassName="fr-input" />}
          {step === "password" && <TextField label="비밀번호" variant="plain" name="password" type="password" autoComplete="current-password"
            placeholder="비밀번호 입력" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} inputClassName="fr-input" />}
          {/* 여섯 칸은 보이기만 하고, 실제 입력은 칸 위에 투명하게 겹친 입력칸 하나가 받는다(문자 자동 채우기 유지). */}
          {step === "otp" && <span className="auth-label" aria-hidden="true">인증번호</span>}
          {step === "otp" && <div className="fr-otp" data-invalid={error ? "" : undefined}>
            {digits.map((digit, index) => <span key={index} aria-hidden="true" data-current={index === Math.min(code.length, 5) ? "" : undefined}>{digit.trim()}</span>)}
            <TextField label="인증번호" hideLabel variant="plain" ref={stepInputRef} id="sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={busy} inputClassName="fr-otp-input" />
          </div>}
          {error && <p id="auth-error" role="alert" className="fr-error">{error}</p>}
          {/* 키보드가 올라와도 버튼 묶음이 낮게 유지되도록, 비밀번호 찾기는 입력칸 바로 아래에 둔다. */}
          {step === "password" && <Button variant="plain" disabled={busy} className="fr-link auth-sheet-forgot" onClick={() => openForm("phone")}>비밀번호를 잊었어요</Button>}
        </div>
        <div className="auth-sheet-actions">
          <Button type="submit" tone="ink" fullWidth loading={busy} disabled={step === "otp" && code.length < 6}>{copy.submit}</Button>
        </div>
      </form>}
    </div>
  </Sheet>;

  return <AuthScreen welcome>
    <div className="here-auth-welcome">
      <h1 className="here-auth-brand"><span>나와 가장 가까운 친구</span><span>here</span></h1>
      <div className="here-auth-welcomeBottom">
        {client ? <div className="here-auth-actions">
          {/* 첫 실행 전체에서 같은 버튼: 주요 동작은 검정, 보조 동작은 흰 버튼(fr-ghost) */}
          <Button ref={welcomeAction === "login" ? welcomeActionRef : undefined} variant="tonal" tone="ink" fullWidth className="fr-ghost" onClick={() => openForm("password")}>
            로그인
          </Button>
          <Button ref={welcomeAction === "signup" ? welcomeActionRef : undefined} tone="ink" fullWidth onClick={() => openForm("phone", "signup")}>
            회원가입
          </Button>
        </div> : <p role="status" className="here-auth-unavailable">로그인을 준비하고 있어요.<br />잠시 후 다시 방문해 주세요.</p>}
        <p className="here-auth-footnote" lang="en">By continuing, you agree to our<br />
          <span className="here-auth-policyText">Terms of service</span>{" & "}<span className="here-auth-policyText">Privacy policy</span>
        </p>
      </div>
    </div>
    {sheet}
  </AuthScreen>;
}
