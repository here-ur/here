"use client";

import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { browserSupabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, passwordSetupError } from "@/lib/password-policy";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";

/** 비밀번호 정하기. sheet면 로그인·가입 시트 모양(위에 이름표, 큰 입력칸, 검정 버튼)으로, 아니면 설정 화면 안의 작은 폼으로 그린다.
 * 가입·재설정 모두 건너뛸 수 없다('나중에' 버튼을 두지 않는다). 그만두려면 onCancel(로그아웃)만 있다.
 * sheet에서는 시트가 다 올라온 뒤 부모(AuthGate)가 inputRef로 첫 칸에 포커스를 옮긴다(올라오는 중에 포커스하면 화면이 튄다).
 * describedBy: 첫 칸과 함께 읽을 설명(시트 위쪽 안내 문구)의 id. */
export default function PasswordSetup({ onSaved, onCancel, signup = false, sheet = false, inputRef, describedBy, onBusyChange }: {
  onSaved: () => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  onCancel?: () => Promise<void>;
  signup?: boolean;
  sheet?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  describedBy?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // 오류가 어느 칸 것인지: 길이·약한 비밀번호는 첫 칸, 불일치는 확인 칸, 저장·연결 문제는 칸 밖의 한 줄.
  const [errorField, setErrorField] = useState<"password" | "confirmation" | "form">("password");
  const ownInput = useRef<HTMLInputElement>(null);
  const passwordInput = inputRef ?? ownInput;
  const confirmationInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!sheet) passwordInput.current?.focus(); }, [sheet, passwordInput]);

  useEffect(() => {
    if (!error || busy) return;
    // 저장하는 동안 누른 버튼이 잠기며 포커스가 빠지므로, 오류가 나면 고칠 칸으로 포커스를 돌려준다.
    (errorField === "confirmation" ? confirmationInput : passwordInput).current?.focus({ preventScroll: true });
  }, [error, errorField, busy, passwordInput]);

  function fail(message: string, field: "password" | "confirmation" | "form") {
    setErrorField(field);
    setError(message);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = browserSupabase();
    if (!client || busy) return;
    const validationError = passwordSetupError(password, confirmation);
    if (validationError) {
      // 비밀번호 자체가 규칙에 맞으면(자기 자신과 비교해 문제가 없으면) 남은 문제는 확인 칸이다.
      fail(validationError, passwordSetupError(password, password) ? "password" : "confirmation");
      return;
    }

    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const { error: saveError } = await client.auth.updateUser({ password });
      if (!saveError) {
        setPassword("");
        setConfirmation("");
        await onSaved();
      } else if (saveError.code === "weak_password" || saveError.code === "same_password") {
        fail("이전 비밀번호와 다른, 추측하기 어려운 비밀번호를 입력해 주세요.", "password");
      } else if (saveError.code === "reauthentication_needed") {
        fail("보안을 위해 다시 본인 확인이 필요해요. 로그아웃한 뒤 로그인 화면의 ‘비밀번호를 잊었어요’로 다시 설정해 주세요.", "form");
      } else {
        fail("비밀번호를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", "form");
      }
    } catch {
      fail("비밀번호를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", "form");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const fieldError = (field: "password" | "confirmation") => errorField === field && error ? error : undefined;
  const formError = errorField === "form" && error ? error : "";

  // noValidate: 길이·필수 검사는 브라우저 말풍선 대신 passwordSetupError의 한국어 문구로 알린다. 저장하는 동안에는 칸을 잠그기만 한다(readOnly).
  if (sheet) return (
    <form noValidate onSubmit={save} className="auth-sheet-form">
      <div className="auth-sheet-fields">
        <TextField ref={passwordInput} label="비밀번호" variant="plain" placeholder={`${MIN_PASSWORD_LENGTH}자 이상`} type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
          value={password} onChange={(event) => setPassword(event.target.value)} error={fieldError("password")} aria-describedby={describedBy} required readOnly={busy} inputClassName="fr-input" />
        <TextField ref={confirmationInput} label="비밀번호 확인" variant="plain" placeholder="한 번 더 입력" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
          value={confirmation} onChange={(event) => setConfirmation(event.target.value)} error={fieldError("confirmation")} required readOnly={busy} inputClassName="fr-input" />
        {formError && <p role="alert" className="fr-error">{formError}</p>}
      </div>
      <div className="auth-sheet-actions">
        <Button type="submit" tone="ink" fullWidth loading={busy}>{signup ? "가입 완료" : "저장"}</Button>
        {onCancel && <Button variant="plain" disabled={busy} className="fr-link" onClick={() => { void onCancel(); }}>로그아웃</Button>}
      </div>
    </form>
  );

  return (
    <form noValidate onSubmit={save} className="flex flex-col gap-4">
      <TextField ref={passwordInput} label={signup ? "비밀번호" : "새 비밀번호"} type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
        value={password} onChange={(event) => setPassword(event.target.value)} error={fieldError("password")} aria-describedby={describedBy} required readOnly={busy} />
      <TextField ref={confirmationInput} label={signup ? "비밀번호 확인" : "새 비밀번호 확인"} type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH}
        value={confirmation} onChange={(event) => setConfirmation(event.target.value)} error={fieldError("confirmation")} required readOnly={busy} />
      {formError && <p role="alert" className="here-field__message">{formError}</p>}
      <Button type="submit" tone="ink" fullWidth loading={busy}>{signup ? "가입 완료" : "비밀번호 저장"}</Button>
      {onCancel && <Button variant="plain" fullWidth disabled={busy} className="min-h-11 text-sm" onClick={() => { void onCancel(); }}>로그아웃하고 처음으로</Button>}
    </form>
  );
}
