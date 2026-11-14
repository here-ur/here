"use client";

import List from "framework7-react/components/list.js";
import ListItem from "framework7-react/components/list-item.js";
import { Icon } from "./art";
import { Button } from "./ui/Button";
import { CatAvatar, FirstRunFooter, FirstRunHeading, FirstRunTopBar } from "./FirstRun";
import { useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase";
import { MEMORY_CONSENT_VERSION } from "@/lib/memory-consent";
import { consentDisplayKey, consentDisplayStorage, hasConsentDisplayHint, setConsentDisplayHint } from "@/lib/consent-display-cache";

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

export default function MemoryConsentGate({ children, signOut, userId = "", preview = false, onPreviewAccept }: { children: React.ReactNode; signOut: () => Promise<void>; userId?: string; preview?: boolean; onPreviewAccept?: () => void }) {
  const [status, setStatus] = useState<"checking" | "required" | "ready" | "error">(() => preview ? "required" : hasConsentDisplayHint(consentDisplayStorage(), userId) ? "ready" : "checking");
  const [privacy, setPrivacy] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  // 체크할 때마다 고양이가 한 번 들썩인다(좋은 티를 안 내려는데 티가 난다). 숫자가 바뀌면 같은 동작을 다시 재생한다.
  const [hops, setHops] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
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
        setStatus(body.required ? "required" : "ready");
      }).catch(() => {
        if (!active || request !== generation.current) return;
        // Keep an already-confirmed user's home visible during transient failures.
        // This never bypasses API-side authorization or consent enforcement.
        setStatus(current => current === "ready" ? current : "error");
        setError("연결을 확인하지 못했어요. 다시 시도해 주세요.");
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
  }, [retry, preview, userId]);

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
      setStatus("ready");
    } catch { setError("동의를 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { accepting.current = false; setBusy(false); }
  }

  if (status === "ready") return children;
  if (status === "checking") return <main className="app-frame bg-white" aria-busy="true" aria-label="앱 준비 중" />;
  const checked = Number(privacy) + Number(sensitive);
  const tick = (set: (value: boolean) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.checked);
    if (e.target.checked) setHops(n => n + 1);
  };
  // 펼친 본문이 아래 버튼에 가려지면 보이게 살짝 내린다. 펼침 동작(260ms)이 끝난 뒤에 잰다.
  const reveal = (e: React.MouseEvent<HTMLElement>) => {
    const details = e.currentTarget.parentElement;
    window.setTimeout(() => {
      if (!(details instanceof HTMLDetailsElement) || !details.open) return;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      details.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "auto" });
    }, 280);
  };
  // 뒤로 가기는 로그아웃하고 처음 화면으로 돌아간다. 동의하지 않는 사람이 이 화면에 갇히지 않게 하는 출구다.
  const leave = () => { if (!busy) void signOut(); };

  return <main className="app-frame app-frame-scrollable first-run first-run--white fr-consent">
    <FirstRunTopBar onBack={leave} backLabel="로그아웃하고 처음으로" />
    <div className="fr-avatar-hop" data-checked={checked}>
      <CatAvatar key={hops} size={96} className={`fr-avatar fr-avatar--balanced${hops ? " fr-hop" : ""}`} />
    </div>
    {status === "error" ? <>
      <FirstRunHeading title="연결을 확인하지 못했어요" />
      <p role="alert" className="fr-note mt-3 px-7">{error}</p>
      <FirstRunFooter>
        <Button fullWidth tone="ink" onClick={() => { setStatus("checking"); setError(""); setRetry(n => n + 1); }}>다시 확인</Button>
      </FirstRunFooter>
    </> : <form onSubmit={accept} className="contents">
      <FirstRunHeading title="이야기를 기억하려면" description="대화에서 정리한 기억을 내 계정에 저장해요." />
      {/* Framework7 iOS 목록의 체크 줄. 펼치기(details)는 같은 줄(li)의 끝 슬롯에 두어 체크 영역 바깥에 있고,
       * '보기'는 줄 오른쪽에 겹쳐 보이며 펼친 본문은 그 줄 아래에 열린다. */}
      <List strong inset className="fr-list fr-checks mx-5 mt-7">
        <ListItem checkbox checked={privacy} onChange={tick(setPrivacy)} required>
          <span slot="title"><span className="fr-req">필수</span>개인정보 수집·이용<span className="sr-only"> 내용을 확인했어요</span></span>
          <div slot="root-end">
            <details>
              <summary id="privacy-title" className="fr-more" onClick={reveal}><span className="sr-only">개인정보 수집·이용 내용 </span>보기<Icon name="down" size={14} /></summary>
              <dl className="fr-detail">
                <dt>목적</dt><dd>회원 확인과 사용자별 대화 기억·맞춤 답변 제공</dd>
                <dt>항목</dt><dd>계정 식별자, 대화 요약, 기억 검색용 임베딩, 생성 시점과 동의 이력. 휴대폰 번호는 로그인에 이용해요.</dd>
                <dt>처리 방식</dt><dd>텍스트 답변은 Runyour AI, 음성 대화와 받아쓰기는 OpenAI로 처리해요. 텍스트와 받아쓰기의 사용자 발언을 Runyour AI로 요약하고, 요약과 검색 문장은 OpenAI로 임베딩해요. 기억은 Supabase에 저장해요. 대화 원문·음성 파일을 기억 DB에 저장하지 않아요.</dd>
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
      {error && <p role="alert" className="fr-error mx-7">{error}</p>}
      <FirstRunFooter sticky>
        <Button type="submit" tone="ink" disabled={!privacy || !sensitive || busy} loading={busy} fullWidth className="fr-ready">{busy ? "저장 중…" : "동의하고 시작하기"}</Button>
      </FirstRunFooter>
    </form>}
  </main>;
}

export function MemoryConsentPreview({ onAccept, onSignOut }: { onAccept?: () => void; onSignOut?: () => void } = {}) {
  return <MemoryConsentGate preview onPreviewAccept={onAccept} signOut={async () => { onSignOut?.(); }}><></></MemoryConsentGate>;
}
