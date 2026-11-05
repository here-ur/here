const smooth = (p: number) => { const t = Math.max(0, Math.min(1, p)); return t * t * (3 - 2 * t); };
export type CatGaitPose = { x: number; leftX: number; leftY: number; rightX: number; rightY: number; direction: number };

/** World-space foot targets keep the supporting foot planted while the torso catches up. */
export function createCatGait() {
  let x = 0, left = 0, right = 0, elapsed = 0, phase: "wait" | "step" | "settle" = "wait";
  let start = 0, target = 0, footStart = 0, swingLeft = true, direction = 0, steps = 0, route = 0;
  const pose: CatGaitPose = { x: 0, leftX: 0, leftY: 0, rightX: 0, rightY: 0, direction: 0 };
  function startStep() {
    start = x; target = x + direction * 5; footStart = swingLeft ? left : right;
    elapsed = 0; phase = "step";
  }
  return {
    update(ms: number, active: boolean): CatGaitPose {
      elapsed += Math.min(40, Math.max(0, ms));
      let lift = 0;
      if (phase === "wait") {
        if (active && elapsed >= 3600) {
          const destinations = [10, -10, 0];
          const destination = destinations[route % 3];
          direction = Math.sign(destination - x);
          steps = Math.round(Math.abs(destination - x) / 5);
          route++;
          if (steps) startStep(); else elapsed = 0;
        }
      } else if (phase === "step") {
        const p = Math.min(1, elapsed / 880);
        const footP = Math.min(1, p / .72);
        const foot = footStart + (target - footStart) * smooth(footP);
        if (swingLeft) left = foot; else right = foot;
        x = start + (target - start) * smooth((p - .12) / .88);
        lift = Math.sin(Math.PI * footP) * 2.4;
        if (p === 1) {
          steps--; swingLeft = !swingLeft;
          if (active && steps > 0) startStep();
          else { phase = "settle"; elapsed = 0; footStart = swingLeft ? left : right; }
        }
      } else {
        const p = Math.min(1, elapsed / 520);
        const foot = footStart + (x - footStart) * smooth(p);
        if (swingLeft) left = foot; else right = foot;
        lift = Math.sin(Math.PI * p) * 1.6;
        if (p === 1) { left = right = x; phase = "wait"; elapsed = 0; direction = 0; }
      }
      Object.assign(pose, { x, leftX: left - x, rightX: right - x, leftY: swingLeft && lift > .0001 ? -lift : 0, rightY: !swingLeft && lift > .0001 ? -lift : 0, direction: phase === "wait" ? 0 : direction });
      return pose;
    },
    reset() { x = left = right = elapsed = route = 0; phase = "wait"; direction = steps = 0; swingLeft = true; },
  };
}
