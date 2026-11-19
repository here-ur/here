/* HereSound — 온보딩 효과음. 소리 파일 없이 Web Audio로 그 자리에서 만든다(앱의 src/lib/sound.ts와 같은 방식: 저작권 걱정 없음, 용량 0).
 * 브라우저는 사용자가 한 번 눌러야 소리를 내 주므로, 첫 누름에서 저절로 풀린다(unlock).
 * 소리는 앱 동작(누름·고름·걸음)에만 붙고, 대화 내용이나 감정에는 반응하지 않는다.
 *
 *   HereSound.tick()        다음 버튼: 짧고 맑은 "톡"                    (앱과 같은 소리)
 *   HereSound.pick(i)       보기 고르기: i에 따라 음이 조금씩 다르다         (앱과 같은 소리)
 *   HereSound.pop()         방울·덩어리가 통 튈 때: "뽁"
 *   HereSound.wake()        고양이가 깰 때: 두 음이 올라간다
 *   HereSound.step()        고양이 발소리 한 번: 낮은 "톡"
 *   HereSound.purr(ms)      골골(ms 동안). 멈추는 함수를 돌려준다
 *   HereSound.whoosh()      색이 번지며 장면이 바뀔 때
 *   HereSound.slot()        이름·숫자가 한 칸 넘어갈 때: 아주 짧은 "틱"
 *   HereSound.type()        글자가 적힐 때: 아주 작은 "톡"(빠르게 불러도 겹치지 않는다)
 *   HereSound.riser(ms)     꾹 누르는 동안 차오르는 소리. 멈추는 함수를 돌려준다   (앱과 같은 소리)
 *   HereSound.burst()       다 찼을 때: 반짝임 + 따뜻한 화음                  (앱과 같은 소리)
 *   HereSound.nope()        안 되는 입력: 낮은 두 음
 *   HereSound.buzz(패턴)    진동(지원하는 기기만)
 *
 *   HereSound.isOn() · HereSound.set(true|false) · HereSound.toggle() · HereSound.onChange(fn)   소리 켬/끔(이 기기에만 기억)
 *   HereSound.render(이름, ...값)   소리를 내지 않고 그려서 { peak, rms, dur }를 돌려준다(검사용)
 */
