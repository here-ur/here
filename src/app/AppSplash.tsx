"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LOADING_SLOW_AFTER_MS } from "@/lib/loading-scene";
import "./app-splash.css";

export default function AppSplash({ waiting = false, children }: { waiting?: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<"hold" | "reveal" | "done">("hold");
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== "hold") return;
    startedAt.current ??= performance.now();
    // A stalled sign-in must still reveal the retry controls.
    const holdUntil = startedAt.current + (waiting ? LOADING_SLOW_AFTER_MS : 900);
    const timer = window.setTimeout(() => {
      setPhase(matchMedia("(prefers-reduced-motion: reduce)").matches ? "done" : "reveal");
    }, Math.max(0, holdUntil - performance.now()));
    return () => window.clearTimeout(timer);
  }, [phase, waiting]);

  return <>
    {phase !== "done" && <main className="app-frame app-splash" aria-label="here 시작 화면"
      data-revealing={phase === "reveal" || undefined}
      onAnimationEnd={event => {
        if (event.target === event.currentTarget && event.animationName === "here-launch-reveal") setPhase("done");
      }}>
      <div className="app-splash__brand">
        <div className="app-splash__badge" aria-hidden="true">
          <div className="app-splash__crop">
            <Image src="/auth/splash-cat.png" alt="" width={1698} height={926} sizes="275px" preload />
          </div>
        </div>
        <Image src="/auth/here-wordmark.svg" alt="here" width={120} height={36} preload />
      </div>
    </main>}
    <div className="app-launch-content" data-waiting={phase === "hold" || undefined} inert={phase !== "done"}>{children}</div>
  </>;
}
