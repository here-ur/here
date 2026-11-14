"use client";

import type { FormEvent, RefObject } from "react";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { CatAvatar, FirstRunFooter, FirstRunHeading, FirstRunScreen, FirstRunTopBar, StepChip } from "./FirstRun";

export type AuthMode = "login" | "signup";
export type AuthStep = "phone" | "otp" | "invite";

/** 화면에 보이는 단계 이름과 문구. 로그인은 휴대폰 → 인증번호, 가입은 초대코드 → 휴대폰 → 인증번호. */
export function authCopy(mode: AuthMode, step: AuthStep, verifiedPhone: string | null, phone: string) {
  const steps: AuthStep[] = mode === "login" ? ["phone", "otp"] : ["invite", "phone", "otp"];
  const atStart = (mode === "login" && step === "phone") || (mode === "signup" && step === "invite" && !verifiedPhone);
  return {
    atStart,
    stepLabel: `${mode === "login" ? "로그인" : "가입"} ${steps.indexOf(step) + 1}/${steps.length}`,
    backLabel: atStart ? "처음 화면으로" : step === "invite" ? "처음부터 다시" : step === "otp" ? "번호 다시 입력" : "초대코드 다시 입력",
    title: step === "phone" ? (mode === "login" ? "다시 만나서 반가워요" : "휴대폰 번호를 알려 주세요")
      : step === "otp" ? "인증번호 6자리" : "초대코드를 입력해 주세요",
    description: step === "phone" ? (mode === "login" ? "가입한 번호로 인증번호를 보내요." : "초대코드를 확인했어요. 인증번호를 문자로 보내요.")
      : step === "otp" ? `${phone}로 보낸 번호를 넣어 주세요.`
        : verifiedPhone ? "휴대폰 인증이 끝났어요. 다른 초대코드로 가입을 마무리해요." : "받은 16자리 코드를 넣어 주세요.",
    submit: step === "invite" ? (verifiedPhone ? "가입 완료하기" : "다음") : step === "phone" ? "인증번호 받기" : mode === "login" ? "로그인하기" : "가입 완료하기",
  };
}

export default function AuthScreen({
  mode, step, verifiedPhone, phone, invite, code, error, busy, configured = true, inputRef,
  onPhone, onInvite, onCode, onSubmit, onBack,
}: {
  mode: AuthMode;
  step: AuthStep;
  verifiedPhone: string | null;
  phone: string;
  invite: string;
  code: string;
  error: string;
  busy: boolean;
  configured?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onPhone: (value: string) => void;
  onInvite: (value: string) => void;
  onCode: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
}) {
  const copy = authCopy(mode, step, verifiedPhone, phone);
  const digits = code.padEnd(6, " ").slice(0, 6).split("");
  return (
    <FirstRunScreen tone="white" scroll>
      <FirstRunTopBar onBack={onBack} backLabel={copy.backLabel} end={configured ? <StepChip>{copy.stepLabel}</StepChip> : undefined} />
      <CatAvatar />
      <FirstRunHeading title={copy.title} description={configured ? copy.description : undefined} />
      {!configured ? <p role="status" className="fr-note mt-8 px-7">로그인 설정이 아직 준비되지 않았어요.<br />Supabase 연결 후 이용할 수 있어요.</p> : (
        <form onSubmit={onSubmit} className="contents" noValidate={false}>
          <div className="fr-field mt-9">
            {step === "phone" && <TextField label="휴대폰 번호" hideLabel variant="plain" id="phone" type="tel" inputMode="tel" autoComplete="tel"
              placeholder="01012345678" value={phone} onChange={(event) => onPhone(event.target.value)} error={error} required inputClassName="fr-input" />}
            {step === "invite" && <TextField label="초대코드" hideLabel variant="plain" ref={inputRef} id="invite" autoCapitalize="characters" autoComplete="off" spellCheck={false}
              placeholder="초대코드 16자리" value={invite} onChange={(event) => onInvite(event.target.value.toUpperCase())} error={error} required inputClassName="fr-input fr-input--code" />}
            {/* 여섯 칸은 보이기만 하는 그림이고, 실제 입력은 칸 위에 투명하게 겹친 공통 입력칸 하나가 받는다(문자 자동 채우기 유지). */}
            {step === "otp" && <div className="fr-otp" data-invalid={error ? "" : undefined}>
              {digits.map((digit, index) => <span key={index} aria-hidden="true" data-current={index === Math.min(code.length, 5) ? "" : undefined}>{digit.trim()}</span>)}
              <TextField label="인증번호" hideLabel variant="plain" ref={inputRef} id="sms-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(event) => onCode(event.target.value.replace(/\D/g, "").slice(0, 6))} error={error} required inputClassName="fr-otp-input" />
            </div>}
          </div>
          <FirstRunFooter>
            <Button type="submit" fullWidth tone="ink" loading={busy} disabled={step === "otp" && code.length < 6}>{copy.submit}</Button>
          </FirstRunFooter>
        </form>
      )}
    </FirstRunScreen>
  );
}
