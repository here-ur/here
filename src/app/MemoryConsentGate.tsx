"use client";

import { Button } from "./ui/Button";
import AuthScreen from "./AuthScreen";
import Sheet from "./Sheet";
import { movePage } from "./page-move";
import OnboardingStage from "./OnboardingStage";
import { SheetHandoff, StageHandoff, type StageHandoffValue } from "./sheet-handoff";
import { loadPendingProfile, readAccountProfile, withProfileTimeout } from "@/lib/account-profile";
import { needsMemberBasics } from "@/lib/member-basics";
import { loadProfile } from "@/lib/onboarding";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserSupabase } from "@/lib/supabase";
import { MEMORY_CONSENT_VERSION } from "@/lib/memory-consent";
import { consentDisplayKey, consentDisplayStorage, hasConsentDisplayHint, setConsentDisplayHint } from "@/lib/consent-display-cache";
import "./first-run.css";

class ConsentVersionError extends Error {}

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
    if (typeof body.version === "string" && body.version !== MEMORY_CONSENT_VERSION) {
      // An already-open tab may still contain the prior notice. Never submit it as consent to a newer policy.
      if (method === "GET") {
        try {
          if (sessionStorage.getItem("here:consent-reload") !== body.version) {
            sessionStorage.setItem("here:consent-reload", body.version);
            window.location.reload();
          }
        } catch { /* A manual refresh still works when storage is unavailable. */ }
      }
      throw new ConsentVersionError("동의 내용이 바뀌었어요. 새로고침한 뒤 새 내용을 확인해 주세요.");
    }
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "동의 상태를 확인하지 못했어요.");
    return body;
  })()]); } finally { clearTimeout(timer!); }
}

/** 기억 기능이 켜진 서버인지(동의를 받을 수 있는지). 켜져 있으면 GET이 동의 문구 버전을 함께 돌려준다. 실패하면 던진다. */
export async function memoryConsentAvailable(): Promise<boolean> {
  const body = await consentRequest("GET");
  return typeof body.version === "string";
}

/** 약속 장면에서 동의를 저장한다. 성공하면 null, 실패하면 장면에 보여 줄 글. 이미 같은 버전에 동의했으면 서버는 그대로 둔다. */
export async function acceptMemoryConsent(): Promise<string | null> {
  try {
    // 기능이 닫힌 환경에서는 GET이 required:false만 반환한다.
    // 동의 저장 API를 호출하지 않고 기존의 비기억 온보딩 흐름을 이어 간다.
    if (!await memoryConsentAvailable()) return null;
    const body = await consentRequest("POST");
    return body.ok === true ? null : "동의를 저장하지 못했어요. 다시 시도해 주세요.";
  } catch (error) { return error instanceof ConsentVersionError ? error.message : "동의를 저장하지 못했어요. 다시 시도해 주세요."; }
}

/** 기억 동의. 캐릭터 만나기 무대(1번 톤)의 약속 장면에서 받는다: 새 회원은 만남 → 약속, 다시 동의해야 하는 기존 회원은 약속 장면만 본다.
 * 동의하기 전에는 이 뒤의 화면(홈·대화 기록 등)을 띄우지 않는다. 확인 중·연결 오류만 시트로 보여 준다.
 * 동의를 마치면(또는 로그인 시트에서 이어 왔는데 이미 동의한 회원이면) 화면이 살짝 작아지며 다음 화면(캐릭터 만나기·홈)으로 넘어간다.
 * handoff면 그 전환을 다음 시트 단계(성별·생년월일, MemberBasicsGate)에 넘긴다: 시트가 보이던 채로 끝났는지만 SheetHandoff로 알려 주고,
 * 다음 단계가 같은 자리에서 내용을 이어 가거나 물을 것이 없으면 직접 다음 화면으로 넘어간다. */
