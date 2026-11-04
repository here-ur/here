// 버튼 누름·완료에 붙는 짧은 효과음. 소리 파일 없이 Web Audio로 그 자리에서 만든다.
// 설정(켬/끔)은 이 기기에만 두고(here.sfx.v1), 음성 대화 중에는 마이크에 섞이지 않게 모두 쉰다.
// 소리는 앱 동작에만 붙고 대화 내용·감정에는 반응하지 않는다.

export type SfxKind = "tap" | "success";

const KEY = "here.sfx.v1";
let enabled: boolean | null = null;
let muted = false; // 음성 대화 중
let ctx: AudioContext | null = null;
let lastAt = -1; // 막 만든 AudioContext는 currentTime이 0이라, 0으로 두면 첫 소리를 삼킨다
const listeners = new Set<() => void>();

export function getSfxEnabled(): boolean {
  if (enabled === null) {
    try { enabled = localStorage.getItem(KEY) !== "off"; } catch { enabled = true; }
  }
  return enabled;
}

export function setSfxEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  listeners.forEach((fn) => fn());
  if (on) playSfx("tap");
}

export function subscribeSfx(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 음성 대화처럼 마이크가 열려 있는 동안 효과음을 쉰다. */
export function muteSfx(on: boolean) { muted = on; }

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// 음 하나: 시작·끝 주파수로 살짝 미끄러지고, 빠르게 올라갔다 부드럽게 꺼진다.
function tone(ac: AudioContext, at: number, from: number, to: number, duration: number, peak: number, type: OscillatorType = "sine") {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2400;
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + duration);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(filter).connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

let pendingTap: ReturnType<typeof setTimeout> | null = null;

export function playSfx(kind: SfxKind) {
  if (muted || !getSfxEnabled()) return;
  // 버튼 누름은 아주 잠깐 미뤄 두고, 그 사이에 완료음이 오면 누름 소리는 생략한다(두 번 울리지 않게).
  if (kind === "tap") {
    if (pendingTap) return;
    pendingTap = setTimeout(() => { pendingTap = null; ring("tap"); }, 40);
    return;
  }
  if (pendingTap) { clearTimeout(pendingTap); pendingTap = null; }
  ring(kind);
}

function ring(kind: SfxKind) {
  const ac = context();
  if (!ac) return;
  const now = ac.currentTime;
  if (now - lastAt < 0.05) return;
  lastAt = now;
  switch (kind) {
    // 누름: 아주 짧은 '틱' 하나
    case "tap": tone(ac, now, 1500, 1100, 0.035, 0.045); break;
    case "success": [523, 659, 784].forEach((f, i) => tone(ac, now + i * 0.085, f, f * 1.01, 0.22, 0.055)); break;
  }
}
