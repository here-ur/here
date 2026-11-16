"use client";

import { Fragment, useState, type RefObject } from "react";

/** 표시만 여섯 칸. 실제 입력은 하나라 붙여넣기·OTP 자동 채우기·방향키가 그대로 동작한다. */
export function EmailCodeField({ value, onChange, inputRef, readOnly, invalid, describedBy }: {
  value: string; onChange: (value: string) => void; inputRef: RefObject<HTMLInputElement | null>;
  readOnly?: boolean; invalid?: boolean; describedBy?: string;
}) {
  const [cursor, setCursor] = useState(value.length);
  return <div className="email-code" data-invalid={invalid || undefined}>
    <div className="email-code-slots" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => <Fragment key={index}>
        {index === 3 && <span className="email-code-divider">–</span>}
        <span className="email-code-slot" data-current={index === Math.min(cursor, 5) || undefined} data-filled={Boolean(value[index]) || undefined}>
          {value[index] || <span className="email-code-dot" />}
        </span>
      </Fragment>)}
    </div>
    <input ref={inputRef} className="email-code-input" name="code" aria-label="인증번호 6자리" type="text"
      inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
      value={value} onChange={e => { const next = e.target.value.replace(/\D/g, "").slice(0, 6); onChange(next); setCursor(next.length); }}
      onSelect={e => setCursor(e.currentTarget.selectionStart ?? value.length)}
      onPaste={e => { e.preventDefault(); const next = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6); onChange(next); setCursor(next.length); }}
      required readOnly={readOnly} aria-invalid={invalid} aria-describedby={describedBy} />
  </div>;
}
