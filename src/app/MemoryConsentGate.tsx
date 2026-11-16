"use client";

import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import { Icon } from "./art";
import { Button } from "./ui/Button";
import AuthScreen from "./AuthScreen";
import Sheet from "./Sheet";
import { movePage } from "./page-move";
import { useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase";
import { MEMORY_CONSENT_VERSION } from "@/lib/memory-consent";
import { consentDisplayKey, consentDisplayStorage, hasConsentDisplayHint, setConsentDisplayHint } from "@/lib/consent-display-cache";
import "./first-run.css";

async function consentRequest(method: "GET" | "POST") {
  // Bound session refresh as well as the HTTP request, not just fetch.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error("consent_timeout")); }, 10000);
  });
  try { return await Promise.race([timeout, (async () => {
    const client = browserSupabase();
    const session = await client?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("다시 로그인해 주세요.");
    const response = await fetch("/api/memory-consent", {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ version: MEMORY_CONSENT_VERSION, privacy: true, sensitive: true }) } : {}),
      cache: "no-store", signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "동의 상태를 확인하지 못했어요.");
    return body;
  })()]); } finally { clearTimeout(timer!); }
}

/** 기억 동의. 영상 위 바텀시트로 보여 준다. continueSheet면 방금 로그인한 시트에서 내용만 이어지도록 시트가 움직이지 않고 그 자리에 있다.
 * 동의를 마치면(또는 로그인 시트에서 이어 왔는데 이미 동의한 회원이면) 화면이 살짝 작아지며 다음 화면(캐릭터 만나기·홈)으로 넘어간다. */
