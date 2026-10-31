"use client";

import { useEffect, useState } from "react";
import { browserSupabase } from "@/lib/supabase";
import { MEMORY_CONSENT_VERSION } from "@/lib/memory-consent";

async function consentRequest(method: "GET" | "POST") {
  const client = browserSupabase();
  const session = await client?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("다시 로그인해 주세요.");
  const response = await fetch("/api/memory-consent", {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify({ version: MEMORY_CONSENT_VERSION, privacy: true, sensitive: true }) } : {}),
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "동의 상태를 확인하지 못했어요.");
  return body;
}

export default function MemoryConsentGate({ children, signOut, preview = false }: { children: React.ReactNode; signOut: () => Promise<void>; preview?: boolean }) {
  const [status, setStatus] = useState<"checking" | "required" | "ready" | "error">(preview ? "required" : "checking");
  const [privacy, setPrivacy] = useState(false);
  const [sensitive, setSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (preview) return;
    let active = true;
    consentRequest("GET").then(body => {
      if (!active) return;
      if (typeof body.required !== "boolean") throw new Error("동의 상태를 확인하지 못했어요.");
      setStatus(body.required ? "required" : "ready");
    }).catch(() => { if (active) { setStatus("error"); setError("동의 상태를 확인하지 못했어요. 다시 시도해 주세요."); } });
    return () => { active = false; };
  }, [retry, preview]);

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    if (!privacy || !sensitive || busy) return;
    if (preview) { setError("화면 미리보기예요. 실제 동의나 데이터 저장은 하지 않아요."); return; }
    setBusy(true); setError("");
    try {
      const body = await consentRequest("POST");
      if (body.ok !== true) throw new Error("동의를 저장하지 못했어요.");
      setStatus("ready");
    } catch { setError("동의를 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }

  if (status === "ready") return children;
  return <main className="app-frame overflow-y-auto bg-[#FAFCFE] px-gutter py-8 text-[#1F2A55]">
    <div className="mx-auto w-full max-w-sm">
      <p className="mb-6 text-t5 font-bold">Here!</p>
      {status === "checking" ? <p role="status">이용 동의를 확인하고 있어요…</p> : status === "error" ? <>
        <p role="alert" className="text-t4">{error}</p>
        <button className="ui-press mt-5 min-h-12 rounded-full bg-[#1E4FE0] px-6 text-white" onClick={() => { setStatus("checking"); setError(""); setRetry(n => n + 1); }}>다시 확인</button>
      </> : <form onSubmit={accept} className="space-y-5">
        <header>
          <h1 className="text-balance text-t7 font-bold">이야기를 이어가기 전에</h1>
          <p className="mt-3 text-pretty text-t4 leading-relaxed text-[#5A6478]">몽글이는 대화에서 정리한 기억을 계정별로 저장하고, 다음 이야기에 참고해요. 가입을 마무리하려면 아래 내용을 각각 확인해 주세요.</p>
        </header>
        <aside className="rounded-r3 bg-[#FFF3D6] p-4 text-t3 leading-relaxed text-[#614715]">
          개발 검증용 화면이에요. 아래 문구는 정식 동의서가 아닌 초안이에요. 실제 개인정보나 건강정보 대신 가상의 테스트 이야기만 입력해 주세요.
        </aside>
        <section className="rounded-r4 bg-white p-5 shadow-sm" aria-labelledby="privacy-title">
          <h2 id="privacy-title" className="font-semibold">개인정보 수집·이용</h2>
          <dl className="mt-3 space-y-3 text-t3 leading-relaxed text-[#5A6478]">
            <div><dt className="font-semibold text-[#1F2A55]">목적</dt><dd>회원 확인과 사용자별 대화 기억·맞춤 답변 제공</dd></div>
            <div><dt className="font-semibold text-[#1F2A55]">항목</dt><dd>계정 식별자, 대화 요약, 기억 검색용 임베딩, 생성 시점과 동의 이력. 휴대폰 번호는 로그인에 이용해요.</dd></div>
            <div><dt className="font-semibold text-[#1F2A55]">처리 방식</dt><dd>텍스트는 Runyour AI로 답변·요약을 만들고, 요약과 검색 문장은 OpenAI로 임베딩해요. 기억은 Supabase에 저장해요. 대화 원문·음성 파일을 기억 DB에 저장하지 않아요. 현재 음성 기억은 준비 중이에요.</dd></div>
            <div><dt className="font-semibold text-[#1F2A55]">보관기간 초안</dt><dd>회원 탈퇴 전까지 보유하고 탈퇴 후 1년 보관하는 정책을 검토 중이에요. 탈퇴 후 보관 목적·근거, 자동 파기와 국외 처리 고지는 운영 전 확정해야 해요.</dd></div>
          </dl>
          <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 text-t3 font-medium"><input type="checkbox" checked={privacy} onChange={e => setPrivacy(e.target.checked)} required className="size-5 shrink-0 accent-[#1E4FE0]" />[필수] 개인정보 수집·이용 내용을 확인했어요</label>
        </section>
        <section className="rounded-r4 bg-white p-5 shadow-sm" aria-labelledby="sensitive-title">
          <h2 id="sensitive-title" className="font-semibold">민감정보 처리</h2>
          <p className="mt-3 text-pretty text-t3 leading-relaxed text-[#5A6478]">사용자가 직접 이야기한 정신·신체 건강 관련 내용이 요약과 기억에 포함될 수 있어요. 개인별 대화를 이어가기 위한 용도로 처리하며, 공용 모델 학습에는 자동으로 사용하지 않아요. 목적·보관기간은 위 초안과 같아요.</p>
          <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 text-t3 font-medium"><input type="checkbox" checked={sensitive} onChange={e => setSensitive(e.target.checked)} required className="size-5 shrink-0 accent-[#1E4FE0]" />[필수] 민감정보 처리 내용을 확인했어요</label>
        </section>
        <p className="text-pretty text-t3 leading-relaxed text-[#5A6478]">동의를 거부할 수 있어요. 이번 개발 테스트에서는 동의하지 않으면 대화를 시작할 수 없어요. 공용 모델 학습 동의는 이번 항목에 포함되지 않아요.</p>
        {error && <p role="alert" className="text-t3 text-[#C2362B]">{error}</p>}
        <button type="submit" disabled={!privacy || !sensitive || busy} className="ui-press min-h-13 w-full rounded-full bg-[#1E4FE0] px-5 font-semibold text-white disabled:opacity-40">{busy ? "저장 중…" : "동의하고 시작하기"}</button>
      </form>}
      <button type="button" disabled={busy} onClick={() => { void signOut(); }} className="ui-press mt-4 min-h-12 w-full rounded-full px-5 text-t3 text-[#5A6478]">로그아웃하고 나가기</button>
    </div>
  </main>;
}

export function MemoryConsentPreview() {
  return <MemoryConsentGate preview signOut={async () => {}}><></></MemoryConsentGate>;
}
