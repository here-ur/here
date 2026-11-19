"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/Button";
import AuthScreen from "./AuthScreen";
import Sheet from "./Sheet";
import { MemberBasicsContext } from "./member-basics-context";
import { movePage } from "./page-move";
import { SheetHandoff, StageHandoff } from "./sheet-handoff";
import { withProfileTimeout } from "@/lib/account-profile";
import { consentDisplayStorage } from "@/lib/consent-display-cache";
import { hasBasicsDisplayHint, needsMemberBasics, saveMemberBasics, setBasicsDisplayHint, type Gender } from "@/lib/member-basics";
import { browserSupabase } from "@/lib/supabase";
import "./first-run.css";

type Status = "checking" | "entering" | "ready" | "error";

/** 새로 가입한 회원에게 성별·생년월일을 물어야 하는지 확인한다. 묻는 화면은 캐릭터 만나기(1번 톤 무대)의 생일·성별 장면이고,
 * 이미 캐릭터가 있는 회원이면 홈 앞에서 그 두 장면만 연다(MemberBasicsStage). 여기서는 확인과 저장만 맡는다.
 * 기억 동의 시트에서 이어 오면 확인하는 동안 시트에 머문 뒤 화면이 살짝 작아지며 다음 화면으로 넘어간다.
 * 값은 members 행에만 저장하고 AI 대화에는 보내지 않는다. 이 기기에서 한 번 확인했으면 다시 묻지 않는다(화면 안내용 표시). */
export default function MemberBasicsGate({ children, signOut, userId = "" }: { children: React.ReactNode; signOut: () => Promise<void>; userId?: string }) {
  const fromSheet = useContext(SheetHandoff);
  const known = useContext(StageHandoff)?.basicsNeeded; // 약속 장면에서 미리 확인했으면 다시 기다리지 않는다
  const [status, setStatus] = useState<Status>(() => known !== undefined ? "ready" : hasBasicsDisplayHint(consentDisplayStorage(), userId) ? (fromSheet ? "entering" : "ready") : "checking");
  const [needed, setNeeded] = useState(known === true);
  const [attempt, setAttempt] = useState(0);
  const entered = useRef(false);

  // 앞 시트에서 이어 왔으면 시트에 잠깐 머문 뒤 다음 화면으로 넘어간다(기억 동의와 같은 전환).
  useEffect(() => {
    if (status !== "entering" || entered.current) return;
    entered.current = true;
    void movePage("enter", () => setStatus("ready"));
  }, [status]);

  useEffect(() => {
    if (status !== "checking") return;
    const client = browserSupabase();
    if (!client) return;
    let active = true;
    const controller = new AbortController();
    void withProfileTimeout(needsMemberBasics(client, userId, controller.signal)).then(({ needed: ask, known }) => {
      if (!active) return;
      setNeeded(ask);
      // 마이그레이션 전 DB(known=false)면 표시를 남기지 않아, 적용된 뒤 다음 확인에서 다시 본다.
      if (known && !ask) setBasicsDisplayHint(consentDisplayStorage(), userId);
      setStatus(fromSheet ? "entering" : "ready");
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; controller.abort(); };
  }, [status, userId, fromSheet, attempt]);

  const save = useCallback(async (gender: Gender, birthDate: string) => {
    const client = browserSupabase();
    if (!client) throw Error("basics_unavailable");
    const result = await withProfileTimeout(saveMemberBasics(client, gender, birthDate));
    if (result === "ok") { setBasicsDisplayHint(consentDisplayStorage(), userId); setNeeded(false); }
    return result;
  }, [userId]);
  const basics = useMemo(() => ({ needed, save }), [needed, save]);

  if (status === "ready") return <MemberBasicsContext.Provider value={basics}>{children}</MemberBasicsContext.Provider>;
  // 앱을 다시 열어 처음 확인하는 동안은 영상만 보여 준다(물을 필요가 없는 기존 회원에게 시트가 깜박이지 않게).
  if (status === "checking" && !fromSheet) return <AuthScreen loading />;

  const failed = status === "error";
  return <AuthScreen welcome>
    <Sheet title={failed ? "연결을 확인하지 못했어요" : "계정 정보를 확인하고 있어요"} onClose={() => {}} className="auth-sheet basics-sheet" slide keyboardAware dismissible={false} appear={!fromSheet}>
      <div key={failed ? "error" : "checking"} className="fr-scope auth-sheet-step" data-direction="fade">
        {failed ? <>
          <p role="alert" className="auth-sheet-desc">연결을 확인하지 못했어요. 다시 시도해 주세요.</p>
          <div className="auth-sheet-actions">
            <Button fullWidth tone="ink" onClick={() => { setStatus("checking"); setAttempt(n => n + 1); }}>다시 확인</Button>
            <Button variant="plain" className="fr-link" onClick={() => { void signOut(); }}>로그아웃</Button>
          </div>
        </> : <div className="consent-wait" role="status"><span aria-hidden="true" /><span className="sr-only">계정 정보를 확인하고 있어요</span></div>}
      </div>
    </Sheet>
  </AuthScreen>;
}
