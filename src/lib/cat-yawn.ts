export const CAT_YAWN_DURATION_MS = 2400;

const track = (value: number, keys: readonly (readonly [number, number])[]) => {
  for (let i = 1; i < keys.length; i++) {
    const [start, from] = keys[i - 1], [end, to] = keys[i];
    if (value <= end) {
      const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
      return from + (to - from) * t * t * (3 - 2 * t);
    }
  }
  return keys[keys.length - 1][1];
};

/** Zero displacement at both ends makes the first/last frame identical to the resting art. */
export function catYawnPose(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  // Anticipation → slower opening → brief stretch → faster release → delayed head settle.
  // The eyes stay shut through the release. No independent gaze movement runs during a yawn.
  const mouth = track(t, [[0,0],[.14,.015],[.28,.14],[.52,.96],[.60,1],[.68,.98],[.82,.02],[.87,0],[1,0]]);
  return {
    eyes: track(t, [[0,0],[.16,.3],[.42,1],[.85,1],[.94,.65],[1,0]]),
    head: track(t, [[0,0],[.14,-.18],[.34,.28],[.58,1.25],[.68,1.35],[.9,-.12],[1,0]]),
    mouth,
    mouthWidth: .62 + .38 * mouth,
  };
}

/** A cancelled intro must never start the microphone connection afterwards. */
export async function waitForCatYawn(signal: AbortSignal, reducedMotion = false): Promise<void> {
  signal.throwIfAborted();
  if (reducedMotion) return;
  await new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, CAT_YAWN_DURATION_MS);
    signal.addEventListener("abort", cancel, { once: true });
  });
}