(() => {
  const KEY = window.HereSoundKey || "here.proto.sound.v1";      // 앱에서는 앱의 효과음 설정과 같은 열쇠를 쓴다
  const MASTER = 0.5;
  let on = true;
  try { on = localStorage.getItem(KEY) !== "off"; } catch {}
  let ctx = null, master = null, noiseBuf = null;
  const listeners = new Set();

  function audio() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      try { ctx = new Ctx(); } catch { return null; }
      master = ctx.createGain();
      master.gain.value = on ? MASTER : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  function noise(c) {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
    const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
    let seed = 1234567;                                   // 늘 같은 잡음(검사 값이 흔들리지 않게)
    for (let i = 0; i < d.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; d[i] = seed / 0x3fffffff - 1; }
    if (!(c instanceof (window.OfflineAudioContext || function () {}))) noiseBuf = b;
    return b;
  }
  /** 한 음: 빠르게 올라와서 천천히 사라진다 */
  function tone(c, out, t, freq, { at = 0, dur = 0.25, vol = 0.2, type = "sine", to = 0 } = {}) {
    const t0 = t + at, osc = c.createOscillator(), g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(out);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  /** 걸러 낸 잡음 한 토막 */
  function hiss(c, out, t, { at = 0, dur = 0.3, vol = 0.06, from = 600, to = 2400, q = 1.2, type = "bandpass" } = {}) {
    const t0 = t + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noise(c); src.loop = true;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 987.77];
  // 소리마다: (c, out, t, ...값) → 길이(초). 같은 그림을 실제 재생과 검사(render)에 같이 쓴다.
  const RECIPES = {
    tick(c, out, t) { tone(c, out, t, 880, { dur: 0.12, vol: 0.12 }); tone(c, out, t, 1320, { at: 0.02, dur: 0.1, vol: 0.05 }); return 0.2; },
    pick(c, out, t, i = 0) { tone(c, out, t, SCALE[((i % SCALE.length) + SCALE.length) % SCALE.length], { dur: 0.3, vol: 0.12, type: "triangle" }); return 0.36; },
    pop(c, out, t) { tone(c, out, t, 460, { dur: 0.11, vol: 0.2, to: 170 }); tone(c, out, t, 920, { at: 0.005, dur: 0.05, vol: 0.05 }); return 0.2; },
    wake(c, out, t) { tone(c, out, t, 392, { dur: 0.16, vol: 0.11, type: "triangle" }); tone(c, out, t, 587.33, { at: 0.09, dur: 0.26, vol: 0.12, type: "triangle" }); return 0.42; },
    step(c, out, t) { tone(c, out, t, 120, { dur: 0.08, vol: 0.2, to: 64 }); hiss(c, out, t, { dur: 0.04, vol: 0.02, from: 900, to: 500, q: 0.8 }); return 0.14; },
    whoosh(c, out, t) { hiss(c, out, t, { dur: 0.38, vol: 0.3, from: 420, to: 2600, q: 1.1 }); return 0.44; },
    slot(c, out, t) { tone(c, out, t, 1180, { dur: 0.045, vol: 0.07, type: "triangle" }); return 0.08; },
    type(c, out, t) { tone(c, out, t, 1500, { dur: 0.03, vol: 0.035 }); return 0.06; },
    nope(c, out, t) { tone(c, out, t, 220, { dur: 0.13, vol: 0.12, type: "triangle" }); tone(c, out, t, 185, { at: 0.12, dur: 0.18, vol: 0.12, type: "triangle" }); return 0.36; },
    burst(c, out, t) {
      [1046.5, 1318.5, 1568].forEach((f, i) => tone(c, out, t, f, { at: i * 0.04, dur: 0.6, vol: 0.08 }));
      [261.63, 329.63, 392, 523.25].forEach((f) => tone(c, out, t, f, { at: 0.35, dur: 2.4, vol: 0.07, type: "triangle" }));
      return 2.9;
    },
    /** 골골: 낮게 걸러 낸 잡음이 1초에 스물네 번쯤 떨리고, 숨 쉬듯 커졌다 작아진다 */
    purr(c, out, t, ms = 2400) {
      const dur = Math.max(0.4, ms / 1000), src = c.createBufferSource(), f = c.createBiquadFilter(), trem = c.createGain(), env = c.createGain();
      const lfo = c.createOscillator(), depth = c.createGain(), hum = c.createOscillator(), humG = c.createGain();
      src.buffer = noise(c); src.loop = true;
      f.type = "bandpass"; f.frequency.value = 240; f.Q.value = 0.9;
      trem.gain.value = 0.55; lfo.type = "sine"; lfo.frequency.value = 24; depth.gain.value = 0.45;
      lfo.connect(depth).connect(trem.gain);
      hum.type = "triangle"; hum.frequency.value = 96; humG.gain.value = 0.18;                    // 작은 스피커에서도 들리는 낮은 음
      src.connect(f).connect(trem); hum.connect(humG).connect(trem); trem.connect(env).connect(out);
      env.gain.setValueAtTime(0, t);
      const breath = 1.5; let x = 0;
      while (x < dur) {                                                                          // 들숨(조금 크게) · 날숨(조금 작게)
        env.gain.linearRampToValueAtTime(0.3, t + Math.min(dur, x + breath * 0.4));
        env.gain.linearRampToValueAtTime(0.14, t + Math.min(dur, x + breath));
        x += breath;
      }
      env.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
      [src, lfo, hum].forEach((n) => { n.start(t); n.stop(t + dur + 0.3); });
      return { dur: dur + 0.3, stop(at) { try { env.gain.cancelScheduledValues(at); env.gain.setTargetAtTime(0, at, 0.08); [src, lfo, hum].forEach((n) => n.stop(at + 0.4)); } catch {} } };
    },
    /** 꾹 누르는 동안 차오르는 소리 */
    riser(c, out, t, ms = 1600) {
      const dur = ms / 1000, o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(880, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + dur);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.35);
      return { dur: dur + 0.35, stop(at) { try { g.gain.cancelScheduledValues(at); g.gain.setTargetAtTime(0, at, 0.05); o.stop(at + 0.3); } catch {} } };
    },
  };

  let lastType = 0, lastStep = 0;
  function play(name, ...args) {
    if (!on) return null;
    const c = audio();
    if (!c || !master) return null;
    try { return RECIPES[name](c, master, c.currentTime + 0.005, ...args); } catch { return null; }
  }
  const stopper = (r) => () => { if (r && r.stop && ctx) r.stop(ctx.currentTime); };

  const api = {
    tick: () => { play("tick"); },
    pick: (i) => { play("pick", i | 0); },
    pop: () => { play("pop"); },
    wake: () => { play("wake"); },
    step: () => { const n = performance.now(); if (n - lastStep < 90) return; lastStep = n; play("step"); },
    whoosh: () => { play("whoosh"); },
    slot: () => { play("slot"); },
    type: () => { const n = performance.now(); if (n - lastType < 45) return; lastType = n; play("type"); },
    nope: () => { play("nope"); },
    burst: () => { play("burst"); },
    purr: (ms) => stopper(play("purr", ms)),
    riser: (ms) => stopper(play("riser", ms)),
    buzz: (pattern) => { try { const ua = navigator.userActivation; if (on && navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(pattern); } catch {} },      // 한 번도 누르지 않은 화면에서는 부르지 않는다(브라우저가 막고 경고를 남긴다)
    unlock: () => { audio(); },
    isOn: () => on,
    set(v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
      if (ctx && master) master.gain.setTargetAtTime(on ? MASTER : 0, ctx.currentTime, 0.03);
      listeners.forEach((fn) => { try { fn(on); } catch {} });
      if (on && !window.HereSoundQuietToggle) api.tick();      // 앱이 같은 순간에 제 소리를 내면 여기서는 내지 않는다
    },
    toggle() { api.set(!on); return on; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    names: Object.keys(RECIPES),
    /** 검사용: 소리를 내지 않고 그려서 크기와 길이를 잰다 */
    async render(name, ...args) {
      const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Off || !RECIPES[name]) return null;
      const sr = 44100, probe = new Off(1, sr * 4, sr), g = probe.createGain();
      g.gain.value = MASTER; g.connect(probe.destination);
      const r = RECIPES[name](probe, g, 0.005, ...args), dur = typeof r === "number" ? r : r.dur;
      const buf = await probe.startRendering(), d = buf.getChannelData(0), n = Math.min(d.length, Math.ceil((dur + 0.05) * sr));
      let peak = 0, sum = 0, last = 0;
      for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; if (v > 0.002) last = i; }
      return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4), dur: +dur.toFixed(2), audibleFor: +(last / sr).toFixed(2) };
    },
  };

  // 첫 누름에서 소리를 연다(브라우저의 자동 재생 제한)
  const first = () => { if (on) audio(); };
  window.addEventListener("pointerdown", first, { capture: true, passive: true });
  window.addEventListener("keydown", first, { capture: true });

  window.HereSound = api;
})();
