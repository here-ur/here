"use client";

import { useEffect, useRef, useState } from "react";
import type { SplineVariables } from "@/lib/garden";

// 디자이너가 만든 Spline 3D 정원. 장면 주소가 없거나, 불러오지 못하거나, 불러오는 동안에는 지금 그림(fallback)을 보여 준다.
// 정원 상태는 같은 이름의 Spline 변수로 넣는다(docs/GARDEN_SPLINE.md). 런타임은 화면에 들어올 때만 불러온다.
export const GARDEN_SPLINE_URL = process.env.NEXT_PUBLIC_GARDEN_SPLINE_URL ?? "";

type SplineApp = { load: (url: string, vars?: Record<string, string | number | boolean>) => Promise<void>; setVariables: (vars: Record<string, string | number | boolean>) => void; dispose: () => void };

export default function SplineGarden({ url = GARDEN_SPLINE_URL, variables, label, fallback }: { url?: string; variables: SplineVariables; label: string; fallback: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<SplineApp | null>(null);
  const varsRef = useRef(variables);
  const [state, setState] = useState<"loading" | "ready" | "failed">(url ? "loading" : "failed");

  useEffect(() => { varsRef.current = variables; appRef.current?.setVariables(variables); }, [variables]);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    let disposed = false;
    const canvas = canvasRef.current;
    void (async () => {
      try {
        const { Application } = await import("@splinetool/runtime");
        if (disposed) return;
        const app = new Application(canvas, { renderMode: "auto" }) as unknown as SplineApp;
        appRef.current = app;
        await app.load(url, varsRef.current);
        if (disposed) { app.dispose(); return; }
        app.setVariables(varsRef.current);
        setState("ready");
      } catch {
        if (!disposed) setState("failed");
      }
    })();
    return () => { disposed = true; appRef.current?.dispose(); appRef.current = null; };
  }, [url]);

  return (
    <div className="relative aspect-[3/2] w-full">
      {state !== "ready" && <div className="absolute inset-0">{fallback}</div>}
      {url && (
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className={`absolute inset-0 size-full rounded-r5 transition-opacity duration-[var(--seed-duration-d6)] ${state === "ready" ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}
