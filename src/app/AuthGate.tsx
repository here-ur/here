"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePhone } from "@/lib/invite";
import { setLocalOwner } from "@/lib/local-scope";
import { browserSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkEntry, clearPasswordReset, isPasswordResetPending, markPasswordReset, resetStorage, shouldRecheckAuth, smsError, type Entry } from "@/lib/session-entry";
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
// 오류 문구가 가리키는 입력칸. credentials는 번호와 비밀번호 둘 다(어느 쪽이 틀렸는지 서버가 알려 주지 않는다).
type Field = "phone" | "password" | "code" | "credentials";
// 인증번호를 다시 받기 전에 기다리는 시간(초). 서버가 더 기다리라고 하면 그 시간을 따른다.
const RESEND_SECONDS = 30;

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
  const [errorField, setErrorField] = useState<Field | null>(null);
  const [notice, setNotice] = useState("");
  // 회원가입으로 들어왔는데 이미 가입된 번호였을 때(비밀번호 재설정으로 바꿔 알린다)
  const [memberNotice, setMemberNotice] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [resendWait, setResendWait] = useState(0);
  // 시트 안에서 단계가 바뀔 때 새 내용이 들어오는 방향
  const [direction, setDirection] = useState<"open" | "forward" | "back">("open");
  // 방금 시트에서 로그인·가입을 마쳤으면 기억 동의가 같은 시트에서 이어진다.
  const [continueSheet, setContinueSheet] = useState(false);
  const stepInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const welcomeActionRef = useRef<HTMLButtonElement>(null);
  const checkGeneration = useRef(0);
  // 문자 인증 뒤 새 비밀번호를 정하는 중인 계정. 다른 탭에서 다른 계정이 로그인하면 이 계정의 비밀번호를 그 세션으로 바꾸지 않게 비교한다.
  const [pendingUser, setPendingUser] = useState<string | null>(null);

  const enter = useCallback((result: Entry) => {
    // 문자 인증만 하고 새 비밀번호를 정하지 않은 회원은(다시 불러오기·'다시 확인' 포함) 앱에 들이지 않고 비밀번호 설정으로 돌려보낸다.
    const resetting = result.kind === "member" && isPasswordResetPending(resetStorage(), result.id);
    const memberId = result.kind === "member" && !resetting ? result.id : null;
    setLoading(false);
    setBusy(false);
    setPassword("");
    setCheckFailed(result.kind === "retry");
    setLocalOwner(memberId);
    setUserId(memberId);
    // 가입 계속(signup)은 같은 계정이므로 정하는 중인 계정을 그대로 둔다.
    if (result.kind !== "signup") setPendingUser(result.kind === "member" && resetting ? result.id : null);
    // 시트에서 이어 가기는 회원으로 들어갈 때만 유지한다(로그아웃·재시도·가입 계속이면 지운다).
    if (result.kind !== "member") setContinueSheet(false);
    if (resetting) {
      // 이 길은 확인 중·확인 실패 화면 다음이라 시트가 새로 올라온다. 옆에서 들어오는 동작 없이 다 올라온 뒤 첫 칸에 포커스한다.
      setDirection("open");
      setContinueSheet(false);
      setShowWelcome(false); setMemberNotice(false);
      setMode("login"); setStep("new-password"); setCode(""); setError("");
    } else if (result.kind === "signup") {
      setShowWelcome(false); setMemberNotice(false);
      setMode("signup"); setStep("new-password");
      setVerifiedPhone(result.phone); setPhone(result.phone);
    } else if (result.kind === "login") {
      setShowWelcome(true); setMemberNotice(false);
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
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { clearPasswordReset(resetStorage()); checkGeneration.current++; enter({ kind: "login" }); return; }
      const sessionUser = session?.user.id ?? null;
      let pending = pendingUser;
      // 다시 불러와 가입을 이어 가는 중이면, 처음 알게 된 세션 계정을 비밀번호를 정하는 계정으로 기억한다.
      if (!userId && step === "new-password" && !pending && sessionUser) { pending = sessionUser; setPendingUser(sessionUser); }
      if (!shouldRecheckAuth(event, sessionUser, { userId, pendingUserId: pending, idle: showWelcome || step === "password", busy })) return;
      // 다른 계정의 세션이 됐으면 지금 화면(앞 계정의 홈·비밀번호 설정)을 바로 내리고 그 세션으로 다시 확인한다.
      checkGeneration.current++;
      if (userId || pending) setLoading(true);
      setAttempt(n => n + 1);
    });
    const recover = () => { if (checkFailed && !busy) setAttempt(n => n + 1); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("online", recover); window.removeEventListener("focus", recover); };
  }, [client, userId, pendingUser, busy, step, showWelcome, checkFailed, enter]);

  useEffect(() => {
    if (!loading && showWelcome && welcomeAction) welcomeActionRef.current?.focus();
    if (loading || showWelcome) return;
    // 시트는 열릴 때 자기 자신에 포커스를 두므로, 올라오는 동작이 끝난 뒤 첫 입력칸으로 옮긴다.
    // 움직이는 중에 스크롤로 입력칸을 찾아가면 화면 전체가 튀어서, 스크롤 없이 포커스만 옮긴다.
    const wait = direction === "open" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 480 : 0;
    const timer = window.setTimeout(() => stepInputRef.current?.focus({ preventScroll: true }), wait);
    return () => window.clearTimeout(timer);
  }, [step, showWelcome, loading, welcomeAction, direction]);

  useEffect(() => {
    if (!error || busy) return;
    // 보내는 동안 누른 버튼이 잠기며 포커스가 빠지므로, 오류가 나면 고칠 입력칸으로 포커스를 돌려준다.
    (errorField === "password" || errorField === "credentials" ? passwordInputRef : stepInputRef).current?.focus({ preventScroll: true });
  }, [error, errorField, busy]);

  useEffect(() => {
    if (!resendAt) return;
    // 문자 앱에 다녀오는 동안 타이머가 멈춰도 남은 시간이 맞도록, 매번 끝나는 시각에서 다시 계산한다.
    let timer = 0;
    const tick = () => {
      const left = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
      setResendWait(left);
      if (left > 0) timer = window.setTimeout(tick, 1000);
    };
    timer = window.setTimeout(tick, 1000);
    return () => window.clearTimeout(timer);
  }, [resendAt]);

  const signOut = useCallback(async () => {
    const result = await client?.auth.signOut({ scope: "local" });
    if (!result?.error) clearPasswordReset(resetStorage());
    enter({ kind: result?.error ? "retry" : "login" });
  }, [client, enter]);

  function fail(message: string, field: Field | null = null) {
    setErrorField(field);
    setError(message);
    setNotice("");
  }

  function startResendWait(seconds: number) {
    setResendAt(Date.now() + seconds * 1000);
    setResendWait(seconds);
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) { fail("휴대폰 번호를 확인해 주세요.", "phone"); return; }
    if (!password) { fail("비밀번호를 입력해 주세요.", "password"); return; }
    checkGeneration.current++;
    setBusy(true);
    setError("");
    try {
      const { data, error: signInError } = await client.auth.signInWithPassword({ phone: normalizedPhone, password });
      if (signInError || !data.user) {
        if (signInError?.code === "invalid_credentials") fail("휴대폰 번호와 비밀번호를 확인해 주세요.", "credentials");
        else fail("로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      // 비밀번호로 들어왔으면 남아 있던 재설정 표시는 필요 없다.
      clearPasswordReset(resetStorage());
      const entry = await checkEntry(client, data.user);
      if (entry.kind === "member") await finishInSheet(entry);
      else { setDirection("forward"); enter(entry); }
    } catch {
      fail("로그인하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function afterSms(entry: Entry) {
    setDirection("forward");
    if (entry.kind !== "member") { enter(entry); return; }
    // 회원가입으로 들어왔어도 이미 가입된 번호면 비밀번호 재설정으로 바꿔 알린다(가입 문구로 기존 비밀번호를 덮어쓰지 않게).
    setMemberNotice(mode === "signup");
    setMode("login");
    setBusy(false);
    setCode("");
    setStep("new-password");
  }

  function requestCode(auth: NonNullable<typeof client>, target: string) {
    return auth.auth.signInWithOtp({ phone: target, options: { shouldCreateUser: mode === "signup" } });
  }

  async function sendOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busy) return;
    checkGeneration.current++;
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) { fail("휴대폰 번호를 확인해 주세요.", "phone"); return; }
    setBusy(true);
    setError("");
    try {
      const { error: otpError } = await requestCode(client, normalizedPhone);
      if (otpError) {
        const failure = smsError(otpError, "send");
        if (failure.waitSeconds) startResendWait(failure.waitSeconds);
        fail(failure.message, failure.field ?? null);
        return;
      }
      setDirection("forward");
      setVerifiedPhone(normalizedPhone);
      setCode("");
      setNotice("");
      startResendWait(RESEND_SECONDS);
      setStep("otp");
    } catch {
      fail("인증번호를 보내지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  // 인증번호가 늦게 오거나 만료됐을 때 번호 단계로 돌아가지 않고 같은 번호로 다시 보낸다.
  async function resendCode() {
    if (!client || !verifiedPhone || busy || resendWait > 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: otpError } = await requestCode(client, verifiedPhone);
      if (otpError) {
        const failure = smsError(otpError, "send");
        if (failure.waitSeconds) startResendWait(failure.waitSeconds);
        fail(failure.message);
        return;
      }
      setCode("");
      startResendWait(RESEND_SECONDS);
      setNotice("인증번호를 다시 보냈어요.");
    } catch {
      fail("인증번호를 보내지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
      // 누른 버튼이 기다리는 시간 표시로 바뀌므로 포커스는 인증번호 칸으로 돌려준다.
      stepInputRef.current?.focus({ preventScroll: true });
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!client || !verifiedPhone || busy) return;
    if (!/^\d{6}$/.test(code.trim())) { fail("인증번호 6자리를 입력해 주세요.", "code"); return; }
    checkGeneration.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: verifyError } = await client.auth.verifyOtp({ phone: verifiedPhone, token: code.trim(), type: "sms" });
      // 연결이 끊긴 것은 인증번호가 틀린 것과 다르게 알리고, 입력한 번호는 그대로 둔다.
      if (verifyError) { const failure = smsError(verifyError, "verify"); fail(failure.message, failure.field ?? null); return; }
      if (!data.user) { fail("인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
      // 인증한 순간부터 새 비밀번호를 정할 때까지 표시해 둔다. 회원 확인이 실패해 '다시 확인'으로 들어와도 비밀번호 설정을 건너뛰지 않는다.
      // 새 가입자는 회원이 아니라서 이 표시와 상관없이 비밀번호 설정으로 가고, 저장하면 지운다.
      markPasswordReset(resetStorage(), data.user.id);
      setPendingUser(data.user.id);
      afterSms(await checkEntry(client, data.user));
    } catch {
      fail("인증을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  // 시트 안의 뒤로 가기: 인증번호 → 번호, 번호(비밀번호 재설정) → 로그인. 첫 단계에서는 뒤로 가기 대신 닫기만 있다.
  function goBack() {
    if (busy) return;
    setDirection("back");
    setError("");
    setNotice("");
    setCode("");
    setVerifiedPhone(null);
    setStep(step === "otp" ? "phone" : "password");
  }

  // 시트가 닫히는 동작이 끝나면 환영 화면만 남긴다.
  function closeSheet() {
    setShowWelcome(true);
    setError("");
    setNotice("");
    setPassword("");
    setCode("");
    setVerifiedPhone(null);
  }

  // 비밀번호를 저장하면 회원 확인을 바로 하고, 로그인과 같은 전환으로 다음 화면에 넘어간다(사진 화면을 다시 거치지 않는다).
  async function finishPasswordSetup() {
    if (!client) return;
    clearPasswordReset(resetStorage());
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
    setNotice("");
    setMemberNotice(false);
    setShowWelcome(false);
  }

  const brand = <h1 className="here-auth-brand"><span>나와 가장 가까운 친구</span><span>here</span></h1>;

  if (loading) return <AuthScreen loading />;
  // 확인 실패도 첫 실행과 같은 배경·검정 알약 버튼으로 보여 준다.
  if (checkFailed) return <AuthScreen>
    <div className="here-auth-welcome">
      {brand}
      <div className="here-auth-welcomeBottom here-auth-retry">
        <p role="alert" className="here-auth-unavailable">로그인 상태를 확인하지 못했어요.<br />연결을 확인하고 다시 시도해 주세요.</p>
        <Button tone="ink" fullWidth onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>다시 확인</Button>
      </div>
    </div>
  </AuthScreen>;
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
    "new-password": { title: "비밀번호 설정", description: memberNotice ? "이미 가입된 번호예요. 새 비밀번호를 정하면 바로 들어가요." : "", submit: "" },
  }[step];
  const canGoBack = step === "otp" || (step === "phone" && mode === "login");
  const digits = code.padEnd(6, " ").slice(0, 6).split("");
  // 단계 설명과 오류는 포커스를 받는 입력칸에 이어서 읽히게 한다.
  const describedBy = [copy.description && "auth-desc", error && "auth-error"].filter(Boolean).join(" ") || undefined;
  const invalid = (field: "phone" | "password" | "code") =>
    error && (errorField === field || (errorField === "credentials" && field !== "code")) ? true : undefined;

  const sheet = !showWelcome && <Sheet title={copy.title} onClose={closeSheet} className="auth-sheet" slide keyboardAware locked={busy}
    onBack={canGoBack ? goBack : undefined} backLabel={step === "otp" ? "번호 다시 입력" : "로그인으로 돌아가기"}
    dismissible={step !== "new-password"}>
    <div key={step} className="fr-scope auth-sheet-step" data-direction={direction}>
      {(currentSteps.length > 1 || copy.description) && <div className="auth-sheet-meta">
        {currentSteps.length > 1 && <span className="fr-steps" role="img" aria-label={`${mode === "login" ? "비밀번호 재설정" : "가입"} ${stepNumber}/${currentSteps.length}단계`}>
          {currentSteps.map((item, index) => <i key={item} data-done={index < stepNumber || undefined} />)}
        </span>}
        {copy.description && <p id="auth-desc" className="auth-sheet-desc">{copy.description}</p>}
      </div>}
      {/* 비밀번호 재설정·가입 모두 새 비밀번호를 정해야 끝난다('나중에'는 두지 않는다). 그만두려면 로그아웃한다. */}
      {step === "new-password" ? <PasswordSetup sheet inputRef={stepInputRef} describedBy={copy.description ? "auth-desc" : undefined}
        onSaved={() => { void finishPasswordSetup(); }} signup={mode === "signup"} onCancel={signOut} />
      : <form noValidate onSubmit={step === "password" ? signIn : step === "phone" ? sendOtp : verifyOtp} className="auth-sheet-form">
        {/* noValidate: 입력칸 검사는 브라우저 말풍선 대신 아래 오류 줄(fr-error)로 알린다. */}
        <div className="auth-sheet-fields">
          {/* 이름표는 입력칸 위에 따로 두고, 입력칸 안에는 예시만 흐리게 보인다. 보내는 동안에는 잠그기만 하고(readOnly) 포커스는 남긴다. */}
          {(step === "phone" || step === "password") && <TextField label="휴대폰 번호" variant="plain" ref={stepInputRef} id="phone" name="phone" type="tel" inputMode="tel"
            autoComplete={step === "password" ? "username" : "tel"} placeholder="01012345678" value={phone} onChange={(event) => setPhone(event.target.value)} required readOnly={busy}
            aria-describedby={describedBy} aria-invalid={invalid("phone")} inputClassName="fr-input" />}
          {step === "password" && <TextField label="비밀번호" variant="plain" ref={passwordInputRef} name="password" type="password" autoComplete="current-password"
            placeholder="비밀번호 입력" value={password} onChange={(event) => setPassword(event.target.value)} required readOnly={busy}
            aria-describedby={describedBy} aria-invalid={invalid("password")} inputClassName="fr-input" />}
          {/* 여섯 칸은 보이기만 하고, 실제 입력은 칸 위에 투명하게 겹친 입력칸 하나가 받는다(문자 자동 채우기 유지). */}
          {step === "otp" && <span className="auth-label" aria-hidden="true">인증번호</span>}
          {step === "otp" && <div className="fr-otp" data-invalid={invalid("code") ? "" : undefined}>
            {digits.map((digit, index) => <span key={index} aria-hidden="true" data-current={index === Math.min(code.length, 5) ? "" : undefined}>{digit.trim()}</span>)}
            <TextField label="인증번호" hideLabel variant="plain" ref={stepInputRef} id="sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required readOnly={busy}
              aria-describedby={describedBy} aria-invalid={invalid("code")} inputClassName="fr-otp-input" />
          </div>}
          {error && <p id="auth-error" role="alert" className="fr-error">{error}</p>}
          {step === "otp" && notice && !error && <p role="status" className="auth-sheet-note">{notice}</p>}
          {/* 키보드가 올라와도 버튼 묶음이 낮게 유지되도록, 비밀번호 찾기·인증번호 다시 받기는 입력칸 바로 아래에 둔다. */}
          {step === "password" && <Button variant="plain" disabled={busy} className="fr-link auth-sheet-forgot" onClick={() => openForm("phone")}>비밀번호를 잊었어요</Button>}
          {step === "otp" && (resendWait > 0
            ? <p className="auth-sheet-resend">{resendWait}초 후 다시 받을 수 있어요</p>
            : <Button variant="plain" disabled={busy} className="fr-link auth-sheet-forgot" onClick={() => { void resendCode(); }}>인증번호 다시 받기</Button>)}
        </div>
        <div className="auth-sheet-actions">
          <Button type="submit" tone="ink" fullWidth loading={busy} disabled={step === "otp" && code.length < 6}>{copy.submit}</Button>
        </div>
      </form>}
    </div>
  </Sheet>;

  return <AuthScreen welcome>
    <div className="here-auth-welcome">
      {brand}
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
