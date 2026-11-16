"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import EmailAuthScreen from "../../EmailAuthScreen";
import { EmailCodeField } from "../../ui/EmailCodeField";
import { TextField } from "../../ui/TextField";
import { Button } from "../../ui/Button";
import { Icon } from "../../art";

// 개발 전용 시각 검증. Auth API·세션·DB에는 접근하지 않는다.
export default function Preview() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, [step]);
  return <EmailAuthScreen busy={false} progress={step} onBack={() => step > 1 ? setStep(step - 1) : router.push("/")}
    title={step === 1 ? <>반가워요.<br />이메일을 알려 주세요.</> : step === 2 ? "인증번호 6자리" : <>마지막으로,<br />비밀번호를 만들어 주세요.</>}
    description={step === 1 ? undefined : step === 2 ? `${email || "you@example.com"}로 보낸 인증번호를 입력해 주세요.` : "8자 이상으로 설정해 주세요."}>
    <form noValidate className="email-auth-form" onSubmit={e => { e.preventDefault(); if (step < 3) setStep(step + 1); }}>
      <div className="email-auth-fields">
        {step === 1 && <TextField ref={input} label="이메일" hideLabel variant="plain" placeholder="이메일 주소" value={email} onChange={e => setEmail(e.target.value)} />}
        {step === 2 && <><EmailCodeField value={code} onChange={setCode} inputRef={input} describedBy="auth-desc" /><Button variant="plain" className="email-auth-link" onClick={() => { setCode(""); input.current?.focus(); }}>인증번호 다시 받기</Button></>}
        {step === 3 && <><TextField ref={input} label="비밀번호" variant="plain" type="password" placeholder="8자 이상" autoComplete="new-password" /><TextField label="비밀번호 확인" variant="plain" type="password" placeholder="한 번 더 입력" autoComplete="new-password" /></>}
      </div>
      <div className="email-auth-footer">
        <span className="email-auth-note">화면 미리보기<br />메일을 보내지 않아요.</span>
        {step < 3 ? <Button type="submit" className="email-auth-next" disabled={step === 2 && code.length !== 6} aria-label="다음"><Icon name="forward" size={26} /></Button>
          : <Button variant="plain" className="email-auth-link" onClick={() => { setStep(1); setCode(""); }}>처음으로</Button>}
      </div>
    </form>
  </EmailAuthScreen>;
}
