"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setLocalOwner } from "@/lib/local-scope";
import { browserSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkEntry, clearPasswordReset, isPasswordResetPending, markPasswordReset, resetStorage, shouldRecheckAuth, type Entry } from "@/lib/session-entry";
import { consentDisplayStorage, hasConsentDisplayHint } from "@/lib/consent-display-cache";
import { hasBasicsDisplayHint } from "@/lib/member-basics";
import { cancelWithdrawal } from "@/lib/member-withdrawal";
import WithdrawalPending from "./WithdrawalPending";
import { emailAuthError, isWithdrawnAuthError, normalizeEmail, socialSignInUrl, WITHDRAWN_MESSAGE, type SocialProvider } from "@/lib/social-auth";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import AuthScreen from "./AuthScreen";
import AuthProviderIcon from "./AuthProviderIcon";
import EmailAuthScreen from "./EmailAuthScreen";
import { EmailCodeField } from "./ui/EmailCodeField";
import { Icon } from "./art";
import { movePage } from "./page-move";
import MemoryConsentGate from "./MemoryConsentGate";
import MemberBasicsGate from "./MemberBasicsGate";
import PasswordSetup from "./PasswordSetup";
import "./first-run.css";

type Step = "login" | "signup" | "signup-code" | "recovery" | "recovery-code" | "new-password";
type Field = "email" | "password" | "confirmation" | "code";
const RESEND_SECONDS = 60;

/** signOut(farewell): 환영 화면으로 돌아가며 farewell 한 줄을 보여 준다(탈퇴를 마쳤을 때). */
export type SignOut = (farewell?: string) => Promise<void>;

