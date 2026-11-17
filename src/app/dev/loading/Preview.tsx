"use client";

import { useState } from "react";
import CatLoading from "../../CatLoading";
import LoadingPeek from "../../LoadingPeek";
import { Button } from "../../ui/Button";
import { PawLoader } from "../../ui/PawLoader";

const SCENES = [
  ["A", "낮잠 · 앱 열 때"],
  ["B", "그루밍 · 설정 불러올 때"],
  ["C", "하품 · 지난 이야기"],
  ["E", "동작 줄이기"],
  ["F", "8초 넘음"],
  ["G", "연결 실패"],
  ["H", "홈 위 빼꼼"],
  ["I", "버튼·화면 안"],
  ["live", "실제 타이밍"],
] as const;
type Key = (typeof SCENES)[number][0];

export default function Preview() {
  const [key, setKey] = useState<Key>("A");
  const [run, setRun] = useState(0);
  const noop = () => {};
  return (
    <div className="relative">
      <nav aria-label="로딩 장면" className="fixed inset-x-2 top-2 z-50 mx-auto flex max-w-[414px] flex-row flex-wrap justify-center gap-1 rounded-2xl bg-white/90 p-1.5 shadow-md">
        {SCENES.map(([k, name]) => (
          <button key={k} type="button" aria-pressed={key === k} onClick={() => { setKey(k); setRun((n) => n + 1); }}
            className={`w-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-5 ${key === k ? "bg-cat-ink font-bold text-white" : "text-cat-ink"}`}>
            {k === "live" ? name : `${k} ${name}`}
          </button>
        ))}
      </nav>
      {key === "A" && <CatLoading scene="nap" label="로그인 상태를 확인하고 있어요" preview={{ phase: "waiting", reduced: false }} />}
      {key === "B" && <CatLoading scene="groom" label="캐릭터 설정을 불러오고 있어요" preview={{ phase: "waiting", reduced: false }} />}
      {key === "C" && <CatLoading scene="yawn" label="지난 이야기를 불러오고 있어요" preview={{ phase: "waiting", reduced: false }} />}
      {key === "E" && <CatLoading scene="nap" label="불러오고 있어요" preview={{ phase: "waiting", reduced: true }} />}
      {key === "F" && <CatLoading scene="nap" label="불러오고 있어요" onRetry={noop} onSignOut={noop} preview={{ phase: "slow", reduced: false }} />}
      {key === "G" && <CatLoading scene="nap" label="불러오지 못했어요" error onRetry={noop} onSignOut={noop} preview={{ phase: "waiting", reduced: false }} />}
      {key === "live" && <CatLoading key={run} scene="nap" label="불러오고 있어요" onRetry={() => setRun((n) => n + 1)} onSignOut={noop} />}
      {key === "H" && (
        <main className="app-frame relative overflow-hidden bg-[url(/home/sunlit-background.png)] bg-cover bg-center">
          <div aria-hidden="true" className="absolute left-1/2 top-[270px] size-[320px] -translate-x-1/2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home/main-cat.png" alt="" className="absolute left-[-50.9%] top-[-4.959%] h-[107.549%] w-[197.213%] max-w-none" />
          </div>
          <LoadingPeek label="라이브러리를 열고 있어요" />
        </main>
      )}
      {key === "I" && (
        <main className="app-frame flex flex-col gap-6 bg-[#F5F2EB] px-6 pb-8 pt-20">
          <section className="grid gap-2.5">
            <h2 className="text-[13px] font-semibold text-[#6F6C65]">버튼 안 · 글자 대신 발자국</h2>
            <Button tone="ink" fullWidth loading>저장하기</Button>
            <Button variant="tonal" tone="ink" fullWidth loading>불러오기</Button>
          </section>
          <section className="grid gap-2.5">
            <h2 className="text-[13px] font-semibold text-[#6F6C65]">대화 위쪽 · 이전 대화 불러올 때</h2>
            <div className="grid place-items-center rounded-2xl bg-white py-3"><PawLoader size={10} gap={5} label="이전 대화를 불러오고 있어요" className="text-[#85591B]" /></div>
          </section>
        </main>
      )}
    </div>
  );
}