export default function MemoryConsentGate({ children, signOut, userId = "", preview = false, onPreviewAccept, continueSheet = false }: {
  children: React.ReactNode; signOut: () => Promise<void>; userId?: string; preview?: boolean; onPreviewAccept?: () => void; continueSheet?: boolean;
}) {
  const [status, setStatus] = useState<"checking" | "required" | "ready" | "error">(() => preview ? "required" : hasConsentDisplayHint(consentDisplayStorage(), userId) ? "ready" : "checking");
  const [privacy, setPrivacy] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // 시트가 한 번 보였으면 다시 확인하는 동안에도 사진 화면으로 바꾸지 않고 시트 안에서 기다린다(깜박임·포커스 잃음 방지).
  const [sheetShown, setSheetShown] = useState(continueSheet);
  // 창에 다시 들어올 때마다 확인하므로, 이미 홈에 있으면 넘어가는 전환을 다시 하지 않는다.
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const generation = useRef(0);
  const accepting = useRef(false);
  useEffect(() => {
    if (preview) return;
    let active = true;
    const check = () => {
      if (accepting.current) return;
      const request = ++generation.current;
      void consentRequest("GET").then(body => {
        if (!active || request !== generation.current) return;
        if (typeof body.required !== "boolean") throw new Error("동의 상태를 확인하지 못했어요.");
        setConsentDisplayHint(consentDisplayStorage(), userId, !body.required);
        // 확인에 성공하면 전에 남은 오류(저장 실패 등)를 지워, 동의 화면이 예전 오류와 함께 열리지 않게 한다.
        setError("");
        if (body.required) setSheetShown(true);
        if (!body.required && continueSheet && statusRef.current !== "ready") void movePage("enter", () => setStatus("ready"));
        else setStatus(body.required ? "required" : "ready");
      }).catch(() => {
        if (!active || request !== generation.current) return;
        // 창에 다시 들어올 때의 확인이 잠깐 실패해도, 이미 보이는 홈(ready)이나 고르던 동의 화면(required)은 그대로 둔다.
        // 처음 확인하거나 다시 확인할 때만 오류 화면으로 바꾼다. 서버 쪽 회원·동의 확인을 건너뛰는 것은 아니다.
        setStatus(current => current === "required" || current === "ready" ? current : "error");
        setSheetShown(true);
      });
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== consentDisplayKey(userId)) return;
      if (!active) return;
      if (!hasConsentDisplayHint(consentDisplayStorage(), userId)) setStatus("checking");
      check();
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("storage", onStorage);
    return () => { active = false; window.removeEventListener("focus", check); window.removeEventListener("storage", onStorage); };
  }, [retry, preview, userId, continueSheet]);

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (!privacy || !sensitive || busy) return;
    if (preview) { if (onPreviewAccept) onPreviewAccept(); else setError("화면 미리보기예요. 실제 동의나 데이터 저장은 하지 않아요."); return; }
    accepting.current = true;
    generation.current++;
    setBusy(true); setError("");
    try {
      const body = await consentRequest("POST");
      if (body.ok !== true) throw new Error("동의를 저장하지 못했어요.");
      setConsentDisplayHint(consentDisplayStorage(), userId, true);
      await movePage("enter", () => setStatus("ready"));
    } catch { setError("동의를 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { accepting.current = false; setBusy(false); }
  }

  if (status === "ready") return children;
  // 확인 중: 로그인 시트에서 이어 왔거나 시트가 이미 보였으면 같은 시트에 잠깐 기다림 표시, 아니면(앱을 다시 연 경우) 사진만 보여 준다.
  if (status === "checking" && !sheetShown) return <AuthScreen loading />;
  const tick = (set: (value: boolean) => void) => (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.checked);
  // 펼친 본문이 아래 버튼에 가려지면 보이게 살짝 내린다. 펼침 동작(260ms)이 끝난 뒤에 잰다.
  const reveal = (e: React.MouseEvent<HTMLElement>) => {
    const details = e.currentTarget.parentElement;
    window.setTimeout(() => {
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      details.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    }, 280);
  };
  // 로그아웃은 동의하지 않는 사람이 이 화면에 갇히지 않게 하는 출구다.
  const leave = () => { if (!busy) void signOut(); };

  return <AuthScreen welcome>
    <Sheet title={status === "error" ? "연결을 확인하지 못했어요" : "이야기를 기억하려면"} onClose={() => {}} className="auth-sheet consent-sheet"
      slide dismissible={false} locked={busy} appear={!continueSheet}>
      <div key={status === "checking" ? "checking" : "content"} className="fr-scope auth-sheet-step" data-direction={status === "checking" ? "fade" : continueSheet ? "forward" : "open"}>
        {status === "checking" ? <div className="consent-wait" role="status"><span aria-hidden="true" /><span className="sr-only">동의 상태를 확인하고 있어요</span></div>
        : status === "error" ? <>
          {/* 오류 화면 문구는 고정이다. error 상태는 동의 화면의 저장 실패 안내에만 쓴다(오래된 문구가 남지 않게). */}
          <p role="alert" className="auth-sheet-desc">연결을 확인하지 못했어요. 다시 시도해 주세요.</p>
          <div className="auth-sheet-actions">
            <Button fullWidth tone="ink" onClick={() => { setStatus("checking"); setError(""); setRetry(n => n + 1); }}>다시 확인</Button>
            <Button variant="plain" className="fr-link" onClick={leave}>로그아웃</Button>
          </div>
        </> : <form onSubmit={accept} className="auth-sheet-form">
          <p className="auth-sheet-desc">대화에서 정리한 기억을 내 계정에 저장해요.</p>
          {/* Framework7 iOS 목록의 체크 줄. 맨 위는 두 항목을 한 번에 고르는 줄이다.
           * 펼치기(details)는 같은 줄(li)의 끝 슬롯에 두어 체크 영역 바깥에 있고, '보기'는 줄 오른쪽에 겹쳐 보이며 펼친 본문은 그 줄 아래에 열린다. */}
          <List strong inset className="fr-list fr-checks consent-checks">
            <ListItem checkbox checked={privacy && sensitive} onChange={(e) => { setPrivacy(e.target.checked); setSensitive(e.target.checked); }} className="consent-all">
              <span slot="title">모두 동의해요</span>
            </ListItem>
            <ListItem checkbox checked={privacy} onChange={tick(setPrivacy)} required>
              <span slot="title"><span className="fr-req">필수</span>개인정보 수집·이용<span className="sr-only"> 내용을 확인했어요</span></span>
              <div slot="root-end">
                <details>
                  <summary id="privacy-title" className="fr-more" onClick={reveal}><span className="sr-only">개인정보 수집·이용 내용 </span>보기<Icon name="down" size={14} /></summary>
                  <dl className="fr-detail">
                    <dt>목적</dt><dd>회원 확인과 사용자별 대화 기억·맞춤 답변 제공</dd>
                    <dt>항목</dt><dd>계정 식별자, 최근 30일 텍스트 대화·음성 자막, 대화 요약, 기억 검색용 임베딩, 생성 시점과 동의 이력. 카카오·구글 계정으로 로그인해요.</dd>
                    <dt>처리 방식</dt><dd>텍스트 답변은 Runyour AI, 음성 대화와 받아쓰기는 OpenAI로 처리해요. 사용자와 캐릭터의 텍스트·음성 자막을 계정별로 Supabase에 30일 보관한 뒤 자동 삭제해요. 기기를 바꿔도 최근 대화를 이어 볼 수 있어요. 전체 대화는 구간별로 Runyour AI가 요약하고 OpenAI가 임베딩해요. 요약·임베딩은 개인화 기억으로 계속 보관하며 30일 원문 삭제와 별개예요. 음성 파일 자체는 저장하지 않아요.</dd>
                    <dt>보관기간 초안</dt><dd>회원 탈퇴 전까지 보유하고 탈퇴 후 1년 보관하는 정책을 검토 중이에요. 탈퇴 후 보관 목적·근거, 자동 파기와 국외 처리 고지는 운영 전 확정해야 해요.</dd>
                    <dt>공용 모델 학습</dt><dd>공용 모델 학습 동의는 이번 항목에 포함되지 않아요.</dd>
                  </dl>
                </details>
              </div>
            </ListItem>
            <ListItem checkbox checked={sensitive} onChange={tick(setSensitive)} required>
              <span slot="title"><span className="fr-req">필수</span>민감정보 처리<span className="sr-only"> 내용을 확인했어요</span></span>
              <div slot="root-end">
                <details>
                  <summary id="sensitive-title" className="fr-more" onClick={reveal}><span className="sr-only">민감정보 처리 내용 </span>보기<Icon name="down" size={14} /></summary>
                  <p className="fr-detail">사용자가 직접 이야기한 정신·신체 건강 관련 내용이 요약과 기억에 포함될 수 있어요. 개인별 대화를 이어가기 위한 용도로 처리하며, 공용 모델 학습에는 자동으로 사용하지 않아요. 목적·보관기간은 위 초안과 같아요.</p>
                </details>
              </div>
            </ListItem>
          </List>
          {/* 아래 두 줄은 줄인 안내다. 공용 모델 학습 안내는 개인정보 본문으로 옮겼다. */}
          <div className="fr-fineprint">
            <p data-tone="dev"><Icon name="info" size={13} />테스트용 초안 · 실제 개인·건강 정보는 쓰지 마세요</p>
            <p>거부할 수 있지만, 동의해야 대화를 시작할 수 있어요</p>
          </div>
          {error && <p role="alert" className="fr-error">{error}</p>}
          <div className="auth-sheet-actions">
            <Button type="submit" tone="ink" disabled={!privacy || !sensitive || busy} loading={busy} fullWidth className="fr-ready">{busy ? "저장 중…" : "동의하고 시작하기"}</Button>
            <Button variant="plain" className="fr-link" disabled={busy} onClick={leave}>로그아웃</Button>
          </div>
        </form>}
      </div>
    </Sheet>
  </AuthScreen>;
}

export function MemoryConsentPreview({ onAccept, onSignOut }: { onAccept?: () => void; onSignOut?: () => void } = {}) {
  return <MemoryConsentGate preview onPreviewAccept={onAccept} signOut={async () => { onSignOut?.(); }}><></></MemoryConsentGate>;
}