export default function AuthGate({ children }: { children: (userId: string, signOut: SignOut) => React.ReactNode }) {
  const client = browserSupabase();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [checkFailed, setCheckFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<Step>("login");
  const [showWelcome, setShowWelcome] = useState(true);
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordPurpose, setPasswordPurpose] = useState<"signup" | "recovery">("signup");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [provider, setProvider] = useState<SocialProvider | null>(null);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<Field | null>(null);
  const [notice, setNotice] = useState("");
  // 환영 화면에 남기는 한 줄(탈퇴를 마쳤거나 탈퇴한 계정으로 들어오려 할 때). 로그인 확인이 다시 돌아도 지우지 않고, 시작 버튼을 누르면 지운다.
  const [farewell, setFarewell] = useState("");
  // 탈퇴 유예기간(7일) 안에 다시 로그인한 회원: 앱에 들이지 않고 탈퇴를 취소할지 묻는다.
  const [pendingWithdrawal, setPendingWithdrawal] = useState<{ id: string; until: string } | null>(null);
  const [cancelError, setCancelError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [resendWait, setResendWait] = useState(0);
  const [direction, setDirection] = useState<"open" | "forward" | "back">("open");
  const [continueSheet, setContinueSheet] = useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const stepInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const checkGeneration = useRef(0);

  const enter = useCallback((entry: Entry) => {
    if (entry.kind === "withdrawn") {
      // 탈퇴한 계정의 남은 세션은 이 기기에서 지우고 환영 화면에 이유를 알린다.
      setFarewell(WITHDRAWN_MESSAGE);
      void client?.auth.signOut({ scope: "local" });
    }
    setPendingWithdrawal(entry.kind === "withdrawal-pending" ? { id: entry.id, until: entry.until } : null);
    setCancelError("");
    const result: Exclude<Entry, { kind: "withdrawn" }> = entry.kind === "withdrawn" ? { kind: "login" } : entry;
    const resetting = result.kind === "member" && isPasswordResetPending(resetStorage(), result.id);
    const memberId = result.kind === "member" && !resetting ? result.id : null;
    setLoading(false);
    setCheckFailed(result.kind === "retry" || result.kind === "signup");
    setLocalOwner(memberId);
    setUserId(memberId);
    setPassword("");
    setPendingUser(resetting || result.kind === "email-signup" ? result.id : null);
    if (result.kind !== "member") setContinueSheet(false);
    if (result.kind === "email-signup") {
      setPasswordPurpose("signup"); setDirection("forward");
      setShowWelcome(false); setStep("new-password"); setEmail(result.email); setCode(""); setError("");
    } else if (resetting) {
      setPasswordPurpose("recovery");
      setDirection("open"); setContinueSheet(false);
      setShowWelcome(false); setStep("new-password"); setCode(""); setError("");
    } else if (result.kind === "login") {
      setShowWelcome(true); setStep("login"); setCode(""); setError("");
    }
  }, [client]);

  useEffect(() => {
    if (!client) return;
    let active = true;
    const generation = ++checkGeneration.current;
    void checkEntry(client).then(result => {
      if (!active || generation !== checkGeneration.current) return;
      // 확인을 마치고 홈(또는 시트)으로 들어갈 때는 시트 단계를 마칠 때와 같은 화면 넘김으로 바꾼다.
      if (result.kind === "member") void movePage("enter", () => enter(result)); else enter(result);
    });
    return () => { active = false; };
  }, [client, attempt, enter]);

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearPasswordReset(resetStorage()); checkGeneration.current++;
        // 로그아웃해서 환영 화면으로 돌아갈 때도 시트를 마칠 때와 같은 화면 넘김을 쓴다.
        void movePage("enter", () => enter({ kind: "login" })); return;
      }
      if (!shouldRecheckAuth(event, session?.user.id, { userId, pendingUserId: pendingUser,
        idle: showWelcome || step === "login", busy: busyRef.current })) return;
      checkGeneration.current++;
      if (userId || pendingUser) setLoading(true);
      setAttempt(n => n + 1);
    });
    const recover = () => { if (checkFailed && !busyRef.current) setAttempt(n => n + 1); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => { data.subscription.unsubscribe(); window.removeEventListener("online", recover); window.removeEventListener("focus", recover); };
  }, [client, userId, pendingUser, step, showWelcome, checkFailed, enter]);

  useEffect(() => {
    if (loading || showWelcome) return;
    const wait = direction === "open" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 480 : 0;
    const timer = window.setTimeout(() => stepInputRef.current?.focus({ preventScroll: true }), wait);
    return () => window.clearTimeout(timer);
  }, [step, showWelcome, loading, direction]);

  useEffect(() => {
    if (!error || busy || showWelcome) return;
    const input = errorField === "password" ? passwordInputRef : stepInputRef;
    input.current?.focus({ preventScroll: true });
  }, [error, errorField, busy, showWelcome]);

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => setResendWait(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000))), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const signOut = useCallback<SignOut>(async (message) => {
    // 버튼 onClick에 바로 넘겨도 이벤트를 문구로 보지 않는다.
    if (typeof message === "string" && message) setFarewell(message);
    const result = await client?.auth.signOut({ scope: "local" });
    if (!result?.error) clearPasswordReset(resetStorage());
    // 성공하면 SIGNED_OUT 이벤트가 화면 넘김과 함께 환영 화면으로 바꾼다(여기서 또 바꾸면 넘김이 끊긴다). 실패하면 다시 확인 화면.
    if (!client || result?.error) enter({ kind: result?.error ? "retry" : "login" });
  }, [client, enter]);

  /** 유예기간 안의 탈퇴 취소: 성공하면 다시 확인해서 그대로 앱에 들어간다. 그사이 기간이 끝났으면 탈퇴한 계정으로 돌려보낸다. */
  async function undoWithdrawal() {
    if (!client || busyRef.current) return;
    setWorking(true); setCancelError("");
    try {
      const result = await cancelWithdrawal(client, AbortSignal.timeout(10000));
      if (result === "expired") { await signOut(WITHDRAWN_MESSAGE); return; }
      if (result === "not_member") { setCancelError("회원 정보를 찾지 못했어요. 로그아웃한 뒤 다시 시도해 주세요."); return; }
      checkGeneration.current++;
      setAttempt(n => n + 1);
    } catch { setCancelError("탈퇴를 취소하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
    finally { setWorking(false); }
  }

  function fail(message: string, field: Field | null = null) {
    setErrorField(field); setError(message); setNotice("");
  }
  function setWorking(value: boolean) { busyRef.current = value; setBusy(value); }
  function startResendWait() { setResendAt(Date.now() + RESEND_SECONDS * 1000); setResendWait(RESEND_SECONDS); }
  function openForm(next: Step, back = false) {
    if (busyRef.current) return;
    setDirection(showWelcome ? "open" : back ? "back" : "forward");
    setStep(next); setShowWelcome(false); setFarewell("");
    setPassword(""); setCode(""); setError(""); setNotice("");
  }
  function closeSheet() {
    setShowWelcome(true); setPassword(""); setCode(""); setError(""); setNotice("");
  }
  async function finishInSheet(entry: Entry) {
    if (entry.kind === "member" && !isPasswordResetPending(resetStorage(), entry.id)) {
      // 이 기기에서 동의와 성별·생년월일 확인을 모두 마친 회원만 시트 없이 바로 넘어간다.
      if (hasConsentDisplayHint(consentDisplayStorage(), entry.id) && hasBasicsDisplayHint(consentDisplayStorage(), entry.id)) {
        await movePage("enter", () => enter(entry)); return;
      }
      setContinueSheet(true);
    }
    enter(entry);
  }
  async function finishPasswordSetup() {
    if (!client) return;
    clearPasswordReset(resetStorage());
    setWorking(true);
    try { await finishInSheet(await checkEntry(client)); }
    finally { setWorking(false); }
  }

  async function startSocial(provider: SocialProvider) {
    if (!client || busyRef.current) return;
    setProvider(provider); setWorking(true); setError(""); setFarewell("");
    try {
      const url = await socialSignInUrl(client, provider, location.origin, {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL!, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      });
      location.assign(url);
    } catch (e) {
      fail(e instanceof Error && e.name === "Error" ? e.message : "로그인에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setWorking(false); setProvider(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!client || busyRef.current) return;
    const target = normalizeEmail(email);
    if (!target) { fail("이메일 주소를 확인해 주세요.", "email"); return; }
    if (step === "login" && !password) { fail("비밀번호를 입력해 주세요.", "password"); return; }
    if (step.endsWith("-code") && !/^\d{6}$/.test(code.trim())) { fail("메일에 있는 인증번호를 입력해 주세요.", "code"); return; }
    checkGeneration.current++;
    setWorking(true); setError(""); setNotice("");
    try {
      if (step === "login") {
        const { data, error } = await client.auth.signInWithPassword({ email: target, password });
        if (error?.code === "email_not_confirmed") {
          setVerifiedEmail(target); setPassword(""); setStep("signup-code"); setDirection("forward");
          setNotice("아직 이메일 인증이 끝나지 않았어요. 가입 메일을 확인하거나 인증번호를 다시 받아 주세요."); return;
        }
        if (isWithdrawnAuthError(error)) { fail(WITHDRAWN_MESSAGE); return; }
        if (error || !data.user) { fail(error?.code === "invalid_credentials" ? "이메일과 비밀번호를 확인해 주세요." : "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.", "password"); return; }
        clearPasswordReset(resetStorage());
        await finishInSheet(await checkEntry(client, data.user));
      } else if (step === "signup") {
        const { error } = await client.auth.signInWithOtp({ email: target, options: { shouldCreateUser: true } });
        if (error) { fail(emailAuthError(error, "send")); return; }
        setVerifiedEmail(target); setPassword(""); setCode("");
        setStep("signup-code"); setDirection("forward"); startResendWait();
      } else if (step === "recovery") {
        const { error } = await client.auth.resetPasswordForEmail(target);
        if (error) { fail(emailAuthError(error, "send")); return; }
        setVerifiedEmail(target); setStep("recovery-code"); setDirection("forward"); setCode(""); startResendWait();
      } else if (step === "signup-code" || step === "recovery-code") {
        const { data, error } = await client.auth.verifyOtp({ email: verifiedEmail, token: code.trim(), type: step === "recovery-code" ? "recovery" : "email" });
        if (error || !data.user) { fail(emailAuthError(error, "verify"), "code"); return; }
        if (step === "recovery-code") {
          markPasswordReset(resetStorage(), data.user.id); setPendingUser(data.user.id); setPasswordPurpose("recovery");
          setStep("new-password"); setDirection("forward"); setCode("");
        } else {
          clearPasswordReset(resetStorage());
          await finishInSheet(await checkEntry(client, data.user));
        }
      }
    } catch { fail("요청을 완료하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
    finally { setWorking(false); }
  }

  async function resendCode() {
    if (!client || !verifiedEmail || busyRef.current || resendWait > 0) return;
    setWorking(true); setError(""); setNotice("");
    try {
      const { error } = step === "recovery-code" ? await client.auth.resetPasswordForEmail(verifiedEmail)
        : await client.auth.signInWithOtp({ email: verifiedEmail, options: { shouldCreateUser: true } });
      if (error) { fail(emailAuthError(error, "send")); startResendWait(); return; }
      setCode(""); startResendWait();
      setNotice("인증 메일을 다시 요청했어요. 받은 편지함과 스팸함을 확인해 주세요.");
    } catch { fail("메일을 보내지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
    finally { setWorking(false); stepInputRef.current?.focus({ preventScroll: true }); }
  }

  const brand = <h1 className="here-auth-brand"><span>나와 가장 가까운 친구</span><span>here</span></h1>;
  // 앱을 열 때·로그인에서 돌아올 때의 확인: 환영 화면과 같은 침실 그림에 발자국만(로딩 화면 시안 A를 이 그림으로 대신). 배경이 바뀌지 않고 홈으로 넘어간다.
  if (loading) return <AuthScreen key={attempt} loading
    onRetry={() => { checkGeneration.current++; setAttempt(n => n + 1); }} onSignOut={() => { void signOut(); }} />;
  if (checkFailed) return <AuthScreen>
    <div className="here-auth-welcome">{brand}<div className="here-auth-welcomeBottom here-auth-retry">
      <p role="alert" className="here-auth-unavailable">연결하지 못했어요</p>
      <Button tone="ink" fullWidth onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>다시 확인</Button>
      <Button variant="tonal" tone="ink" fullWidth onClick={() => { void signOut(); }}>로그아웃</Button>
    </div></div>
  </AuthScreen>;
  if (pendingWithdrawal) return <WithdrawalPending until={pendingWithdrawal.until} busy={busy} error={cancelError}
    onCancel={() => { void undoWithdrawal(); }} onSignOut={() => { void signOut(); }} />;
  // 로그인 뒤 시트 단계: 기억 동의 → 성별·생년월일(새 회원만) → 캐릭터 만나기·홈. 화면 넘김은 마지막 시트 단계가 맡는다.
  if (userId) return <MemoryConsentGate key={userId} userId={userId} signOut={signOut} continueSheet={continueSheet} handoff>
    <MemberBasicsGate userId={userId} signOut={signOut}>{children(userId, signOut)}</MemberBasicsGate>
  </MemoryConsentGate>;

  const codeStep = step === "signup-code" || step === "recovery-code";
  const copy = {
    login: { title: <>다시 만나서 반가워요.</>, description: "가입한 이메일과 비밀번호를 입력해 주세요.", submit: "로그인" },
    signup: { title: <>반가워요.<br />이메일을 알려 주세요.</>, description: "", submit: "인증번호 받기" },
    "signup-code": { title: <>인증번호 6자리</>, description: `${verifiedEmail}로 보낸 인증번호를 입력해 주세요.`, submit: "인증번호 확인" },
    recovery: { title: <>비밀번호를<br />다시 설정할게요.</>, description: "가입한 이메일로 인증번호를 보내 드려요.", submit: "인증번호 받기" },
    "recovery-code": { title: <>인증번호 6자리</>, description: `${verifiedEmail} 계정이 있다면 인증메일을 보내 드려요.`, submit: "인증번호 확인" },
    "new-password": { title: passwordPurpose === "signup" ? <>마지막으로,<br />비밀번호를 만들어 주세요.</> : <>새 비밀번호를<br />만들어 주세요.</>, description: "8자 이상으로 설정해 주세요.", submit: "" },
  }[step];
  const describedBy = [copy.description && "auth-desc", error && "auth-error"].filter(Boolean).join(" ") || undefined;
  const invalid = (field: Field) => Boolean(error && errorField === field) || undefined;
  const back = () => {
    if (step === "new-password") { void signOut(); return; }
    if (step === "signup" || step === "login") { closeSheet(); return; }
    openForm(step === "signup-code" ? "signup" : step === "recovery-code" ? "recovery" : "login", true);
  };

  if (!showWelcome) return <EmailAuthScreen title={copy.title} description={copy.description} onBack={back} busy={busy}
    progress={step === "signup" ? 1 : step === "signup-code" ? 2 : step === "new-password" && passwordPurpose === "signup" ? 3 : undefined}>
    {step === "new-password" ? <PasswordSetup sheet signup={passwordPurpose === "signup"} inputRef={stepInputRef}
      onSaved={finishPasswordSetup} onBusyChange={setWorking} onCancel={signOut} />
      : <form key={step} noValidate onSubmit={submit} className="email-auth-form">
        <div className="email-auth-fields">
          {!codeStep && <TextField label="이메일" hideLabel={step !== "login"} variant="plain" ref={stepInputRef} name="email" type="email" inputMode="email"
            autoComplete={step === "login" ? "username" : "email"} autoCapitalize="none" spellCheck={false} enterKeyHint={step === "login" ? "next" : "go"}
            placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)} required readOnly={busy} aria-describedby={describedBy} aria-invalid={invalid("email")} />}
          {step === "login" && <TextField label="비밀번호" variant="plain" ref={passwordInputRef} name="password" type="password" autoComplete="current-password"
            placeholder="비밀번호" value={password} onChange={e => setPassword(e.target.value)} required readOnly={busy} aria-describedby={describedBy} aria-invalid={invalid("password")} />}
          {codeStep && <EmailCodeField value={code} onChange={setCode} inputRef={stepInputRef} readOnly={busy} invalid={invalid("code")} describedBy={describedBy} />}
          {error && <p id="auth-error" role="alert" className="email-auth-error">{error}</p>}
          {notice && !error && <p role="status" className="email-auth-note">{notice}</p>}
          {step === "login" && <Button variant="plain" disabled={busy} className="email-auth-link" onClick={() => openForm("recovery")}>비밀번호를 잊었어요</Button>}
          {codeStep && <div>
            <p className="email-auth-note">메일이 없으면 스팸함도 확인해 주세요.</p>
            {resendWait > 0 ? <p className="email-auth-note">{resendWait}초 후 다시 받을 수 있어요</p>
              : <Button variant="plain" disabled={busy} className="email-auth-link" onClick={() => { void resendCode(); }}>인증번호 다시 받기</Button>}
          </div>}
        </div>
        <div className="email-auth-footer">
          {step === "signup" && <Button variant="plain" className="email-auth-link" disabled={busy} onClick={() => openForm("login")}>이미 가입했어요 · 로그인</Button>}
          {step === "login" && <Button variant="plain" className="email-auth-link" disabled={busy} onClick={() => openForm("signup", true)}>이메일로 가입하기</Button>}
          <Button type="submit" tone="ink" className="email-auth-next" loading={busy} disabled={codeStep && code.length !== 6} aria-label={copy.submit}><Icon name="forward" size={26} /></Button>
        </div>
      </form>}
  </EmailAuthScreen>;

  return <AuthScreen welcome>
    <div className="here-auth-welcome">{brand}
      <div className="here-auth-welcomeBottom">
        {showWelcome && error && <p role="alert" className="here-auth-unavailable auth-provider-error">{error}</p>}
        {showWelcome && !error && farewell && <p role="status" className="here-auth-unavailable auth-provider-error">{farewell}</p>}
        {client ? <div className="here-auth-actions">
          <Button className="auth-provider-button auth-provider-kakao" tone="ink" fullWidth loading={busy && provider === "kakao"} disabled={busy} onClick={() => { void startSocial("kakao"); }}><AuthProviderIcon provider="kakao" />카카오로 시작하기</Button>
          <Button className="auth-provider-button auth-provider-google" tone="ink" fullWidth loading={busy && provider === "google"} disabled={busy} onClick={() => { void startSocial("google"); }}><AuthProviderIcon provider="google" />구글로 시작하기</Button>
        </div> : <p role="status" className="here-auth-unavailable">로그인을 준비하고 있어요.<br />잠시 후 다시 방문해 주세요.</p>}
      </div>
    </div>
  </AuthScreen>;
}
