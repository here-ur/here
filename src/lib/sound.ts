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

// 배경음: 밑에는 도(C) 한 음을 고정으로 깔고, 위 화음만 겹쳐 사라지며 바뀐다(음이 미끄러져 내려가지 않게).
// 그 위로 오르골 같은 맑은 음이 가끔 떨어진다. C → F/C → Am/C → G/C
const BASS = 130.81;
const CHORDS = [
  [261.63, 329.63, 392, 587.33],
  [261.63, 349.23, 440, 523.25],
  [261.63, 329.63, 440, 493.88],
  [293.66, 392, 493.88, 587.33],
];
const CHORD_S = 6;
const SPARKLE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // C 장조 5음계라 어떻게 겹쳐도 어울린다

/** 잔잔한 배경음. 다시 불러도 하나만 돈다. */
export function startPad() {
  const c = audio();
  if (!c || !master || pad) return;
  const out = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(0.028, c.currentTime + 4);
  lp.connect(out).connect(master);

  // 오르골 음에 걸 메아리(딜레이)
  const echo = c.createDelay(1);
  const fb = c.createGain();
  const wet = c.createGain();
  echo.delayTime.value = 0.42;
  fb.gain.value = 0.35;
  wet.gain.value = 0.5;
  echo.connect(fb).connect(echo);
  echo.connect(wet).connect(master);

  // 고정 베이스
  const bass = c.createOscillator();
  const bassGain = c.createGain();
  bass.type = "sine";
  bass.frequency.value = BASS;
  bassGain.gain.value = 0.6;
  bass.connect(bassGain).connect(lp);
  bass.start();

  // 화음 한 벌을 띄우고 2초에 걸쳐 나타났다 사라진다
  const live = new Set<OscillatorNode>();
  function chord(notes: number[]) {
    if (!c) return;
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 2);
    g.gain.setValueAtTime(0.5, t + CHORD_S);
    g.gain.linearRampToValueAtTime(0, t + CHORD_S + 2);
    g.connect(lp);
    notes.forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 4;
      o.connect(g);
      o.start(t);
      o.stop(t + CHORD_S + 2.1);
      live.add(o);
      o.onended = () => live.delete(o);
    });
  }
  chord(CHORDS[0]);

  function sparkle() {
    if (!c || !master) return;
    const f = SPARKLE[Math.floor(Math.random() * SPARKLE.length)];
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g);
    g.connect(master);
    g.connect(echo);
    o.start(t);
    o.stop(t + 1.7);
  }

  let n = 0;
  const chordTimer = setInterval(() => {
    n = (n + 1) % CHORDS.length;
    chord(CHORDS[n]);
  }, CHORD_S * 1000);
  let sparkleTimer: ReturnType<typeof setTimeout>;
  const loop = () => {
    sparkle();
    sparkleTimer = setTimeout(loop, 1800 + Math.random() * 2600);
  };
  sparkleTimer = setTimeout(loop, 1500);

  pad = {
    stop: () => {
      clearInterval(chordTimer);
      clearTimeout(sparkleTimer);
      out.gain.setTargetAtTime(0, c.currentTime, 0.6);
      [bass, ...live].forEach((o) => o.stop(c.currentTime + 3));
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
