"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "./ui/Button";
import { TextField } from "./ui/TextField";
import { Icon } from "./art";
import AuthScreen from "./AuthScreen";
import Sheet from "./Sheet";
import { movePage } from "./page-move";
import { SheetHandoff } from "./sheet-handoff";
import { withProfileTimeout } from "@/lib/account-profile";
import { consentDisplayStorage } from "@/lib/consent-display-cache";
import {
  GENDERS, MIN_AGE, birthDigits, formatBirthDate, hasBasicsDisplayHint, isUnderAge, needsMemberBasics, parseBirthDate,
  saveMemberBasics, seoulToday, setBasicsDisplayHint, type Gender,
} from "@/lib/member-basics";
import { browserSupabase } from "@/lib/supabase";
import "./first-run.css";

type Status = "checking" | "entering" | "required" | "blocked" | "ready" | "error";

/** 새로 가입한 회원의 성별·생년월일. 기억 동의 다음, 캐릭터 만나기 전에 같은 영상 위 바텀시트로 한 번만 묻는다.
 * 기억 동의 시트에서 이어 오면(SheetHandoff) 시트를 새로 올리지 않고 내용만 옆으로 바꾼다. 다 적으면(또는 물을 필요가 없으면)
 * 화면이 살짝 작아지며 다음 화면(캐릭터 만나기·홈)으로 넘어간다. 만 14세 미만이면 저장하지 않고 안내와 로그아웃만 남긴다.
 * 값은 members 행에만 저장하고 AI 대화에는 보내지 않는다. 이 기기에서 한 번 확인했으면 다시 묻지 않는다(화면 안내용 표시). */
