"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePhone } from "@/lib/invite";
import { setLocalOwner } from "@/lib/local-scope";
import { browserSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkEntry, type Entry } from "@/lib/session-entry";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { Icon } from "./art";
import AuthScreen from "./AuthScreen";
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
    if (!loading && !showWelcome) stepInputRef.current?.focus();
    if (!loading && showWelcome && welcomeAction) welcomeActionRef.current?.focus();
  }, [step, showWelcome, loading, welcomeAction]);

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
      enter(await checkEntry(client, data.user));
    } catch {
      setError("로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function afterSms(entry: Entry) {
    if (entry.kind !== "member") {
      enter(entry);
      return;
    }
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

  async function goBack() {
    if (busy) return;
    setError("");
    if (step === "password" || (step === "phone" && mode === "signup")) {
      setShowWelcome(true);
      setPassword("");
      setCode("");
      setVerifiedPhone(null);
      return;
    }
    setCode("");
    setVerifiedPhone(null);
    setStep(step === "phone" ? "password" : "phone");
  }

  function finishPasswordSetup() {
    setLoading(true);
    setAttempt(n => n + 1);
  }

  function openForm(next: Step, nextMode: Mode = "login") {
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
  if (userId) return <MemoryConsentGate key={userId} userId={userId} signOut={signOut}>{children(userId, signOut)}</MemoryConsentGate>;

  if (showWelcome) return <AuthScreen welcome>
    <div className="here-auth-welcome">
      <h1 className="here-auth-brand"><span>나와 가장 가까운 친구</span><span>here</span></h1>
      <div className="here-auth-welcomeBottom">
        {client ? <div className="here-auth-actions">
          <Button ref={welcomeAction === "login" ? welcomeActionRef : undefined} fullWidth className="here-auth-action" onClick={() => openForm("password")}>
            휴대폰 번호로 로그인
          </Button>
          <Button ref={welcomeAction === "signup" ? welcomeActionRef : undefined} fullWidth className="here-auth-action here-auth-signup" onClick={() => openForm("phone", "signup")}>
            회원가입
          </Button>
        </div> : <p role="status" className="here-auth-unavailable">로그인을 준비하고 있어요.<br />잠시 후 다시 방문해 주세요.</p>}
        <p className="here-auth-footnote" lang="en">By continuing, you agree to our<br />
          <span className="here-auth-policyText">Terms of service</span>{" & "}<span className="here-auth-policyText">Privacy policy</span>
        </p>
      </div>
    </div>
  </AuthScreen>;

  const currentSteps: Step[] = mode === "signup" ? ["phone", "otp", "new-password"]
    : step === "password" ? ["password"] : ["phone", "otp", "new-password"];
  const stepNumber = currentSteps.indexOf(step) + 1;
  const content = {
    password: { title: "휴대폰 번호로 로그인", description: "가입한 휴대폰 번호와 비밀번호를 입력해 주세요.", label: "로그인" },
    phone: {
      title: mode === "login" ? "휴대폰 번호를 확인해요" : "휴대폰 번호로 가입해요",
      description: mode === "login" ? "가입한 번호로 인증번호를 보내드려요." : "로그인 ID로 사용할 휴대폰 번호를 입력해 주세요.",
      label: "인증번호 받기",
    },
    otp: { title: "인증번호를 입력해 주세요", description: `${phone}로 보낸 6자리 인증번호를 입력해 주세요.`, label: "인증번호 확인" },
    "new-password": { title: "비밀번호를 설정해 주세요", description: `${MIN_PASSWORD_LENGTH}자 이상으로 설정해 주세요. 다음부터 휴대폰 번호와 비밀번호로 로그인할 수 있어요.` },
  }[step];
  const stepLabel: Record<Step, string> = { password: "로그인", phone: "휴대폰 번호 (ID)", otp: "인증번호", "new-password": "비밀번호 설정" };
  const backLabel = step === "otp" ? "번호 다시 입력"
    : step === "password" || mode === "signup" ? "처음으로" : "로그인으로 돌아가기";

  return <AuthScreen>
    <div className="here-auth-formPage">
      <p className="here-auth-smallBrand">here</p>
      <section className="here-auth-panel" aria-labelledby="auth-title">
        {step !== "new-password" && <Button variant="plain" disabled={busy} onClick={() => { void goBack(); }} className="here-auth-back"><Icon name="back" size={16} />{backLabel}</Button>}
        <div className="here-auth-heading" aria-label={`${mode === "login" ? "로그인" : "가입"} ${stepNumber}단계, 전체 ${currentSteps.length}단계`}>
          {step !== "password" && <>
            <div className="here-auth-progress" aria-hidden="true">{currentSteps.map((item, index) => <span key={item} className="here-auth-progressBar" data-complete={index < stepNumber || undefined} />)}</div>
            <p className="here-auth-stepLabel">{stepNumber} / {currentSteps.length} · {stepLabel[step]}</p>
          </>}
          <h1 id="auth-title" className="here-auth-title">{content.title}</h1>
          <p className="here-auth-description">{content.description}</p>
        </div>
        {step === "new-password" ? <PasswordSetup onSaved={finishPasswordSetup} signup={mode === "signup"} onSkip={mode === "login" ? finishPasswordSetup : undefined} onCancel={signOut} />
        : <form onSubmit={step === "password" ? signIn : step === "phone" ? sendOtp : verifyOtp} className="here-auth-form" aria-describedby={error ? "auth-error" : undefined}>
          {(step === "phone" || step === "password") && <TextField label={mode === "signup" ? "휴대폰 번호 (ID)" : "휴대폰 번호"} ref={stepInputRef} id="phone" name="phone" type="tel" inputMode="tel" autoComplete={step === "password" ? "username" : "tel"} placeholder="01012345678" value={phone} onChange={(event) => setPhone(event.target.value)} required disabled={busy} />}
          {step === "password" && <TextField label="비밀번호" name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} />}
          {step === "otp" && <TextField label="인증번호" ref={stepInputRef} id="sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6자리 숫자" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required disabled={busy} />}
          {error && <p id="auth-error" role="alert" className="here-auth-error">{error}</p>}
          <Button type="submit" fullWidth loading={busy} className="here-auth-submit">{"label" in content && content.label}</Button>
        </form>}
        {step === "password" && <Button variant="plain" fullWidth disabled={busy} className="here-auth-secondary"
          onClick={() => openForm("phone")}>문자로 비밀번호 설정·재설정</Button>}
      </section>
    </div>
  </AuthScreen>;
}
