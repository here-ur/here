import { useEffect, useRef } from "react";
import { createCatGait } from "@/lib/cat-gait";

export function useCatStroll(active: boolean) {
  const root = useRef<SVGSVGElement>(null);
  const gait = useRef<ReturnType<typeof createCatGait> | null>(null);
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const travel = svg.querySelector<SVGGElement>(".cat-travel");
    const left = svg.querySelector<SVGGElement>(".cat-foot-left");
    const right = svg.querySelector<SVGGElement>(".cat-foot-right");
    if (!travel || !left || !right) return;
    const controller = gait.current ??= createCatGait();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, previous = 0;
    const tick = (time: number) => {
      const dt = previous ? Math.min(time - previous, 40) : 16;
      previous = time;
      if (reduced.matches) {
        controller.reset(); travel.style.transform = left.style.transform = right.style.transform = "none";
        delete svg.dataset.walkDirection; frame = 0; return;
      }
      if (document.hidden) { previous = 0; frame = 0; return; }
      const pose = controller.update(dt, active);
      // Feet use the image's 970-unit coordinate system, travel uses the outer 240-unit SVG.
      const scale = 970 / 200;
      left.style.transform = `translate(${pose.leftX * scale}px, ${pose.leftY * scale}px)`;
      right.style.transform = `translate(${pose.rightX * scale}px, ${pose.rightY * scale}px)`;
      travel.style.transform = `translateX(${pose.x}px)`;
      if (pose.direction) svg.dataset.walkDirection = pose.direction > 0 ? "right" : "left";
      else delete svg.dataset.walkDirection;
      if (!active && !pose.direction) { frame = 0; return; }
      frame = requestAnimationFrame(tick);
    };
    const start = () => { cancelAnimationFrame(frame); previous = 0; frame = requestAnimationFrame(tick); };
    reduced.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    start();
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, [active]);
  return root;
}
