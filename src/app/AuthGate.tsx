"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeInviteCode, normalizePhone } from "@/lib/invite";
import { setLocalOwner } from "@/lib/local-scope";
import { browserSupabase, isSupabaseConfigured } from "@/lib/supabase";
import { checkEntry, type Entry } from "@/lib/session-entry";
import { Button } from "./ui/Button";
import AuthScreen from "./AuthScreen";
import MemoryConsentGate from "./MemoryConsentGate";
import Welcome from "./Welcome";

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
  // 로그인 전에는 환영 화면을 먼저 보여 주고, 가입·로그인을 고르면 카드로 넘어간다.
  const [started, setStarted] = useState(false);
  const [agreed, setAgreed] = useState(false);
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
      setStarted(true);
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
      if (event === "SIGNED_OUT") { checkGeneration.current++; setStarted(false); enter({ kind: "login" }); }
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
    if (!result?.error) setStarted(false);
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

  const atStart = (mode === "login" && step === "phone") || (mode === "signup" && step === "invite" && !verifiedPhone);

  async function goBack() {
    if (busy) return;
    setError("");
    if (atStart) { setStarted(false); return; }
    if (step === "invite" && verifiedPhone) {
      await signOut();
      return;
    }
    if (step === "phone" && mode === "signup") { setStep("invite"); return; }
    setCode("");
    setVerifiedPhone(null);
    setStep("phone");
  }

  if (loading) return <main className="app-frame bg-white" />;
  if (checkFailed) return <main className="app-frame flex flex-col items-center justify-center gap-4 px-7">
    <p role="alert">로그인 상태를 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.</p>
    <Button variant="tonal" size="medium" onClick={() => { setLoading(true); setAttempt(n => n + 1); }}>다시 확인</Button>
  </main>;
  if (userId) return <MemoryConsentGate key={userId} userId={userId} signOut={signOut}>{children(userId, signOut)}</MemoryConsentGate>;
  if (!started) return <Welcome agreed={agreed} onAgreedChange={setAgreed}
    onSignup={() => { setMode("signup"); setStep("invite"); setError(""); setStarted(true); }}
    onLogin={() => { setMode("login"); setStep("phone"); setError(""); setStarted(true); }} />;

  return <AuthScreen mode={mode} step={step} verifiedPhone={verifiedPhone} phone={phone} invite={invite} code={code} error={error} busy={busy}
    configured={!!client} inputRef={stepInputRef}
    onPhone={setPhone} onInvite={setInvite} onCode={setCode}
    onSubmit={step === "phone" ? sendOtp : step === "otp" ? verifyOtp : redeemInvite}
    onBack={() => { void goBack(); }} />;
}
