import { useEffect, useRef } from "react";

/** Short grounded steps, with longer pauses at each destination. Coordinates use the 240px SVG. */
export function useCatStroll(active: boolean) {
  const root = useRef<SVGSVGElement>(null);
  const position = useRef(0);
  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const travel = svg.querySelector<SVGGElement>(".cat-travel");
    const weight = svg.querySelector<SVGGElement>(".cat-step-weight");
    const left = svg.querySelector<SVGGElement>(".cat-foot-left");
    const right = svg.querySelector<SVGGElement>(".cat-foot-right");
    if (!travel || !weight || !left || !right) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, elapsed = 0, previous = 0;
    const resetFeet = () => {
      left.style.transform = right.style.transform = weight.style.transform = "none";
      delete svg.dataset.walkDirection;
    };
    const reset = () => {
      position.current = 0;
      travel.style.transform = "none";
      resetFeet();
    };
    const tick = (time: number) => {
      const dt = previous ? Math.min(time - previous, 40) : 16;
      previous = time;
      if (reduced.matches) { reset(); frame = 0; return; }
      if (document.hidden) { previous = 0; frame = 0; return; }
      if (!active) {
        position.current *= Math.exp(-dt / 150);
        resetFeet();
        if (Math.abs(position.current) < .05) { reset(); frame = 0; return; }
      } else {
        elapsed += dt;
        const t = (elapsed / 1000) % 26;
        let x = 0, stride = 0, direction = 0;
        const step = (start: number, duration: number, from: number, to: number) => {
          const p = (t - start) / duration;
          x = from + (to - from) * (p * p * (3 - 2 * p));
          stride = Math.sin((t - start) * Math.PI * 2 / .8) * Math.min(1, p * 8, (1 - p) * 8);
          direction = Math.sign(to - from);
        };
        if (t >= 4 && t < 6.4) step(4, 2.4, 0, 24);
        else if (t >= 6.4 && t < 10) x = 24;
        else if (t >= 10 && t < 14.8) step(10, 4.8, 24, -24);
        else if (t >= 14.8 && t < 19) x = -24;
        else if (t >= 19 && t < 21.4) step(19, 2.4, -24, 0);
        // Smoothly acquire the path after an interrupted return to centre.
        position.current += (x - position.current) * (1 - Math.exp(-dt / 55));
        left.style.transform = `translateY(${-Math.max(0, stride) * 14}px) rotate(${stride * 2.5}deg)`;
        right.style.transform = `translateY(${-Math.max(0, -stride) * 14}px) rotate(${stride * 2.5}deg)`;
        weight.style.transform = `rotate(${stride * .65}deg)`;
        if (direction) svg.dataset.walkDirection = direction > 0 ? "right" : "left";
        else delete svg.dataset.walkDirection;
      }
      travel.style.transform = `translateX(${position.current}px)`;
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      frame = requestAnimationFrame(tick);
    };
    reduced.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    start();
    return () => {
      cancelAnimationFrame(frame);
      reduced.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
      resetFeet();
    };
  }, [active]);
  return root;
}