export default function MemoryConsentGate({ children, signOut, userId = "", preview = false, onPreviewAccept, continueSheet = false, handoff = false }: {
  children: React.ReactNode; signOut: () => Promise<void>; userId?: string; preview?: boolean; onPreviewAccept?: () => void; continueSheet?: boolean; handoff?: boolean;
}) {
  const [status, setStatus] = useState<"checking" | "required" | "ready" | "error">(() => preview ? "required" : hasConsentDisplayHint(consentDisplayStorage(), userId) ? "ready" : "checking");
  // 다음 단계에 넘길 '시트가 보이던 채로 끝났는지'. 로그인 시트에서 이어 왔으면 처음부터 그렇다.
  const [fromSheet, setFromSheet] = useState(continueSheet);
  const enterNext = useCallback(() => {
    if (!handoff) return movePage("enter", () => setStatus("ready"));
    setFromSheet(true); setStatus("ready");
    return Promise.resolve();
  }, [handoff]);
  const [newMember, setNewMember] = useState(preview); // 캐릭터가 아직 없는 회원이면 만남부터 보여 준다
  const [stageInfo, setStageInfo] = useState<StageHandoffValue | null>(null);
  const nextInfo = useRef<StageHandoffValue | null>(null);
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
    const showConsent = async (request: number) => {
      const client = browserSupabase();
      const isNew = client ? await withProfileTimeout(readAccountProfile(client, userId, loadProfile(), loadPendingProfile())).then(p => !p, () => false) : false;
      if (!active || request !== generation.current) return;
      setNewMember(isNew);
      if (continueSheet) void movePage("enter", () => setStatus("required")); else setStatus("required");
    };
    const check = () => {
      if (accepting.current) return;
      const request = ++generation.current;
      void consentRequest("GET").then(body => {
        if (!active || request !== generation.current) return;
        if (typeof body.required !== "boolean") throw new Error("동의 상태를 확인하지 못했어요.");
        setConsentDisplayHint(consentDisplayStorage(), userId, !body.required);
        if (!body.required && continueSheet && statusRef.current !== "ready") void enterNext();
        else if (!body.required) setStatus("ready");
        else if (statusRef.current !== "required") void showConsent(request);
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
  }, [retry, preview, userId, continueSheet, enterNext]);

  // 약속 장면의 '동의하고 시작하기': 저장을 마쳐야 넘어간다. 실패하면 그 글을 돌려주고 장면에 머문다.
  async function accept(): Promise<string | null> {
    if (preview) return null;
    accepting.current = true;
    generation.current++;
    try {
      const body = await consentRequest("POST");
      if (body.ok !== true) throw new Error("동의를 저장하지 못했어요.");
      setConsentDisplayHint(consentDisplayStorage(), userId, true);
      // 다음 화면이 다시 기다리지 않도록 성별·생년월일을 물어야 하는지 미리 알아 둔다(실패하면 다음 단계가 다시 확인한다).
      const client = browserSupabase();
      const basicsNeeded = client ? await withProfileTimeout(needsMemberBasics(client, userId)).then(r => r.needed, () => undefined) : undefined;
      nextInfo.current = { consented: true, newMember, basicsNeeded };
      return null;
    } catch (error) { return error instanceof ConsentVersionError ? error.message : "동의를 저장하지 못했어요. 다시 시도해 주세요."; }
    finally { accepting.current = false; }
  }
  function release() {
    if (preview) { onPreviewAccept?.(); return; }
    void movePage("enter", () => { setStageInfo(nextInfo.current); setStatus("ready"); });
  }

  if (status === "ready") return <StageHandoff.Provider value={stageInfo}>{handoff ? <SheetHandoff.Provider value={fromSheet}>{children}</SheetHandoff.Provider> : children}</StageHandoff.Provider>;
  // 확인 중: 로그인 시트에서 이어 왔거나 시트가 이미 보였으면 같은 시트에 잠깐 기다림 표시, 아니면(앱을 다시 연 경우) 사진만 보여 준다.
  if (status === "checking" && !sheetShown) return <AuthScreen loading />;
  // 로그아웃은 동의하지 않는 사람이 이 화면에 갇히지 않게 하는 출구다.
  const leave = () => { void signOut(); };
  if (status === "required") return <OnboardingStage consent noBack={!newMember} scene={newMember ? "open" : "promise"} scenes={newMember ? ["open", "promise"] : ["promise"]}
    beforeNext={(snapshot) => (snapshot.scene === "promise" ? accept() : null)} onFinish={release} onSignOut={leave} />;

  return <AuthScreen welcome>
    <Sheet title={status === "error" ? "연결을 확인하지 못했어요" : "이야기를 기억하려면"} onClose={() => {}} className="auth-sheet consent-sheet"
      slide dismissible={false} appear={!continueSheet}>
      <div key={status === "checking" ? "checking" : "content"} className="fr-scope auth-sheet-step" data-direction={status === "checking" ? "fade" : continueSheet ? "forward" : "open"}>
        {status === "checking" ? <div className="consent-wait" role="status"><span aria-hidden="true" /><span className="sr-only">동의 상태를 확인하고 있어요</span></div>
        : status === "error" ? <>
          {/* 오류 화면 문구는 고정이다. */}
          <p role="alert" className="auth-sheet-desc">연결을 확인하지 못했어요. 다시 시도해 주세요.</p>
          <div className="auth-sheet-actions">
            <Button fullWidth tone="ink" onClick={() => { setStatus("checking"); setRetry(n => n + 1); }}>다시 확인</Button>
            <Button variant="plain" className="fr-link" onClick={leave}>로그아웃</Button>
          </div>
        </> : null}
      </div>
    </Sheet>
  </AuthScreen>;
}

export function MemoryConsentPreview({ onAccept, onSignOut }: { onAccept?: () => void; onSignOut?: () => void } = {}) {
  return <MemoryConsentGate preview onPreviewAccept={onAccept} signOut={async () => { onSignOut?.(); }}><></></MemoryConsentGate>;
}
