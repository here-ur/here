import { useEffect, useRef, type RefObject } from "react";

/** Consume the remote playback envelope without re-rendering the chat on every audio frame. */
export function useAudioMouth(speaking: boolean, level?: RefObject<number>) {
  const mouth = useRef<SVGGElement>(null);
  const rest = useRef<SVGPathElement>(null);
  useEffect(() => {
    const open = mouth.current, closed = rest.current;
    if (!open || !closed) return;
    let frame = 0;
    const reset = () => { open.style.opacity = "0"; closed.style.opacity = "1"; };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = () => {
      if (!speaking || !level || document.hidden) { reset(); return; }
      const value = Number.isFinite(level.current) ? Math.max(0, Math.min(1, level.current)) : 0;
      open.style.opacity = value > .015 ? "1" : "0";
      closed.style.opacity = value > .015 ? "0" : "1";
      open.style.transform = reduced.matches ? "none" : `scale(${.8 + value * .35}, ${.12 + value * .95})`;
      frame = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(frame); tick(); };
    document.addEventListener("visibilitychange", start);
    start();
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", start); reset(); };
  }, [speaking, level]);
  return { mouth, rest };
}
