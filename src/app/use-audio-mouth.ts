import { MOUTH_POSES, type MouthShape } from "@/lib/mouth-shape";
import { useEffect, useRef, type RefObject } from "react";

/** Consume the remote playback envelope without re-rendering the chat on every audio frame. */
export function useAudioMouth(speaking: boolean, level?: RefObject<number>, shape?: RefObject<MouthShape>) {
  const mouth = useRef<SVGGElement>(null);
  const rest = useRef<SVGPathElement>(null);
  useEffect(() => {
    const open = mouth.current, closed = rest.current;
    if (!open || !closed) return;
    const cavity = open.querySelector<SVGPathElement>(".cat-mouth-cavity");
    const teeth = open.querySelector<SVGPathElement>(".cat-mouth-teeth");
    const tongue = open.querySelector<SVGPathElement>(".cat-mouth-tongue");
    let frame = 0, last = 0;
    let width = 25, height = 0, curve = .55, tooth = 0;
    const reset = () => { open.style.opacity = "0"; closed.style.opacity = "1"; open.dataset.shape = "rest"; };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const tick = (time = performance.now()) => {
      if (!speaking || !level || document.hidden) { reset(); return; }
      const value = Number.isFinite(level.current) ? Math.max(0, Math.min(1, level.current)) : 0;
      open.style.opacity = value > .015 ? "1" : "0";
      closed.style.opacity = value > .015 ? "0" : "1";
      const family = value > .015 ? (shape?.current ?? "open") : "rest";
      const pose = MOUTH_POSES[family];
      const dt = last ? Math.min(50, time - last) : 16; last = time;
      const blend = reduced.matches ? 1 : 1 - Math.exp(-dt / 45);
      const strength = .45 + .55 * value;
      width += (pose.width - width) * blend;
      height += (pose.height * strength - height) * blend;
      curve += (pose.curve - curve) * blend;
      tooth += (pose.teeth - tooth) * blend;
      const w = width, h = Math.max(.1, height), c = w * curve;
      cavity?.setAttribute("d", `M${-w} 0 C${-w} ${-h} ${-c} ${-h} 0 ${-h} C${c} ${-h} ${w} ${-h} ${w} 0 C${w} ${h} ${c} ${h} 0 ${h} C${-c} ${h} ${-w} ${h} ${-w} 0Z`);
      if (teeth) { teeth.style.opacity = String(tooth); teeth.setAttribute("d", `M${-w * .65} ${-h * .45} Q0 ${-h * .25} ${w * .65} ${-h * .45}`); }
      if (tongue) { tongue.style.opacity = String(family === "open" ? .45 : 0); tongue.setAttribute("d", `M${-w * .45} ${h * .6} Q0 ${h * .35} ${w * .45} ${h * .6}`); }
      open.dataset.shape = family;
      open.style.transform = "none";
      frame = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(frame); tick(); };
    document.addEventListener("visibilitychange", start);
    start();
    return () => { cancelAnimationFrame(frame); document.removeEventListener("visibilitychange", start); reset(); };
  }, [speaking, level, shape]);
  return { mouth, rest };
}
