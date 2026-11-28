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
  /* ───────────────────────── 아이콘(인라인 SVG) ───────────────────────── */
  // Iconsax Free; the same local sprite serves React and this shadow-root stage.
  const glyph = (name) => `<svg viewBox="0 0 24 24" fill="none"><use href="/icons/iconsax-free.svg?v=20261128-keyline5#${name}"/></svg>`;
  const ICONS = Object.fromEntries(["back", "chev", "chev2", "arrow", "heart", "sparkle", "star", "check", "checkFilled", "dice", "phone", "pencil", "clock", "chat", "profile", "heartCircle", "badgeEdit", "badgeClock", "badgeChat", "badgeProfile", "badgePhone"].map((name) => [name, glyph(name)]));
  ICONS.sound = glyph("soundOn");
  ICONS.mute = glyph("soundOff");
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

    /** 타이틀 오른쪽의 공통 고양이. 모든 반응이 같은 기본 프레임을 공유한다. */
    titleCat({ cls = "" } = {}) {
      const actor = el("div", "hp-title-cat" + (cls ? " " + cls : ""));
      actor.setAttribute("aria-hidden", "true");
      const still = el("img", "hp-title-cat-default");
      still.src = "/characters/reactions/default-front-v3.png"; still.alt = "";
      actor.append(still);
      return { el: actor, still };
    },

    pawIcon() {
      const paw = el("img");
      paw.src = "/onboarding/assets/gender-paw-24.svg";
      paw.alt = "";
      return paw;
    },

    /** 성별·관심사 화면이 공유하는 단일 선택 카드 목록. */
    choiceList(ctx, { labels, label, value = -1, onPick }) {
      const group = el("div", "hp-choice-list");
      group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", label);
      let choice = value;
      const buttons = labels.map((text, i) => {
        const tick = el("span", "hp-choice-check", ui.pawIcon()); tick.setAttribute("aria-hidden", "true");
        const button = el("button", "hp-choice-option", el("span", "hp-choice-label", text), tick);
        button.type = "button"; button.setAttribute("role", "radio"); button.setAttribute("aria-label", text); button.dataset.sfx = "none";
        ctx.on(button, "click", () => select(i)); group.append(button); return button;
      });
      function select(i, notify = true) {
        choice = i;
        buttons.forEach((b, n) => { b.setAttribute("aria-checked", String(n === choice)); b.tabIndex = n === (choice < 0 ? 0 : choice) ? 0 : -1; });
        if (notify && onPick) onPick(i);
      }
      ctx.on(group, "keydown", (event) => {
        const at = buttons.indexOf(event.target.closest(".hp-choice-option"));
        if (at < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
        const step = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
        const to = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : step ? (at + step + buttons.length) % buttons.length : -1;
        if (to < 0) return; event.preventDefault(); buttons[to].focus({ preventScroll: true }); select(to);
      });
      select(value, false);
      return { el: group, select, buttons };
    },

    /** 제목 다음 영역을 공통 간격으로 배치한다. 폰트·줄바꿈 변화에도 무대 좌표를 유지한다. */
    afterTitle(ctx, anchor, apply) {
      const update = () => {
        if (!anchor.isConnected) return;
        const stage = ctx.el.getBoundingClientRect(), scale = stage.width / W;
        apply((anchor.getBoundingClientRect().bottom - stage.top) / scale + 24);
      };
      const observer = new ResizeObserver(update); observer.observe(anchor);
      ctx.onDestroy(() => observer.disconnect()); ctx.later(update, 0);
      document.fonts?.ready.then(update);
    },

    /** 제목의 핵심 단어를 기존 공통 알약으로 감싼다. 문구와 읽기 순서는 그대로다. */
    badgedHeadline(lineList, { token, ...options } = {}) {
      let added = false;
      const rows = lineList.map(row => {
        if (added || typeof row !== "string" || !token || !row.includes(token)) return row;
        added = true;
        const badgeIcons = { "마음": "heartCircle", "성별": "badgeProfile", "사람": "badgeProfile", "시간": "badgeClock", "뭐라고": "badgeEdit", "이름": "badgeEdit", "이야기": "badgeChat", "얘기하러": "badgeChat", "AI": "star" };
        const badge = ui.pill({ text: token, dot: badgeIcons[token] || "star", headline: true });
        badge.classList.add("hp-title-badge");
        return swap(row, token, badge);
      });
      return ui.headline(rows, options);
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
    pill({ text, dot, wave = false, swatch, onPress, label, name = false, headline = !wave && !swatch, content } = {}) {
      const p = el(onPress ? "button" : "span", "hp-pill" + (swatch ? " is-swatch" : ""));
      if (onPress) { p.type = "button"; p.addEventListener("click", onPress); }
      if (headline || name) p.classList.add("hp-pill-headline");
      if (label) p.setAttribute("aria-label", label);
      p.dataset.say = text || "";
      if (wave) {
        // Figma 500:356: keep the exported waveform and z badge at their native sizes.
        p.classList.add("hp-pill-sleep");
        p.setAttribute("role", "img");
        p.setAttribute("aria-label", label || "자는 중");
        const w = el("span", "hp-sleep-wave");
        const waveform = el("img"); waveform.src = "/onboarding/assets/sleep-wave.svg"; waveform.alt = "";
        const badge = el("img", "hp-sleep-badge"); badge.src = "/onboarding/assets/sleep-badge-v2.svg"; badge.alt = "";
        w.append(waveform); p.append(w, badge);
        return p;
      }
      if (swatch) swatch.forEach((c) => { const d = el("i"); d.style.setProperty("--c", c); p.append(d); });
      if (content) p.append(...[].concat(content));
      else if (text) p.append(el("span", name ? "hp-pill-name" : "hp-pill-text", text));
      if (dot) {
        const d = el("span", "hp-pill-dot"); d.setAttribute("aria-hidden", "true");
        if (typeof dot === "string") d.innerHTML = ICONS[dot] || ""; else d.append(el("b", "", dot.text));
        p.append(d);
      }
      return p;
    },

    /** 큰 검정 알약 버튼. { label, tail(글의 끝. 자리가 모자라면 앞부분만 줄어든다), onPress, hidden, disabled, icon, pages: ctx } → button(.setLabel(글, 바로, tail) / .show / .hide)
     *  진행률은 상단 바에서 표시한다. */
    cta({ label, tail, onPress, hidden = false, disabled = false, icon: ic = "arrow", pages } = {}) {
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
      // 진행률은 모든 설정 장면의 상단 바에서 표시한다.
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

    questionFooter(ctx, cta, answerId) {
      const skip = el("button", "hp-skip", "건너뛰기");
      skip.type = "button";
      skip.addEventListener("click", () => {
        ctx.set({ answers: { [answerId]: null } });
        ctx.next(skip);
      });
      const footer = el("div", "hp-question-footer", cta, skip);
      footer.skip = skip;
      return footer;
    },

    /** 위 줄: 뒤로가기 · 설정 진행률 · 사운드. */
    topbar(ctx, { back = true, pages = false } = {}) {
      const bar = el("div", "hp-top");
      if (back) {
        const b = el("button", "hp-back hp-drop", icon("back")); b.type = "button"; b.setAttribute("aria-label", "뒤로");
        b.addEventListener("click", () => (typeof back === "function" ? back(b) : ctx.back(b)));
        bar.append(b); bar.back = b;
      }
      if (ctx.id !== "open" && ctx.id !== "promise") {
        bar.pages = ui.pages(ctx); bar.append(bar.pages);
      }
      // 화면 읽기 프로그램에는 몇 번째 장면인지 글로 알린다
      const ids = sceneIds();
      if (!bar.pages) bar.append(el("span", "hp-sr", `${ids.length}단계 중 ${ids.indexOf(ctx.id) + 1}단계`));
      // 소리 켜고 끄기(앱의 온보딩과 같은 자리·같은 읽기 방식: 이름은 그대로 두고 눌림 상태로 꺼졌는지 알린다)
      if (window.HereSound) {
        const snd = el("button", "hp-sound hp-drop"); snd.type = "button"; snd.setAttribute("aria-label", "소리 끄기"); snd.dataset.sfx = "none";
        const paint = () => { const on = window.HereSound.isOn(); snd.setAttribute("aria-pressed", String(!on)); snd.replaceChildren(icon(on ? "sound" : "mute")); };
        snd.addEventListener("click", () => { window.HereSound.toggle(); paint(); });
        paint(); bar.append(snd); bar.sound = snd;
      }
      return bar;
    },

    /** 이름 입력부터 마지막 설정까지 페이지마다 한 칸으로 진행률을 표시한다. */
    pages(ctx) {
      const ids = sceneIds().filter((id) => id !== "open" && id !== "promise");
      const at = ids.indexOf(ctx.id), total = ids.length;
      const box = el("span", "hp-progress");
      box.setAttribute("role", "progressbar"); box.setAttribute("aria-label", "설정 진행률");
      box.setAttribute("aria-valuemin", "0"); box.setAttribute("aria-valuemax", String(total));
      box.setAttribute("aria-valuenow", String(at + 1));
      box.setAttribute("aria-valuetext", `${total}단계 중 ${at + 1}단계`);
      ids.forEach((id, index) => {
        const segment = el("i", "hp-progress-step" + (index === at ? " is-current" : ""));
        segment.setAttribute("aria-hidden", "true");
        segment.dataset.step = id;
        box.append(segment);
      });
      return box;
    },

    /** 아주 큰 이름 입력칸(이름표 + 입력). 글자 수에 맞춰 크기가 줄고, 쓸 수 없는 글자는 바로 걸러진다.
     *  { label, placeholder, value, size, max, selectOnFocus, caret(포커스가 없을 때도 깜박이는 커서), rule(밑줄), onInput(typedNow), onEnter }
     *  → { el, input, clean(), fit(), textRect(), roll(names) } */
    nameField(ctx, { label, placeholder = "", value = "", size = 76, max = 12, selectOnFocus = false, caret = false, rule = false, onInput, onEnter } = {}) {
      const C = ctx.copy;
      const input = el("input", "hp-bigin");
      Object.assign(input, { type: "text", placeholder, value, autocomplete: "off", spellcheck: false, enterKeyHint: "done" });
      input.setAttribute("aria-label", label);
      input.setAttribute("autocapitalize", "off"); input.setAttribute("autocorrect", "off");
      const mirror = el("span", "hp-bigin-mirror"); mirror.setAttribute("aria-hidden", "true");      // 글자 너비를 재는 숨은 글
      const box = el("span", "hp-bigin-box" + (rule ? " has-rule" : ""), input, mirror);
      const tick = caret ? el("i", "hp-caret") : null;
      if (tick) { tick.setAttribute("aria-hidden", "true"); box.append(tick); }
      const wrap = el("label", "hp-field", box);
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
      const pill = ui.pill({ text: name, name: true, dot: "badgeEdit", onPress: onEdit, label: `${name}, 이름 고치기` });
      const h = ui.headline(lines(make(TOKEN), counts).map((p) => (p.includes(TOKEN) ? swap(p, TOKEN, pill) : p)), { typed: true });
      const fit = () => {
        const t = pill.querySelector(".hp-pill-name"); if (!t) return;
        t.style.maxWidth = max + "px"; t.style.fontSize = ""; let px = 32;
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
    mark(kind, { x, y, s = 28, r = 0, pop = false, float = false, twinkle = false, d = 0, asset, color } = {}) {
      // 라인 아이콘 대신 공통 Figma 채움 별을 사용한다.
      if (kind === "sparkle") asset = "/onboarding/assets/solid-star.svg";
      const m = el("span", "hp-mark" + (kind === "sparkle" ? " hp-mark-solid-star" : "") + (pop ? " is-pop" : "") + (float ? " is-float" : "") + (twinkle ? " is-twinkle" : ""));
      m.setAttribute("aria-hidden", "true");
      if (color) m.style.color = color;
      const inner = el("span");
      if (asset) {
        m.classList.add("hp-mark-asset");
        const image = el("img"); image.src = asset; image.alt = "";
        inner.append(image);
      } else inner.innerHTML = ICONS[kind] || "";
      m.append(inner);
      for (const [k, v] of Object.entries({ x, y, s, r, d })) m.style.setProperty("--" + k, v);
      return m;
    },

    /** 그 자리에서 조각이 튀어나온다. bits = [{ kind, dx, dy, s, r, delay, hold, color }] */
    burst(parent, x, y, bits) {
      if (reduced()) return;
      bits.filter((b) => b.kind !== "sparkle").forEach((b) => {
        const n = el("span", "hp-bit"); n.setAttribute("aria-hidden", "true");
        // Opening effects use the same solid Figma star as the resting decorations.
        const starAsset = b.kind === "sparkle" && parent.closest('[data-scene="open"]');
        if (starAsset) {
          n.classList.add("hp-bit-asset");
          const image = el("img"); image.src = "/onboarding/assets/sleep-star.svg"; image.alt = "";
          n.append(image);
        } else n.innerHTML = ICONS[b.kind] || "";
        n.style.setProperty("--s", b.s || 22);
        if (b.color) n.style.color = b.color;
        parent.append(n);
        const r = b.r || 0;
        const from = `translate3d(${x}px, ${y}px, 0) scale(${starAsset ? .85 : 0}) rotate(${r - (starAsset ? 12 : 50)}deg)`;
        const to = `translate3d(${x + b.dx}px, ${y + b.dy}px, 0) scale(1) rotate(${r}deg)`;
        const gone = `translate3d(${x + b.dx * 1.1}px, ${y + b.dy * 1.1 - 14}px, 0) scale(.5) rotate(${r + 30}deg)`;
        n.animate([{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: to, opacity: 1 }], { duration: starAsset ? 760 : 640, delay: (b.delay || 0) + (starAsset ? 120 : 0), easing: starAsset ? EASE.out : EASE.spring, fill: "both" }).finished
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
        for (const [n, amp, deg = 0] of (Array.isArray(shape) ? shape : [])) r += m * amp * Math.cos(n * (a - turn) - (deg * Math.PI) / 180);
        rs.push(r); if (r > max) max = r;
      }
      // 점과 점 사이를 곡선으로 잇는다(크게 그려도 각이 지지 않는다)
      const px = [], py = [];
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2, r = (rs[i] / max) * 100, x = Math.cos(a), y = Math.sin(a);
        if (shape === "tilted-square") {
          const sx = Math.sign(x) * Math.pow(Math.abs(x), .3) * 100;
          const sy = Math.sign(y) * Math.pow(Math.abs(y), .3) * 100;
          const mix = clamp(m, 0, 1);
          px.push(lerp(x * 100, (sx + sy * .04) * .91, mix));
          py.push(lerp(y * 100, (sy - sx * .07) * .90, mix));
        } else { px.push(x * r); py.push(y * r); }
      }
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
        if (dt.mark === "sparkle") {
          d.classList.add("hp-bub-solid-star");
          d.style.setProperty("--s", dt.r * 2);
          const image = el("img"); image.src = "/onboarding/assets/solid-star.svg"; image.alt = "";
          d.append(image);
        } else if (dt.mark) d.innerHTML = ICONS[dt.mark] || "";
        field.append(d);
        bodies.push({ kind: "dot", el: d, x: dt.x, y: dt.y, vx: 0, vy: 0, r: dt.r, r0: dt.r, rv: 0, rt: dt.r, hx: dt.x, hy: dt.y, homeX: dt.x, homeY: dt.y, ...DOT, m: dt.r * dt.r * 1.5, away: false, sq: 0, sqv: 0, sqa: 0, p1: rnd(0, 6.28), p2: rnd(0, 6.28), w1: rnd(0.5, 1.1), w2: rnd(0.5, 1), wa: 40 });
      });

      const squashOf = (b) => { const d = (b.sqa * 180) / Math.PI; return `rotate(${d.toFixed(1)}deg) scale(${(1 + b.sq).toFixed(4)}, ${(1 - b.sq * 0.7).toFixed(4)}) rotate(${(-d).toFixed(1)}deg)`; };
      function paint(b) {
        const soft = Math.abs(b.sq) > 0.002;
        if (b.kind !== "item") {
          b.el.style.transform = `translate3d(${(b.x - b.r0).toFixed(2)}px, ${(b.y - b.r0).toFixed(2)}px, 0) scale(${(b.r / b.r0).toFixed(4)})` + (soft ? " " + squashOf(b) : "");
          return;
        }
        // 최종 지름에서 SVG와 글자를 다시 그려 확대된 합성 레이어의 흐림을 막는다.
        const diameter = (b.r * 2).toFixed(2) + "px";
        b.el.style.width = diameter; b.el.style.height = diameter;
        b.el.style.transform = `translate(${(b.x - b.r).toFixed(2)}px, ${(b.y - b.r).toFixed(2)}px)`;
        b.el.querySelector(".hp-bub-label").style.fontSize = (19 * b.r / b.r0).toFixed(2) + "px";
        if (soft || b.squashed) { b.skin.style.transform = soft ? squashOf(b) : ""; b.squashed = soft; }
        if (b.morph > 0.001 || b.shaped) { b.path.setAttribute("d", ui.blobPath(b.it.shape, b.morph, 0)); b.shaped = b.morph > 0.001; }
        if (b.it.line) b.path.style.strokeWidth = lerp(2.5, b.it.stroke || 2.5, clamp(b.morph, 0, 1)).toFixed(2) + "px";
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
    let current = null, endTransition = null, kb = 0, fakeKb = null, fakeBy = null, building = null;

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
        if (def.id === "open") return;
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

    /** 이전 화면을 먼저 지운 뒤 새 화면을 나타낸다. 두 화면의 콘텐츠는 겹치지 않는다. */
    function navigate(id, { state: st, wipe = true } = {}) {
      if (endTransition) { if (wipe) return; endTransition(); }
      if (fakeBy) { fakeKb = null; fakeBy = null; kb = 0; root.classList.remove("has-kb", "has-fake-kb"); }      // 장면이 켠 시험용 키보드는 장면과 함께 내려간다
      const old = current;
      building = id;
      try { current = build(id, { state: st, instant: st != null && !wipe, fromId: old ? old.id : null }); } finally { building = null; }
      const settleBg = () => { root.style.background = `var(--hp-${current.def.field})`; };
      emit();
      if (kb) current.ctx.keyboardChanged(kb);
      if (!old || !wipe || reduced() || !current.el.animate) { teardown(old); settleBg(); return; }
      old.el.classList.add("is-frozen");
      const fresh = current;
      const restoreFocus = root.contains(focusedIn(root));
      old.el.inert = true;
      fresh.el.inert = true;
      fresh.el.classList.add("is-entering");
      settleBg();
      const easing = "cubic-bezier(.4,0,.2,1)";
      const outgoing = old.el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 200, easing, fill: "both",
      });
      const incoming = fresh.el.animate([{ opacity: 0 }, { opacity: 1 }], {
        delay: 200, duration: 360, easing, fill: "both",
      });
      const removeOld = () => { teardown(old); outgoing.cancel(); };
      const finish = () => {
        if (endTransition !== finish) return;
        endTransition = null;
        removeOld();
        incoming.cancel();
        fresh.el.inert = false;
        fresh.el.classList.remove("is-entering");
        settleBg();
        if (restoreFocus) fresh.el.focus({ preventScroll: true });
      };
      endTransition = finish;
      outgoing.finished.then(removeOld, () => {});
      incoming.finished.then(finish, () => {});
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
        if (endTransition) endTransition();
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
      // 잠든 고양이는 발을 고정한 2초 호흡 루프를 재생한다.
      const SLEEP = { x: 195, ground: 646, h: 280 }, SIT = { x: 195, ground: 682, h: 348 };
      let awake = false, said = false;
      const talk = ui.speech();

      root.append(ui.topbar(ctx, { back: (button) => {
        if (awake) ctx.go("open", "idle", button);
        else if (ctx.actions.signOut) ctx.actions.signOut();
        else ctx.back(button);
      } }));

      // 제목 두 벌: 자는 동안(서비스의 말) → 깬 뒤(고양이의 첫마디)
      const head = ui.block("hp-head", { top: 88 });
      const [a1, a2, a3] = lines(C.open.eyebrow, [2, 1, 2]);
      const hA = ui.headline([a1, [a2 + " ", ui.pill({ wave: true, dot: { text: "z" } })], a3], { size: 46 });
      const [b1, b2, b3] = lines(C.open.line || C.open.catLine, [1, 2, 2]);
      // 첫마디가 두 줄이면 셋째 줄은 없다. 줄에 "AI"가 있을 때만 알약으로 바꾼다
      const hB = ui.badgedHeadline([b1, b2, b3].filter(Boolean), { token: (b2 || "").includes("AI") ? "AI" : "얘기하러", typed: true });
      const desc = el("p", "hp-body", C.open.note || C.open.desc);
      head.append(hA);
      root.append(head);

      // 화면 양옆과 아래를 채우는 큰 원의 윗부분만 보여 아치형 배경을 만든다.
      const SPOT = { x: 195, y: 704, r: 410, m: 0 };
      const spot = ui.shape(ctx, { color: "#FF6A32", shape: [], ...SPOT });
      root.append(spot.el);
      // 고정된 수면 말풍선 안에서 z 세 글자의 투명도만 차례로 바뀐다.
      const cat = ctx.cat(SLEEP);
      cat.pose(reduced() ? "purr" : "sleep");
      const zz = el("div", "hp-zz"); zz.setAttribute("aria-hidden", "true");
      [0, 1, 2].forEach((n) => { const b = el("b", "", "z"); b.style.setProperty("--n", n); zz.append(b); });
      zz.style.left = `${SLEEP.x + 31}px`;
      zz.style.top = `${SLEEP.ground - 263}px`;
      // 자는 동안의 하트·반짝이(참고 이미지의 작은 표시): z 곁에 둔다. 깨면 물러나고 깬 뒤의 표시(decorate)가 대신한다
      const dozing = [["heart", { x: 58, y: 448, s: 38, r: -12, float: true, color: "#000" }], ["sparkle", { x: 352, y: 480, s: 24, r: 0, twinkle: true, d: 500, asset: "/onboarding/assets/sleep-star.svg" }]]
        .map(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !ctx.instant, d: ctx.instant ? o.d : 760 + n * 120 }); root.append(m); return m; });
      const hit = el("div", "hp-hit");
      hit.style.cssText = `left:${SPOT.x - SPOT.r}px;top:${SPOT.y - SPOT.r}px;width:${SPOT.r * 2}px;height:${SPOT.r * 2}px;border-radius:50%`;      // 동그라미 어디를 눌러도 깬다
      const cta = ui.cta({ label: C.open.approach || "다가가기", onPress: () => { if (!awake) wake(reduced()); else if (talk.pass()) ctx.next(cta); } });
      root.append(zz, hit, cta);

      function decorate(pop) {
        [["heart", { x: 344, y: 342, s: 44, r: 8, float: true, color: "#000" }], ["sparkle", { x: 48, y: 426, s: 30, r: 14, twinkle: true, d: 300, asset: "/onboarding/assets/sleep-star.svg" }], ["sparkle", { x: 344, y: 588, s: 20, r: -12, twinkle: true, d: 1200, asset: "/onboarding/assets/sleep-star.svg" }]]
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
        if (instant) zz.remove();
        else { zz.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, fill: "forwards" }).finished.then(() => zz.remove(), () => zz.remove()); }
        hit.remove();
        dozing.forEach((m) => { if (instant) m.remove(); else { m.classList.add("is-out"); ctx.later(() => m.remove(), 260); } });
        cta.setLabel(C.open.cta || "계속", instant);
        ctx.set({});
        if (instant) { cat.place(SIT).pose("sit"); spoken(false); talk.end(ctx.state === "awake"); return; }
        talk.begin(() => spoken(true));
        sfx("wake");
        // 잠든 자세를 서서히 겹쳐 지우며 앉은 자세로 이동한다. 배경은 고정한다.
        cat.pose("sit", { ms: 560 }).place(SIT, { ms: 780, easing: "cubic-bezier(.4,0,.2,1)" });
        hA.querySelectorAll(".hp-l").forEach((l, i) => { l.classList.remove("hp-rise"); l.style.setProperty("--i", i); l.classList.add("hp-open-leave"); });
        ctx.later(() => {
          if (said) return;
          hA.remove(); head.append(hB);
          hB.play({ speed: 46 }).then(() => { spoken(true); talk.end(); });
        }, 480);
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
      const ASK_TOP = 412;
      /** 키보드가 올라왔을 때의 자리: 묻는 글의 윗변(top) 위쪽 귀퉁이에 PEEK와 같은 짜임으로 작게 들어간다.
       *  첫 줄("뭐라고")은 x 150에서 끝나므로 그 오른쪽은 둘째 줄 바로 위(top + 44)까지 쓸 수 있다. 고양이·동그라미는 그 아래로 내려가지 않는다. */
      const typeSpot = (top) => { const floor = top + 44, h = clamp(floor * 0.95, 150, 250); return { x: 386 + 0.23 * h, y: floor - 8 - 0.155 * h, r: -38, h }; };
      let mode = "ask", changing = false, panelAnimations = [];
      const talk = ui.speech();

      root.append(ui.topbar(ctx, { back: (b) => (mode === "reply" ? edit() : ctx.back(b)) }));

      // 노란 배경과 고양이가 같은 원형 컨테이너를 사용해 경계가 어긋나지 않는다.
      const circle = el("div", "hp-name-peek-circle");
      root.append(circle);
      const stage = el("div", "hp-catlayer hp-name-peek");
      const peekImage = document.createElement("img");
      peekImage.src = "/characters/name-peek-left-v4.png";
      peekImage.alt = ""; peekImage.draggable = false;
      stage.setAttribute("aria-hidden", "true");
      stage.append(peekImage); circle.append(stage);
      // 전용 포즈를 오른쪽 가장자리에서 수평으로 내민다. 이미지 자체는 회전하지 않는다.
      function stageTo(p, n = 0) {
        const size = p.h * 0.875;
        const x = W - size * 0.82 + (p === OUT ? W : 0) - Math.min(n * 2, 12);
        const y = p.y - size - 24;
        const radius = size * 0.55;
        const left = x + size * 0.01, top = y - size * 0.16;
        circle.style.setProperty("--circle-x", left + "px");
        circle.style.setProperty("--circle-y", top + "px");
        circle.style.setProperty("--circle-size", radius * 2 + "px");
        stage.style.setProperty("--sx", x - left + "px");
        stage.style.setProperty("--sy", y - top + "px");
        stage.style.setProperty("--peek-size", size + "px");
      }

      // 묻는 쪽
      const field = ui.nameField(ctx, { label: C.name.label, placeholder: C.name.placeholder, value: ctx.data.nickname || "", caret: true, onInput: sync, onEnter: () => submit(false) });
      field.el.classList.add("hp-rise"); field.el.style.setProperty("--i", 2);
      const ask = ui.block("hp-name-ask", { top: ASK_TOP }, ui.badgedHeadline(lines(C.name.title, [1, 2]), { token: "뭐라고" }), field.el);
      const reply = ui.block("hp-head hp-name-reply", { top: ASK_TOP });
      reply.style.visibility = "hidden"; reply.inert = true;
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
        if (mode === "ask") ask.style.transform = top === ASK_TOP ? "" : `translate3d(0, ${top - ASK_TOP}px, 0)`;
        cta.style.bottom = up ? ctx.kb + 12 + "px" : "";
        stageTo(mode === "ask" ? spot() : PEEK, lean());
      }
      ctx.onKeyboard(layout);

      function sync(typedNow) {
        field.fit();
        cta.disabled = !field.clean();
        if (mode !== "ask") return;
        stageTo(spot(), lean());

      }

      // 제거했던 라인 별 자리에는 채움 별만 되돌린다. 하트는 복구하지 않는다.
      root.append(ui.mark("sparkle", { x: 86, y: 176, s: 28, r: 12, twinkle: true, d: 500 }));

      // 이름과 확인 문구는 같은 상단 기준선에서 교체한다. 복제한 이름의 비행은 사용하지 않는다.
      function swapPanels(from, to, instant, done) {
        changing = true; cta.disabled = true;
        from.inert = true; to.inert = true;
        to.style.visibility = "visible";
        const finish = () => {
          from.style.visibility = "hidden";
          panelAnimations.forEach((animation) => animation.cancel()); panelAnimations = [];
          to.inert = false; changing = false;
          cta.disabled = mode === "ask" && !field.clean();
          if (done) done();
        };
        if (instant || reduced() || !from.animate) { finish(); return; }
        const out = from.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 160, easing: "ease-out", fill: "both",
        });
        const incoming = to.animate([{ opacity: 0 }, { opacity: 1 }], {
          delay: 160, duration: 280, easing: "cubic-bezier(.22,1,.36,1)", fill: "both",
        });
        panelAnimations = [out, incoming];
        incoming.finished.then(finish, () => {});
      }
      ctx.onDestroy(() => { panelAnimations.forEach((animation) => animation.cancel()); });

      function submit(instant) {
        const name = field.clean();
        if (!name || mode === "reply" || changing) return;
        mode = "reply"; root.dataset.state = "filled";
        field.input.value = name; field.fit();
        ctx.set({ nickname: name });
        const made = ui.nameLine(C.name.reply, [1, 3], name, () => edit(), { max: 186, min: 16 });
        reply.replaceChildren(made.h); made.fit();
        made.pill.classList.add("is-on", "is-set"); made.h.finish();
        const typing = focusedIn(root) === field.input, soft = ctx.kb > 0;
        field.input.blur(); if (ctx.state === "typing") ctx.keyboard(null);
        layout();
        cta.setLabel("계속", true);
        swapPanels(ask, reply, instant, () => {
          talk.end(true);
          if (typing) { cta.classList.toggle("is-quiet", soft); cta.focus({ preventScroll: true }); }
        });
      }

      function edit() {
        if (mode !== "reply" || changing) return;
        mode = "ask"; root.dataset.state = "empty";
        talk.reset();
        cta.setLabel("다음", true);
        sync(false); if (ctx.state === "typing") ctx.keyboard(336);
        layout();
        swapPanels(reply, ask, false, () => { field.input.focus({ preventScroll: true }); });
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
        circle.style.transition = "none"; stage.style.transition = "none";
        stageTo(OUT); void circle.offsetWidth;
        circle.style.transition = ""; stage.style.transition = "";
        ctx.later(() => { if (mode === "ask") layout(); }, 240);
        ctx.later(() => { if (mode === "ask" && root.isConnected) field.input.focus({ preventScroll: true }); }, 1000);
      }
    },
  });

  /* 요즘 마음: 떠다니는 원형 선택지와 제목 오른쪽의 고양이. */
  addScene({
    id: "q1", field: "yellow", states: ["idle", "chosen", "tough"],
    build(ctx) {
      const { el: root, copy: C } = ctx, Q = C.Q.lately;
      let choice = -1;
      const bar = ui.topbar(ctx, { back: (button) => choice >= 0 ? field.release() : ctx.back(button), pages: true });
      const title = ui.badgedHeadline(["요즘", "마음은", "어때요?"], { token: "마음" });
      root.append(bar, ui.block("hp-head hp-q1-head", { top: 88 }, title));
      // 네 반응은 같은 기본 프레임에서 시작하고, 재생 뒤에는 각 영상의 마지막 프레임을 유지한다.
      const { el: cat, still } = ui.titleCat({ cls: "hp-q1-title-cat" });
      still.classList.add("hp-q1-default");
      const okay = el("video", "hp-q1-video hp-q1-okay");
      okay.src = "/characters/reactions/okay-front-4s-v1.webm";
      okay.muted = true; okay.playsInline = true; okay.preload = "auto";
      const tired = el("video", "hp-q1-video hp-q1-tired");
      tired.src = "/characters/reactions/tired-front-2s-v4.webm";
      tired.muted = true; tired.playsInline = true; tired.preload = "auto";
      const heavy = el("video", "hp-q1-video hp-q1-heavy");
      heavy.src = "/characters/reactions/heavy-front-4s-v4.webm";
      heavy.muted = true; heavy.playsInline = true; heavy.preload = "auto";
      const unsure = el("video", "hp-q1-video hp-q1-unsure");
      unsure.src = "/characters/reactions/unsure-front-4s-v2.webm";
      unsure.muted = true; unsure.playsInline = true; unsure.preload = "auto";
      const videos = [okay, tired, heavy, unsure];
      cat.append(still, ...videos); root.querySelector(".hp-q1-head").append(cat);
      let playId = 0;
      function resetReaction() {
        playId++;
        videos.forEach((video) => { video.pause(); video.currentTime = 0; });
        delete cat.dataset.playing;
      }
      videos.forEach((video) => { ctx.on(video, "ended", () => video.pause()); ctx.on(video, "error", resetReaction); });
      const looks = [
        { color: "var(--hp-white)", r: 82, x: 104, y: 360, shape: [[4, .075, 45]] },
        { color: "var(--hp-orange)", r: 76, x: 290, y: 366, shape: [[5, .13, -90]] },
        { color: "var(--hp-lilac)", r: 74, x: 96, y: 528, shape: [[3, .1, -90]] },
        { color: "#BFE6C8", r: 77, x: 296, y: 528, shape: "tilted-square" },
      ];
      let titleShift = 0;
      const fieldBounds = { l: 10, t: 280, r: W - 10, b: 718 };
      const field = ui.bubbles(ctx, {
        items: Q.options.map((label, i) => ({ label, ...looks[i] })),
        dots: [{ mark: "heart", rot: -14, r: 15, x: 200, y: 454 }, { mark: "sparkle", rot: 12, r: 13, x: 356, y: 288 }, { mark: "sparkle", rot: -10, r: 9, x: 30, y: 612 }],
        bounds: fieldBounds,
        hero: () => ({ x: 195, y: 458 + titleShift, r: 170 }), onPick: pick, onRelease: clear,
      });
      const group = field.el;
      const go = ui.cta({ label: "다음", disabled: true, pages: ctx, onPress: () => { if (choice >= 0) ctx.next(go); } });
      const footer = ui.questionFooter(ctx, go, Q.id);
      root.append(group, footer);
      ui.afterTitle(ctx, title, top => {
        const next = top - 278, delta = next - titleShift; titleShift = next;
        fieldBounds.t = top;
        field.bodies.forEach(body => { body.homeY += delta; if (field.picked < 0) { body.hy += delta; body.y += delta; } });
      });

      function render() {
        root.dataset.state = choice < 0 ? "idle" : Q.options[choice] === C.TOUGH ? "tough" : "chosen";
        go.disabled = choice < 0;
        footer.skip.classList.toggle("is-off", choice >= 0);
      }
      function pick(i, instant = false) {
        choice = i; ctx.set({ answers: { lately: Q.options[i] } }); render();
        resetReaction();
        if (instant || reduced()) return;
        const id = playId, video = videos[i];
        video.play().then(() => {
          if (id === playId) cat.dataset.playing = ["okay", "tired", "heavy", "unsure"][i];
        }).catch(() => { if (id === playId) resetReaction(); });
      }
      function clear() {
        choice = -1; resetReaction();
        ctx.set({ answers: { lately: null } }); render();
      }
      ctx.onDestroy(() => { resetReaction(); videos.forEach((video) => { video.removeAttribute("src"); video.load(); }); });
      const before = Q.options.indexOf(ctx.data.answers.lately);
      if (ctx.state === "chosen") field.pick(1, true);
      else if (ctx.state === "tough") field.pick(Q.options.indexOf(C.TOUGH), true);
      else if (ctx.state == null && before >= 0) field.pick(before, true);
      else render();
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
      let choice = -1;

      const bar = ui.topbar(ctx, { pages: true });      // 고양이가 버튼 위에 앉으므로 쪽 표시는 위 줄에
      // 다른 질문과 같은 기본 제목 크기와 위치를 유지한다.
      const titleRows = lines(Q.text, [2, 1, 2]);
      const title = ui.badgedHeadline(titleRows, { token: "시간" });
      root.append(bar, ui.block("hp-head hp-q3-head", { top: 88 }, title));

      const list = ui.block("hp-opts hp-q3-list", { top: 304 }); list.setAttribute("role", "group"); list.setAttribute("aria-label", Q.text);
      const opts = Q.options.map((label, i) => {
        const o = ui.option({ label, onPick: () => pick(i, false) });
        o.querySelector(".hp-opt-tick").innerHTML = ICONS.checkFilled;
        o.classList.add("hp-rise"); o.style.setProperty("--i", i + 3);
        list.append(o); return o;
      });

      // 원은 선택 후의 언덕 크기·위치로 고정한다.
      const disc = el("div", "hp-q3-disc"); disc.setAttribute("aria-hidden", "true");
      disc.style.transform = "translate3d(75px, 680px, 0) scale(1.7833333333)";
      root.append(disc);

      const cta = ui.cta({
        label: "다음", disabled: true,
        onPress: () => {
          if (choice < 0) return;
          ctx.next(cta);
        },
      });
      const footer = ui.questionFooter(ctx, cta, Q.id);
      root.append(list, footer);
      const catOffsetY = 20;
      const cat = ctx.cat({ x: 195, ground: footer.offsetTop + catOffsetY, h: 230 });
      cat.el.style.setProperty("--hc-shadow-o", "0");
      ui.afterTitle(ctx, title, top => {
        list.style.top = top + "px";
        const ground = footer.offsetTop;
        cat.place({ x: 195, ground: ground + catOffsetY, h: Math.min(230, ground - top - list.offsetHeight) });
      });

      // 장식도 선택 전후 같은 자리에 둔다.
      [["heart", { s: 40, r: 10, x: 346, y: 500 }], ["sparkle", { s: 26, r: -12, x: 44, y: 536 }], ["sparkle", { s: 16, r: 8, x: 356, y: 626 }]]
        .forEach(([kind, options]) => root.append(ui.mark(kind, options)));

      function pick(i, instant) {
        if (choice === i) return;
        const first = choice < 0;
        if (!first) opts[choice].clear();
        choice = i; opts[i].select(instant);
        root.dataset.state = "chosen";
        ctx.set({ answers: { want: Q.options[i] } });
        cta.disabled = false;
        // 선택은 카드 상태만 바꾸고 고양이 위치와 자세는 유지한다.
      }

      const before = Q.options.indexOf(ctx.data.answers.want);
      if (ctx.state === "chosen") pick(0, true);
      else if (ctx.state == null && before >= 0) pick(before, ctx.instant || reduced());            // 돌아왔을 때: 골랐던 답 그대로
    },
  });

  /* ═════════════════════════ 장면: naming (라일락) ═════════════════════════
   * 고양이 이름 짓기. 아주 큰 이름(깜박이는 커서·밑줄, 누르면 통째로 선택) + 주사위(이름이 슬롯처럼 구른다). 고양이는 주황 언덕 앞에서 크게 올려다본다.
   * 하단에서 이름을 확정하면 기본 자세의 고양이와 대화 시작 버튼을 보여 준다.
   */
  addScene({
    id: "naming", field: "lilac", states: ["idle", "done"],
    build(ctx) {
      const { el: root, copy: C } = ctx;
      const N = C.naming;
      const PEEK = { x: 195, ground: 1012, h: 476 }, SEATED = { x: 195, ground: 610, h: 240 };
      let FORM_TOP = 198;
      let mode = "ask", rolling = false, calm = 0, hLine = null, extras = [];
      const talk = ui.speech(), intro = ui.speech();      // intro는 이름을 묻는 첫 대사의 재생 상태를 관리한다.

      root.append(ui.topbar(ctx, { back: (b) => (mode === "done" ? edit() : ctx.back(b)), pages: true }));      // 아래에는 고양이 얼굴이 있으므로 쪽 표시는 위 줄에
      // 고양이 뒤의 주황 덩어리(참고 이미지의 라일락 화면): 올려다보는 얼굴 뒤에 둥근 언덕으로 솟아 있다가, 이름을 정하면 위로 모여 다섯 갈래 별이 되어 앉는 자리가 된다
      const BACK = { x: 195, y: 838, r: 302, m: 0 }, SPOT = { x: 195, y: SEATED.ground - 80, r: 168, m: 1 };
      const spot = ui.shape(ctx, { color: "var(--hp-orange)", shape: [[5, 0.12, -90]], ...BACK });
      root.append(spot.el);
      const cat = ctx.cat(PEEK, { z: 3 });
      // 올려다보는 얼굴 곁의 하트·반짝이(이름을 정하면 완료 화면의 장식으로 바뀐다)
      [["heart", { x: 352, y: 488, s: 34, r: 12, float: true }], ["sparkle", { x: 34, y: 506, s: 24, r: -12, twinkle: true, d: 600 }]]
        .forEach(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !ctx.instant, d: ctx.instant ? o.d : 1000 + n * 120 }); m.classList.add("hp-naming-mark"); root.append(m); });

      // 이름이 없을 때 고양이가 하는 말
      const hAsk = ui.badgedHeadline(lines(N.line(""), [2, 3]), { token: "이름", typed: true, size: 34 });
      const head = ui.block("hp-head hp-naming-head", { top: 88 }, hAsk);

      // 이름을 정하는 버튼·Enter: 고양이의 첫 한마디가 적히는 중이면 그 줄부터 다 보여 준다(두 번 빠르게 눌러도 건너뛰지 않는다)
      const decide = () => { if (intro.pass()) confirm(false); };
      const field = ui.nameField(ctx, { label: N.label, placeholder: N.placeholder, value: ctx.data.companion || N.defaultName, selectOnFocus: true, caret: true, rule: true, onInput: sync, onEnter: decide });
      const dice = el("button", "hp-round hp-dice", icon("dice")); dice.type = "button"; dice.setAttribute("aria-label", "이름 굴리기");
      // 버튼의 글("○○로 할게요"): 이름이 길면 이름만 말줄임표로 줄고 "로 할게요"는 남는다
      const tailOf = (name) => { const full = N.cta(name); return name && full.startsWith(name) ? full.slice(name.length) : ""; };
      const setOk = (name, instant) => ok.setLabel(N.cta(name), instant, tailOf(name));
      const ok = ui.cta({ label: N.cta(field.clean()), tail: tailOf(field.clean()), onPress: decide });
      ok.classList.add("hp-naming-confirm");
      const form = ui.block("hp-naming-form hp-rise", { top: FORM_TOP }, field.el, dice);
      form.style.setProperty("--i", 3);
      const start = ui.cta({ label: C.done.cta, onPress: () => { if (talk.pass()) ctx.next(start); } });
      start.addEventListener("blur", () => start.classList.remove("is-quiet"));
      root.append(head, form, ok);
      ui.afterTitle(ctx, hAsk, top => { FORM_TOP = top; form.style.top = top + "px"; });

      /** 키보드가 올라오면: 고양이의 말은 물러나고 이름·버튼이 위로 붙고, 고양이는 키보드 너머로 눈만 내민다. */
      function layout() {
        const up = mode === "ask" && ctx.kb > 0;
        root.classList.toggle("is-typing", up);
        if (mode !== "ask") return;
        ok.style.bottom = up ? ctx.kb + 12 + "px" : "";
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
        setOk(name, !typedNow); ok.disabled = !name || rolling;
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
        rolling = true; ok.disabled = true;
        ok.setAttribute("aria-busy", "true"); curious();
        if (dice.animate && !reduced()) dice.animate([{ transform: "rotate(0) scale(1)" }, { transform: "rotate(-200deg) scale(.84)", offset: 0.35 }, { transform: "rotate(-360deg) scale(1)" }], { duration: 760, easing: EASE.soft });
        // 버튼의 글은 새 이름이 자리에 들어설 때 같이 바뀐다
        field.roll([cur || " ", ...mid, last], (name) => { if (mode === "ask") setOk(name); }).then(() => {
          rolling = false; ok.removeAttribute("aria-busy"); sync(false);
          if (mode === "ask") { cat.pop(0.9); clearTimeout(calm); calm = ctx.later(() => { if (mode === "ask") cat.pose("sit"); }, 700); }
        });
      });

      function showIdleMarks() {
        if (extras.length) return;
        extras = [
          ui.mark("heart", { x: 46, y: 412, s: 42, r: -10, float: true }),
          ui.mark("sparkle", { x: 344, y: 424, s: 26, r: 12, float: true, d: 300 }),
          ui.mark("sparkle", { x: 34, y: 628, s: 18, r: -4, float: true, d: 900 }),
        ];
        root.append(...extras);
      }

      function confirm(instant) {
        const name = field.clean();
        if (!name || mode === "done" || rolling) return;
        mode = "done"; root.dataset.state = "done";
        const active = focusedIn(root);
        const focusStart = active === ok || form.contains(active);
        ok.replaceWith(start);
        clearTimeout(calm);
        field.input.value = name; field.fit();
        ctx.set({ companion: name });
        const made = ui.nameLine(N.line, [1, 1, 4], name, () => edit());
        const mine = made.h; hLine = mine;
        /** 고양이의 말이 다 보인 상태(끝 상태) */
        const spoken = () => {
          if (hLine !== mine || mine.said) return; mine.said = true;
          hAsk.remove(); form.classList.add("is-gone");
          root.querySelectorAll(".hp-ghost").forEach((g) => g.remove()); made.pill.style.visibility = ""; made.pill.classList.add("is-on", "is-set");
          showIdleMarks();
          mine.finish();
        };
        if (instant) {
          head.replaceChildren(mine); made.fit(); form.style.transform = "";
          cat.place(SEATED).pose("sit"); spot.set(SPOT); spoken(); talk.end(ctx.state === "done");
          return;
        }
        talk.begin(spoken);
        hAsk.finish(); hAsk.classList.add("is-leaving");
        head.append(mine); made.fit();
        const soft = ctx.kb > 0;
        const flight = ui.flyName(field, made.pill, root);
        field.input.blur(); root.classList.remove("is-typing");
        form.classList.add("is-leaving");
        // 이름 칸이나 버튼에 있던 포커스는 '대화 시작하기'로 옮긴다(화면 키보드였다면 포커스 고리는 그리지 않는다)
        if (focusStart) { start.classList.toggle("is-quiet", soft); start.focus({ preventScroll: true }); }
        // 고양이가 가까이 앉는다
        cat.pose("sit").place(SEATED, { ms: 760, easing: EASE.spring }); cat.pop(1.6);
        sfx("pop");
        spot.to(SPOT, { kick: 5 });
        flight.then(() => {
          if (hLine !== mine || mine.said) return;
          hAsk.remove(); form.classList.add("is-gone"); form.style.transform = "";
          showIdleMarks();
          return mine.play({ speed: 44 }).then(() => { spoken(); talk.end(); });
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
        start.replaceWith(ok);
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
        if (!reduced()) spot.el.animate([{ filter: "blur(1.5px)" }, { filter: "blur(0)" }], { duration: 420, easing: EASE.out });
        intro.begin(() => hAsk.finish());
        hAsk.play({ speed: 44, delay: 620 }).then(() => intro.end());
      }
    },
  });
})();
