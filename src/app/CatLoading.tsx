"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { continuedScene, loadingPhase, LOADING_SHOW_AFTER_MS, LOADING_SLOW_AFTER_MS, type LastLoading, type LoadingPhase, type LoadingScene } from "@/lib/loading-scene";
import { Button } from "./ui/Button";
import { PawLoader } from "./ui/PawLoader";
import "./cat-loading.css";

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribeReduce = (onChange: () => void) => {
  const query = matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

const ART: Record<LoadingScene, string> = {
  nap: "/characters/motion/sleep.webp",
  groom: "/characters/motion/groom.webp",
  yawn: "/characters/motion/yawn.webp",
};

// 바로 앞에 보였던 로딩 장면. 로그인 확인 → 설정 불러오기처럼 이어지는 로딩은 같은 고양이를 이어 쓴다.
let lastLoading: LastLoading | null = null;

/** 화면 전체를 덮는 고양이 로딩(로딩 화면 시안 A·B·C·E·F·G, 팀 확인 전).
 * 0.4초 안에 끝나면 배경만 보이고, 그 뒤로는 글자 없이 고양이와 발자국만 보여 준다(화면 읽기 프로그램에는 label을 읽어 준다).
 * 8초가 넘으면 한 줄과 다시 시도·로그아웃, 실패하면 한 줄과 다시 확인·로그아웃. 동작 줄이기에서는 멈춘 식빵 고양이(E)를 보여 준다. */
export default function CatLoading({ scene: wanted, label, error, onRetry, onSignOut, preview }: {
  scene: LoadingScene;
  /** 화면 읽기 프로그램에 읽어 줄 문장. 화면에는 쓰지 않는다. */
  label: string;
  /** 실패했을 때 보여 줄 한 줄. true면 "연결하지 못했어요". */
  error?: string | boolean;
  onRetry?: () => void;
  onSignOut?: () => void;
  /** 개발 미리보기: 단계와 동작 줄이기를 고정한다. */
  preview?: { phase?: LoadingPhase; reduced?: boolean };
}) {
  const systemReduced = useSyncExternalStore(subscribeReduce, () => matchMedia(REDUCE).matches, () => false);
  const reduced = preview?.reduced ?? systemReduced;
  // 앞 로딩은 브라우저에서만 기록되므로, 서버 미리 그리기와 첫 화면에서는 시간을 읽지 않는다.
  const [{ scene, continued }] = useState(() => !preview && lastLoading
    ? continuedScene(wanted, lastLoading, performance.now()) : { scene: wanted, continued: false });
  const canEscape = Boolean(onRetry || onSignOut);
  const [elapsed, setElapsed] = useState(0);
  const sceneRef = useRef(scene);

  useEffect(() => {
    const started = performance.now();
    const timers = [LOADING_SHOW_AFTER_MS, LOADING_SLOW_AFTER_MS].map((ms) => window.setTimeout(() => setElapsed(performance.now() - started), ms));
    const current = sceneRef.current;
    return () => { timers.forEach((t) => window.clearTimeout(t)); lastLoading = { scene: current, endedAt: performance.now() }; };
  }, []);

  const phase: LoadingPhase | "error" = error ? "error" : preview?.phase ?? loadingPhase(elapsed, canEscape, continued);
  const failed = phase === "error";
  const message = failed ? (typeof error === "string" && error ? error : "연결하지 못했어요") : phase === "slow" ? "연결이 느려요" : "";
  const art = failed ? "/characters/motion/round.webp" : reduced ? "/characters/motion/purr.webp" : ART[scene];
  const look = failed ? "error" : reduced ? "loaf" : scene;

  return (
    <main className="app-frame cat-loading" data-look={look} data-phase={phase} aria-busy={!failed || undefined}>
      <div className="cat-loading__body">
        <div className="cat-loading__art" aria-hidden="true">
          {look === "nap" || look === "loaf" ? <span className="cat-loading__cushion" /> : null}
          <span className="cat-loading__shadow" />
          {/* eslint-disable-next-line @next/next/no-img-element -- 배경 없는 움직이는 WebP라 원본 그대로 쓴다 */}
          <img className="cat-loading__cat" src={art} alt="" draggable={false} />
          {look === "nap" && <><span className="cat-loading__z" data-n="1">z</span><span className="cat-loading__z" data-n="2">z</span><span className="cat-loading__z" data-n="3">z</span></>}
          {look === "groom" && <><span className="cat-loading__tuft" data-n="1" /><span className="cat-loading__tuft" data-n="2" /></>}
          {failed && <span className="cat-loading__ask">?</span>}
        </div>
        {!failed && <PawLoader size={18} gap={10} still={reduced} className="cat-loading__paws" />}
        {message
          ? <p role={failed ? "alert" : "status"} className="cat-loading__line" data-strong={failed || undefined}>{message}</p>
          : <p role="status" className="sr-only">{label}</p>}
      </div>
      {(phase === "slow" || failed) && canEscape && (
        <div className="cat-loading__actions">
          {onRetry && <Button tone="ink" fullWidth onClick={onRetry}>{failed ? "다시 확인" : "다시 시도"}</Button>}
          {onSignOut && <Button variant="plain" className="cat-loading__link" onClick={onSignOut}>로그아웃</Button>}
        </div>
      )}
    </main>
  );
}
