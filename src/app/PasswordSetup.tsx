"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { browserSupabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, passwordSetupError } from "@/lib/password-policy";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";

/** 비밀번호 정하기. sheet면 로그인·가입 시트 모양(위에 이름표, 큰 입력칸, 검정 버튼)으로, 아니면 설정 화면 안의 작은 폼으로 그린다. */
export default function PasswordSetup({ onSaved, onSkip, onCancel, signup = false, sheet = false }: {
  onSaved: () => void;
  onSkip?: () => void;
  onCancel?: () => Promise<void>;
  signup?: boolean;
  sheet?: boolean;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const passwordInput = useRef<HTMLInputElement>(null);

  useEffect(() => { passwordInput.current?.focus(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = browserSupabase();
    if (!client || busy) return;
    const validationError = passwordSetupError(password, confirmation);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { error: saveError } = await client.auth.updateUser({ password });
      if (!saveError) {
        setPassword("");
        setConfirmation("");
        onSaved();
      } else if (saveError.code === "weak_password" || saveError.code === "same_password") {
        setError("이전 비밀번호와 다른, 추측하기 어려운 비밀번호를 입력해 주세요.");
      } else if (saveError.code === "reauthentication_needed") {
        setError("보안을 위해 다시 본인 확인이 필요해요. 로그아웃 후 ‘문자로 비밀번호 설정·재설정’을 이용해 주세요.");
      } else {
        setError("비밀번호를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setError("비밀번호를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (sheet) return (
    <form onSubmit={save} className="auth-sheet-form">
      <div className="auth-sheet-fields">
        <TextField ref={passwordInput} label="비밀번호" variant="plain" placeholder={`${MIN_PASSWORD_LENGTH}자 이상`} type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
          value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} inputClassName="fr-input" />
        <TextField label="비밀번호 확인" variant="plain" placeholder="한 번 더 입력" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
          value={confirmation} onChange={(event) => setConfirmation(event.target.value)} error={error} required disabled={busy} inputClassName="fr-input" />
      </div>
      <div className="auth-sheet-actions">
        <Button type="submit" tone="ink" fullWidth loading={busy}>{signup ? "가입 완료" : "저장"}</Button>
        {!signup && onSkip && <Button variant="plain" disabled={busy} className="fr-link" onClick={onSkip}>나중에 할게요</Button>}
        {onCancel && <Button variant="plain" disabled={busy} className="fr-link" onClick={() => { void onCancel(); }}>로그아웃</Button>}
      </div>
    </form>
  );

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <TextField ref={passwordInput} label={signup ? "비밀번호" : "새 비밀번호"} type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
        value={password} onChange={(event) => setPassword(event.target.value)} required disabled={busy} />
      <TextField label={signup ? "비밀번호 확인" : "새 비밀번호 확인"} type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
        value={confirmation} onChange={(event) => setConfirmation(event.target.value)} error={error} required disabled={busy} />
      <Button type="submit" fullWidth loading={busy}>{signup ? "가입 완료" : "비밀번호 저장"}</Button>
      {!signup && onSkip && <Button variant="plain" fullWidth disabled={busy} className="min-h-11 text-sm" onClick={onSkip}>나중에 설정하기</Button>}
      {onCancel && <Button variant="plain" fullWidth disabled={busy} className="min-h-11 text-sm" onClick={() => { void onCancel(); }}>로그아웃하고 처음으로</Button>}
    </form>
  );
}