export default function MemberBasicsGate({ children, signOut, userId = "", preview = false, onPreviewDone }: {
  children: React.ReactNode; signOut: () => Promise<void>; userId?: string; preview?: boolean; onPreviewDone?: (gender: Gender, birth: string) => void;
}) {
  const fromSheet = useContext(SheetHandoff);
  const [status, setStatus] = useState<Status>(() => preview ? "required"
    : hasBasicsDisplayHint(consentDisplayStorage(), userId) ? (fromSheet ? "entering" : "ready") : "checking");
  const [gender, setGender] = useState<Gender | null>(null);
  const [birth, setBirth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const blockedRef = useRef<HTMLParagraphElement>(null);
  const entered = useRef(false);

  // 앞 시트에서 이어 왔는데 물을 필요가 없으면, 시트에 잠깐 머문 뒤 다음 화면으로 넘어간다(기억 동의와 같은 전환).
  useEffect(() => {
    if (status !== "entering" || entered.current) return;
    entered.current = true;
    void movePage("enter", () => setStatus("ready"));
  }, [status]);

  useEffect(() => {
    if (preview || status !== "checking") return;
    const client = browserSupabase();
    if (!client) return;
    let active = true;
    const controller = new AbortController();
    void withProfileTimeout(needsMemberBasics(client, userId, controller.signal)).then(({ needed, known }) => {
      if (!active) return;
      if (needed) { setStatus("required"); return; }
      // 마이그레이션 전 DB(known=false)면 표시를 남기지 않아, 적용된 뒤 다음 확인에서 다시 본다.
      if (known) setBasicsDisplayHint(consentDisplayStorage(), userId);
      setStatus(fromSheet ? "entering" : "ready");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; controller.abort(); };
  }, [preview, status, userId, fromSheet, attempt]);

  useEffect(() => {
    if (status === "blocked") blockedRef.current?.focus({ preventScroll: true });
  }, [status]);

  if (status === "ready") return children;
  // 앱을 다시 열어 처음 확인하는 동안은 영상만 보여 준다(물을 필요가 없는 기존 회원에게 시트가 깜박이지 않게).
  if (status === "checking" && !fromSheet) return <AuthScreen loading />;

  const today = seoulToday();
  const birthDate = birth.length === 8 ? parseBirthDate(birth, today) : null;
  const birthError = birth.length === 8 && !birthDate ? "날짜를 확인해 주세요." : undefined;
  const leave = () => { if (!busy) void signOut(); };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !gender || !birthDate) return;
    setError("");
    // 만 14세 미만은 서버에 보내지 않는다(DB 함수도 같은 기준으로 저장을 거절한다).
    if (isUnderAge(birthDate, today)) { setStatus("blocked"); return; }
    if (preview) { onPreviewDone?.(gender, birthDate); return; }
    const client = browserSupabase();
    if (!client) { setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    setBusy(true);
    try {
      const result = await withProfileTimeout(saveMemberBasics(client, gender, birthDate));
      if (result === "ok") {
        setBasicsDisplayHint(consentDisplayStorage(), userId);
        await movePage("enter", () => setStatus("ready"));
      } else if (result === "under_14") setStatus("blocked");
      else if (result === "invalid") setError("생년월일을 다시 확인해 주세요.");
      else setError("계정 정보를 확인하지 못했어요. 로그아웃한 뒤 다시 로그인해 주세요.");
    } catch { setError("저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  const title = status === "error" ? "연결을 확인하지 못했어요" : status === "blocked" ? `만 ${MIN_AGE}세 이상부터 쓸 수 있어요` : "나에 대해 알려 주세요";
  const waiting = status === "checking" || status === "entering";
  return <AuthScreen welcome>
    <Sheet title={title} onClose={() => {}} className="auth-sheet basics-sheet" slide keyboardAware dismissible={false} locked={busy} appear={!fromSheet}>
      <div key={waiting ? "checking" : status} className="fr-scope auth-sheet-step"
        data-direction={waiting || status === "error" ? "fade" : status === "blocked" || fromSheet ? "forward" : "open"}>
        {waiting ? <div className="consent-wait" role="status"><span aria-hidden="true" /><span className="sr-only">계정 정보를 확인하고 있어요</span></div>
        : status === "error" ? <>
          <p role="alert" className="auth-sheet-desc">연결을 확인하지 못했어요. 다시 시도해 주세요.</p>
          <div className="auth-sheet-actions">
            <Button fullWidth tone="ink" onClick={() => { setStatus("checking"); setAttempt(n => n + 1); }}>다시 확인</Button>
            <Button variant="plain" className="fr-link" onClick={leave}>로그아웃</Button>
          </div>
        </> : status === "blocked" ? <>
          <p ref={blockedRef} tabIndex={-1} role="alert" className="auth-sheet-desc basics-blocked">
            지금은 만 {MIN_AGE}세 이상만 가입할 수 있어요. 적어 준 성별과 생년월일은 저장하지 않았어요.
          </p>
          <a href="tel:109" className="fr-sos">
            <span><b>위급할 때는 109</b><small>24시간 사람과 이야기할 수 있어요</small></span>
            <span className="fr-call" aria-hidden="true">전화</span>
          </a>
          <div className="auth-sheet-actions">
            <Button fullWidth tone="ink" onClick={leave}>로그아웃</Button>
          </div>
        </> : <form noValidate onSubmit={submit} className="auth-sheet-form">
          <p className="auth-sheet-desc">처음 한 번만 물어볼게요.</p>
          <div className="auth-sheet-fields">
            <fieldset className="basics-genders" disabled={busy}>
              <legend className="auth-label">성별</legend>
              {GENDERS.map(g => <label key={g.id} className="basics-option">
                <input type="radio" name="gender" value={g.id} checked={gender === g.id} onChange={() => setGender(g.id)} className="sr-only" />
                {g.label}
              </label>)}
            </fieldset>
            <TextField label="생년월일" variant="plain" name="bday" inputMode="numeric" pattern="[0-9]*" autoComplete="bday" enterKeyHint="done"
              placeholder="8자리 숫자 (예: 19990101)" value={birth} onChange={e => setBirth(birthDigits(e.target.value))} readOnly={busy}
              inputClassName="fr-input basics-birth" error={birthError} help={birthDate ? formatBirthDate(birthDate) : undefined} />
          </div>
          <div className="fr-fineprint">
            <p data-tone="dev"><Icon name="info" size={13} />테스트용 초안 · 쓰임과 보관 기간은 정해지기 전이에요</p>
            <p>만 {MIN_AGE}세 이상부터 쓸 수 있어요</p>
            <p>내 계정에만 저장하고, AI 대화에는 보내지 않아요</p>
          </div>
          {error && <p role="alert" className="fr-error">{error}</p>}
          <div className="auth-sheet-actions">
            <Button type="submit" tone="ink" fullWidth disabled={!gender || !birthDate || busy} loading={busy} className="fr-ready">{busy ? "저장 중…" : "다음"}</Button>
            <Button variant="plain" className="fr-link" disabled={busy} onClick={leave}>로그아웃</Button>
          </div>
        </form>}
      </div>
    </Sheet>
  </AuthScreen>;
}

export function MemberBasicsPreview({ onDone, onSignOut }: { onDone?: (gender: Gender, birth: string) => void; onSignOut?: () => void } = {}) {
  return <MemberBasicsGate preview onPreviewDone={onDone} signOut={async () => { onSignOut?.(); }}><></></MemberBasicsGate>;
}
