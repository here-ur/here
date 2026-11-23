/* HerePhone · 시안 "pop"(1번 톤 = refs/tone-1-popcolor) — 색면 한 장면씩
 *
 *   HerePhone.mount(el, { assets, scene?, state?, onChange? }) → { go(id, state?), restart(), scenes, data, keyboard(px) }
 *   HerePhone.addScene({ id, field, states, build(ctx) })       장면을 더한다(다른 파일에서 불러도 된다)
 *   HerePhone.ui                                                 같은 모양을 만드는 도우미(제목·알약·버튼·적히는 줄·표시·방울·고양이)
 *
 * 장면 하나는 색면 하나다. build(ctx)가 ctx.el(.hp-scene) 안에 화면을 그린다.
 * 문구는 window.HereCopy(shared/copy.js)에서만 가져온다. 자세한 설명과 예시는 NOTES.md.
 */
(() => {
  "use strict";

  const W = 390, H = 844;
  /** 전체 흐름('다음'의 차례와 쪽 표시의 순서). 아직 없는 장면은 건너뛴다. */
  const FLOW = ["open", "promise", "name", "birthday", "gender", "q1", "q2", "q3", "q4", "meet", "naming", "done"];
  const registry = new Map();

  /* ───────────────────────── 작은 도구 ───────────────────────── */
  const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  /** 지금 포커스된 요소(섀도 루트 안에 올려도 맞게 찾는다). */
  const focusedIn = (node) => { const r = node.getRootNode ? node.getRootNode() : document; return (r && r.activeElement) || document.activeElement; };

  function el(tag, cls, ...kids) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  }

  /** 스프링을 CSS linear() 곡선으로 만든다(넘쳤다가 돌아와 멈춘다). */
  function springCurve(stiffness, damping) {
    const dt = 1 / 240, pts = [];
    let x = 0, v = 0, t = 0;
    while (t < 2.5) {
      v += (-stiffness * (x - 1) - damping * v) * dt; x += v * dt; t += dt; pts.push(x);
      if (t > 0.15 && Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02) break;
    }
    const n = 40, out = [];
    for (let i = 0; i <= n; i++) out.push(+pts[Math.min(pts.length - 1, Math.round((i / n) * (pts.length - 1)))].toFixed(3));
    out[0] = 0; out[n] = 1;
    return `linear(${out.join(",")})`;
  }
  const canLinear = typeof CSS !== "undefined" && CSS.supports && CSS.supports("transition-timing-function", "linear(0, 0.5, 1)");
  const EASE = {
    spring: canLinear ? springCurve(260, 15) : "cubic-bezier(.2,1.5,.4,1)",      // 통 튀는 반응(버튼·표시·고양이)
    soft: canLinear ? springCurve(170, 19) : "cubic-bezier(.2,1.15,.35,1)",       // 살짝 넘치는 이동(패널·알약·무대)
    reel: canLinear ? springCurve(70, 12.5) : "cubic-bezier(.12,.75,.15,1)",    // 이름 굴리기
    out: "cubic-bezier(.2,.8,.2,1)", inout: "cubic-bezier(.65,0,.25,1)",
  };
  /** cubic-bezier(x1, y1, x2, y2)의 값을 구한다: (0~1) → (0~1). 장면 전환에서 앞서가는 고리를 처음부터 끝까지 같은 두께로 그릴 때 쓴다. */
  function bezier(x1, y1, x2, y2) {
    const at = (a, b, t) => 3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
    return (x) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (at(x1, x2, m) < x) lo = m; else hi = m; } return at(y1, y2, (lo + hi) / 2); };
  }
  const INOUT = bezier(0.65, 0, 0.25, 1);       // EASE.inout과 같은 곡선

  /* ───────────────────────── 아이콘(인라인 SVG) ───────────────────────── */
  const LINE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
  const STAR = "M12 2.2c.7 5.6 4 8.9 9.8 9.8-5.8.9-9.1 4.2-9.8 9.8-.7-5.6-4-8.9-9.8-9.8 5.8-.9 9.1-4.2 9.8-9.8Z";
  const ICONS = {
    back: `<svg viewBox="0 0 24 24" ${LINE} stroke-width="2"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>`,
    chev: `<svg viewBox="0 0 24 24" ${LINE} stroke-width="2"><path d="M9.5 6 15.5 12l-6 6"/></svg>`,
    chev2: `<svg viewBox="0 0 24 24" ${LINE} stroke-width="1.7"><path d="M5.5 6.5 11 12l-5.5 5.5M13 6.5l5.5 5.5-5.5 5.5"/></svg>`,
    arrow: `<svg viewBox="0 0 24 24" ${LINE} stroke-width="2"><path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5"/></svg>`,
    // 통통한 두 잎 하트(tone-1): 살짝 기울고, 가운데가 깊이 패이고, 아래는 둥글게 모인다
    heart: `<svg viewBox="0 0 48 48"><path fill="currentColor" d="M22.4 21.2C19.6 15 15.4 8 9.6 6.6 4.4 5.4 1.2 10.2 2.2 17.8 3.4 26.6 9 35.8 15 40.9 17.4 42.9 20.2 42.9 23 41.2 31.4 36.2 41.2 27.6 45.4 19.4 48 13.6 43.4 9.8 37.4 11.2 31.2 12.6 25.9 16.6 22.4 21.2Z"/></svg>`,
    sparkle: `<svg viewBox="0 0 24 24" ${LINE} stroke-width="1.5"><path d="${STAR}"/></svg>`,
    star: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${STAR}"/></svg>`,
    check: `<svg viewBox="0 0 24 24" ${LINE} stroke-width="2.6"><path d="M5.6 12.6l4.1 4.1 8.7-9.4"/></svg>`,
    dice: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5.5" fill="currentColor"/><g fill="var(--pip, #fff)"><circle cx="8.3" cy="8.3" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="15.7" cy="15.7" r="1.7"/></g></svg>`,
    phone: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7.1 3.5h2c.5 0 1 .4 1.1.9l.7 3c.1.4 0 .9-.3 1.2L9.1 10.1a12.5 12.5 0 0 0 4.8 4.8l1.5-1.5c.3-.3.8-.4 1.2-.3l3 .7c.5.1.9.6.9 1.1v2c0 1.3-1.1 2.3-2.4 2.2C10.9 18.6 5.4 13.1 4.9 5.9 4.8 4.6 5.8 3.5 7.1 3.5Z"/></svg>`,
    pencil: `<svg viewBox="0 0 24 24" ${LINE} stroke-width="2"><path d="M4.5 19.5 5.6 15 15.7 4.9a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9 18.4l-4.5 1.1Z"/></svg>`,
    clock: `<svg viewBox="5 4.5 14 14" ${LINE} stroke-width="1.9"><path d="M12 5.8V12l4.3 2.8"/></svg>`,      // 바늘만 그린다(알약 끝의 동그란 점이 시계판)
  };
  ICONS.sound = `<svg viewBox="0 0 24 24" ${LINE} stroke-width="1.9"><path d="M4 9.6h3.1L11.4 6v12l-4.3-3.6H4Z"/><path d="M15 9.3a4 4 0 0 1 0 5.4M17.7 6.9a7.4 7.4 0 0 1 0 10.2"/></svg>`;
  ICONS.mute = `<svg viewBox="0 0 24 24" ${LINE} stroke-width="1.9"><path d="M4 9.6h3.1L11.4 6v12l-4.3-3.6H4Z"/><path d="m15.6 9.6 4.8 4.8M20.4 9.6l-4.8 4.8"/></svg>`;
  /** 효과음(shared/sound.js의 HereSound). 없으면 아무 일도 하지 않는다. sfx("tick") · sfx("pick", i) · sfx("purr", ms) → 멈추는 함수 */
  const sfx = (name, ...a) => { const S = window.HereSound; try { return S && typeof S[name] === "function" ? S[name](...a) : undefined; } catch { return undefined; } };
  function icon(name, cls) {
    const s = el("span", "hp-i" + (cls ? " " + cls : ""));
    s.setAttribute("aria-hidden", "true"); s.innerHTML = ICONS[name] || "";
    return s;
  }

  /* ───────────────────────── 글자 ───────────────────────── */
  /** 문구를 낱말 수대로 줄로 나눈다: lines("가 나 다 라", [1, 3]) → ["가", "나 다 라"]. 문구는 copy.js 그대로 두고 줄만 나눈다. */
  function lines(text, counts) {
    const words = String(text).split(" "), out = [];
    let i = 0;
    for (const c of counts) { out.push(words.slice(i, i + c).join(" ")); i += c; }
    if (i < words.length) out[out.length - 1] += " " + words.slice(i).join(" ");
    return out.filter(Boolean);
  }
  /** 줄 안의 한 토막을 노드로 바꾼다: swap("나 AI야.", "AI", pill) → ["나 ", pill, "야."] */
  function swap(text, token, node) {
    const i = text.indexOf(token);
    return i < 0 ? [text] : [text.slice(0, i), node, text.slice(i + token.length)].filter((p) => p !== "");
  }
  const sayOf = (parts) => [].concat(parts).map((p) => (p && p.nodeType ? p.dataset.say || p.textContent : p)).join("");

  /** 한 글자씩 적히게 토막을 넣는다(낱말은 줄 끝에서 쪼개지지 않는다).
   *  화면 읽기 프로그램은 낱글자 대신 숨은 글(.hp-sr)을 한 번에 읽는다. */
  function fillTyped(box, parts) {
    for (const p of [].concat(parts)) {
      if (p && p.nodeType) { p.classList.add("hp-c", "hp-c-node"); box.append(p); continue; }
      const seen = el("span", "hp-seen"); seen.setAttribute("aria-hidden", "true");
      String(p).split(/( +)/).forEach((chunk) => {
        if (!chunk) return;
        if (/^ +$/.test(chunk)) { seen.append(document.createTextNode(chunk)); return; }
        const w = el("span", "hp-w");
        for (const ch of Array.from(chunk)) w.append(el("span", "hp-c", ch));
        seen.append(w);
      });
      box.append(el("span", "hp-sr", String(p)), seen);
    }
  }
  /** 두 줄이 되는 글이면 문장 끝(. ? !)이나 쉼표 뒤에서 줄을 나눈다. 글꼴이 다 온 뒤에 한 번 더 맞춘다. */
  function breakWell(node) {
    const fix = () => {
      if (!node.isConnected) return;
      node.querySelectorAll(".hp-br").forEach((b) => b.replaceWith(document.createTextNode(" ")));
      const words = Array.from(node.querySelectorAll(".hp-w")), avail = node.clientWidth - parseFloat(getComputedStyle(node).paddingLeft) - parseFloat(getComputedStyle(node).paddingRight);
      if (words.length < 3 || avail <= 0) return;
      const ws = words.map((w) => w.offsetWidth), gap = parseFloat(getComputedStyle(node).fontSize) * 0.24;
      const total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
      if (total <= avail) return;
      let best = null, left = 0;
      for (let i = 1; i < words.length; i++) {
        left += ws[i - 1] + (i > 1 ? gap : 0);
        const right = total - left - gap;
        if (left > avail || right > avail) continue;
        const end = words[i - 1].textContent.slice(-1);
        const score = (/[.?!]/.test(end) ? 0 : end === "," ? 0.2 : 0.55) + (Math.abs(left - right) / avail) * 0.45;
        if (!best || score < best.score) best = { i, score };
      }
      if (!best) return;
      const at = words[best.i], br = el("br", "hp-br");
      if (at.previousSibling && at.previousSibling.nodeType === 3) at.previousSibling.replaceWith(br); else at.before(br);
    };
    fix();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fix);
    return node;
  }

  /** 적히는 줄에 .play({ speed, delay }) → Promise, .finish(), .reset(), .typing 을 붙인다. */
  function attachTyping(node) {
    let timer = 0, done = null, running = false;
    const chars = () => Array.from(node.querySelectorAll(".hp-c"));
    const settle = () => { const d = done; done = null; if (d) d(); };
    node.classList.add("hp-typed");
    node.finish = () => {
      clearTimeout(timer); running = false;
      node.classList.add("is-done"); chars().forEach((c) => c.classList.add("is-on"));
      settle(); return node;
    };
    node.reset = () => {
      clearTimeout(timer); running = false; settle();
      node.classList.remove("is-done"); chars().forEach((c) => c.classList.remove("is-on"));
      return node;
    };
    node.play = ({ speed = 38, delay = 0 } = {}) => new Promise((resolve) => {
      settle();
      const live = node.closest(".hp") && node.closest(".hp").querySelector(".hp-live");
      if (live) live.textContent = node.dataset.say || "";
      if (reduced()) { done = resolve; node.finish(); return; }
      const list = chars(); let cur = 0;
      done = resolve; running = true; node.classList.remove("is-done");
      const step = () => {
        if (!running) return;
        if (!node.isConnected) { running = false; return; }
        while (cur < list.length && list[cur].classList.contains("is-on")) cur++;      // 이미 보이는 토막(날아온 알약)은 넘어간다
        if (cur >= list.length) { running = false; node.classList.add("is-done"); settle(); return; }
        const c = list[cur++]; c.classList.add("is-on");
        const ch = c.classList.contains("hp-c-node") ? "*" : c.textContent;
        if (ch.trim() && ch !== "…") sfx("type");
        timer = setTimeout(step, speed + (ch === "…" ? 300 : /[.?!]/.test(ch) ? 250 : ch === "," ? 170 : ch === "*" ? 200 : 0));
      };
      timer = setTimeout(step, delay);
    });
    Object.defineProperty(node, "typing", { get: () => running, configurable: true });
    return node;
  }

  /* ───────────────────────── HerePhone.ui ───────────────────────── */
  const ui = {
    el, icon, lines, swap, reduced, clamp, lerp, ease: EASE, W, H, flow: FLOW, sfx,

    /** 자리 잡은 덩어리: 장면 안에서 위(top)나 아래(bottom)에 붙인다. ui.block("hp-head", { top: 92 }, 제목) */
    block(cls, { top, bottom } = {}, ...kids) {
      const b = el("div", "hp-block" + (cls ? " " + cls : ""), ...kids);
      if (top != null) b.style.top = top + "px";
      if (bottom != null) b.style.bottom = bottom + "px";
      return b;
    },

    /** 큰 제목. lineList = 줄 배열(줄은 문자열이거나 [문자열 | 노드] 배열). typed면 한 글자씩 적힌다(.play() / .finish()). */
    headline(lineList, { typed = false, cls = "", tag = "h1", size } = {}) {
      const h = el(tag, "hp-h" + (cls ? " " + cls : ""));
      if (size) h.style.fontSize = size + "px";
      const say = [];
      lineList.forEach((parts, i) => {
        const line = el("span", "hp-l");
        say.push(sayOf(parts));
        if (typed) fillTyped(line, parts);
        else { line.append(...[].concat(parts)); line.classList.add("hp-rise"); line.style.setProperty("--i", i); }
        h.append(line);
      });
      h.dataset.say = say.join(" ");
      if (typed) attachTyping(h);
      return h;
    },

    /** 적히는 줄(본문 크기). ui.typed("…가자고?", "hp-body") → .play() / .finish() / .wrap()(붙인 뒤 부르면 문장 끝에서 줄을 나눈다) */
    typed(parts, cls = "", tag = "p") {
      const p = el(tag, cls);
      fillTyped(p, parts);
      p.dataset.say = sayOf(parts);
      p.wrap = () => breakWell(p);
      return attachTyping(p);
    },

    /** 고양이가 말하는 동안의 문지기. 줄이 다 보이기 전에 버튼을 누르면 줄만 끝까지 보여 주고, 그 뒤 hold(ms) 동안은 넘어가지 않는다
     *  (두 번 빠르게 눌러도 고양이의 말을 건너뛸 수 없다).
     *    const talk = ui.speech();
     *    talk.begin(() => 끝 상태로 바로 가기);  …  줄.play().then(() => talk.end());
     *    버튼: if (talk.pass()) ctx.next(버튼); */
    speech(hold = 420) {
      let at = 0, hurry = null;
      return {
        begin(finishNow) { at = 0; hurry = finishNow || (() => {}); },
        /** 다 말했다. watched = 적히는 것을 끝까지 지켜본 경우(바로 넘어갈 수 있다). 한꺼번에 보여 줬다면(동작 줄이기 등) false. */
        end(watched = !reduced()) { if (!at) at = performance.now() - (watched ? hold : 0); hurry = null; },
        reset() { at = 0; hurry = null; },
        /** 버튼이 눌렸다 → true면 넘어가도 된다. */
        pass() {
          if (!at) { if (hurry) { const h = hurry; hurry = null; at = performance.now(); h(); } return false; }
          return performance.now() - at >= hold;
        },
        get speaking() { return !at && Boolean(hurry); },
      };
    },

    /** 줄 안의 알약. { text, dot: 아이콘 이름 | { text }, wave, swatch: [색], onPress, label, name } */
    pill({ text, dot, wave = false, swatch, onPress, label, name = false } = {}) {
      const p = el(onPress ? "button" : "span", "hp-pill" + (swatch ? " is-swatch" : ""));
      if (onPress) { p.type = "button"; p.addEventListener("click", onPress); }
      if (label) p.setAttribute("aria-label", label);
      p.dataset.say = text || "";
      if (wave) {
        const w = el("span", "hp-wave"); w.setAttribute("aria-hidden", "true");
        [5, 9, 15, 22, 26, 20, 12, 17, 24, 18, 10, 14, 8, 4].forEach((hh, n) => { const b = el("i"); b.style.cssText = `--h:${hh};--n:${n}`; w.append(b); });
        p.append(w);
      }
      if (swatch) swatch.forEach((c) => { const d = el("i"); d.style.setProperty("--c", c); p.append(d); });
      if (text) p.append(el("span", name ? "hp-pill-name" : "hp-pill-text", text));
      if (dot) {
        const d = el("span", "hp-pill-dot"); d.setAttribute("aria-hidden", "true");
        if (typeof dot === "string") d.innerHTML = ICONS[dot] || ""; else d.append(el("b", "", dot.text));
        p.append(d);
      }
      return p;
    },

    /** 큰 검정 알약 버튼. { label, tail(글의 끝. 자리가 모자라면 앞부분만 줄어든다), onPress, hidden, disabled, icon, pages: ctx } → button(.setLabel(글, 바로, tail) / .show / .hide)
     *  pages에 ctx를 주면 버튼 바로 위에 쪽 표시(짧은 줄 + 점)가 붙는다(참고 이미지의 자리). 버튼과 같이 움직인다. */
    cta({ label, tail, onPress, hidden = false, disabled = false, icon: ic = "chev2", pages } = {}) {
      const b = el("button", "hp-cta" + (hidden ? " is-hidden" : ""));
      b.type = "button"; b.disabled = disabled; if (hidden) b.tabIndex = -1;
      /** 글 한 벌. tail(글의 끝, 예: "로 할게요")을 주면 자리가 모자랄 때 앞부분만 말줄임표로 줄고 끝은 그대로 남는다 */
      const piece = (text, tail, cls) => {
        const s = el("span", cls || "");
        if (tail && text.length > tail.length && text.endsWith(tail)) { s.classList.add("has-tail"); s.append(el("span", "hp-cta-cut", text.slice(0, -tail.length)), el("span", "hp-cta-keep", tail)); }
        else s.textContent = text;
        return s;
      };
      const lab = el("span", "hp-cta-label", piece(label, tail));
      b.append(lab, icon(ic));
      if (pages) b.append(ui.pages(pages));
      if (onPress) b.addEventListener("click", (e) => onPress(e, b));
      /** 글이 길면 17 → 15px까지 줄인 뒤에야 말줄임표를 쓴다 */
      const fit = () => {
        const s = lab.lastElementChild; lab.style.fontSize = "";
        if (!s || !lab.clientWidth) return;
        const wide = () => (s.classList.contains("has-tail") ? s.firstChild.scrollWidth + s.lastChild.offsetWidth : s.scrollWidth);
        let px = 17; while (px > 15 && wide() > lab.clientWidth) { px -= 1; lab.style.fontSize = px + "px"; }
      };
      b.setLabel = (text, instant, tail) => {
        const cur = lab.lastElementChild;
        if (cur && cur.textContent === text && !cur.classList.contains("is-out")) { fit(); return b; }
        if (instant || reduced()) { lab.replaceChildren(piece(text, tail)); fit(); return b; }
        lab.querySelectorAll(".is-out").forEach((n) => n.remove());
        cur.classList.remove("is-in"); cur.classList.add("is-out"); cur.addEventListener("animationend", () => cur.remove(), { once: true });
        lab.append(piece(text, tail, "is-in")); fit();
        return b;
      };
      b.fit = fit;
      b.show = () => { b.classList.remove("is-hidden"); b.tabIndex = 0; return b; };
      b.hide = () => { b.classList.add("is-hidden"); b.tabIndex = -1; return b; };
      return b;
    },

    /** 고르는 알약(하얀 알약 → 고르면 검정 + 동그란 체크 + 안에 고양이의 대답이 적힌다). → button(.select(instant) / .clear() / .line) */
    option({ label, reply, onPick }) {
      const b = el("button", "hp-opt"); b.type = "button"; b.setAttribute("aria-pressed", "false");
      const line = reply ? ui.typed(reply, "hp-opt-reply", "span") : null;
      const tick = el("span", "hp-opt-tick"); tick.setAttribute("aria-hidden", "true"); tick.innerHTML = ICONS.check;
      b.append(el("span", "hp-opt-label", label), tick);
      if (line) b.append(el("span", "hp-opt-more", el("span", "hp-opt-more-in", line)));
      b.addEventListener("click", () => onPick && onPick(b));
      b.select = (instant) => {
        b.classList.add("is-on"); b.setAttribute("aria-pressed", "true");
        if (line) { if (!b.wrapped) { line.wrap(); b.wrapped = true; } if (instant) line.finish(); else line.reset().play({ speed: 34, delay: 300 }); }
        return b;
      };
      b.clear = () => { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); if (line) line.finish(); return b; };
      b.line = line;
      return b;
    },

    /** 위 줄: 테두리 없는 뒤로 화살표 · 글자뿐인 건너뛰기(참고 이미지에는 위 줄이 없어서 진행 막대는 두지 않는다).
     *  { back: true | false | fn(button), skip: false | true | fn(button), pages: true(쪽 표시를 위 줄 가운데에 둔다) }
     *  쪽 표시의 자리: 아래 큰 버튼 위가 비어 있는 장면은 ui.cta({ pages: ctx }), 그 자리에 고양이가 있는 장면은 여기(pages: true). 한 장면 안에서는 자리를 바꾸지 않는다. */
    topbar(ctx, { back = true, skip = false, pages = false } = {}) {
      const bar = el("div", "hp-top");
      if (pages) { bar.pages = ui.pages(ctx); bar.append(bar.pages); }
      if (back) {
        const b = el("button", "hp-back hp-drop", icon("back")); b.type = "button"; b.setAttribute("aria-label", "뒤로");
        b.addEventListener("click", () => (typeof back === "function" ? back(b) : ctx.back(b)));
        bar.append(b); bar.back = b;
      }
      // 화면 읽기 프로그램에는 몇 번째 장면인지 글로 알린다(쪽 표시는 그림일 뿐이다)
      const ids = sceneIds();
      bar.append(el("span", "hp-sr", `${ids.length}단계 중 ${ids.indexOf(ctx.id) + 1}단계`));
      if (skip) {
        const s = el("button", "hp-skip hp-drop", "건너뛰기"); s.type = "button";
        s.addEventListener("click", () => (typeof skip === "function" ? skip(s) : ctx.next(s)));
        bar.append(s); bar.skip = s;
      }
      // 소리 켜고 끄기(앱의 온보딩과 같은 자리·같은 읽기 방식: 이름은 그대로 두고 눌림 상태로 꺼졌는지 알린다)
      if (window.HereSound) {
        const snd = el("button", "hp-sound hp-drop"); snd.type = "button"; snd.setAttribute("aria-label", "소리 끄기"); snd.dataset.sfx = "none";
        const paint = () => { const on = window.HereSound.isOn(); snd.setAttribute("aria-pressed", String(!on)); snd.replaceChildren(icon(on ? "sound" : "mute")); };
        snd.addEventListener("click", () => { window.HereSound.toggle(); paint(); });
        paint(); bar.append(snd); bar.sound = snd;
      }
      return bar;
    },

    /** 쪽 표시: 짧은 줄 하나(지금 장면) + 점(나머지 장면). 참고 이미지처럼 아래 큰 버튼 바로 위 가운데에 둔다(ui.cta의 pages). 그 자리에 고양이가 있는 장면은 위 줄 가운데(ui.topbar의 pages).
     *  짧은 줄은 앞 장면의 자리에서 이 장면의 자리로 옮겨 온다. 지금 등록된 장면 수만큼 그린다. */
    pages(ctx) {
      const ids = sceneIds(), at = ids.indexOf(ctx.id);
      const box = el("span", "hp-pages"); box.setAttribute("aria-hidden", "true");
      const marks = ids.map(() => box.appendChild(el("i")));
      const on = (n) => marks.forEach((m, i) => m.classList.toggle("is-on", i === n));
      const from = ctx.instant || ctx.fromId == null ? at : ids.indexOf(ctx.fromId);
      on(from < 0 ? at : from);
      if (from >= 0 && from !== at) ctx.later(() => on(at), 420);
      return box;
    },

    /** 아주 큰 이름 입력칸(이름표 + 입력). 글자 수에 맞춰 크기가 줄고, 쓸 수 없는 글자는 바로 걸러진다.
     *  { label, placeholder, value, size, max, selectOnFocus, caret(포커스가 없을 때도 깜박이는 커서), rule(밑줄), onInput(typedNow), onEnter }
     *  → { el, input, clean(), fit(), textRect(), roll(names) } */
    nameField(ctx, { label, placeholder = "", value = "", size = 76, max = 12, selectOnFocus = false, caret = false, rule = false, onInput, onEnter } = {}) {
      const C = ctx.copy;
      const input = el("input", "hp-bigin");
      Object.assign(input, { type: "text", placeholder, value, autocomplete: "off", spellcheck: false, enterKeyHint: "done" });
      input.setAttribute("autocapitalize", "off"); input.setAttribute("autocorrect", "off");
      const mirror = el("span", "hp-bigin-mirror"); mirror.setAttribute("aria-hidden", "true");      // 글자 너비를 재는 숨은 글
      const box = el("span", "hp-bigin-box" + (rule ? " has-rule" : ""), input, mirror);
      const tick = caret ? el("i", "hp-caret") : null;
      if (tick) { tick.setAttribute("aria-hidden", "true"); box.append(tick); }
      const wrap = el("label", "hp-field", el("span", "hp-field-label", label), box);
      let composing = false, untouched = true;
      const widthAt = (text, px) => { mirror.style.fontSize = px + "px"; mirror.textContent = text; return mirror.offsetWidth; };
      const api = {
        el: wrap, input,
        clean: () => C.cleanName(input.value, max),
        /** 글자 크기를 길이에 맞춘다 → px */
        fit(text = input.value || input.placeholder || "") {
          let px = size;
          while (px > 30 && widthAt(text, px) > 332) px -= 2;
          input.style.fontSize = px + "px";
          if (tick) {
            const w = input.value ? widthAt(input.value, px) : 0;
            tick.style.height = Math.round(px * 0.88) + "px";
            tick.style.transform = `translate3d(${Math.min(w + (input.value ? 6 : 0), 336)}px, -50%, 0)`;
          }
          return px;
        },
        /** 지금 적힌 글자가 차지하는 자리(무대 좌표) */
        textRect() {
          const r = input.getBoundingClientRect(), base = ctx.root.getBoundingClientRect(), k = W / (base.width || W);
          const px = parseFloat(input.style.fontSize) || size;
          return { x: (r.left - base.left) * k, y: (r.top - base.top) * k + (r.height * k - px) / 2, w: widthAt(input.value, px), h: px, px };
        },
        /** 이름들이 슬롯처럼 굴러 마지막 이름에서 멈춘다. names의 첫 칸은 지금 이름. landed(이름)은 마지막 이름이 자리에 들어설 즈음 불린다. → Promise */
        roll(names, landed) {
          const last = names[names.length - 1];
          const land = () => { input.value = last; untouched = true; api.fit(); };
          if (reduced() || !box.animate) { land(); if (landed) landed(last); return Promise.resolve(); }
          const hh = box.offsetHeight, px = api.fit(names.reduce((a, b) => (Array.from(b).length > Array.from(a).length ? b : a), ""));
          const strip = el("span", "hp-reel-strip", names.map((n) => el("span", "", n)));
          const reel = el("span", "hp-reel", strip); reel.setAttribute("aria-hidden", "true");
          reel.style.fontSize = px + "px"; strip.querySelectorAll("span").forEach((s) => { s.style.height = hh + "px"; s.style.lineHeight = hh + "px"; });
          box.append(reel); input.classList.add("is-rolling");
          if (landed) ctx.later(() => landed(last), 520);
          for (let k = 1; k < names.length; k++) ctx.later(() => sfx("slot"), Math.round(520 * Math.pow(k / (names.length - 1), 1.6)));      // 이름이 한 칸 넘어갈 때마다 틱(점점 느려진다)
          return strip.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(0, ${-(names.length - 1) * hh}px, 0)` }], { duration: 1150, easing: EASE.reel, fill: "forwards" }).finished
            .catch(() => {}).then(() => { land(); reel.remove(); input.classList.remove("is-rolling"); });
        },
      };
      const filter = () => {
        const v = input.value.normalize("NFC").replace(/[^\p{L}\p{M}\p{N} ]/gu, "").replace(/\s+/g, " ").replace(/^ /, "");
        const cut = Array.from(v).slice(0, max).join("");
        if (cut !== input.value) input.value = cut;
      };
      const changed = () => { api.fit(); if (onInput) onInput(true); };
      ctx.on(input, "compositionstart", () => { composing = true; });
      ctx.on(input, "compositionend", () => { composing = false; filter(); changed(); });
      ctx.on(input, "input", () => { if (!composing) filter(); changed(); });
      ctx.on(input, "keydown", (e) => { if (e.key === "Enter" && !e.isComposing && !composing) { e.preventDefault(); if (onEnter) onEnter(); } });
      if (selectOnFocus) {
        // 아직 손대지 않은 이름(기본값·굴린 이름)은 누르면 통째로 선택된다: 바로 새 이름을 적을 수 있다
        let justSelected = false;
        ctx.on(input, "input", () => { untouched = false; });
        ctx.on(input, "focus", () => { if (untouched && input.value) setTimeout(() => { if (focusedIn(input) === input) { input.select(); justSelected = true; } }, 0); });
        ctx.on(input, "mouseup", (e) => { if (justSelected) { e.preventDefault(); justSelected = false; } });
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (input.isConnected) api.fit(); });
      return api;
    },

    /** 이름이 담긴 고양이의 대답 제목. make(이름) → 문구(copy.js의 함수), counts = 줄마다 낱말 수.
     *  이름은 누르면 고칠 수 있는 알약이 된다. { max(이름 글자의 최대 너비 px), min(가장 작은 글자 px) }
     *  → { h(적히는 제목), pill, fit()(붙인 뒤 부른다: 긴 이름은 26px에서 min까지 줄인 뒤에야 말줄임표를 쓴다) } */
    nameLine(make, counts, name, onEdit, { max = 236, min = 20 } = {}) {
      const TOKEN = "\u0001";
      const pill = ui.pill({ text: name, name: true, dot: "pencil", onPress: onEdit, label: `${name}, 이름 고치기` });
      const h = ui.headline(lines(make(TOKEN), counts).map((p) => (p.includes(TOKEN) ? swap(p, TOKEN, pill) : p)), { typed: true });
      const fit = () => {
        const t = pill.querySelector(".hp-pill-name"); if (!t) return;
        t.style.maxWidth = max + "px"; t.style.fontSize = ""; let px = 26;
        while (px > min && t.scrollWidth > t.clientWidth + 0.5) { px -= 1; t.style.fontSize = px + "px"; }
      };
      return { h, pill, fit };
    },
    /** 큰 입력칸의 이름이 알약에 담겨 대답의 첫머리로 날아간다(field = ui.nameField, pill = ui.nameLine의 pill). → Promise */
    flyName(field, pill, scene) {
      const r = field.textRect(), k = Math.min(2.3, (r.px / 26) * 0.8);
      pill.classList.add("is-on", "is-set");
      return ui.fly({ x: Math.max(10, r.x - 16 * k), y: r.y + r.h / 2 - 23 * k, s: k }, pill, scene);
    },

    /** 작은 표시(하트·반짝이). { x, y, s(크기), r(기울기), pop, float, twinkle, d(지연 ms) } */
    mark(kind, { x, y, s = 28, r = 0, pop = false, float = false, twinkle = false, d = 0 } = {}) {
      const m = el("span", "hp-mark" + (pop ? " is-pop" : "") + (float ? " is-float" : "") + (twinkle ? " is-twinkle" : ""));
      m.setAttribute("aria-hidden", "true");
      const inner = el("span"); inner.innerHTML = ICONS[kind] || ""; m.append(inner);
      for (const [k, v] of Object.entries({ x, y, s, r, d })) m.style.setProperty("--" + k, v);
      return m;
    },

    /** 그 자리에서 조각이 튀어나온다. bits = [{ kind, dx, dy, s, r, delay, hold, color }] */
    burst(parent, x, y, bits) {
      if (reduced()) return;
      bits.forEach((b) => {
        const n = el("span", "hp-bit"); n.setAttribute("aria-hidden", "true"); n.innerHTML = ICONS[b.kind] || "";
        n.style.setProperty("--s", b.s || 22);
        if (b.color) n.style.color = b.color;
        parent.append(n);
        const r = b.r || 0;
        const from = `translate3d(${x}px, ${y}px, 0) scale(0) rotate(${r - 50}deg)`;
        const to = `translate3d(${x + b.dx}px, ${y + b.dy}px, 0) scale(1) rotate(${r}deg)`;
        const gone = `translate3d(${x + b.dx * 1.1}px, ${y + b.dy * 1.1 - 14}px, 0) scale(.5) rotate(${r + 30}deg)`;
        n.animate([{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: to, opacity: 1 }], { duration: 640, delay: b.delay || 0, easing: EASE.spring, fill: "both" }).finished
          .then(() => n.animate([{ opacity: 1, transform: to }, { opacity: 0, transform: gone }], { duration: 420, delay: b.hold == null ? 260 : b.hold, easing: "ease-in", fill: "forwards" }).finished)
          .then(() => n.remove(), () => n.remove());
      });
    },

    /** 그 자리에서 테두리 동그라미가 퍼진다. */
    ring(parent, x, y, { to = 3.4, duration = 620, color } = {}) {
      if (reduced()) return;
      const r = el("span", "hp-ring"); r.setAttribute("aria-hidden", "true"); if (color) r.style.borderColor = color;
      parent.append(r);
      r.animate([{ transform: `translate3d(${x}px, ${y}px, 0) scale(.3)`, opacity: 1 }, { transform: `translate3d(${x}px, ${y}px, 0) scale(${to})`, opacity: 0 }], { duration, easing: EASE.out, fill: "forwards" }).finished.then(() => r.remove(), () => r.remove());
    },

    /** 같은 것이 자리를 옮긴다: to의 복제본이 from(= { x, y, s } 왼쪽 위와 배율)에서 to 자리로 날아가고, 닿으면 to가 보인다.
     *  live면 날아가는 동안에도 눌린다(누르면 to를 누른 것과 같다). */
    fly(from, to, scene, { duration = 680, easing = EASE.soft, live = false } = {}) {
      const base = scene.getBoundingClientRect(), k = W / (base.width || W), r = to.getBoundingClientRect();
      const b = { x: (r.left - base.left) * k, y: (r.top - base.top) * k };
      const land = () => { to.style.visibility = ""; };
      if (reduced() || !to.animate) { land(); return Promise.resolve(); }
      const ghost = to.cloneNode(true);
      ghost.classList.remove("hp-c", "hp-c-node"); ghost.classList.add("hp-ghost");
      ghost.style.cssText = `position:absolute;left:${b.x}px;top:${b.y}px;margin:0;z-index:40;transform-origin:0 0;pointer-events:${live ? "auto" : "none"}`;
      ghost.setAttribute("aria-hidden", "true"); ghost.tabIndex = -1;
      if (live) ghost.addEventListener("click", () => to.click());
      scene.append(ghost); to.style.visibility = "hidden";
      const done = () => { ghost.remove(); land(); };
      return ghost.animate([{ transform: `translate3d(${from.x - b.x}px, ${from.y - b.y}px, 0) scale(${from.s})`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { transform: "none", opacity: 1 }], { duration, easing, fill: "forwards" }).finished.then(done, done);
    },

    /** 말랑한 덩어리의 길(반지름 100 기준). shape = [[갈래 수, 세기, 돌린 각도°], …], m = 0(동그라미)~1(덩어리) */
    blobPath(shape, m = 1, turn = 0) {
      const N = 72, rs = []; let max = 0;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2; let r = 1;
        for (const [n, amp, deg = 0] of shape) r += m * amp * Math.cos(n * (a - turn) - (deg * Math.PI) / 180);
        rs.push(r); if (r > max) max = r;
      }
      // 점과 점 사이를 곡선으로 잇는다(크게 그려도 각이 지지 않는다)
      const px = [], py = [];
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, r = (rs[i] / max) * 100; px.push(Math.cos(a) * r); py.push(Math.sin(a) * r); }
      const mid = (i) => { const j = (i + 1) % N; return ((px[i] + px[j]) / 2).toFixed(1) + " " + ((py[i] + py[j]) / 2).toFixed(1); };
      let d = "M" + mid(N - 1);
      for (let i = 0; i < N; i++) d += "Q" + px[i].toFixed(1) + " " + py[i].toFixed(1) + " " + mid(i);
      return d + "Z";
    },

    /** 고양이의 자리가 되는 납작한 색 덩어리(동그라미 ↔ 꽃·별 모양). 모양(m)·크기(r)·자리(x, y)가 스프링으로 바뀐다.
     *  ui.shape(ctx, { color, shape: [[갈래 수, 세기, 각도°]], x, y, r, m }) → { el, set({ x, y, r, m }), to({ x, y, r, m }, { kick }) }
     *  m = 0(동그라미) ~ 1(모양). kick을 주면 모양이 한 번 크게 튀었다가 가라앉는다(깜짝 놀라는 순간). */
    shape(ctx, { color = "var(--hp-orange)", shape = [[5, 0.14, -90]], x = W / 2, y = H / 2, r = 100, m = 0 } = {}) {
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "hp-shape"); svg.setAttribute("viewBox", "-100 -100 200 200"); svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(NS, "path"); path.style.fill = color; svg.append(path);
      const KEYS = ["x", "y", "r", "m"], cur = { x, y, r, m }, goal = { x, y, r, m }, vel = { x: 0, y: 0, r: 0, m: 0 };
      let stop = null;
      const paint = () => {
        svg.style.transform = `translate3d(${(cur.x - 100).toFixed(2)}px, ${(cur.y - 100).toFixed(2)}px, 0) scale(${Math.max(0, cur.r / 100).toFixed(4)})`;
        path.setAttribute("d", ui.blobPath(shape, Math.max(0, cur.m)));
      };
      const api = {
        el: svg,
        set(p = {}) { if (p.shape) shape = p.shape; for (const k of KEYS) if (p[k] != null) { goal[k] = cur[k] = p[k]; vel[k] = 0; } paint(); return api; },
        to(p = {}, { kick = 0 } = {}) {
          if (reduced()) return api.set(p);
          if (p.shape) shape = p.shape;
          for (const k of KEYS) if (p[k] != null) goal[k] = p[k];
          vel.m += kick;
          if (!stop) stop = ctx.loop((dt) => {
            let moving = false;
            for (const k of KEYS) {
              const soft = k === "m";
              vel[k] += ((goal[k] - cur[k]) * (soft ? 110 : 170) - vel[k] * (soft ? 9 : 19)) * dt; cur[k] += vel[k] * dt;
              if (Math.abs(goal[k] - cur[k]) > (soft ? 0.002 : 0.05) || Math.abs(vel[k]) > (soft ? 0.01 : 0.5)) moving = true;
            }
            if (!moving) { Object.assign(cur, goal); stop(); stop = null; }
            paint();
          });
          return api;
        },
      };
      paint();
      return api;
    },

    /** 떠다니는 방울 고르기(물리: 떠다니고, 부딪히면 말랑하게 눌리고, 밀리고, 던져진다). 고르면 그 방울이 자라 덩어리가 되고 나머지는 흩어진다.
     *  items = [{ label, lines(글을 나눌 줄. 없으면 첫 낱말 / 나머지), color, line(바탕색에 잉크 테두리), stroke(덩어리가 됐을 때의 선 굵기), r, x, y, shape }]
     *  dots = [{ mark: "heart" | "sparkle", rot, r, x, y } | { color, r, x, y }], bounds = { l, t, r, b }
     *  solids = [{ x, y, r, onHit }] 움직이지 않는 것(방울이 튕겨 나간다)
     *  hero(item, i) → { x, y, r } 고른 방울이 갈 자리. onPick(i, instant, focused(포커스가 그 방울에 있었는지)) / onRelease(i)
     *  → { el, pick(i, instant), release(), picked } */
    bubbles(ctx, { items, dots = [], solids = [], bounds, hero, onPick, onRelease }) {
      const field = el("div", "hp-bubs");
      const still = reduced(), bodies = [];
      const ITEM = { k: 0.9, c: 1.15 }, DOT = { k: 0.7, c: 0.9 }, DT = 1 / 120;
      let picked = null, t = 0, drag = null, acc = 0;
      const ptr = { x: -999, y: -999, vx: 0, vy: 0, at: 0, inside: false };
      const NS = "http://www.w3.org/2000/svg";
      // 떠다니는 박자: 보통은 열 때마다 다르고, 바로 보여 주는 상태(?state=…, 스크린샷용)에서는 늘 같다
      let seed = 13;
      const rnd = ctx.instant ? (a, b) => { seed = (seed * 1664525 + 1013904223) >>> 0; return a + (seed / 4294967296) * (b - a); } : rand;

      items.forEach((it, i) => {
        const b = el("button", "hp-bub" + (it.line ? " is-line" : "")); b.type = "button";
        b.style.cssText = `--c:${it.color};width:${it.r * 2}px;height:${it.r * 2}px`;
        const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "-100 -100 200 200"); svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(NS, "path"); path.setAttribute("d", ui.blobPath(it.shape, 0)); svg.append(path);
        const words = it.label.split(" ");
        // 첫 낱말 / 나머지로 나눈다. 첫 낱말이 한 글자면("잘 모르겠어요") 한 글자만 남는 줄이 생기므로 한 줄로 둔다(lines로 직접 정할 수도 있다)
        const rows = it.lines || (words.length > 1 && Array.from(words[0]).length > 1 ? [words[0], words.slice(1).join(" ")] : [it.label]);
        b.append(svg, el("span", "hp-bub-label", rows.map((t) => el("span", "", t))));
        b.setAttribute("aria-label", it.label);
        field.append(b);
        const body = { kind: "item", i, it, el: b, skin: svg, path, x: it.x, y: it.y, vx: 0, vy: 0, r: it.r, r0: it.r, rv: 0, rt: it.r, hx: it.x, hy: it.y, homeX: it.x, homeY: it.y, ...ITEM, m: it.r * it.r, morph: 0, mv: 0, mt: 0, turn: 0, away: false, dragged: false, sq: 0, sqv: 0, sqa: 0, p1: rnd(0, 6.28), p2: rnd(0, 6.28), w1: rnd(0.45, 0.8), w2: rnd(0.4, 0.7), wa: 24 };
        bodies.push(body);
        b.addEventListener("click", () => { if (body.dragged) { body.dragged = false; return; } pick(i, false); });
      });
      dots.forEach((dt) => {
        const d = el("i", "hp-bub-dot" + (dt.mark ? " is-mark" : "")); d.setAttribute("aria-hidden", "true");
        d.style.cssText = `--c:${dt.color || "none"};--rot:${dt.rot || 0}deg;width:${dt.r * 2}px;height:${dt.r * 2}px`;
        if (dt.mark) d.innerHTML = ICONS[dt.mark] || "";
        field.append(d);
        bodies.push({ kind: "dot", el: d, x: dt.x, y: dt.y, vx: 0, vy: 0, r: dt.r, r0: dt.r, rv: 0, rt: dt.r, hx: dt.x, hy: dt.y, homeX: dt.x, homeY: dt.y, ...DOT, m: dt.r * dt.r * 1.5, away: false, sq: 0, sqv: 0, sqa: 0, p1: rnd(0, 6.28), p2: rnd(0, 6.28), w1: rnd(0.5, 1.1), w2: rnd(0.5, 1), wa: 40 });
      });

      const squashOf = (b) => { const d = (b.sqa * 180) / Math.PI; return `rotate(${d.toFixed(1)}deg) scale(${(1 + b.sq).toFixed(4)}, ${(1 - b.sq * 0.7).toFixed(4)}) rotate(${(-d).toFixed(1)}deg)`; };
      function paint(b) {
        const soft = Math.abs(b.sq) > 0.002;
        b.el.style.transform = `translate3d(${(b.x - b.r0).toFixed(2)}px, ${(b.y - b.r0).toFixed(2)}px, 0) scale(${(b.r / b.r0).toFixed(4)})` + (b.kind === "dot" && soft ? " " + squashOf(b) : "");
        if (b.kind !== "item") return;
        if (soft || b.squashed) { b.skin.style.transform = soft ? squashOf(b) : ""; b.squashed = soft; }       // 색 덩어리만 눌린다(글자는 그대로)
        if (b.morph > 0.001 || b.shaped) { b.path.setAttribute("d", ui.blobPath(b.it.shape, b.morph, b.turn)); b.shaped = b.morph > 0.001; }
        if (b.it.line) b.path.style.strokeWidth = (lerp(2.5, b.it.stroke || 2.5, clamp(b.morph, 0, 1)) * b.r0 / Math.max(b.r, 1)).toFixed(2) + "px";      // 방울일 때 2.5px, 덩어리가 되면 stroke까지 굵어진다
      }
      /** 부딪힌 쪽(nx, ny)으로 말랑하게 눌린다. hit = 0~1 세기 */
      const squish = (b, nx, ny, hit) => { if (hit < 0.1 || b === picked || t - (b.hitAt || -1) < 0.1) return; b.hitAt = t; b.sqa = Math.atan2(ny, nx); b.sqv -= Math.min(hit, 0.8) * 4.2; };      // 세게 부딪힌 순간에만(계속 밀고 있을 때는 아니다)

      function step(dt) {
        t += dt;
        for (const b of bodies) {
          // 제자리로 끌림 + 떠다님
          let ax = (b.hx - b.x) * b.k, ay = (b.hy - b.y) * b.k;
          if (!picked) { ax += Math.sin(t * b.w1 + b.p1) * b.wa; ay += Math.cos(t * b.w2 + b.p2) * b.wa; }
          if (drag && drag.body === b && drag.moved) { ax += (drag.x - b.x) * 140; ay += (drag.y - b.y) * 140; b.vx *= 0.9; b.vy *= 0.9; }
          // 포인터가 지나가면 작은 점은 달아나고, 큰 방울은 지나가는 쪽으로 슬쩍 밀린다
          if (ptr.inside && !picked) {
            const dx = b.x - ptr.x, dy = b.y - ptr.y, d = Math.hypot(dx, dy) || 1;
            if (b.kind === "dot" && d < b.r + 54) { const f = (1 - d / (b.r + 54)) * 900; ax += (dx / d) * f; ay += (dy / d) * f; }
            if (b.kind === "item" && d < b.r && !(drag && drag.body === b)) { ax += clamp(ptr.vx, -900, 900) * 1.1; ay += clamp(ptr.vy, -900, 900) * 1.1; }
          }
          b.vx += ax * dt; b.vy += ay * dt;
          const damp = Math.exp(-b.c * dt); b.vx *= damp; b.vy *= damp;
          b.x += b.vx * dt; b.y += b.vy * dt;
          // 크기·모양·눌림 스프링
          b.rv += ((b.rt - b.r) * 150 - b.rv * 15) * dt; b.r += b.rv * dt;
          b.sqv += (-190 * b.sq - 16 * b.sqv) * dt; b.sq = clamp(b.sq + b.sqv * dt, -0.15, 0.15);
          if (b.kind === "item") { b.mv += ((b.mt - b.morph) * 60 - b.mv * 11) * dt; b.morph = clamp(b.morph + b.mv * dt, 0, 1.25); if (b === picked) b.turn = 0.11 * Math.sin((t - b.t0) * 0.55); }      // 고른 덩어리는 천천히 좌우로 기웃거린다(모양의 위아래는 그대로)
        }
        ptr.vx *= Math.exp(-8 * dt); ptr.vy *= Math.exp(-8 * dt);
        // 부딪힘(서로 밀어내고 튕기고 눌린다)
        for (let n = 0; n < 2; n++) for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          if (a.away && b.away) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001, min = a.r + b.r + 5;
          if (d >= min) continue;
          const nx = dx / d, ny = dy / d, pen = min - d, tot = a.m + b.m;
          a.x -= nx * pen * (b.m / tot); a.y -= ny * pen * (b.m / tot); b.x += nx * pen * (a.m / tot); b.y += ny * pen * (a.m / tot);
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jn = (-1.55 * rv) / (1 / a.m + 1 / b.m); a.vx -= (jn / a.m) * nx; a.vy -= (jn / a.m) * ny; b.vx += (jn / b.m) * nx; b.vy += (jn / b.m) * ny;
            const hit = Math.min(1, -rv / 380); squish(a, nx, ny, hit); squish(b, nx, ny, hit);
          }
        }
        // 움직이지 않는 것(패널 너머로 내다보는 고양이의 머리와 귀)
        for (const s of solids) for (const b of bodies) {
          if (b.away || b === picked) continue;
          const dx = b.x - s.x, dy = b.y - s.y, d = Math.hypot(dx, dy) || 0.001, min = b.r + s.r + 3;
          if (d >= min) continue;
          const nx = dx / d, ny = dy / d; b.x += nx * (min - d); b.y += ny * (min - d);
          const rv = b.vx * nx + b.vy * ny;
          if (rv < 0) { b.vx -= 1.5 * rv * nx; b.vy -= 1.5 * rv * ny; squish(b, nx, ny, Math.min(1, -rv / 380)); if (s.onHit && -rv > 70) s.onHit(b); }
        }
        // 벽
        for (const b of bodies) {
          if (b.away || b === picked) continue;
          if (b.x - b.r < bounds.l) { b.x = bounds.l + b.r; if (b.vx < 0) { squish(b, 1, 0, Math.min(1, -b.vx / 500)); b.vx *= -0.5; } }
          if (b.x + b.r > bounds.r) { b.x = bounds.r - b.r; if (b.vx > 0) { squish(b, 1, 0, Math.min(1, b.vx / 500)); b.vx *= -0.5; } }
          if (b.y - b.r < bounds.t) { b.y = bounds.t + b.r; if (b.vy < 0) { squish(b, 0, 1, Math.min(1, -b.vy / 500)); b.vy *= -0.5; } }
          if (b.y + b.r > bounds.b) { b.y = bounds.b - b.r; if (b.vy > 0) { squish(b, 0, 1, Math.min(1, b.vy / 500)); b.vy *= -0.5; } }
        }
      }
      /** 프레임마다: 물리는 1/120초씩 끊어서 계산한다(기기마다 같은 느낌) */
      function frame(dt) { acc = Math.min(acc + dt, 0.05); while (acc >= DT) { step(DT); acc -= DT; } bodies.forEach(paint); }

      // 포인터: 누르고 끌면 방울이 따라오고(놓으면 그 속도로 밀려난다), 그냥 누르면 고른다
      ctx.on(field, "pointerdown", (e) => {
        const p = ctx.point(e);
        Object.assign(ptr, { x: p.x, y: p.y, inside: true, at: performance.now() });
        if (picked) { if (Math.hypot(p.x - picked.x, p.y - picked.y) <= picked.r) picked.rv -= 130; return; }      // 고른 덩어리를 누르면 젤리처럼 출렁인다
        const body = bodies.find((b) => b.kind === "item" && !b.away && Math.hypot(p.x - b.x, p.y - b.y) <= b.r);
        if (!body) return;
        body.rv -= 80; body.sqa = -Math.PI / 2; body.sqv -= 2.4;                   // 눌리는 느낌
        drag = { body, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false };
      });
      ctx.on(window, "pointermove", (e) => {
        const p = ctx.point(e), now = performance.now(), dt = Math.max(8, now - ptr.at) / 1000;
        ptr.inside = p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
        ptr.vx = lerp(ptr.vx, (p.x - ptr.x) / dt, 0.5); ptr.vy = lerp(ptr.vy, (p.y - ptr.y) / dt, 0.5);
        Object.assign(ptr, { x: p.x, y: p.y, at: now });
        if (!drag) return;
        drag.x = p.x; drag.y = p.y;
        if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 7) { drag.moved = true; drag.body.dragged = true; field.classList.add("is-dragging"); }
      });
      const drop = () => { if (!drag) return; const b = drag.body; drag = null; field.classList.remove("is-dragging"); if (b.dragged) setTimeout(() => { b.dragged = false; }, 80); };
      ctx.on(window, "pointerup", drop); ctx.on(window, "pointercancel", drop);

      function pick(i, instant) {
        if (picked) return;
        const b = bodies[i], to = hero(b.it, i), focused = focusedIn(field) === b.el;
        picked = b; drag = null;
        field.classList.add("is-picked"); b.el.classList.add("is-picked"); b.el.disabled = true;
        Object.assign(b, { hx: to.x, hy: to.y, rt: to.r, mt: 1, k: 60, c: 13, m: 1e7, sq: 0, sqv: 0, t0: t });
        for (const o of bodies) {
          if (o === b) continue;
          let dx = o.x - b.x, dy = o.y - b.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
          Object.assign(o, { away: true, hx: o.x + dx * 640, hy: o.y + dy * 640, k: 7, c: 4 }); o.vx += dx * 260; o.vy += dy * 260;
          o.el.classList.add("is-away"); if (o.kind === "item") o.el.disabled = true;
        }
        if (instant || still) { Object.assign(b, { x: to.x, y: to.y, r: to.r, morph: 1 }); for (const o of bodies) if (o !== b) { o.x = o.hx; o.y = o.hy; } bodies.forEach(paint); }
        if (onPick) onPick(i, Boolean(instant) || still, focused);
      }
      function release() {
        if (!picked) return;
        const b = picked; picked = null;
        field.classList.remove("is-picked"); b.el.classList.remove("is-picked");
        for (const o of bodies) {
          const base = o.kind === "item" ? ITEM : DOT;
          Object.assign(o, { away: false, hx: o.homeX, hy: o.homeY, rt: o.r0, m: o.kind === "item" ? o.r0 * o.r0 : o.r0 * o.r0 * 1.5, k: still ? base.k : 9, c: still ? base.c : 5 });
          if (o.kind === "item") { o.mt = 0; o.turn = 0; o.el.disabled = false; }
          o.el.classList.remove("is-away");
          if (still) Object.assign(o, { x: o.hx, y: o.hy, r: o.r0, morph: 0 });
        }
        if (still) bodies.forEach(paint);
        else ctx.later(() => { if (!picked) for (const o of bodies) Object.assign(o, o.kind === "item" ? ITEM : DOT); }, 1000);
        if (onRelease) onRelease(b.i);
      }
      // 들어올 때: 하나씩 통 부풀어 오른다
      if (!still && !ctx.instant) bodies.forEach((b, n) => { b.r = 0.5; b.rt = 0.5; b.y += 26; ctx.later(() => { if (!b.away && b !== picked) b.rt = b.r0; }, 400 + n * 80); });
      bodies.forEach(paint);
      if (!still) ctx.loop(frame);
      return { el: field, bodies, pick, release, get picked() { return picked ? picked.i : -1; } };
    },

    /** 색면 바꾸기(장면 전환): from(눌린 요소)에서 그 색이 먼저, 이어서 새 색면이 동그랗게 퍼진다. id를 비우면 다음 장면. */
    transition(ctx, id, { from, state } = {}) { return id ? ctx.go(id, state, from) : ctx.next(from); },

    /** 고양이 배우(HereCat). 장면 안에서는 ctx.cat(place)를 쓴다(장면이 사라질 때 같이 정리된다). */
    cat(stage, assets, place) { const a = window.HereCat.create(stage, { assets }); clipWalk(a); if (place) a.place(place); return a; },

    /** 요소 가운데의 무대 좌표(390×844 기준). 화면이 축소돼 있어도 맞는다. */
    center(node, root) {
      const a = node.getBoundingClientRect(), b = root.getBoundingClientRect(), k = W / (b.width || W);
      return { x: (a.left + a.width / 2 - b.left) * k, y: (a.top + a.height / 2 - b.top) * k };
    },
    /** 포인터 위치를 무대 좌표로. */
    point(e, root) {
      const b = root.getBoundingClientRect(), k = W / (b.width || W);
      return { x: (e.clientX - b.left) * k, y: (e.clientY - b.top) * k };
    },
  };

  /** 걷는 그림(스프라이트)에는 발 사이·발밑 바닥에 회색 그림자가 구워져 있어서 색면 위에서 얼룩으로 보인다.
   *  프레임마다 그림자가 있는 자리만 털의 아래 윤곽을 따라 오려 낸다(앉은 그림들의 clip-path와 같은 생각). 픽셀을 읽지 않으므로 file://에서도 된다.
   *  WALK_CLIP은 make-clips.cjs가 걷기 그림에서 계산해 적는다: 프레임(6~96)은 쉼표로, 한 프레임 안의 구간은 마침표로 나뉘고,
   *  점 하나는 36진수 세 글자(x 두 글자 + 바닥 띠 안의 y 한 글자)다. 그림이 바뀌면 `node attempts/pop/make-clips.cjs`를 다시 돌린다. */
  const WALK = { fw: 493, fh: 398, cols: 7, sheetB: 49, first: 6, floor: 350 };
  const WALK_CLIP = "64b67a6c46d56k56nl.8j98l38m58p49559689a8.a61a82,58b.66e69c6d46e56h46i56m56nl.8k1.9249369b6,57a58f59e.69l6bf6c36d66f56m66nl.7o97pg.8k1,57f.5dt5ju.65t68s6au6c16d56i56l76m66nk,57i.6bs6ca6g56m66nk.7pc,57h.6ct6d86g56l66nj.7pb,57h.6cp6de6he6j76k76lg6rl.7qa,57i.6di6eh6nh6pj6sj6vl.7r87s9,4t84w8.6bn6ei6oh6p86qf6rf6sj6tk6vj71k.7gl7hm.7t6,4j14n1.4u74x7.6cm6dk6fk6ih6oh6p46qe6se6vk6xl75l77n7hn7il7ll,4m24o1.58b.6cm6ef6fi6gh6oh6p36qd6td6wg70h71m78o7co7dn7fp.7v2,586.6dj6fj6gh6oh6p26qh6ti.7u57v3,4n54u6.589.6di6if6og6p16qc6sc,59a.6dh6e96fg6gf6nf6oa6pf6sl6tl6ur70p.75n7dn.7lq7mr.7u9,59a.6dh6fh6gf6nf6od.7uf7w2,6ch6eh6fe6ne6oc.7uf,587.68h6af6bg6cf6d66ee6ne6pm,568587.5gl5kk.60j63j67g68h6ag6c46df6mf6ne6rn.7td,566.5hm5im.60m62j67h6ad6bg6cf6mf6ne6ql.7td,552565.5jn5tn5um62n65l69e6ag6df6fg6mg6nd6ql.7tf,555565.69h6gf6mg6nc6ql,555565572.6986ah6gf6mf6nb6pj.7s9,551564.6bb6c26dg6ef6mf6na6pi.7s9.874,6bg6de6me6n96og6qj.7s8,56g.6cg6de6gd6ld6me6n86pg.7s9,4t1.56257h.6cf6dd6ee6md6n76of6qi,57d.6df6gd6od6qg.7s7,57d.6cl6ee6hd6oe6pb6qg6rf6ui.7t6,6bl6ef6qf6rc6tg72j,58b.6bl6di6ed6fg6hf6pf6q26rd6td6xi70h72k74j76l78l.7jk7kk.7v47w6,58d.6ck6hf6pf6q16rc6uc70g73g76j7ej.7v37w5,6di6fg6gh6hf6qf6uh.7u37v3,4v3583.6dh6he6oe6p26qb6ub.7u37v5,4l7.59a.6dh6fe6pe6ri.6vm6wm6xp70o71m76m77n.7en7fm7gn.7kr7ls7mp7nq,6dg6fd6ge6hd6nd6oe6pb6qq.7v1,6ch6e66fd6od6pa6qe,589597.69h6af6gd6od6pa.7ue,578586.60j64j68g6bg6d66ee6id6ne6od6qk.7ue,576.5il5jl.61l64i69g6ad6bd6c26df6me6ph6rm.7ud,565576.5kn5ln.5xn61n63i65i69f6ac6bc6c16de6le6nf6ob6qk.7tb,565575.69g6nf6oa6qj.7ta,565575.6bg6mf6qj.7tc,561574.6cf6le6qi.7t2832874,6dg6ge6me6ng6qh,57f.6df6hd6ne6o66qh,572.6cn6df6fd6nd6o56qh,6da6ed6jd6kc6nd6o56pe6rh,6cm6ed6fe6nd6o76qe6th.7t6,58c.6bm6ec6ff6pe6q26sg6vg71j,6cl6gf6kf6le6sf6tc6wh70h72k75k.7hk7mk.7w3,6dk6gg6lg6mf6sf6tg6ub6we71g73l77m7fm7hl,599.6ei6hf6pf6tg6vi.7w2,585594.6eh6gf6ke6ne6th.7v27w5,4p4.5a9.6eh6he6oe6sh.6zm70l71p77o78m7cm7eo7hp7ko7mq.7w9,5a9.6eg6f86ge6pe6q96rh.7ve,5ab.6eg6f76ge6hd6od6pc6qd.7vf7w17z1,6bg6dd6e46fd6od6q7.7vf,588596.66i69f6bg6ce6d16ee6oe6pc6qi,573.5fl5hl.60k65i66j69i6bc6cc6d46ef6me6pg6rk,567576.5km.63n67k6ae6bh6ff6mf6og6pa6rl.7uc,567576.6ai6ci6gf6lf6pg6rl.7uc,566574.6cg6lf6pg6qi,561575.6cg6nf6oc6qi.7u3823865,56b.6bh6gf6nf6oa6qi.7t9,571.6cq6ef6ie6me6nf6o96qi.7ta,4s24u2.572.6dh6ie6me6nf6o86qi.7t9,57h58h59e.6dh6ef6he6me6nf6o86qi.7tb,6di6ef6he6ne6of6pc6rh.7t9,6co6dh6ei6gg6pg6q56sh6uh6wj,58f.6co6fi6qh6r56se6te6uh6xj73k75m.7im7om.7w1,58g.6cp6dm6ii6ri6s36tg6vg75n77m78n7gn7hp7lq.7x1,6dn6fj6sj6wk6yg71i75i79l7fl7go7ho.7y6,6dm6fj6kj6li6qi6rj6s36tj6vj6xf6zg70m76o7bk7fp7hp.7x67y9,4sd4td.52e54e55b5ac.6dn6gi6ri6sj6tf6wj6zk75k78m7il,4gf4he.59g5ac.6do6fh6ng6o86pg6tl6xn.7fn7gm7kn7mm,495.59g5ac.6cp6fg6jf6mg.7re,496.5ac.6co6ff6lf6mg,496.5ac.6co6ed6ic6kd6lc6me.7qa,496.59g5ab.6bp6dl6ea6g86la6mf.7qb,496.59e5a4.6bo6cn6d86e96g76m8.7qd,497.59e5a4.6bo6d86f76k76l86m7.7qf,497.59d5ai.6cm6d76l66mi.7o27qh.8p2,497.59d5ai.6di6e66j66kh6mj.7o27pc.8q4,497.5ac5bj.6dl6fi6ii6lk.7og7pc,497.5bc5cj.6em6fk6jl.7o2,497.5ce5d45ei.7o77pd.8q78r68z7.985995.9f79j69l7,497.5dd5f1.7o9.8rb98c9979c89n89pa9rj9tj.achaffagg,4974cb.5e85f4.8ph8wl.a19a39,497.5e95f5.7pl81k88m.9nf9oh,4944a14b1.5dd5e15f2.7ql83l84m.9me9re,497.5de5f1.7ql84l.9oe9re";
  let walkPolys = null;
  function walkClip(f) {
    if (!walkPolys) walkPolys = WALK_CLIP.split(",").map((frame) => {
      if (!frame) return "none";
      const at = (x, y) => `, ${+((x / WALK.fw) * 100).toFixed(2)}% ${+((y / WALK.fh) * 100).toFixed(2)}%`;
      let d = "0% 0%, 100% 0%, 100% 100%";
      for (const run of frame.split(".").reverse()) {                 // 오른쪽 구간부터: 아래 변을 따라 왼쪽으로 가며 구간마다 윤곽까지 파 올린다
        const pts = [];
        for (let i = 0; i + 2 < run.length; i += 3) pts.push([parseInt(run.slice(i, i + 2), 36), WALK.floor + parseInt(run[i + 2], 36)]);
        if (!pts.length) continue;
        const l = pts[0][0], r = pts[pts.length - 1][0] + 1;
        d += at(r, WALK.fh) + at(r, pts[pts.length - 1][1]);
        for (let i = pts.length - 1; i >= 0; i--) d += at(pts[i][0] + 0.5, pts[i][1]);
        d += at(l, pts[0][1]) + at(l, WALK.fh);
      }
      return `polygon(${d}, 0% 100%)`;
    });
    return walkPolys[f - WALK.first] || "none";
  }
  /** 고양이 배우가 걷는 프레임을 그릴 때마다 그 프레임의 clip-path를 캔버스에 준다. */
  function clipWalk(actor) {
    const canvas = actor.el.querySelector(".hc-walk"), g = canvas && canvas.getContext && canvas.getContext("2d");
    if (!g || g.hpClip) return;
    const draw = g.drawImage.bind(g);
    let last = -1, first = null;
    g.hpClip = true;
    g.drawImage = (...a) => {
      if (a.length === 9 && a[3] === WALK.fw && a[4] === WALK.fh) {
        // 두 번째 장(walk-b)인지: 파일 이름으로 알아보고, 이름이 바뀌어 있으면 처음 그린 그림(걷기는 늘 첫 장에서 시작한다)과 다른지로 본다
        const src = (a[0] && a[0].src) || "";
        let second = /walk-b/.test(src);
        if (!second && !/walk-a/.test(src)) { if (!first) first = a[0]; second = a[0] !== first; }
        const f = (second ? WALK.sheetB : 0) + Math.round(a[2] / WALK.fh) * WALK.cols + Math.round(a[1] / WALK.fw);
        if (f !== last) { last = f; canvas.style.clipPath = walkClip(f); }
      }
      return draw(...a);
    };
  }

  /* ───────────────────────── 장면 등록 ───────────────────────── */
  function addScene(def) {
    if (!def || !def.id || typeof def.build !== "function") throw new Error("addScene: { id, build }가 필요해요");
    registry.set(def.id, { field: "yellow", states: [], ...def });
    return HerePhone;
  }
  const orderOf = (id) => { const i = FLOW.indexOf(id); return i < 0 ? FLOW.length + [...registry.keys()].indexOf(id) : i; };
  let allowed = null;                                                   // 앱: 이번 흐름에서 쓰는 장면(mount의 scenes). 없으면 등록된 장면 전부
  const sceneIds = () => [...registry.keys()].filter((id) => !allowed || allowed.includes(id)).sort((a, b) => orderOf(a) - orderOf(b));

  /** 화면의 그 자리(clientX, clientY)가 고양이 위인지(그림의 자리로 가늠한다). 반복 영상은 그림이 고양이보다 넓어서 안쪽만 본다. */
  function catAt(actor, x, y) {
    const s = actor.state;
    if (s.walking || actor.away || actor.el.style.opacity === "0") return false;
    const im = actor.el.querySelector(".hc-img"), r = im && im.getBoundingClientRect();
    if (!r || !r.width) return false;
    const clip = !/^(sit|round|grumble|purr)$/.test(s.pose);
    const cx = r.left + r.width / 2, cy = r.top + r.height * (clip ? 0.6 : 0.5), rx = r.width * (clip ? 0.33 : 0.48), ry = r.height * (clip ? 0.36 : 0.48);
    return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  }
  /** 고양이를 콕 눌렀는지. */
  const hitCat = (actor, e) => catAt(actor, e.clientX, e.clientY);

  /* ───────────────────────── mount ───────────────────────── */
  function mount(host, { assets = "assets/", scene, state, onChange, initial, onFinish, scenes, beforeNext, actions } = {}) {
    allowed = scenes || null;
    const C = window.HereCopy;
    const root = el("div", "hp");
    root.style.setProperty("--hp-spring", EASE.spring);
    root.style.setProperty("--hp-spring-soft", EASE.soft);
    const stack = el("div", "hp-stack"), live = el("div", "hp-sr hp-live");
    live.setAttribute("role", "status"); live.setAttribute("aria-live", "polite");
    // 시험용 키보드(api.keyboard · state=typing)가 켜져 있을 때만 보이는 자리 표시. 진짜 키보드가 올라올 때는 보이지 않는다.
    const kbGhost = el("div", "hp-kbd", el("span", "", "키보드가 올라오는 자리")); kbGhost.setAttribute("aria-hidden", "true");
    root.append(stack, kbGhost, live); host.append(root);
    root.addEventListener("click", (e) => {
      const t = e.target && e.target.closest ? e.target.closest("button, a[href], [role=button]") : null;
      if (!t || !root.contains(t) || t.disabled || t.getAttribute("aria-disabled") === "true") return;
      const tagged = t.closest("[data-sfx]"), kind = tagged ? tagged.dataset.sfx : "";
      if (kind === "none" || t.classList.contains("hp-bub")) return;       // 방울은 고른 순간에 장면이 소리를 낸다
      if (kind) { sfx(kind); return; }
      if (t.classList.contains("hp-opt")) { const list = Array.from(t.parentNode.querySelectorAll(".hp-opt")); sfx("pick", Math.max(0, list.indexOf(t))); }
      else sfx("tick");
    }, true);

    const fresh = () => ({ nickname: "", companion: C.naming.defaultName, answers: {} });
    const data = fresh();
    if (initial) {                                                      // 앱: 새로 고친 뒤에도 하던 값으로 이어 간다
      if (typeof initial.nickname === "string") data.nickname = initial.nickname;
      if (typeof initial.companion === "string" && initial.companion) data.companion = initial.companion;
      if (initial.answers) for (const [k, v] of Object.entries(initial.answers)) if (v != null) data.answers[k] = v;
    }
    let current = null, endWipe = null, kb = 0, fakeKb = null, fakeBy = null, building = null;

    if (window.HereCat) window.HereCat.preload(assets, ["sleep"]).catch(() => {});
    warmFonts(C);
    // 키를 누른 채로 있어도(자동 반복) 버튼이 잇달아 눌리지 않는다: 이름을 적고 Enter를 누르고 있어도 고양이의 말을 지나치지 않는다
    root.addEventListener("keydown", (e) => { if (e.repeat && e.key === "Enter" && e.target.closest && e.target.closest("button, a")) e.preventDefault(); });

    const snapshot = () => ({ scene: building || (current ? current.id : null), field: current ? current.def.field : null, nickname: data.nickname, companion: data.companion, answers: { ...data.answers } });
    // 장면을 짓는 동안(building)의 변화는 다 지은 뒤에 한 번만 알린다(앞 장면의 id가 섞여 나가지 않는다)
    const emit = () => { if (!building && onChange) onChange(snapshot()); };

    function makeCtx(def, sceneEl, { state: st, instant, fromId }) {
      const cleanups = [], cats = [], kbFns = [];
      const ctx = {
        id: def.id, el: sceneEl, root, actions: actions || {}, state: st, instant: Boolean(instant) || reduced(), fromId, data, copy: C, ui, assets, cats,
        /** 화면 키보드가 가린 높이(무대 px). 0이면 키보드가 없다. */
        get kb() { return kb; },
        /** 키보드가 올라오거나 내려갈 때 불린다: ctx.onKeyboard((px) => …) */
        onKeyboard(fn) { kbFns.push(fn); },
        keyboardChanged(px) { kbFns.forEach((fn) => fn(px)); },
        /** 시험용: 이 장면에 있는 동안 키보드가 px만큼 올라온 것처럼 군다(state=typing 같은 바로가기에서 쓴다). */
        keyboard(px) { fakeKb = px; fakeBy = px == null ? null : def.id; watchKeyboard(); },
        /** 이 장면의 고양이(HereCat 배우). place = { x, ground, h }. layer를 주면 그 안에 세운다(기울인 무대 등). poke: false면 눌러도 반응하지 않는다. */
        cat(place, { layer, z, poke = true } = {}) {
          const lay = layer || el("div", "hp-catlayer");
          if (!layer) { if (z != null) lay.style.zIndex = z; sceneEl.append(lay); }
          const actor = ui.cat(lay, assets, place);
          if (poke) cats.push(actor);
          cleanups.push(() => actor.destroy());
          return actor;
        },
        /** 값 바꾸기 + onChange 알림: ctx.set({ nickname }) / ctx.set({ answers: { lately } }) */
        set(patch = {}) {
          const { answers, ...rest } = patch;
          Object.assign(data, rest);
          if (answers) for (const [k, v] of Object.entries(answers)) { if (v == null) delete data.answers[k]; else data.answers[k] = v; }
          emit();
        },
        /** 장면이 사라지면 같이 정리되는 타이머·반복·이벤트 */
        later(fn, ms) { const t = setTimeout(fn, ms); cleanups.push(() => clearTimeout(t)); return t; },
        loop(fn) {
          let raf = 0, last = performance.now(), alive = true;
          const tick = (now) => { if (!alive) return; const dt = Math.min(0.034, (now - last) / 1000); last = now; fn(dt, now); raf = requestAnimationFrame(tick); };
          raf = requestAnimationFrame(tick);
          const stop = () => { alive = false; cancelAnimationFrame(raf); };
          cleanups.push(stop); return stop;
        },
        on(target, type, fn, opts) { target.addEventListener(type, fn, opts); cleanups.push(() => target.removeEventListener(type, fn, opts)); },
        onDestroy(fn) { cleanups.push(fn); },
        /** 다음·이전 장면으로. from(눌린 버튼)에서 색이 동그랗게 퍼진다. 마지막 장면의 다음은 끝(finish)이다. */
        next(from) {
          const go = () => { const ids = sceneIds(), i = ids.indexOf(def.id); if (i === ids.length - 1) ctx.finish(from); else navigate(ids[i + 1], { from }); };
          // 앱: 이 장면을 떠나기 전에 저장할 것이 있으면 끝날 때까지 머문다(false면 그대로 남는다)
          const wait = beforeNext ? beforeNext(snapshot(), finishing(from, sceneEl)) : true;
          if (wait === false) return;
          if (wait && wait.then) { wait.then((ok) => { if (ok && current && current.ctx === ctx) go(); }); return; }
          go();
        },
        back(from) { const ids = sceneIds(), i = ids.indexOf(def.id); if (i > 0) navigate(ids[i - 1], { from, back: true }); },
        go(id, st2, from) { navigate(id, { state: st2, from }); },
        /** 온보딩 끝: onChange({ scene: "done", … })로 모은 값을 한 번 넘기고, 값을 비운 뒤 처음으로 돌아간다. */
        finish(from) {
          // 앱: 저장이 끝날 때까지 마지막 화면에 머문다. 두 번째 인자로 버튼의 진행·실패 표시를 넘긴다(busy · fail)
          if (onFinish) { onFinish({ ...snapshot(), scene: "done" }, finishing(from, sceneEl)); return; }
          if (onChange) onChange({ ...snapshot(), scene: "done" });
          Object.assign(data, fresh());
          navigate(sceneIds()[0], { from });
        },
        center(node) { return ui.center(node, root); },
        point(e) { return ui.point(e, root); },
        destroy() { while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.error(e); } } },
      };
      return ctx;
    }

    /** 마지막 버튼의 진행·실패 표시(앱이 프로필을 저장하는 동안). busy(true)면 버튼이 잠기고 점 셋이 깜박인다. fail(글, 버튼 글)이면 버튼 위에 알림이 뜨고 다시 누를 수 있다 */
    function finishing(btn, sceneEl) {
      const noteOf = () => sceneEl.querySelector(".hp-fail");
      const ctl = {
        busy(on) {
          sceneEl.classList.toggle("is-saving", Boolean(on));
          if (on) { const n = noteOf(); if (n) n.remove(); sceneEl.classList.remove("is-failed"); }
          if (!btn) return;
          btn.classList.toggle("is-busy", Boolean(on)); btn.disabled = Boolean(on);
          if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy");
        },
        fail(message, retryLabel) {
          ctl.busy(false);
          let n = noteOf();
          if (!n) { n = el("p", "hp-fail"); n.setAttribute("role", "alert"); sceneEl.append(n); }
          n.textContent = message; sceneEl.classList.add("is-failed");
          if (btn && retryLabel && btn.setLabel) btn.setLabel(retryLabel, true);
          if (btn && btn.focus) btn.focus({ preventScroll: true });
        },
      };
      return ctl;
    }

    function build(id, opts) {
      const def = registry.get(id);
      if (!def) throw new Error("모르는 장면: " + id);
      const sceneEl = el("section", "hp-scene" + (opts.instant || reduced() ? " hp-still" : ""));
      sceneEl.dataset.scene = id; sceneEl.dataset.field = def.field; sceneEl.tabIndex = -1;
      sceneEl.dataset.state = opts.state || def.states[0] || "";
      const ctx = makeCtx(def, sceneEl, opts);
      stack.append(sceneEl);          // 먼저 붙여야 크기를 잴 수 있다
      def.build(ctx);
      // 고양이를 콕 누르면 움찔한다(어느 장면에서든). 골골거릴 때는 하트가, 아니면 반짝이가 튄다.
      ctx.on(sceneEl, "pointerdown", (e) => {
        const control = e.target.closest && e.target.closest("button, a, input, label, .hp-hit");
        if (control && !control.disabled) return;
        const p = ui.point(e, root);
        const actor = ctx.cats.find((c) => hitCat(c, e) && (!c.hitTest || c.hitTest(p))); if (!actor) return;
        const purr = actor.state.pose === "purr";
        actor.pop(1.2);
        // 조각은 참고 이미지의 두 가지뿐이다(테두리 반짝이 · 골골거릴 때는 하트). 검은 털 위에 내려앉는 것만 흰색, 색면 위의 것은 잉크색
        const base = root.getBoundingClientRect(), k = (base.width || W) / W;
        const onFur = (x, y) => catAt(actor, base.left + x * k, base.top + y * k);
        ui.burst(sceneEl, p.x, p.y, [[-40, -36, 22, -14], [36, -46, 28, 12], [-8, -66, 18, 4], [52, -8, 16, -8]].map(([dx, dy, s, r], n) => ({ kind: purr ? "heart" : "sparkle", dx, dy, s, r, delay: n * 30, hold: 120, color: onFur(p.x + dx, p.y + dy) ? "#fff" : "" })));
      });
      return { id, el: sceneEl, ctx, def };
    }
    function teardown(s) { if (!s) return; s.ctx.destroy(); s.el.remove(); }

    /** 장면 바꾸기. 눌린 버튼(from)에서 그 버튼의 색이 먼저 퍼지고, 바로 뒤따라 새 색면이 퍼진다. */
    function navigate(id, { state: st, from, wipe = true, back = false } = {}) {
      if (endWipe) { if (wipe) return; endWipe(); }
      if (fakeBy) { fakeKb = null; fakeBy = null; kb = 0; root.classList.remove("has-kb", "has-fake-kb"); }      // 장면이 켠 시험용 키보드는 장면과 함께 내려간다
      const old = current;
      const o = from && from.isConnected ? ui.center(from, root) : { x: W / 2, y: H - 60 };
      let inkColor = "";
      // 불투명한 배경색만 버튼의 색으로 본다(투명하거나 눌리는 동안만 살짝 물드는 뒤로 화살표 · 건너뛰기는 색이 없는 것으로)
      if (from && from.isConnected) { const bg = getComputedStyle(from).backgroundColor, m = /^rgba?\(([^)]+)\)$/.exec(bg || ""), p = m ? m[1].split(/[,\/\s]+/).filter(Boolean) : null; if (p && (p.length < 4 || parseFloat(p[3]) >= 0.98)) inkColor = bg; }
      building = id;
      try { current = build(id, { state: st, instant: st != null && !wipe, fromId: old ? old.id : null }); } finally { building = null; }
      const settleBg = () => { root.style.background = `var(--hp-${current.def.field})`; };
      emit();
      if (kb) current.ctx.keyboardChanged(kb);
      if (!old || !wipe || reduced() || !current.el.animate) { teardown(old); settleBg(); return; }
      old.el.classList.add("is-frozen");
      sfx("whoosh");
      const R = Math.ceil(Math.hypot(Math.max(o.x, W - o.x), Math.max(o.y, H - o.y))) + 12;
      const circle = (r) => `circle(${Math.max(0, r).toFixed(1)}px at ${o.x}px ${o.y}px)`;
      const fresh = current, lead = back ? 60 : 80, dur = 620, BAND = 28;
      const fieldColor = getComputedStyle(fresh.el).backgroundColor;
      // 버튼이 투명하거나(건너뛰기 · 뒤로) 다음 색면과 같은 색이면(q1의 주황 화살표) 다음 색면의 색이 그대로 번진다. 검정 버튼이면 잉크색 고리가 앞서간다.
      const flood = !inkColor || inkColor === fieldColor;
      const ink = el("div", "hp-ink");
      ink.style.background = flood ? fieldColor : inkColor;
      settleBg();                                         // 물러나는 옛 장면 둘레로는 새 색면의 색이 보인다
      stack.insertBefore(ink, current.el);
      // 새 장면은 색이 퍼지는 첫 순간에는 눌리지 않는다(같은 자리를 두 번 눌러도 다음 장면의 버튼이 눌리지 않게)
      fresh.el.classList.add("is-entering"); setTimeout(() => fresh.el.classList.remove("is-entering"), 400);
      old.el.animate([{ transform: "scale(1)" }, { transform: "scale(.94)" }], { duration: 600, easing: EASE.inout, fill: "forwards" });
      let a;
      if (flood) {
        ink.animate([{ clipPath: circle(0) }, { clipPath: circle(R) }], { duration: dur, easing: EASE.inout, fill: "forwards" });
        a = fresh.el.animate([{ clipPath: circle(0) }, { clipPath: circle(R) }], { duration: dur, delay: lead, easing: EASE.inout, fill: "both" });
      } else {
        // 버튼 색의 고리는 처음부터 끝까지 같은 두께(BAND)다: 새 색면이 바로 뒤를 따라가므로 화면이 버튼 색으로 덮이는 순간이 없다
        const N = 32, ring = [], field = [];
        for (let i = 0; i <= N; i++) { const r = INOUT(i / N) * (R + BAND); ring.push({ clipPath: circle(r) }); field.push({ clipPath: circle(r - BAND) }); }
        ink.animate(ring, { duration: dur, easing: "linear", fill: "forwards" });
        a = fresh.el.animate(field, { duration: dur, easing: "linear", fill: "both" });
      }
      endWipe = () => { endWipe = null; teardown(old); ink.remove(); a.cancel(); settleBg(); };
      if (root.contains(focusedIn(root))) fresh.el.focus({ preventScroll: true });      // 다음 Tab은 새 장면의 맨 위부터
      a.finished.then(() => { if (endWipe) endWipe(); }, () => {});
    }

    // 화면 키보드: 보이는 화면(visualViewport)이 줄어 무대 아래쪽이 가려지면 그 높이를 장면에 알린다(ctx.kb · ctx.onKeyboard).
    // 창이 작을 뿐인 데스크톱은 키보드로 보지 않는다. api.keyboard(px)는 시험용이다(무대 px).
    const vv = window.visualViewport;
    function watchKeyboard() {
      let hidden = 0;
      if (fakeKb != null) hidden = fakeKb;
      else if (vv) {
        const a = focusedIn(root), typing = a && root.contains(a) && /^(INPUT|TEXTAREA)$/.test(a.tagName);
        if (typing && window.innerHeight - vv.height > 80) {
          const r = root.getBoundingClientRect(), k = (r.height || H) / H;
          hidden = Math.max(0, (r.bottom - (vv.offsetTop + vv.height)) / k);
        }
      }
      hidden = Math.round(clamp(hidden, 0, 520));
      root.classList.toggle("has-fake-kb", fakeKb != null && hidden > 0); kbGhost.style.height = hidden + "px";
      if (hidden === kb) return;
      kb = hidden; root.classList.toggle("has-kb", kb > 0);
      if (current) current.ctx.keyboardChanged(kb);
    }
    if (vv) { vv.addEventListener("resize", watchKeyboard); vv.addEventListener("scroll", watchKeyboard); }
    root.addEventListener("focusin", watchKeyboard); root.addEventListener("focusout", () => setTimeout(watchKeyboard, 80));

    const api = {
      /** 장면(과 상태)으로 바로 간다. state를 주면 긴 움직임 없이 그 상태가 된다. */
      go(id, st) { navigate(id, { state: st, wipe: false }); return api; },
      restart() { Object.assign(data, fresh()); navigate(sceneIds()[0], { wipe: false }); return api; },
      /** 시험용: 화면 키보드가 px(무대 기준)만큼 올라온 것처럼 군다. null이면 끈다. */
      keyboard(px) { fakeKb = px == null ? null : px; watchKeyboard(); return api; },
      get scenes() { return sceneIds(); },
      get data() { return snapshot(); },
      root,
      /** 앱: 화면에서 내릴 때(리스너·타이머·고양이를 모두 정리한다) */
      destroy() {
        if (endWipe) endWipe();
        if (current) { teardown(current); current = null; }
        if (vv) { vv.removeEventListener("resize", watchKeyboard); vv.removeEventListener("scroll", watchKeyboard); }
        root.remove();
      },
    };
    const first = scene && registry.has(scene) ? scene : sceneIds()[0];
    if (first) navigate(first, { state, wipe: false });
    return api;
  }

  /** 문구에 쓰이는 글자를 미리 받아 둔다(한글 글꼴은 조각으로 나뉘어 온다). */
  function warmFonts(C) {
    if (!document.fonts || !document.fonts.load) return;
    let text = "";
    const walk = (v) => { if (typeof v === "string") text += v; else if (typeof v === "function") { try { walk(v("가")); } catch { /* 인자가 다른 함수 */ } } else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    walk(C);
    text = Array.from(new Set(Array.from(text + "요즘 나는 계속 다음 건너뛰기 뒤로 다가가기 눌러서 고르기 전화하기 0123456789/AIz"))).join("");
    const fams = (window.HereFontFamilies || ["Gothic A1", "Outfit"]);
    for (const f of fams) for (const w of [400, 500, 600]) document.fonts.load(`${w} 20px "${f}"`, text).catch(() => {});
  }

  const HerePhone = { mount, addScene, ui, flow: FLOW };
  window.HerePhone = HerePhone;

  /* ═════════════════════════ 장면: open (노랑) ═════════════════════════
   * 주황 동그라미 안에서 자는 고양이(곁에 z · 하트 · 반짝이) → 다가가기(또는 동그라미 누르기) → 깜짝 깨서 첫마디(= AI라는 안내). 동그라미는 여섯 갈래 꽃 모양으로 튄다.
   * 참고: tone-1(노란 색면·줄 안 알약·캐릭터 뒤의 주황 덩어리·하트와 반짝이·버튼 위의 쪽 표시·검정 알약 버튼) — 참고 이미지의 노란 화면을 그대로 옮긴 장면.
   *       짜임은 layout-4("열어 보면 누가 있다")
   */
  addScene({
    id: "open", field: "yellow", states: ["idle", "awake"],
    build(ctx) {
      const { el: root, copy: C } = ctx;
      // 자는 영상은 원본이 작아서(493px) 크게 늘리지 않는다(h 200 → 그림 너비 313px, 2배 화면에서 1.27배). 깬 뒤의 앉은 그림은 고해상도라 크게 쓴다.
      const SLEEP = { x: 195, ground: 596, h: 200 }, SIT = { x: 195, ground: 682, h: 348 };
      let awake = false, said = false;
      const talk = ui.speech();

      root.append(ui.topbar(ctx, { back: false }));

      // 제목 두 벌: 자는 동안(서비스의 말) → 깬 뒤(고양이의 첫마디)
      const head = ui.block("hp-head", { top: 92 });
      const [a1, a2, a3] = lines(C.open.eyebrow, [2, 1, 2]);
      const hA = ui.headline([a1, [a2 + " ", ui.pill({ wave: true, dot: { text: "z" } })], a3], { size: 46 });
      const [b1, b2, b3] = lines(C.open.line || C.open.catLine, [1, 2, 2]);
      // 첫마디가 두 줄이면 셋째 줄은 없다. 줄에 "AI"가 있을 때만 알약으로 바꾼다
      const hB = ui.headline([b1, b2 && swap(b2, "AI", ui.pill({ text: "AI", dot: "star" })), b3].filter(Boolean), { typed: true });
      const desc = el("p", "hp-body", C.open.note || C.open.desc);
      head.append(hA);
      root.append(head);

      // 고양이의 자리: 주황 동그라미(tone-1의 색 덩어리). 깨는 순간 여섯 갈래 꽃 모양으로 통 튄다.
      const SPOT = { x: 195, y: SLEEP.ground - 58, r: 128, m: 0 }, SPOT_UP = { x: 195, y: 536, r: 208, m: 1 };
      const spot = ui.shape(ctx, { color: "var(--hp-orange)", shape: [[6, 0.1, 0]], ...SPOT });      // 여섯 갈래: 양옆 갈래는 화면 밖으로 잘리고, 아래는 골이라 쪽 표시 자리가 빈다
      root.append(spot.el);
      // 고양이 + 제목의 알약까지 이어지는 z
      const cat = ctx.cat(SLEEP);
      cat.pose(reduced() ? "purr" : "sleep");
      const zz = el("div", "hp-zz"); zz.setAttribute("aria-hidden", "true");
      [[0, 26, 0, 0], [1, 38, 24, -58], [2, 54, 58, -138]].forEach(([n, s, x, y]) => { const b = el("b", "", "z"); b.style.cssText = `--n:${n};--s:${s};left:${x}px;top:${y}px`; zz.append(b); });
      zz.style.transform = `translate3d(${SLEEP.x + 26}px, ${SLEEP.ground - SLEEP.h * 0.8}px, 0)`;
      // 자는 동안의 하트·반짝이(참고 이미지의 작은 표시): z 곁에 둔다. 깨면 물러나고 깬 뒤의 표시(decorate)가 대신한다
      const dozing = [["heart", { x: 58, y: 408, s: 38, r: -12, float: true }], ["sparkle", { x: 340, y: 468, s: 24, r: 12, twinkle: true, d: 500 }]]
        .map(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !ctx.instant, d: ctx.instant ? o.d : 760 + n * 120 }); root.append(m); return m; });
      const hit = el("div", "hp-hit");
      hit.style.cssText = `left:${SPOT.x - SPOT.r}px;top:${SPOT.y - SPOT.r}px;width:${SPOT.r * 2}px;height:${SPOT.r * 2}px;border-radius:50%`;      // 동그라미 어디를 눌러도 깬다
      const cta = ui.cta({ label: C.open.approach || "다가가기", pages: ctx, onPress: () => { if (!awake) wake(reduced()); else if (talk.pass()) ctx.next(cta); } });
      root.append(zz, hit, cta);

      function decorate(pop) {
        [["heart", { x: 344, y: 342, s: 44, r: 8, float: true }], ["sparkle", { x: 48, y: 426, s: 30, r: 14, twinkle: true, d: 300 }], ["sparkle", { x: 344, y: 588, s: 20, r: -12, twinkle: true, d: 1200 }]]
          .forEach(([kind, o], i) => root.append(ui.mark(kind, { ...o, pop, d: pop ? i * 110 : o.d })));
      }
      /** 첫마디가 다 보인 상태(끝 상태). 적히는 중에 버튼을 누르면 바로 여기로 온다. */
      function spoken(pop) {
        if (said) return; said = true;
        if (!hB.isConnected) { hA.remove(); head.append(hB); }
        hB.finish();
        if (pop) desc.classList.add("hp-rise");
        head.append(desc); decorate(pop);
        if (cat.state.pose !== "sit") { cat.pose("sit"); if (pop) cat.pop(1); }
      }

      function wake(instant) {
        if (awake) return; awake = true;
        root.dataset.state = "awake";
        zz.remove(); hit.remove();
        dozing.forEach((m) => { if (instant) m.remove(); else { m.classList.add("is-out"); ctx.later(() => m.remove(), 260); } });
        cta.setLabel(C.open.cta || "계속", instant);
        ctx.set({});
        if (instant) { cat.place(SIT).pose("sit"); spot.set(SPOT_UP); spoken(false); talk.end(ctx.state === "awake"); return; }
        talk.begin(() => spoken(true));
        sfx("wake");
        // 0ms: 깜짝 — 눈이 동그래지고, 자리가 꽃 모양으로 튀고, 반짝이가 튄다
        cat.pose("round").place(SIT, { ms: 420, easing: EASE.spring }); cat.pop(2.2);
        spot.to(SPOT_UP, { kick: 14 });
        const hx = SIT.x, hy = SIT.ground - SIT.h * 0.72;
        ui.ring(root, hx, hy, { to: 3.6 });
        ui.burst(root, hx, hy, [
          { kind: "sparkle", dx: -128, dy: -92, s: 30, r: -12 }, { kind: "sparkle", dx: 124, dy: -116, s: 38, r: 16, delay: 40 },
          { kind: "sparkle", dx: -150, dy: 18, s: 18, r: 10, delay: 90 }, { kind: "sparkle", dx: 152, dy: 6, s: 20, r: -8, delay: 70 },
          { kind: "sparkle", dx: -44, dy: -168, s: 22, r: 24, delay: 110 },
        ]);
        hA.querySelectorAll(".hp-l").forEach((l, i) => { l.classList.remove("hp-rise"); l.style.setProperty("--i", i); l.classList.add("hp-leave"); });
        ctx.later(() => {
          if (said) return;
          hA.remove(); head.append(hB);
          hB.play({ speed: 46 }).then(() => { spoken(true); talk.end(); });
        }, 330);
        // 첫 줄이 끝날 즈음 평소 얼굴로 돌아온다
        ctx.later(() => { if (cat.state.pose === "round") { cat.pose("sit"); cat.pop(1); } }, 980);
      }
      hit.addEventListener("click", () => wake(reduced()));
      if (ctx.state === "awake") wake(true);
    },
  });

  /* ═════════════════════════ 장면: name (라일락) ═════════════════════════
   * 고양이가 오른쪽 위의 노란 동그라미에서 고개를 들이민다. 이름을 아주 크게 적는다 → 이름이 검정 알약에 담겨 고양이 대답의 첫머리가 되고, 동그라미는 별 모양으로 튄다.
   * 대답하는 동안에는 고양이가 별 위로 물러나 앉아 입을 벌리고 한마디 하고(입 벌린 그림은 원본이 작아서 작게 쓴다), 말이 끝나면 다시 크게 들이민다.
   * 화면 키보드가 올라오면(ctx.kb) 묻는 덩어리가 키보드 위로 올라가고 '다음'은 오른쪽 작은 알약이 되어 키보드 바로 위에 붙는다.
   * 그때 고양이와 동그라미는 묻는 글 위(첫 줄 오른쪽)의 귀퉁이로 작게 들어가서 글자와 겹치지 않는다.
   * 참고: tone-1(라일락 색면·캐릭터 뒤의 색 덩어리·줄 안 알약·하트와 반짝이·쪽 표시·검정 알약 버튼).
   *       짜임은 layout-4(귀퉁이에서 엿보기·작은 이름표·아주 큰 이름·키보드 위의 Next), layout-1(아래에 붙인 글)
   */
  addScene({
    id: "name", field: "lilac", states: ["empty", "filled", "typing"],      // typing = 키보드가 올라온 모습(시험용 키보드 336px)
    build(ctx) {
      const { el: root, copy: C } = ctx;
      // 기울어진 무대의 자리(x, y = 발이 닿는 점의 화면 좌표, r = 기울기°). 고양이 크기는 h. 발은 화면 밖에 둔다(머리·어깨·앞발만 보인다).
      const OUT = { x: 700, y: 360, r: -58, h: 400 }, PEEK = { x: 478, y: 438, r: -38, h: 400 };
      const SPEAK = { x: 268, y: 524, r: 0, h: 256 };             // 대답하는 동안: 별 위에 똑바로 앉아서(입을 벌린 그림은 387px라 크게 늘리지 않는다)
      const NEAR = { x: 492, y: 596, r: -38, h: 470 };            // 말이 끝나면: 크게 들이민다(앉은 그림은 고해상도)
      const ASK_TOP = 412;
      /** 키보드가 올라왔을 때의 자리: 묻는 글의 윗변(top) 위쪽 귀퉁이에 PEEK와 같은 짜임으로 작게 들어간다.
       *  첫 줄("뭐라고")은 x 150에서 끝나므로 그 오른쪽은 둘째 줄 바로 위(top + 44)까지 쓸 수 있다. 고양이·동그라미는 그 아래로 내려가지 않는다. */
      const typeSpot = (top) => { const floor = top + 44, h = clamp(floor * 0.95, 150, 250); return { x: 386 + 0.23 * h, y: floor - 8 - 0.155 * h, r: -38, h }; };
      let mode = "ask", calm = 0, hReply = null, deco = [];
      const talk = ui.speech();

      root.append(ui.topbar(ctx, { back: (b) => (mode === "reply" ? edit() : ctx.back(b)) }));

      // 고양이 뒤의 노란 동그라미(라일락 위의 색 덩어리). 자리·크기는 고양이(무대)를 따라가고, 고양이가 대답하는 순간 다섯 갈래 별로 튄다.
      // k = 반지름 / 고양이 키. 내다볼 때는 왼쪽 귀 끝이 동그라미 안쪽으로 넉넉히 들어오게 조금 크게(0.555), 키보드 위에서는 더 크게(0.6), 별은 0.515
      const backOf = (p, m = 0, k = 0.515) => ({ x: p.x - 0.37 * p.h, y: p.y - 0.53 * p.h, r: k * p.h, m });
      const DISC = 0.555, DISC_TYPE = 0.6, STAR_SPEAK = { x: 280, y: 406, r: 176, m: 1 };
      const back = ui.shape(ctx, { color: "var(--hp-yellow)", shape: [[5, 0.12, -60]], ...backOf(PEEK, 0, DISC) });
      root.append(back.el);
      const backAt = (spec, kick = 0) => (ctx.instant ? back.set(spec) : back.to(spec, { kick }));
      const stage = el("div", "hp-catlayer hp-tilt");
      root.append(stage);
      const cat = ctx.cat({ x: 0, ground: 0, h: PEEK.h }, { layer: stage });
      /** 무대를 옮긴다(스프링). n = 적은 글자 수만큼 더 들이민다. */
      function stageTo(p, n = 0) {
        stage.style.setProperty("--sx", p.x - n * 6 + "px"); stage.style.setProperty("--sy", p.y + n * 2 + "px"); stage.style.setProperty("--sr", p.r - n * 0.7 + "deg");
        if (cat.state.h !== p.h) cat.place({ h: p.h }, { ms: ctx.instant ? 0 : 700, easing: EASE.soft });
      }

      // 묻는 쪽
      const field = ui.nameField(ctx, { label: C.name.label, placeholder: C.name.placeholder, value: ctx.data.nickname || "", caret: true, onInput: sync, onEnter: () => submit(false) });
      field.el.classList.add("hp-rise"); field.el.style.setProperty("--i", 2);
      const note = el("p", "hp-note hp-rise", lines(C.name.desc, [4, 2]).map((t) => el("span", "", t)));
      note.id = "hp-name-note"; note.style.setProperty("--i", 3); field.input.setAttribute("aria-describedby", note.id);
      const ask = ui.block("hp-name-ask", { top: ASK_TOP }, ui.headline(lines(C.name.title, [1, 2])), field.el, note);
      const reply = ui.block("hp-head", { bottom: 136 });
      const cta = ui.cta({ label: "다음", disabled: true, pages: ctx, onPress: () => { if (mode === "ask") submit(false); else if (talk.pass()) ctx.next(cta); } });
      cta.classList.add("hp-name-cta");
      cta.addEventListener("blur", () => cta.classList.remove("is-quiet"));
      root.append(ask, reply, cta);

      // 글자를 적을 때마다 조금씩 더 들이민다(키보드가 올라와 있을 때는 자리가 좁아서 들이밀지 않는다)
      const lean = () => (ctx.kb > 0 ? 0 : Math.min(Array.from(field.input.value.trim()).length, 6));
      const askTop = () => (ctx.kb > 0 ? clamp(H - ctx.kb - 322, 84, ASK_TOP) : ASK_TOP);
      const spot = () => (ctx.kb > 0 ? typeSpot(askTop()) : PEEK);
      /** 키보드에 맞춰 자리를 다시 잡는다. */
      function layout() {
        const up = mode === "ask" && ctx.kb > 0;
        root.classList.toggle("is-typing", up);
        const top = up ? askTop() : ASK_TOP;
        ask.style.transform = top === ASK_TOP ? "" : `translate3d(0, ${top - ASK_TOP}px, 0)`;
        cta.style.bottom = up ? ctx.kb + 12 + "px" : "";
        if (mode === "ask") { stageTo(spot(), lean()); backAt(backOf(spot(), 0, up ? DISC_TYPE : DISC)); }
      }
      ctx.onKeyboard(layout);

      function sync(typedNow) {
        field.fit();
        cta.disabled = !field.clean();
        if (mode !== "ask") return;
        stageTo(spot(), lean());
        if (!typedNow) return;
        // 적을 때마다 눈이 동그래지고 통 튄다. 멈추면 평소 얼굴로.
        if (cat.state.pose !== "round") cat.pose("round");
        cat.pop(0.7);
        clearTimeout(calm); calm = ctx.later(() => { if (mode === "ask") { cat.pose("sit"); cat.pop(0.5); } }, 1100);
      }

      // 하트·반짝이(참고 이미지의 작은 표시): 처음부터 고양이 곁에 떠 있고, 고양이가 대답하면 자리를 옮기며 반짝이가 하나 더 생긴다. [종류, 모양, 묻는 동안의 자리, 대답한 뒤의 자리]
      const MARKS = [["heart", { s: 40, r: -14, float: true }, [46, 330], [50, 250]], ["sparkle", { s: 28, r: 12, twinkle: true, d: 500 }, [86, 176], [132, 128]]];
      const marks = MARKS.map(([kind, o, at], n) => { const m = ui.mark(kind, { ...o, x: at[0], y: at[1], pop: !ctx.instant, d: ctx.instant ? o.d : 700 + n * 120 }); m.classList.add("hp-name-mark"); root.append(m); return m; });
      const marksTo = (near) => marks.forEach((m, n) => { const p = MARKS[n][near ? 3 : 2]; m.style.setProperty("--x", p[0]); m.style.setProperty("--y", p[1]); });
      function decorate(pop) {
        marksTo(true);
        deco = [ui.mark("sparkle", { x: 56, y: 424, s: 18, r: -10, twinkle: true, pop, d: pop ? 160 : 1400 })];
        deco.forEach((m) => root.append(m));
      }

      function submit(instant) {
        const name = field.clean();
        if (!name || mode === "reply") return;
        mode = "reply"; root.dataset.state = "filled";
        clearTimeout(calm);
        field.input.value = name; field.fit();
        ctx.set({ nickname: name });
        // "[지우]." / "흠, 알았어." — 마침표와 말줄임표가 한 줄에 몰리지 않고, 한 글자만 남는 줄도 없다
        // 긴 이름은 알약과 마침표가 고양이의 앞발에 닿지 않게 좁은 너비 안에서 16px까지 줄인다
        const made = ui.nameLine(C.name.reply, [1, 3], name, () => edit(), { max: 186, min: 16 });
        const mine = made.h; hReply = mine; reply.replaceChildren(mine); made.fit();
        cta.disabled = false;
        /** 대답이 다 보인 상태(끝 상태): 평소 얼굴로 돌아와 크게 들이민다 */
        const spoken = (pop) => {
          if (hReply !== mine || mine.said) return; mine.said = true;
          ask.classList.add("is-gone");
          root.querySelectorAll(".hp-ghost").forEach((g) => g.remove()); made.pill.style.visibility = ""; made.pill.classList.add("is-on", "is-set");
          mine.finish();
          stage.classList.remove("is-sitting");
          cat.pose("sit"); if (pop) cat.pop(0.8);
          stageTo(NEAR); backAt(backOf(NEAR, 1)); decorate(pop);
        };
        if (instant) { cta.setLabel("계속", true); layout(); spoken(false); talk.end(ctx.state === "filled"); return; }
        talk.begin(() => spoken(true));
        const typing = focusedIn(root) === field.input, soft = ctx.kb > 0;
        const flight = ui.flyName(field, made.pill, root);      // 자리를 먼저 잰 뒤에 키보드 자리를 푼다
        field.input.blur(); if (ctx.state === "typing") ctx.keyboard(null);
        // 입력칸에서 Enter로 넘겼다면 포커스는 '계속'으로 간다(화면 키보드였다면 포커스 고리는 그리지 않는다)
        if (typing) { cta.classList.toggle("is-quiet", soft); cta.focus({ preventScroll: true }); }
        layout();
        ask.classList.add("is-leaving");
        // 별 위로 물러나 앉아 한마디 한다
        cat.pose("grumble"); cat.pop(1.4); stage.classList.add("is-sitting"); stageTo(SPEAK); backAt(STAR_SPEAK, 7);
        cta.setLabel("계속");
        flight.then(() => {
          if (hReply !== mine || mine.said) return;
          ask.classList.add("is-gone");
          const c = ctx.center(made.pill), edge = c.x + made.pill.offsetWidth / 2;      // 알약의 오른쪽 끝에서 튄다(긴 이름이어도 알약 위에 겹치지 않는다)
          ui.burst(root, edge, c.y, [{ kind: "sparkle", dx: 46, dy: -34, s: 24, r: 12 }, { kind: "sparkle", dx: 72, dy: 14, s: 16, r: -10, delay: 60 }]);
          return mine.play({ speed: 44 }).then(() => { spoken(true); talk.end(); });
        });
      }

      function edit() {
        if (mode !== "reply") return;
        mode = "ask"; root.dataset.state = "empty";
        talk.reset();
        if (hReply) { hReply.said = true; hReply.finish(); }
        reply.replaceChildren(); hReply = null;
        deco.forEach((m) => m.remove()); deco = []; marksTo(false);
        ask.classList.remove("is-gone", "is-leaving");
        cta.setLabel("다음", ctx.instant);
        stage.classList.remove("is-sitting");
        cat.pose("sit"); cat.pop(0.8);
        sync(false); if (ctx.state === "typing") ctx.keyboard(336);
        layout();
        field.input.focus({ preventScroll: true });
      }

      sync(false);
      if (ctx.state === "filled") { if (!field.clean()) field.input.value = "지우"; stageTo(PEEK); submit(true); }
      else if (ctx.state === "typing") {
        root.dataset.state = "empty"; ctx.keyboard(336); layout();
        ctx.later(() => { if (mode === "ask" && root.isConnected) field.input.focus({ preventScroll: true }); }, 60);      // 키보드가 올라온 모습이므로 입력칸에 포커스가 있다
      }
      else if (ctx.instant) {
        layout();
        if (ctx.state == null) ctx.later(() => { if (mode === "ask" && root.isConnected) field.input.focus({ preventScroll: true }); }, 60);      // 동작 줄이기에서도 바로 적을 수 있게
      } else {
        // 오른쪽 밖에서 고개를 들이밀며 들어온다
        stage.style.transition = "none"; stageTo(OUT); void stage.offsetWidth; stage.style.transition = "";
        back.set({ ...backOf(OUT, 0, DISC), r: 110 });
        ctx.later(() => { if (mode === "ask") layout(); }, 240);
        ctx.later(() => { if (mode === "ask" && root.isConnected) field.input.focus({ preventScroll: true }); }, 1000);
      }
    },
  });

  /* ═════════════════════════ 장면: q1 (노랑) ═════════════════════════
   * 마음 방울 네 개가 노란 색면 위를 떠다닌다(밀고 끌고 던질 수 있다). 하나를 고르면 자라서 말랑한 덩어리가 되고, 그 위에 고양이가 올라앉아 한마디 한다.
   * 질문이 있던 자리에는 "요즘 나는 / [고른 말 ✎]"이 들어선다(고른 말은 방울에서 큰 검정 알약으로 날아온다. 누르면 다시 고른다).
   * 아래 패널은 처음부터 떠 있다: "눌러서 고르기" + 흰 테두리의 화살표 → 고르면 고양이의 대답 + 주황 화살표.
   * 고르기 전에는 고양이가 그 패널 너머로 얼굴을 내밀고 지켜본다(손가락을 따라 보고, 방울이 머리에 부딪히면 움찔하며 고개를 숙였다 든다).
   * 참고: interaction-1(방울·덩어리·아래 패널과 화살표·"I'm feeling ___")의 짜임을 tone-1의 색과 모양으로 옮겼다
   *       — 노란 색면, 흰·주황·라일락·테두리 방울, 캐릭터 뒤의 색 덩어리, 줄 안의 검정 알약, 검정 알약 + 끝의 주황 동그라미.
   * 방울의 색은 고른 답을 되비추는 표시일 뿐이다(자리 순서대로 줬고, 좋다·나쁘다를 뜻하지 않는다).
   */
  addScene({
    id: "q1", field: "yellow", states: ["idle", "chosen", "tough"],
    build(ctx) {
      const { el: root, copy: C } = ctx;
      const Q = C.Q.lately;
      // 방울의 자리·크기·덩어리 모양. 네 가지 모두 검은 고양이가 올라앉을 수 있는 색이다(흰색 · 주황 · 라일락 · 바탕색에 잉크 테두리).
      const LOOK = [
        { color: "var(--hp-white)", r: 82, x: 104, y: 296, shape: [[4, 0.075, 45]] },
        { color: "var(--hp-orange)", r: 76, x: 290, y: 302, shape: [[5, 0.13, -90]] },
        { color: "var(--hp-lilac)", r: 74, x: 96, y: 464, shape: [[3, 0.1, -90]] },
        // 테두리 방울: 덩어리가 되면 굵은 선(4px)의 둥근 돔이 되고, 그 뒤에서 주황 별이 내다본다(참고 이미지의 유리 돔과 별). 고양이는 돔 안에 다 들어오게 조금 작게 앉는다
        { color: "var(--hp-yellow)", line: true, stroke: 4, dome: true, r: 77, x: 296, y: 464, shape: [[2, 0, 0]] },
      ];
      const items = Q.options.map((label, i) => ({ label, ...LOOK[i % LOOK.length] }));
      // 방울 사이를 떠다니는 작은 것들: 참고 이미지의 통통한 하트 하나와 테두리 반짝이 둘뿐이다(점은 참고 이미지에 없다)
      const DOTS = [{ mark: "heart", rot: -14, r: 15, x: 200, y: 390 }, { mark: "sparkle", rot: 12, r: 13, x: 356, y: 224 }, { mark: "sparkle", rot: -10, r: 9, x: 30, y: 548 }];
      const isTough = (i) => Q.options[i] === C.TOUGH;
      const SAY = "요즘 나는";                                   // 고른 답 앞에 붙는 말(브리프의 "요즘 나는 / 조금 지쳤어요" 틀)
      const PANEL_TOP = 726;                                     // 아래 패널의 윗변. 고르기 전에는 고양이가 그 너머로 내다본다
      const HERO = { x: 195, y: 460, r: 180 }, HERO_TOUGH = { x: 195, y: 366, r: 134 }, HERO_DOME = { x: 195, y: 458, r: 170 };
      const heroOf = (i) => (isTough(i) ? HERO_TOUGH : LOOK[i % LOOK.length].dome ? HERO_DOME : HERO);
      // 내다보는 고양이: 코와 입 아래(앉은 그림 높이의 48%. 입은 44.7%에서 끝난다)가 패널 윗변에 걸린다. 머리가 그림 가운데보다 조금 왼쪽이라 8px 오른쪽에 세운다.
      const LURK_H = 352, LURK_TOP = PANEL_TOP - 0.48 * LURK_H;
      const LURK = { x: 203, ground: LURK_TOP + LURK_H, h: LURK_H }, DUCK = { ...LURK, ground: LURK.ground + 210 };
      let choice = -1, extras = [], bumped = 0;
      const talk = ui.speech();

      const bar = ui.topbar(ctx, { back: (b) => (choice >= 0 ? field.release() : ctx.back(b)), skip: true, pages: true });      // 아래 패널 위에는 고양이가 있으므로 쪽 표시는 위 줄에
      const [q1, q2] = lines(Q.text, [1, 2]);
      const hAsk = ui.headline([[q1 + " ", ui.pill({ swatch: LOOK.map((l) => l.color) })], q2]);
      const head = ui.block("hp-head hp-q1-head", { top: 88 }, hAsk);
      root.append(bar, head);

      // 고른 뒤에 덩어리 위로 올라오는 고양이(덩어리 색이 조금 어두워진 납작한 그림자가 깔린다)
      const cat = ctx.cat({ x: 195, ground: 520, h: 20 }, { z: 5 });
      cat.el.style.opacity = "0"; cat.el.parentNode.classList.add("hp-q1-cat");

      // 패널 너머로 내다보는 고양이. 무대(.hp-q1-lurk)는 패널 가운데에서 잘려서 패널 아래로는 보이지 않는다.
      const lurk = el("div", "hp-catlayer hp-q1-lurk"), look = el("div", "hp-q1-look"), dip = el("div", "hp-q1-look");
      look.append(dip); lurk.append(look); root.append(lurk);
      const peek = ctx.cat(ctx.instant ? LURK : DUCK, { layer: dip });
      peek.hitTest = (p) => p.y < PANEL_TOP;                     // 패널에 가려진 몸은 눌리지 않는다
      /** 방울이 머리에 부딪혔다: 움찔하며 고개를 살짝 숙였다 든다 */
      const flinch = () => {
        const now = performance.now(); if (choice >= 0 || now - bumped < 520) return; bumped = now;
        peek.pop(0.9);
        if (!reduced() && dip.animate) dip.animate([{ transform: "translate3d(0,0,0)" }, { transform: "translate3d(0,10px,0)", offset: 0.26 }, { transform: "translate3d(0,-2px,0)", offset: 0.68 }, { transform: "translate3d(0,0,0)" }], { duration: 440, easing: EASE.out });
      };
      // 눈길: 손가락(포인터)이 가는 쪽으로 고개를 슬쩍 돌리고, 위쪽이면 조금 더 내다본다
      const glance = (e) => {
        if (choice >= 0 || reduced()) return;
        const p = ctx.point(e), dx = clamp((p.x - 195) / 160, -1, 1), dy = clamp((p.y - PANEL_TOP) / 420, -1, 0.2);
        look.style.setProperty("--gx", (dx * 9).toFixed(1) + "px"); look.style.setProperty("--gy", (dy * 12).toFixed(1) + "px"); look.style.setProperty("--gr", (dx * 2.2).toFixed(2) + "deg");
      };
      ctx.on(root, "pointermove", glance); ctx.on(root, "pointerdown", glance);

      const field = ui.bubbles(ctx, {
        items, dots: DOTS, bounds: { l: 10, t: 206, r: W - 10, b: PANEL_TOP - 8 },
        // 고양이의 머리와 두 귀: 방울이 튕겨 나가고 고양이가 움찔한다
        solids: [{ x: 195, y: LURK_TOP + 0.42 * LURK_H, r: 0.345 * LURK_H, onHit: flinch }, ...[100, 570].map((ex) => ({ x: LURK.x + (ex - 367) * LURK_H / 1000, y: LURK_TOP + 0.072 * LURK_H, r: 0.072 * LURK_H, onHit: flinch }))],
        hero: (it, i) => heroOf(i),
        onPick: picked, onRelease: released,
      });
      // 돔 뒤에서 내다보는 주황 별(테두리 방울을 골랐을 때만 나타난다). 방울들보다 뒤에 깔린다
      const STAR = { x: 74, y: 596, r: 84 };
      const star = ui.shape(ctx, { color: "var(--hp-orange)", shape: [[5, 0.13, -90]], ...STAR, r: 0, m: 1 });
      root.append(star.el, field.el);

      // 아래 패널: 검정 알약 + 끝의 둥근 화살표. 안내 → 고양이의 대답. 화살표는 고르기 전에는 흰 테두리뿐이다(회색은 쓰지 않는다).
      const hint = el("p", "hp-panel-line is-hint", "눌러서 고르기");
      const slot = el("div", "hp-panel-slot", hint);
      const go = el("button", "hp-round hp-panel-go", icon("arrow")); go.type = "button"; go.disabled = true; go.setAttribute("aria-label", "계속");
      go.addEventListener("click", () => { if (talk.pass()) ctx.next(go); });
      const panel = el("div", "hp-panel hp-rise", slot, go); panel.style.setProperty("--i", 5);
      root.append(panel);

      function picked(i, instant, focused) {
        choice = i;
        const it = items[i], tough = isTough(i), T = heroOf(i);
        root.dataset.state = tough ? "tough" : "chosen";
        ctx.set({ answers: { lately: it.label } });
        if (!instant && !tough) sfx("pop");      // 많이 힘들다는 답에는 통통 튀는 소리를 내지 않는다
        if (bar.skip) bar.skip.classList.add("is-off");
        hAsk.querySelectorAll(".hp-l").forEach((l, n) => { l.classList.remove("hp-rise"); l.style.setProperty("--i", n); l.classList.add("hp-leave"); });
        hAsk.style.visibility = instant ? "hidden" : ""; hAsk.setAttribute("aria-hidden", "true");
        // 내다보던 고양이는 패널 뒤로 쏙 내려간다
        peek.away = true; peek.place(DUCK, { ms: instant ? 0 : 300, easing: EASE.inout });

        // 큰 문장: 질문이 있던 자리에 "요즘 나는 / [고른 말 ✎]". 고른 말은 방울에서 검정 알약으로 날아온다.
        const pill = ui.pill({ text: it.label, dot: "pencil", onPress: () => field.release(), label: `${it.label}, 다시 고르기` });
        pill.classList.add("hp-pill-big");
        const say = ui.headline([SAY, [pill]], { tag: "p", cls: "hp-q1-say" });
        say.style.setProperty("--d", "230ms");
        pill.parentNode.classList.remove("hp-rise");
        head.append(say);
        if (!instant) {
          const b = field.bodies[i], s = 0.6;
          ui.fly({ x: b.x - (pill.offsetWidth * s) / 2, y: b.y - (pill.offsetHeight * s) / 2, s }, pill, root, { duration: 760, live: true });      // 날아가는 동안에도 눌린다(다시 고르기)
        }

        // 고양이가 덩어리 위에 통 올라앉는다(덩어리가 천천히 돌아도 발밑이 늘 덩어리 안에 있게 조금 위쪽에). 돔에서는 귀 끝까지 선 안쪽에 들어오게 조금 작게, 조금 아래에
        const seat = it.dome ? { x: T.x, ground: T.y + T.r * 0.7, h: T.r * 1.42 } : { x: T.x, ground: T.y + T.r * 0.66, h: T.r * 1.52 };
        if (it.dome) { if (instant) star.set(STAR); else ctx.later(() => { if (choice === i) star.to(STAR, { kick: 5 }); }, 380); }
        cat.pose("sit");
        if (instant) { cat.place(seat); cat.el.style.opacity = "1"; }
        else {
          cat.place({ ...seat, h: 24 });
          ctx.later(() => { if (choice !== i) return; cat.el.style.opacity = "1"; cat.place(seat, { ms: 640, easing: EASE.spring }); }, 430);
        }

        extras = [say];
        if (tough) {
          // 109 안내(많이 힘들어요): 고르자마자, 고양이의 말보다 먼저 보인다
          const call = el("a", "hp-sos-call", el("span", "hp-sos-num", icon("phone"), el("b", "", "109")), el("span", "hp-sos-go", "전화하기", icon("chev")));
          call.href = "tel:109"; call.setAttribute("aria-label", "109에 전화하기");
          const sos = el("div", "hp-sos" + (instant ? "" : " hp-popin"), el("strong", "hp-sos-title", C.sos.tough), el("span", "hp-sos-sub", C.sos.sub), call);
          sos.setAttribute("role", "note");
          root.append(sos); extras.push(sos);
        } else {
          // 덩어리 둘레의 하트·반짝이(참고 이미지의 작은 표시)
          [["heart", { x: 350, y: 300, s: 40, r: 10, float: true }], ["sparkle", { x: 26, y: 352, s: 26, r: -12, twinkle: true, d: 500 }], ["sparkle", { x: 356, y: 628, s: 18, r: 10, twinkle: true, d: 1300 }]]
            .forEach(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !instant, d: instant ? o.d : 620 + n * 110 }); root.append(m); extras.push(m); });
        }

        // 아래 패널: 안내가 고양이의 대답으로 바뀌고 화살표가 주황으로 켜진다
        const line = ui.typed(C.REPLIES.lately[it.label], "hp-panel-line");
        slot.replaceChildren(line); line.wrap();
        go.disabled = false;
        if (focused) go.focus({ preventScroll: true });           // 키보드로 골랐다면 포커스는 화살표로
        const spoken = () => { if (choice === i) line.finish(); };
        if (instant) { line.finish(); talk.end(ctx.state != null); }
        else {
          talk.begin(spoken);
          ctx.later(() => { if (choice !== i || !talk.speaking) return; cat.pop(0.9); line.play({ speed: 40 }).then(() => talk.end()); }, 860);
        }
      }

      function released(i) {
        choice = -1; root.dataset.state = "idle";
        talk.reset();
        const refocus = extras.some((n) => n.contains(focusedIn(root))) || focusedIn(root) === go;      // 고른 말(다시 고르기)이나 화살표에 있던 포커스는 그 방울로 돌아간다
        extras.forEach((n) => n.remove()); extras = [];
        root.querySelectorAll(".hp-ghost").forEach((g) => g.remove());
        slot.replaceChildren(hint); go.disabled = true;
        hAsk.style.visibility = ""; hAsk.removeAttribute("aria-hidden");
        hAsk.querySelectorAll(".hp-l").forEach((l) => { l.classList.remove("hp-leave"); l.classList.add("hp-rise"); });
        if (refocus && field.bodies[i]) field.bodies[i].el.focus({ preventScroll: true });
        cat.el.style.opacity = "0";
        if (ctx.instant) star.set({ r: 0 }); else star.to({ r: 0 });
        peek.away = false; peek.place(LURK, { ms: 620, easing: EASE.spring });
        if (bar.skip) bar.skip.classList.remove("is-off");
        ctx.set({ answers: { lately: null } });
      }

      const before = Q.options.indexOf(ctx.data.answers.lately);
      if (ctx.state === "chosen") field.pick(1, true);
      else if (ctx.state === "tough") field.pick(Q.options.indexOf(C.TOUGH), true);
      else if (ctx.state == null && before >= 0) field.pick(before, true);      // 돌아왔을 때: 골랐던 답 그대로
      else if (!ctx.instant) ctx.later(() => { if (choice < 0) peek.place(LURK, { ms: 700, easing: EASE.spring }); }, 760);      // 방울이 다 부푼 뒤에 고개를 내민다
    },
  });

  /* ═════════════════════════ 장면: q3 (주황) ═════════════════════════
   * 알약 네 개. 고르면 검정으로 바뀌며 길어지고 그 안에 고양이의 대답이 적힌다. 동시에 질문은 조금 작아지고(두 줄과 "시간" 알약은 그대로) 알약이 위로 붙어
   * 자리가 열리면, 멀리 노란 동그라미 위에서 딴청 피우던 고양이가 일어나 걸어와 "계속" 버튼 위에 크게 앉는다(동그라미도 같이 커진다).
   * 참고: tone-1(주황 색면·큰 제목과 줄 안 알약 "시간"·그 아래 본문 한 줄·노란 덩어리 위의 캐릭터·하트와 반짝이·검정 알약 버튼).
   *       짜임은 layout-2(알약 기둥·길어지는 선택)
   */
  addScene({
    id: "q3", field: "orange", states: ["idle", "chosen"],
    build(ctx) {
      const { el: root, copy: C } = ctx;
      const Q = C.Q.want;
      // NEAR: "계속" 버튼의 윗변(y 756)에 발이 닿게 앉는다. 걷는 그림은 원본이 작아서(493px) h 230까지만 키우고, 앉은 뒤에 고해상도 그림으로 한 번 더 다가온다.
      const FAR = { x: 195, ground: 750, h: 188 }, NEAR = { x: 195, ground: 756, h: 280 }, WALK_H = 230;
      let choice = -1, arrived = false, lock = 0;

      const bar = ui.topbar(ctx, { skip: true, pages: true });      // 고양이가 버튼 위에 앉으므로 쪽 표시는 위 줄에
      // 질문: 큰 제목 + 그 아래 본문 한 줄(참고 이미지의 본문 자리). 고르고 나면 제목은 조금 작아지고 본문 줄은 물러난다(CSS).
      const [t1, t2] = lines(Q.text, [3, 2]);
      const sub = el("p", "hp-body hp-q3-sub hp-rise", C.eyebrows.want); sub.style.setProperty("--i", 2);
      root.append(bar, ui.block("hp-head hp-q3-head", { top: 88 }, ui.headline([swap(t1, "시간", ui.pill({ text: "시간", dot: "clock" })), t2], { size: 38 }), sub));

      const list = ui.block("hp-opts hp-q3-list", { top: 246 }); list.setAttribute("role", "group"); list.setAttribute("aria-label", Q.text);
      const opts = Q.options.map((label, i) => {
        const o = ui.option({ label, reply: C.REPLIES.want[label], onPick: () => pick(i, false) });
        o.classList.add("hp-rise"); o.style.setProperty("--i", i + 3);
        list.append(o); return o;
      });

      // 고양이의 자리(노란 동그라미). 고양이를 따라 커지면서 아래로 내려가 언덕이 된다.
      const disc = el("div", "hp-q3-disc"); disc.setAttribute("aria-hidden", "true");
      root.append(disc);
      const cat = ctx.cat(FAR);
      if (!reduced()) cat.pose("groom");
      function seat() {
        const s = cat.state, p = clamp((s.h - FAR.h) / (NEAR.h - FAR.h), 0, 1);
        const r = lerp(124, 214, p), cy = lerp(s.ground - s.h * 0.46, s.ground + 44, p);
        disc.style.transform = `translate3d(${(s.x - 120).toFixed(1)}px, ${(cy - 120).toFixed(1)}px, 0) scale(${(r / 120).toFixed(4)})`;
      }
      seat();
      ctx.loop(() => { if (cat.state.walking) seat(); });

      const cta = ui.cta({
        label: "계속", hidden: true,
        onPress: () => {
          const line = choice >= 0 && opts[choice].line, now = performance.now();
          if (line && line.typing) { line.finish(); lock = now; return; }      // 적히는 중이면 먼저 대답을 다 보여 준다
          if (now - lock < 380) return;
          cat.settle(); cat.place(NEAR); cat.el.style.setProperty("--hc-shadow-o", "0"); seat(); ctx.next(cta);
        },
      });
      root.append(list, cta);

      // 하트·반짝이(참고 이미지의 작은 표시): 처음부터 멀리 있는 고양이 곁에 떠 있고, 고양이가 다가오면 같이 자리를 옮긴다. [종류, 모양, 먼 자리, 가까운 자리]
      const MARKS = [["heart", { s: 40, r: 10, float: true }, [336, 566], [346, 500]], ["sparkle", { s: 26, r: -12, twinkle: true, d: 400 }, [48, 590], [44, 536]], ["sparkle", { s: 16, r: 8, twinkle: true, d: 1200 }, [348, 712], [356, 626]]];
      const marks = MARKS.map(([kind, o, far], n) => { const m = ui.mark(kind, { ...o, x: far[0], y: far[1], pop: !ctx.instant, d: ctx.instant ? o.d : 760 + n * 110 }); m.classList.add("hp-q3-mark"); root.append(m); return m; });
      const marksTo = (near) => marks.forEach((m, n) => { const p = MARKS[n][near ? 3 : 2]; m.style.setProperty("--x", p[0]); m.style.setProperty("--y", p[1]); });

      function pick(i, instant) {
        if (choice === i) return;
        const first = choice < 0;
        if (!first) opts[choice].clear();
        choice = i; opts[i].select(instant);
        root.dataset.state = "chosen";
        ctx.set({ answers: { want: Q.options[i] } });
        cta.show(); bar.skip.classList.add("is-off");
        // 버튼 위에 앉으면 발밑의 납작한 그림자는 거둔다(검정 버튼이 바닥이다)
        const sit = () => { arrived = true; cat.el.style.setProperty("--hc-shadow-o", "0"); };
        if (instant) { cat.place(NEAR).pose("sit"); sit(); seat(); marksTo(true); return; }
        if (first) {
          cat.pop(0.7); ctx.later(() => marksTo(true), 420);
          // 걸어오는 동안은 작게(걷는 그림이 흐려지지 않고, 세운 꼬리가 알약에 닿지 않게), 앉으면서 마지막으로 한 번 더 크게 다가온다
          for (let k = 0; k < 9; k++) ctx.later(() => { if (!arrived && root.isConnected) sfx("step"); }, 220 + k * 250);
          cat.walkTo({ ...NEAR, h: WALK_H }, { duration: 2500 }).then(() => {
            if (arrived) return; sit();
            if (!root.isConnected) return;
            disc.classList.add("is-settling");
            cat.place(NEAR, { ms: 520, easing: EASE.spring }); seat();
            cat.pop(1.3); sfx("pop");
            ui.burst(root, NEAR.x, NEAR.ground - NEAR.h * 0.9, [{ kind: "sparkle", dx: -122, dy: -18, s: 22, r: -10 }, { kind: "sparkle", dx: 118, dy: -40, s: 16, r: 8, delay: 60 }, { kind: "sparkle", dx: -96, dy: 56, s: 14, r: 0, delay: 110 }]);
          });
        } else if (arrived) cat.pop(1);
      }

      const before = Q.options.indexOf(ctx.data.answers.want);
      if (ctx.state === "chosen") pick(0, true);
      else if (ctx.state == null && before >= 0) pick(before, true);            // 돌아왔을 때: 골랐던 답 그대로
    },
  });

  /* ═════════════════════════ 장면: naming (라일락) ═════════════════════════
   * 고양이 이름 짓기. 아주 큰 이름(깜박이는 커서·밑줄, 누르면 통째로 선택) + 주사위(이름이 슬롯처럼 구른다). 고양이는 주황 언덕 앞에서 크게 올려다본다.
   * 정하면 언덕이 다섯 갈래 별로 모이고 그 위에서 식빵 자세로 골골거린다. 하트 하나와 반짝이 둘이 튀고, 버튼 위에 "준비됐어요" 한 줄이 켜진다.
   * 참고: tone-1(라일락 색면 + 주황 별 덩어리 — 참고 이미지의 라일락 화면, 하트·반짝이·검정 알약).
   *       짜임은 layout-4(이름 화면: 작은 이름표·아주 큰 이름과 커서·주사위·알약 버튼), interaction-2(마지막 줄이 체크로 바뀐다)
   */
  addScene({
    id: "naming", field: "lilac", states: ["idle", "done"],
    build(ctx) {
      const { el: root, copy: C } = ctx;
      const N = C.naming;
      // 식빵 그림은 원본이 작아서(428px) h 240까지만 쓴다(너비 230px, 2배 화면에서 1.08배)
      const PEEK = { x: 195, ground: 1012, h: 476 }, LOAF = { x: 195, ground: 610, h: 240 };
      const FORM_TOP = 198;
      let mode = "ask", rolling = false, calm = 0, hLine = null, extras = [];
      const talk = ui.speech(), intro = ui.speech();      // intro = 처음의 한마디("내 이름? 없어. 네가 지어 봐.")를 지키는 문지기

      root.append(ui.topbar(ctx, { back: (b) => (mode === "done" ? edit() : ctx.back(b)), pages: true }));      // 아래에는 고양이 얼굴이 있으므로 쪽 표시는 위 줄에
      // 고양이 뒤의 주황 덩어리(참고 이미지의 라일락 화면): 올려다보는 얼굴 뒤에 둥근 언덕으로 솟아 있다가, 이름을 정하면 위로 모여 다섯 갈래 별이 되어 식빵 굽는 자리가 된다
      const BACK = { x: 195, y: 862, r: 302, m: 0 }, SPOT = { x: 195, y: LOAF.ground - 80, r: 168, m: 1 };
      const spot = ui.shape(ctx, { color: "var(--hp-orange)", shape: [[5, 0.12, -90]], ...BACK });
      root.append(spot.el);
      const cat = ctx.cat(PEEK, { z: 3 });
      // 올려다보는 얼굴 곁의 하트·반짝이(이름을 정하면 celebrate의 것들이 대신한다)
      [["heart", { x: 352, y: 488, s: 34, r: 12, float: true }], ["sparkle", { x: 34, y: 506, s: 24, r: -12, twinkle: true, d: 600 }]]
        .forEach(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !ctx.instant, d: ctx.instant ? o.d : 1000 + n * 120 }); m.classList.add("hp-naming-mark"); root.append(m); });

      // 이름이 없을 때 고양이가 하는 말
      const hAsk = ui.headline(lines(N.line(""), [2, 3]), { typed: true, size: 34 });
      const head = ui.block("hp-head hp-naming-head", { top: 90 }, hAsk);

      // 이름을 정하는 버튼·Enter: 고양이의 첫 한마디가 적히는 중이면 그 줄부터 다 보여 준다(두 번 빠르게 눌러도 건너뛰지 않는다)
      const decide = () => { if (intro.pass()) confirm(false); };
      const field = ui.nameField(ctx, { label: N.label, placeholder: N.placeholder, value: ctx.data.companion || N.defaultName, size: 96, selectOnFocus: true, caret: true, rule: true, onInput: sync, onEnter: decide });
      const dice = el("button", "hp-round hp-dice", icon("dice")); dice.type = "button"; dice.setAttribute("aria-label", "이름 굴리기");
      // 버튼의 글("○○로 할게요"): 이름이 길면 이름만 말줄임표로 줄고 "로 할게요"는 남는다
      const tailOf = (name) => { const full = N.cta(name); return name && full.startsWith(name) ? full.slice(name.length) : ""; };
      const setOk = (name, instant) => ok.setLabel(N.cta(name), instant, tailOf(name));
      const ok = ui.cta({ label: N.cta(field.clean()), tail: tailOf(field.clean()), onPress: decide });
      const row = el("div", "hp-row", dice, ok);
      const form = ui.block("hp-naming-form hp-rise", { top: FORM_TOP }, field.el, row);
      form.style.setProperty("--i", 3);
      const start = ui.cta({ label: C.done.cta, hidden: true, onPress: () => { if (talk.pass()) ctx.next(start); } });
      start.addEventListener("blur", () => start.classList.remove("is-quiet"));
      // "준비됐어요": 고양이의 말이 끝나면 동그라미가 체크로 바뀌며 글자가 펼쳐진다
      const ready = el("p", "hp-ready", el("span", "hp-ready-dot", icon("check")), el("span", "hp-ready-text", C.done.title));
      ready.setAttribute("aria-hidden", "true");      // 켜지기 전에는 읽히지 않는다
      root.append(head, form, ready, start);

      /** 키보드가 올라오면: 고양이의 말은 물러나고 이름·버튼이 위로 붙고, 고양이는 키보드 너머로 눈만 내민다. */
      function layout() {
        const up = mode === "ask" && ctx.kb > 0;
        root.classList.toggle("is-typing", up);
        if (mode !== "ask") return;
        const rise = up ? 96 : 0, vb = H - ctx.kb;
        form.style.transform = rise ? `translate3d(0, ${-rise}px, 0)` : "";
        cat.place(up ? { x: 195, h: 300, ground: Math.max(vb + 150, FORM_TOP - rise + 228 + 300) } : PEEK, { ms: ctx.instant ? 0 : 560, easing: EASE.soft });
        const back = up ? { x: 195, y: cat.state.ground - 95, r: 190, m: 0 } : BACK;
        if (ctx.instant) spot.set(back); else spot.to(back);
      }
      ctx.onKeyboard(layout);

      function sync(typedNow) {
        field.fit();
        const name = field.clean();
        setOk(name, !typedNow); ok.disabled = !name;
        if (typedNow) curious();
      }
      function curious() {
        if (mode !== "ask") return;
        if (cat.state.pose !== "round") cat.pose("round");
        cat.pop(0.6);
        clearTimeout(calm); calm = ctx.later(() => { if (mode === "ask" && !rolling) { cat.pose("sit"); cat.pop(0.4); } }, 1000);
      }

      dice.addEventListener("click", () => {
        if (rolling || mode !== "ask") return;
        const cur = field.clean(), pool = N.names.filter((n) => n !== cur);
        const last = pool[Math.floor(Math.random() * pool.length)];
        const mid = pool.filter((n) => n !== last).sort(() => Math.random() - 0.5).slice(0, 5);
        rolling = true; curious();
        if (dice.animate && !reduced()) dice.animate([{ transform: "rotate(0) scale(1)" }, { transform: "rotate(-200deg) scale(.84)", offset: 0.35 }, { transform: "rotate(-360deg) scale(1)" }], { duration: 760, easing: EASE.soft });
        // 버튼의 글은 새 이름이 자리에 들어설 때 같이 바뀐다
        field.roll([cur || " ", ...mid, last], (name) => { if (mode === "ask") { setOk(name); ok.disabled = false; } }).then(() => {
          rolling = false; setOk(field.clean()); ok.disabled = false;
          if (mode === "ask") { cat.pop(0.9); clearTimeout(calm); calm = ctx.later(() => { if (mode === "ask") cat.pose("sit"); }, 700); }
        });
      });

      function celebrate(pop) {
        // 참고 이미지처럼 하트 하나와 반짝이 둘, 그리고 "골골" 한 번
        const marks = [["heart", { x: 46, y: 412, s: 42, r: -10, float: true }], ["sparkle", { x: 344, y: 424, s: 26, r: 12, twinkle: true, d: 400 }], ["sparkle", { x: 34, y: 628, s: 18, r: -10, twinkle: true, d: 1300 }]]
          .map(([kind, o], i) => ui.mark(kind, { ...o, pop, d: pop ? 200 + i * 90 : o.d }));
        const purrs = [[272, 356, 10, 0]].map(([x, y, r, n]) => { const p = el("span", "hp-purr" + (pop ? " hp-popin" : ""), N.purr); p.setAttribute("aria-hidden", "true"); p.style.cssText = `left:${x}px;top:${y}px;--r:${r}deg;--n:${n};--i:${n + 4}`; return p; });
        extras = [...marks, ...purrs]; extras.forEach((m) => root.append(m));
      }

      function confirm(instant) {
        const name = field.clean();
        if (!name || mode === "done" || rolling) return;
        mode = "done"; root.dataset.state = "done";
        clearTimeout(calm);
        field.input.value = name; field.fit();
        ctx.set({ companion: name });
        const made = ui.nameLine(N.line, [1, 1, 4], name, () => edit());
        const mine = made.h; hLine = mine;
        /** 고양이의 말이 다 보인 상태(끝 상태) */
        const spoken = (pop) => {
          if (hLine !== mine || mine.said) return; mine.said = true;
          hAsk.remove(); form.classList.add("is-gone");
          root.querySelectorAll(".hp-ghost").forEach((g) => g.remove()); made.pill.style.visibility = ""; made.pill.classList.add("is-on", "is-set");
          if (!extras.length) celebrate(pop);
          mine.finish(); ready.classList.add("is-on"); ready.removeAttribute("aria-hidden");
        };
        if (instant) {
          head.replaceChildren(mine); made.fit(); form.style.transform = "";
          cat.place(LOAF).pose("purr"); spot.set(SPOT); start.show(); ready.classList.add("is-shown"); spoken(false); talk.end(ctx.state === "done");
          return;
        }
        talk.begin(() => spoken(true));
        hAsk.finish(); hAsk.classList.add("is-leaving");
        head.append(mine); made.fit();
        const inForm = form.contains(focusedIn(root)), soft = ctx.kb > 0;
        const flight = ui.flyName(field, made.pill, root);
        field.input.blur(); root.classList.remove("is-typing");
        form.classList.add("is-leaving");
        start.show(); ready.classList.add("is-shown");
        // 이름 칸이나 버튼에 있던 포커스는 '대화 시작하기'로 옮긴다(화면 키보드였다면 포커스 고리는 그리지 않는다)
        if (inForm) { start.classList.toggle("is-quiet", soft); start.focus({ preventScroll: true }); }
        // 고양이가 훌쩍 올라와 식빵을 굽는다
        cat.pose("purr").place(LOAF, { ms: 760, easing: EASE.spring }); cat.pop(1.6);
        sfx("pop"); ctx.later(() => { if (root.isConnected) sfx("purr", 2600); }, 700);
        spot.to(SPOT, { kick: 5 });
        flight.then(() => {
          if (hLine !== mine || mine.said) return;
          hAsk.remove(); form.classList.add("is-gone"); form.style.transform = "";
          ui.burst(root, LOAF.x, LOAF.ground - 96, [
            { kind: "heart", dx: -108, dy: -120, s: 30, r: -18 }, { kind: "heart", dx: 104, dy: -140, s: 24, r: 14, delay: 70 },
            { kind: "sparkle", dx: -34, dy: -176, s: 24, r: 10, delay: 40 }, { kind: "sparkle", dx: 166, dy: -50, s: 26, r: -12, delay: 100 }, { kind: "sparkle", dx: -168, dy: -30, s: 18, r: 0, delay: 150 },
          ]);
          celebrate(true);
          return mine.play({ speed: 44 }).then(() => { spoken(true); talk.end(); });
        });
      }

      function edit() {
        if (mode !== "done") return;
        mode = "ask"; root.dataset.state = "idle";
        talk.reset();
        if (hLine) { hLine.said = true; hLine.finish(); }
        hLine = null; extras.forEach((m) => m.remove()); extras = [];
        hAsk.classList.remove("is-leaving"); head.replaceChildren(hAsk); hAsk.finish(); intro.end(true);
        form.classList.remove("is-gone", "is-leaving");
        start.hide(); ready.classList.remove("is-on", "is-shown"); ready.setAttribute("aria-hidden", "true");
        cat.pose("sit").place(PEEK, { ms: ctx.instant ? 0 : 620, easing: EASE.soft }); cat.pop(0.8);
        sync(false); layout();
      }

      sync(false);
      if (ctx.state === "done") { intro.end(true); confirm(true); }
      else if (ctx.instant) { hAsk.finish(); intro.end(ctx.state != null); layout(); }
      else {
        // 아래에서 쑥 올라오며 한마디(뒤의 덩어리도 같이 솟는다)
        cat.place({ ...PEEK, ground: PEEK.ground + 300 }).place(PEEK, { ms: 900, easing: EASE.soft });
        spot.set({ ...BACK, y: BACK.y + 320 }).to(BACK);
        intro.begin(() => hAsk.finish());
        hAsk.play({ speed: 44, delay: 620 }).then(() => intro.end());
      }
    },
  });
})();
