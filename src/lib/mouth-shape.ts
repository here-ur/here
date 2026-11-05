/** Audio-derived mouth families, not a phoneme recognizer or Korean forced alignment. */
export type MouthShape = "rest" | "open" | "wide" | "round" | "pucker" | "teeth";
export function estimateMouthShape(db: Float32Array, sampleRate: number, fftSize: number, level: number): MouthShape {
  if (level < .025) return "rest";
  let back = 0, middle = 0, front = 0, hiss = 0;
  for (let i = 0; i < db.length; i++) {
    const hz = i * sampleRate / fftSize;
    if (hz < 350 || hz > 8000 || !Number.isFinite(db[i])) continue;
    const power = 10 ** (db[i] / 10);
    if (hz < 900) back += power;
    else if (hz < 1800) middle += power;
    else if (hz < 3500) front += power;
    else hiss += power;
  }
  const total = back + middle + front + hiss;
  if (total < 1e-10) return "open";
  if (hiss / total > .32) return "teeth";
  if (front / total > .28) return "wide";
  if (back / total > .72 && level < .7) return "pucker";
  if (back / total > .52) return "round";
  return "open";
}

export const MOUTH_POSES: Record<MouthShape, { width: number; height: number; curve: number; teeth: number }> = {
  rest: { width: 25, height: 0, curve: .55, teeth: 0 },
  open: { width: 29, height: 27, curve: .55, teeth: 0 },
  wide: { width: 39, height: 13, curve: .9, teeth: .5 },
  round: { width: 19, height: 24, curve: .55, teeth: 0 },
  pucker: { width: 12, height: 15, curve: .55, teeth: 0 },
  teeth: { width: 31, height: 7, curve: .9, teeth: .8 },
};
