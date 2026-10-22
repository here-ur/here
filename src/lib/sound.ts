// 온보딩 효과음과 배경음. 파일 없이 Web Audio로 만든다(저작권 걱정 없음, 용량 0).
// 브라우저는 사용자가 한 번 눌러야 소리를 내 주므로, 첫 탭에서 unlock()을 부른다.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let pad: { stop: () => void } | null = null;
let muted = false;

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlock() {
  const c = audio();
  if (c?.state === "suspended") void c.resume();
}

export function setMuted(m: boolean) {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.05);
}

function tone(freq: number, { at = 0, dur = 0.25, vol = 0.2, type = "sine" as OscillatorType } = {}) {
  const c = audio();
  if (!c || !master) return;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** 다음 버튼: 짧고 맑은 "톡" */
export function tick() {
  tone(880, { dur: 0.12, vol: 0.12 });
  tone(1320, { at: 0.02, dur: 0.1, vol: 0.05 });
}

/** 보기 고르기: 고를 때마다 음이 조금씩 다르다 */
export function pick(i: number) {
  const scale = [523.25, 587.33, 659.25, 783.99, 880, 987.77];
  tone(scale[i % scale.length], { dur: 0.3, vol: 0.12, type: "triangle" });
}

// 배경음 화음 진행(낮은 음역). 8초마다 다음 화음으로 천천히 넘어간다: Fmaj7 → Am7 → Dm7 → Cmaj7
const CHORDS = [
  [174.61, 220, 261.63, 329.63],
  [220, 261.63, 329.63, 392],
  [146.83, 220, 261.63, 349.23],
  [130.81, 196, 246.94, 329.63],
];
const CHORD_S = 8;

/** 잔잔한 배경음. 화음이 천천히 바뀌고 숨 쉬듯 커졌다 작아진다. 다시 불러도 하나만 돈다. */
export function startPad() {
  const c = audio();
  if (!c || !master || pad) return;
  const out = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 600;
  lp.Q.value = 0.3;
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(0.035, c.currentTime + 4);

  // 아주 느린 흔들림: 음량과 밝기가 10초 주기로 오르내린다
  const lfo = c.createOscillator();
  const lfoVol = c.createGain();
  const lfoTone = c.createGain();
  lfo.frequency.value = 0.1;
  lfoVol.gain.value = 0.012;
  lfoTone.gain.value = 250;
  lfo.connect(lfoVol).connect(out.gain);
  lfo.connect(lfoTone).connect(lp.frequency);
  lfo.start();

  const voices = CHORDS[0].map((f, i) => {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.detune.value = (i - 1.5) * 5;
    o.connect(lp);
    o.start();
    return o;
  });
  lp.connect(out).connect(master);

  let n = 0;
  const timer = setInterval(() => {
    n = (n + 1) % CHORDS.length;
    voices.forEach((o, i) => o.frequency.setTargetAtTime(CHORDS[n][i], c.currentTime, 1.5)); // 미끄러지듯 넘어간다
  }, CHORD_S * 1000);

  pad = {
    stop: () => {
      clearInterval(timer);
      out.gain.setTargetAtTime(0, c.currentTime, 0.6);
      [...voices, lfo].forEach((o) => o.stop(c.currentTime + 3));
    },
  };
}

export function stopPad() {
  pad?.stop();
  pad = null;
}

/** 꾹 누르는 동안 차오르는 소리. 돌려받은 함수로 멈춘다. */
export function riser(ms: number) {
  const c = audio();
  if (!c || !master) return () => {};
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(220, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(880, c.currentTime + ms / 1000);
  g.gain.setValueAtTime(0, c.currentTime);
  g.gain.linearRampToValueAtTime(0.12, c.currentTime + ms / 1000);
  o.connect(g).connect(master);
  o.start();
  return () => {
    g.gain.setTargetAtTime(0, c.currentTime, 0.05);
    o.stop(c.currentTime + 0.3);
  };
}

/** 빛이 터질 때: 반짝임 뒤에 따뜻한 화음 */
export function burst() {
  [1046.5, 1318.5, 1568].forEach((f, i) => tone(f, { at: i * 0.04, dur: 0.6, vol: 0.08 }));
  [261.63, 329.63, 392, 523.25].forEach((f) => tone(f, { at: 0.35, dur: 2.4, vol: 0.07, type: "triangle" }));
}

/** 진동(지원하는 기기만) */
export function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
