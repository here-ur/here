"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
import { CAT_YAWN_DURATION_MS, catYawnPose } from "@/lib/cat-yawn";
import { createCatArtworkRenderer, RESTING_CAT_POSE } from "@/lib/cat-artwork-renderer";
import { MOUTH_POSES, type MouthShape } from "@/lib/mouth-shape";
import { Accessory, type BuddyState } from "./Buddy";
import "./cat-artwork.css";

/** The idle image and every animated frame use the exact same full-body texture and geometry. */
export default function CatArtwork({ state = "idle", progress, accessory, outputLevel, outputShape }: {
  state?: BuddyState;
  progress?: number;
  accessory?: string;
  outputLevel?: RefObject<number>;
  outputShape?: RefObject<MouthShape>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const current = useRef({ state, progress, outputLevel, outputShape });
  useEffect(() => { current.current = { state, progress, outputLevel, outputShape }; }, [state, progress, outputLevel, outputShape]);
  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let disposed = false, frame = 0, started = 0;
    let previous: BuddyState = "idle";
    let lastDrawn = RESTING_CAT_POSE;
    let renderer: ReturnType<typeof createCatArtworkRenderer> = null;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const art = new window.Image();
    const render = (time: number) => {
      if (disposed || document.hidden) return;
      const value = current.current;
      if (value.state !== previous) { started = time; previous = value.state; }
      let pose = RESTING_CAT_POSE;
      if (value.state === "yawning" && !reduced.matches) {
        pose = { ...catYawnPose(value.progress ?? (time - started) / CAT_YAWN_DURATION_MS), yawn: 1 };
      } else if (value.state === "speaking") {
        const rawLevel = value.outputLevel?.current ?? 0;
        const level = Number.isFinite(rawLevel) ? Math.max(0, Math.min(1, rawLevel)) : 0;
        const family = MOUTH_POSES[value.outputShape?.current ?? "open"];
        pose = { ...RESTING_CAT_POSE, mouth: level > .015 ? family.height / 68 * (.45 + .55 * level) : 0, mouthWidth: family.width / 56 };
      }
      if (Object.keys(pose).some(key => pose[key as keyof typeof pose] !== lastDrawn[key as keyof typeof pose])) {
        renderer?.draw(pose); lastDrawn = pose;
      }
      // Sample state/audio without repainting the GPU while the character is still.
      frame = requestAnimationFrame(render);
    };
    art.onload = () => {
      if (disposed) return;
      try {
        renderer = createCatArtworkRenderer(surface, art);
        if (renderer) { renderer.draw(RESTING_CAT_POSE); setReady(true); frame = requestAnimationFrame(render); }
      } catch { /* Keep the original image visible when GPU rendering is unavailable. */ }
    };
    const resume = () => { cancelAnimationFrame(frame); if (!document.hidden && renderer) frame = requestAnimationFrame(render); };
    const contextLost = (event: Event) => { event.preventDefault(); cancelAnimationFrame(frame); setReady(false); };
    const resize = new ResizeObserver(() => renderer?.draw(lastDrawn));
    resize.observe(surface);
    document.addEventListener("visibilitychange", resume);
    surface.addEventListener("webglcontextlost", contextLost);
    art.src = "/home/main-cat.png";
    return () => {
      disposed = true; cancelAnimationFrame(frame); resize.disconnect(); renderer?.dispose();
      document.removeEventListener("visibilitychange", resume);
      surface.removeEventListener("webglcontextlost", contextLost);
    };
  }, []);
  return <div className="cat-artwork" data-ready={ready} data-state={state} aria-hidden="true">
    <Image className="cat-artwork-original" src="/home/main-cat.png" alt="" fill sizes="(max-width: 430px) 196vw, 843px" preload unoptimized />
    <canvas ref={canvas} className="cat-artwork-canvas" />
    {accessory && ["sprout", "hat", "scarf", "flowers", "crown", "rainbow"].includes(accessory) && <svg className="cat-artwork-accessory" viewBox="0 0 3396 1852">
      <g transform="translate(876.5 85.4) scale(7.175)"><Accessory id={accessory as Parameters<typeof Accessory>[0]["id"]} shape="round" /></g>
    </svg>}
  </div>;
}
