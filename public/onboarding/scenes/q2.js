/* 장면: q2 (라일락) — 질문 2 "요즘 마음이 가장 많이 가는 건 뭐예요?"
 *
 * 이 장면만의 손맛은 "돌리는 바퀴"다. 1번 톤의 다섯 갈래 덩어리(참고 이미지의 라일락 화면에 있는 별)가 그대로 다이얼이 된다:
 *   · 노란 다섯 갈래 바퀴가 화면 아래 절반을 채운다(양옆과 아래는 화면 밖으로 잘린다). 보기 다섯 개는 갈래 사이의 골마다 하나씩,
 *     바퀴 위의 테두리 알약으로 놓인다(바퀴의 결을 따라 살짝 기운다).
 *   · 끌면 돌고, 놓으면 그 빠르기만큼 더 가서 가장 가까운 칸에 통 들어앉는다(다섯 칸, 칸마다 "틱").
 *     손대기 전에는 바퀴가 가끔(세 번까지) 살짝 흔들려 돌릴 수 있음을 알린다.
 *   · 맨 위 골(고양이 턱 밑)의 검정 알약이 창이다: 지금 그 자리에 온 보기가 크게 적히고 끝에 주황 화살표가 있다. 누르면 그 보기로 정한다.
 *     바퀴 위의 보기를 바로 눌러도 되고(그 보기가 창까지 돌아온 뒤 정해진다), 방향키로 돌리고 Enter · Space로 정할 수도 있다.
 *     제목의 검정 알약 "마음 ♥"과 창의 검정 알약 "○○ →"이 위아래로 짝을 이룬다(마음이 → 가는 곳).
 *   · 고양이는 바퀴 뒤에서 맨 위 골 사이로 "슬쩍 고개를 내밀고" 있다. 돌리면 갈래가 얼굴 앞을 지나가고(까꿍), 고양이는 그 너머로 눈만 내밀며
 *     따라 올라갔다가 다음 골에 턱을 내려놓는다. 도는 쪽으로 고개가 기울고, 세게 돌리면 눈이 동그래진다.
 *   · 정하면: 창의 검정 알약이 그대로 제목의 "뭐예요?" 자리로 날아가 고른 말이 되고(✎로 다시 고른다. "마음" 알약은 풀려 그냥 낱말이 된다), 바퀴는 위로 모여 순한 별이 되고,
 *     고양이가 바퀴 뒤에서 나와 그 위에 앉는다(한 발짝 더 가까이). 아래에서 검정 패널이 올라와 고양이의 대답이 적힌다.
 *
 * 참고: tone-1(라일락 색면 + 다섯 갈래 덩어리, 줄 안의 검정 알약과 주황 동그라미 "Languages →", 하트 하나 · 반짝이 둘, 쪽 표시),
 *       interaction-1-howwefeel-ring(큰 바퀴와 그 위의 둥근 화살표), q1과 같은 "고른 말이 제목으로 · 아래 패널에 대답" 짜임.
 * 문구는 HereCopy에서만 온다(Q.concern · REPLIES.concern · eyebrows.concern). 덧붙인 글자는 화면 읽기용 이름표뿐이다.
 */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP || typeof HP.addScene !== "function") return;
  const ui = HP.ui, { el, icon, clamp, lerp } = ui;
  const NS = "http://www.w3.org/2000/svg";
  const mod = (v, n) => ((v % n) + n) % n, rad = (d) => (d * Math.PI) / 180;
  const focusedIn = (node) => { const r = node.getRootNode ? node.getRootNode() : document; return (r && r.activeElement) || document.activeElement; };

  /** 긴 보기는 낱말 사이에서 가장 고르게 두 줄로 나눈다(한 글자만 남는 줄은 만들지 않는다). */
  function rowsOf(label) {
    const words = label.split(" "), len = (a) => Array.from(a.join(" ")).length;
    if (words.length < 2 || len(words) <= 6) return [label];
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i), b = words.slice(i);
      if (len(a) < 2 || len(b) < 2) continue;
      const score = Math.max(len(a), len(b));
      if (!best || score < best.score) best = { score, rows: [a.join(" "), b.join(" ")] };
    }
    return best ? best.rows : [label];
  }

  /** 적히는 줄을 문장 끝(. ? !)에서 나눈다. 한 문장이 한 줄보다 길면 낱말 사이에서 가장 고르게 두 줄로. 글꼴이 다 온 뒤에 한 번 더 맞춘다. */
  function wrapSentences(node) {
    const fix = () => {
      if (!node.isConnected) return;
      node.querySelectorAll(".hp-br").forEach((b) => b.replaceWith(document.createTextNode(" ")));
      const words = Array.from(node.querySelectorAll(".hp-w")), avail = node.clientWidth;
      if (words.length < 2 || avail <= 0) return;
      const gap = parseFloat(getComputedStyle(node).fontSize) * 0.24, ws = words.map((w) => w.offsetWidth);
      const span = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += ws[i] + (i > a ? gap : 0); return s; };
      const cut = (i) => { const at = words[i], br = el("br", "hp-br"); if (at.previousSibling && at.previousSibling.nodeType === 3) at.previousSibling.replaceWith(br); else at.before(br); };
      const ends = [];
      words.forEach((w, i) => { if (/[.?!]$/.test(w.textContent) || i === words.length - 1) ends.push(i + 1); });
      let start = 0, line = 0;
      for (const end of ends) {
        if (start > line && span(line, end) > avail) { cut(start); line = start; }
        if (span(line, end) > avail) {
          let best = -1, diff = Infinity;
          for (let i = line + 1; i < end; i++) { const l = span(line, i), r = span(i, end); if (l <= avail && r <= avail && Math.abs(l - r) < diff) { diff = Math.abs(l - r); best = i; } }
          if (best > 0) { cut(best); line = best; }
        }
        start = end;
      }
    };
    fix();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fix);
    return node;
  }

  HP.addScene({
    id: "q2", field: "lilac", states: ["idle", "chosen"],
    build(ctx) {
      const { el: root, copy: C } = ctx, Q = C.Q.concern;
      const N = Q.options.length, STEP = 360 / N;                    // 보기 수만큼의 칸(다섯 칸, 한 칸 72°)
      const still = ui.reduced();
      const put = (node, v) => { if (node.q2t !== v) { node.q2t = v; node.style.transform = v; } };

      /* ── 자리 ── */
      const AMP = 0.2, SHAPE = [[N, AMP, 90]];                       // 다섯 갈래. 보기는 갈래 사이의 골에 있다: 멈추면 늘 골이 맨 위에 온다
      const DIAL = { x: 195, y: 672, r: 264, m: 1 };                 // 돌리는 바퀴: 양옆과 아래가 화면 밖으로 잘린다
      const SEAT = { x: 195, y: 486, r: 194, m: 0.62 };              // 정한 뒤: 고양이가 앉는 별(갈래가 순해지고, 반 칸 더 돌아 갈래가 맨 위에 온다)
      const LENS_AT = 0.447, LABEL_SIDE = 0.375, LABEL_LOW = 0.44;   // 창 · 보기의 자리(반지름에 대한 비율). 아래쪽 보기는 조금 더 바깥에
      const LENS_MAX = 230, TEXT_MAX = 258;                          // 창 · 제목 알약 속 글자의 최대 너비(가장 긴 보기도 한 줄에 들어가게)
      const LEAN = 8;                                                // 보기가 바퀴의 결을 따라 기우는 정도(°, 옆에서 가장 크다)
      const FOLLOW = 0.45;                                           // 갈래가 지나갈 때 고양이가 따라 올라가는 정도(나머지만큼은 갈래에 가려진다)
      /** 바퀴의 가장자리까지의 거리(반지름에 대한 비율). deg = 골 한가운데에서 벗어난 각도 */
      const rimRel = (deg, m = 1) => (1 - AMP * m * Math.cos(rad(N * deg))) / (1 + AMP * m);
      const CAT_H = 330, RIM = DIAL.y - DIAL.r * rimRel(0);          // RIM = 골이 맨 위에 왔을 때 바퀴의 윗변(고양이 턱이 걸리는 자리)
      const PEEK = { x: 195, ground: RIM + CAT_H * 0.5 + 4, h: CAT_H }, DUCK = { ...PEEK, ground: PEEK.ground + CAT_H * 0.62 };
      const SIT = { x: SEAT.x, ground: SEAT.y + SEAT.r * 0.66, h: SEAT.r * 1.52 };

      /* ── 상태 ── */
      const wh = { ...DIAL }, whTo = { ...DIAL }, whV = { x: 0, y: 0, r: 0, m: 0 };
      let rot = 0, vel = 0, goal = null;                             // 바퀴의 각도(°, 시계 방향) · 빠르기(°/s) · 들어앉을 각도
      let cur = 0, turn = 0, choice = -1, pending = -1, pendingFocus = false, drag = null, pressed = null, noClick = 0, token = 0;
      let intro = false, touched = ctx.state != null;                // intro = 들어오는 동안(바퀴가 천천히 솟으며 돈다) · touched = 바퀴에 손을 댔다
      let clock = 0, chosenAt = 0, bob = 0, bobV = 0, tilt = 0, tiltV = 0, sway = 0, swayV = 0, calmAt = 0, lastD = "", extras = [];
      const talk = ui.speech();
      /** k번 보기가 맨 위에 오는 각도 가운데 from에서 가장 가까운 것 */
      const angleFor = (k, from) => { const a = -STEP * k; return a + 360 * Math.round((from - a) / 360); };
      /** 바퀴가 가서 설 보기(돌고 있을 때는 들어앉을 칸) */
      const aim = () => mod(Math.round(-(goal != null ? goal : rot) / STEP), N);
      const rectOf = (node) => { const a = node.getBoundingClientRect(), b = ctx.root.getBoundingClientRect(), k = 390 / (b.width || 390); return { x: (a.left - b.left) * k, y: (a.top - b.top) * k, w: a.width * k, h: a.height * k }; };

      /* ── 위 줄 · 제목 ── */
      const bar = ui.topbar(ctx, { back: (b) => (choice >= 0 ? release() : ctx.back(b)), skip: true, pages: true });      // 아래는 바퀴가 차지하므로 쪽 표시는 위 줄에
      const WORD = "마음";
      const [t1, t2, t3] = ui.lines(Q.text, [2, 4, 1]);              // "요즘 마음이" / "가장 많이 가는 건" / "뭐예요?"
      // 줄 안의 검정 알약 "마음 ♥". 정하고 나면 알약이 풀려 그냥 낱말이 된다(검정 알약은 고른 말 하나만 남는다)
      const wordPill = ui.pill({ text: WORD, dot: "heart" }); wordPill.setAttribute("aria-hidden", "true");
      const wordPlain = el("span", "hp-q2-word-plain", WORD);
      const word = el("span", "hp-q2-word", wordPlain, wordPill); word.dataset.say = WORD;
      const hAsk = ui.headline([ui.swap(t1, WORD, word), t2, t3].filter(Boolean));
      const rows = Array.from(hAsk.querySelectorAll(".hp-l")), line3 = rows[rows.length - 1];
      const sub = el("p", "hp-body hp-q2-sub hp-rise", C.eyebrows.concern); sub.style.setProperty("--i", rows.length);
      const answer = el("p", "hp-q2-answer");                         // "뭐예요?" 자리에 들어서는 고른 말
      const head = ui.block("hp-head hp-q2-head", { top: 88 }, hAsk, sub, answer);
      root.append(bar, head);
      const sizeWord = (plain, snap) => {
        if (!word.isConnected) return;
        if (snap) word.classList.add("is-snap");
        word.style.width = (plain ? wordPlain.offsetWidth : wordPill.offsetWidth + 2) + "px";
        if (snap) { void word.offsetWidth; word.classList.remove("is-snap"); }
      };
      /** 알약 속 글자를 max 너비에 맞춘다(30px에서 19px까지) */
      const fitText = (node, max = TEXT_MAX) => { node.style.fontSize = ""; let px = 32; while (px > 19 && node.offsetWidth > max) { px -= 1; node.style.fontSize = px + "px"; } };
      /** 바퀴가 한 칸 넘어갈 때: 제목 알약의 하트와 창의 주황 화살표가 한 번 뛴다 */
      const beat = () => { if (still) return; for (const d of [wordPill.querySelector(".hp-pill-dot"), lensDot]) if (d && d.animate) d.animate([{ transform: "scale(1)" }, { transform: "scale(1.24)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 300, easing: ui.ease.out }); };

      /* ── 바퀴 너머로 내다보는 고양이(바퀴보다 뒤) ── */
      const peekLayer = el("div", "hp-catlayer hp-q2-peek"), look = el("div", "hp-q2-look"), dip = el("div", "hp-q2-look");
      look.style.transformOrigin = `${PEEK.x}px ${RIM + 30}px`;
      look.append(dip); peekLayer.append(look); root.append(peekLayer);
      const peek = ctx.cat(ctx.instant ? PEEK : DUCK, { layer: dip });
      peek.hitTest = (p) => !inWheel(p);                             // 바퀴에 가려진 몸은 눌리지 않는다

      /* ── 바퀴 ── */
      const dial = el("div", "hp-q2-dial"); dial.dataset.sfx = "none";      // 소리는 이 장면이 직접 낸다(칸마다 slot, 정할 때 pick)
      const svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "hp-q2-disc"); svg.setAttribute("viewBox", "-100 -100 200 200"); svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(NS, "path"); svg.append(path);
      const grab = el("div", "hp-q2-grab"); grab.style.width = grab.style.height = DIAL.r * 2 + "px"; grab.setAttribute("aria-hidden", "true");
      const group = el("div", "hp-q2-opts"); group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", Q.text);
      const radios = Q.options.map((label, i) => {
        const b = el("button", "hp-q2-opt", el("span", "hp-q2-opt-label", rowsOf(label).map((t) => el("span", "", t))));
        b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false"); b.setAttribute("aria-label", label); b.tabIndex = i === 0 ? 0 : -1;
        b.addEventListener("click", () => choose(i, focusedIn(root) === b));
        group.append(b); return b;
      });
      // 긴 보기는 옆 자리에서는 골의 가장자리에 닿지 않게 조금 안쪽에, 아래 자리에서는 옆 보기와 닿지 않게 조금 바깥쪽에 둔다
      const inset = radios.map(() => 0);
      const measure = () => radios.forEach((b, i) => { inset[i] = Math.max(0, b.firstChild.offsetWidth - 116) * 0.42; });
      // 창: 맨 위에 온 보기가 적히는 검정 알약(끝에 주황 화살표). 누르면 그 보기로 정한다. 화면 읽기 · 키보드는 위의 라디오로 같은 일을 한다
      const lensText = el("span", "hp-q2-lens-text");
      const lens = ui.pill({ content: lensText, dot: "arrow" });
      lens.classList.add("hp-q2-lens"); lens.setAttribute("aria-hidden", "true");
      const lensDot = lens.querySelector(".hp-pill-dot");
      const lensWrap = el("div", "hp-q2-lens-wrap", lens);
      lens.addEventListener("click", () => choose(aim(), false));
      dial.append(svg, grab, group, lensWrap);
      root.append(dial);

      /* ── 정한 뒤에 별 위로 올라오는 고양이 ── */
      const hero = ctx.cat({ ...SIT, h: 24 }, { z: 5 });
      hero.el.style.opacity = "0"; hero.el.parentNode.classList.add("hp-q2-cat");

      /* ── 아래 패널: 고양이의 대답 + 둥근 주황 화살표(q1과 같은 것). 정한 뒤에 올라온다 ── */
      const slot = el("div", "hp-panel-slot");
      const go = el("button", "hp-round hp-panel-go", icon("arrow")); go.type = "button"; go.disabled = true; go.setAttribute("aria-label", "계속");
      go.addEventListener("click", () => { if (choice >= 0 && talk.pass()) ctx.next(go); });
      const panel = el("div", "hp-panel hp-q2-panel is-hidden", slot, go);
      root.append(panel);

      /* ── 하트 · 반짝이(참고 이미지의 작은 표시): 내다보는 고양이 곁 → 정하면 별 둘레로 ── */
      const IDLE_MARKS = [["heart", { x: 338, y: 328, s: 38, r: 10, float: true }], ["sparkle", { x: 52, y: 366, s: 26, r: -12, twinkle: true, d: 500 }], ["sparkle", { x: 348, y: 426, s: 16, r: 8, twinkle: true, d: 1300 }]];
      const SEAT_MARKS = [["heart", { x: 350, y: 316, s: 40, r: 10, float: true }], ["sparkle", { x: 30, y: 380, s: 26, r: -12, twinkle: true, d: 500 }], ["sparkle", { x: 354, y: 656, s: 18, r: 10, twinkle: true, d: 1300 }]];
      const idleMarks = IDLE_MARKS.map(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !ctx.instant, d: ctx.instant ? o.d : 1420 + n * 110 }); root.append(m); return m; });

      /* ── 그리기 ── */
      function paint() {
        const swing = choice >= 0 && !still && ctx.state == null ? 4.5 * Math.sin((clock - chosenAt) * 0.6) : 0;      // 정한 뒤: 별이 천천히 기웃거린다(바로 보여 주는 상태에서는 가만히 있어서 스크린샷이 늘 같다)
        put(svg, `translate3d(${(wh.x - 100).toFixed(2)}px, ${(wh.y - 100).toFixed(2)}px, 0) scale(${(wh.r / 100).toFixed(4)}) rotate(${(rot + swing).toFixed(2)}deg)`);
        const d = clamp(wh.m, 0, 2).toFixed(3);
        if (d !== lastD) { lastD = d; path.setAttribute("d", ui.blobPath(SHAPE, +d)); }
        put(grab, `translate3d(${(wh.x - DIAL.r).toFixed(1)}px, ${(wh.y - DIAL.r).toFixed(1)}px, 0) scale(${(wh.r / DIAL.r).toFixed(4)})`);
        radios.forEach((b, i) => {
          const a = rot + STEP * i, t = rad(a), far = Math.abs(a - 360 * Math.round(a / 360));          // far = 맨 위에서 벗어난 각도(0~180)
          const low = clamp((far - STEP) / STEP, 0, 1);                                              // 0 = 옆 자리, 1 = 아래 자리
          const ring = wh.r * lerp(LABEL_SIDE, LABEL_LOW, low) + lerp(-inset[i], inset[i] * 0.6, low);
          put(b, `translate3d(${(wh.x + ring * Math.sin(t)).toFixed(1)}px, ${(wh.y - ring * Math.cos(t)).toFixed(1)}px, 0) translate(-50%, -50%) rotate(${(LEAN * Math.sin(t)).toFixed(2)}deg)`);      // 바퀴의 결을 따라 살짝 기운다
          const o = clamp((far - 40) / 18, 0, 1).toFixed(2);                                         // 창 가까이 오면 흐려진다(창에 크게 적힌다)
          if (b.q2o !== o) { b.q2o = o; b.style.opacity = o; }
        });
        put(lensWrap, `translate3d(0, ${(wh.y - LENS_AT * wh.r - 30).toFixed(1)}px, 0)`);
        put(dip, `translate3d(0, ${bob.toFixed(1)}px, 0)`);
        put(look, `translate3d(${sway.toFixed(1)}px, 0, 0) rotate(${tilt.toFixed(2)}deg)`);
      }

      /* ── 창에 적힌 보기 바꾸기 ── */
      function setLens(k, dir, instant) {
        const next = el("span", "", Q.options[k]), old = lensText.lastElementChild;
        lensText.querySelectorAll(".is-out").forEach((n) => n.remove());
        if (instant || still || !old || !old.isConnected) lensText.replaceChildren(next);
        else {
          old.classList.remove("is-in"); old.classList.add("is-out"); old.style.setProperty("--dir", dir);
          old.addEventListener("animationend", () => old.remove(), { once: true });
          next.classList.add("is-in"); next.style.setProperty("--dir", dir);
          lensText.append(next);
        }
        fitText(next, LENS_MAX);
        lensText.style.width = next.offsetWidth + "px";
      }
      /** 맨 위에 온 보기가 바뀌었다(한 칸 넘어갔다) */
      function setCur(k, dir, quiet) {
        cur = k;
        const to = aim(), inside = group.contains(focusedIn(root));
        radios.forEach((b, i) => { b.tabIndex = i === to ? 0 : -1; });
        if (inside && choice < 0 && focusedIn(root) !== radios[to]) radios[to].focus({ preventScroll: true });      // 끌어서 돌렸다면 포커스도 따라온다
        setLens(k, dir, quiet);
        if (quiet) return;
        // 들어올 때의 틱은 아직 아무것도 누른 적 없는 페이지(이 장면을 바로 연 개발 화면)에서는 내지 않는다(브라우저가 소리를 막고 경고를 남긴다)
        const ua = navigator.userActivation;
        if (!(intro && ua && !ua.hasBeenActive)) ui.sfx("slot");
        beat();
        if (!still && choice < 0) peek.pop(0.45);
      }
      /** 지금 각도에서 맨 위의 보기를 다시 가늠한다. 두 보기의 경계에서 이리저리 바뀌지 않게 조금 넘어가야 바뀐다 */
      function track(force) {
        const f = -rot / STEP, near = Math.round(f);
        if (force) { turn = near; setCur(mod(near, N), 1, true); return; }
        if (near !== turn && Math.abs(f - turn) > 0.56) { const dir = near > turn ? -1 : 1; turn = near; setCur(mod(near, N), dir); }
      }

      /* ── 프레임마다 ── */
      function frame(dt) {
        clock += dt;
        const held = drag && drag.moved;
        if (!held && goal != null) {
          vel += ((goal - rot) * (intro ? 26 : 150) - vel * (intro ? 7.4 : 15)) * dt; rot += vel * dt;      // 칸에 통 들어앉는 스프링(조금 넘쳤다 돌아온다)
          if (Math.abs(goal - rot) < 0.06 && Math.abs(vel) < 1.2) { rot = goal; vel = 0; goal = null; intro = false; }
        } else if (held) { if (clock - drag.at > 0.08) vel *= Math.exp(-14 * dt); }                          // 손가락이 멈추면 빠르기도 잦아든다
        else vel = 0;
        if (choice < 0) track();
        if (pending >= 0 && choice < 0 && cur === pending && Math.abs((goal != null ? goal : rot) - rot) < 16) { const k = pending; pending = -1; pick(k, false, pendingFocus); }
        for (const k of ["x", "y", "r", "m"]) { const soft = k === "m"; whV[k] += ((whTo[k] - wh[k]) * (soft ? 110 : intro ? 44 : 170) - whV[k] * (soft ? 9 : intro ? 10.5 : 19)) * dt; wh[k] += whV[k] * dt; }
        // 고양이: 갈래가 얼굴 앞을 지나가면 그 너머로 눈만 내밀며 따라 올라가고, 도는 쪽으로 기울고, 세게 돌리면 눈이 동그래진다
        const idle = choice < 0;
        const lift = DIAL.r * (rimRel(rot) - rimRel(0)), low = Math.max(0, wh.y - wh.r * rimRel(0, wh.m) - RIM);      // lift = 갈래가 올라온 높이 · low = 바퀴가 제자리보다 내려가 있는 만큼(들어올 때)
        bobV += (((idle ? low - lift * FOLLOW : 0) - bob) * 260 - bobV * 24) * dt; bob += bobV * dt;
        tiltV += (((idle ? clamp(vel * 0.02, -7, 7) : 0) - tilt) * 120 - tiltV * 14) * dt; tilt += tiltV * dt;
        swayV += (((idle ? clamp(vel * 0.028, -12, 12) : 0) - sway) * 120 - swayV * 14) * dt; sway += swayV * dt;
        if (idle && !peek.away) {
          if (Math.abs(vel) > 520) { calmAt = clock + 0.5; if (peek.state.pose !== "round") { peek.pose("round"); peek.pop(0.9); } }
          else if (peek.state.pose === "round" && clock > calmAt && Math.abs(vel) < 40) { peek.pose("sit"); peek.pop(0.5); }
        }
        paint();
      }

      /* ── 끌어서 돌리기 ── */
      const press = (node) => { if (pressed === node) return; if (pressed) pressed.classList.remove("is-press"); pressed = node; if (node) node.classList.add("is-press"); };
      const angleAt = (p) => (Math.atan2(p.x - wh.x, -(p.y - wh.y)) * 180) / Math.PI;
      const inWheel = (p) => Math.hypot(p.x - wh.x, p.y - wh.y) <= wh.r * rimRel(angleAt(p) - rot, wh.m) + 4;
      ctx.on(dial, "pointerdown", (e) => {
        if (e.button) return;
        const p = ctx.point(e);
        if (!inWheel(p)) return;
        if (choice >= 0) { if (!still) { whV.r -= 110; whV.m += 2.4; } return; }      // 정한 뒤의 별을 누르면 젤리처럼 출렁인다
        touched = true;
        drag = { a: angleAt(p), sx: p.x, sy: p.y, moved: false, t: 0, at: clock };
        press(e.target.closest ? e.target.closest(".hp-q2-opt, .hp-q2-lens") : null);      // 누르면 80ms 안에 눌린 티가 난다
      });
      const drop = () => {
        press(null);
        if (!drag) return;
        const d = drag; drag = null; dial.classList.remove("is-dragging");
        if (choice < 0) whTo.r = DIAL.r;
        if (!d.moved || choice >= 0) return;
        noClick = performance.now() + 320;
        if (performance.now() - d.t > 90) vel = 0;
        const land = Math.round((rot + (still ? 0 : clamp(vel, -1100, 1100) * 0.2)) / STEP) * STEP;      // 놓은 빠르기만큼 더 가서 가장 가까운 칸에 선다(동작 줄이기에서는 그 자리에서 가장 가까운 칸)
        if (still) { rot = land; vel = 0; track(); paint(); } else goal = land;
      };
      ctx.on(window, "pointermove", (e) => {
        if (!drag) return;
        if (e.pointerType === "mouse" && e.buttons === 0) { drop(); return; }             // 화면 밖에서 손을 뗐다
        const p = ctx.point(e);
        if (!drag.moved) {
          if (Math.hypot(p.x - drag.sx, p.y - drag.sy) < 7) return;
          Object.assign(drag, { moved: true, a: angleAt(p), t: performance.now(), at: clock });
          goal = null; pending = -1; vel = 0; intro = false; dial.classList.add("is-dragging"); press(null);
          if (!still) whTo.r = DIAL.r - 5;                                                // 잡으면 살짝 눌린다
          return;
        }
        const a = angleAt(p), now = performance.now();
        let da = a - drag.a; da -= 360 * Math.round(da / 360);
        if (Math.hypot(p.x - wh.x, p.y - wh.y) < 26) da = 0;                             // 바퀴 한가운데에서는 각도가 튄다
        rot += da; vel = lerp(vel, da / Math.max(0.008, (now - drag.t) / 1000), 0.45);
        Object.assign(drag, { a, t: now, at: clock });
        if (still) { track(); paint(); }
      });
      ctx.on(window, "pointerup", drop); ctx.on(window, "pointercancel", drop);
      ctx.on(dial, "click", (e) => { if (performance.now() < noClick) { e.stopPropagation(); e.preventDefault(); } }, true);      // 끌다가 놓은 것은 누른 것이 아니다

      /* ── 키보드: 방향키로 돌리고 Enter · Space로 정한다 ── */
      ctx.on(group, "keydown", (e) => {
        if (choice >= 0) return;
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        const k = d ? mod(aim() + d, N) : e.key === "Home" ? 0 : e.key === "End" ? N - 1 : -1;
        if (k < 0) return;
        e.preventDefault();
        const to = angleFor(k, goal != null ? goal : rot);
        touched = true; pending = -1; intro = false;
        radios.forEach((b, i) => { b.tabIndex = i === k ? 0 : -1; });
        radios[k].focus({ preventScroll: true });
        if (still) { rot = to; vel = 0; goal = null; track(); paint(); } else goal = to;
      });
      // 포커스 고리는 창(검정 알약)에 그린다: 포커스가 있는 보기는 늘 창에 적혀 있다
      ctx.on(group, "focusin", (e) => lens.classList.toggle("is-focus", Boolean(e.target.matches && e.target.matches(":focus-visible"))));
      ctx.on(group, "focusout", () => lens.classList.remove("is-focus"));
      // 올라오는 중인 패널의 화살표에 Tab으로 포커스가 가면 브라우저가 장면을 밀어 올린다(overflow: hidden이어도 포커스는 스크롤을 만든다). 제자리로 되돌린다
      ctx.on(root, "scroll", () => { if (root.scrollTop || root.scrollLeft) { root.scrollTop = 0; root.scrollLeft = 0; } });

      /* ── 고르기 ── */
      /** k번 보기로 정한다: 그 보기가 창까지 돌아온 뒤에 정해진다 */
      function choose(k, focused) {
        if (choice >= 0) return;
        const to = angleFor(k, goal != null ? goal : rot);
        touched = true; intro = false;
        if (still) { rot = to; vel = 0; goal = null; track(); pick(k, true, focused, true); return; }      // 동작 줄이기: 움직임 없이 바로(소리는 난다)
        if (k === cur && Math.abs(to - rot) < 1.5) { pick(k, false, focused); return; }
        goal = to; pending = k; pendingFocus = focused;
      }

      /** 창(검정 알약)이 그 자리에서 제목의 고른 말 자리로 날아간다(화살표는 연필이 된다). 날아가는 동안에도 눌린다(다시 고르기) */
      function flyTo(pill, from) {
        if (!pill.animate) return;
        const to = rectOf(pill), ghost = pill.cloneNode(true);
        ghost.classList.add("hp-ghost");
        ghost.style.cssText = `position:absolute;left:${to.x}px;top:${to.y}px;margin:0;z-index:40;transform-origin:0 0`;
        ghost.setAttribute("aria-hidden", "true"); ghost.tabIndex = -1;
        ghost.addEventListener("mousedown", (e) => e.preventDefault());      // 눌러도 포커스를 받지 않는다(읽히지 않는 복제본이다)
        ghost.addEventListener("click", () => pill.click());
        root.append(ghost); pill.style.visibility = "hidden";
        const done = () => { ghost.remove(); pill.style.visibility = ""; };
        ghost.animate([{ transform: `translate3d(${(from.x - to.x).toFixed(1)}px, ${(from.y - to.y).toFixed(1)}px, 0) scale(${(from.w / (to.w || from.w)).toFixed(4)})` }, { transform: "none" }], { duration: 700, easing: ui.ease.soft, fill: "forwards" }).finished.then(done, done);
      }

      /** i번 보기로 정했다. instant = 움직임 없이 바로 그 상태로(바로가기 · 돌아왔을 때 · 동작 줄이기), voiced = 고르는 소리를 낸다(사람이 방금 고른 것) */
      function pick(i, instant, focused, voiced = !instant) {
        if (choice >= 0) return;
        instant = Boolean(instant) || still;
        const label = Q.options[i], my = ++token;
        choice = i; pending = -1; chosenAt = clock; drag = null; intro = false; touched = true;
        root.dataset.state = "chosen";
        ctx.set({ answers: { concern: label } });
        if (voiced) ui.sfx("pick", i);
        radios.forEach((b, k) => { b.setAttribute("aria-checked", String(k === i)); b.disabled = true; });
        group.inert = true;                                       // 정한 뒤의 바퀴는 누를 수도, 읽힐 수도 없다(고른 말은 제목의 알약이 알린다)
        if (bar.skip) bar.skip.classList.add("is-off");
        dial.classList.remove("is-dragging"); dial.classList.add("is-seat");

        // 바퀴는 위로 모여 고양이가 앉을 별이 된다(내다보던 고양이가 바퀴 뒤로 쏙 내려간 뒤에)
        if (instant) { rot = angleFor(i, rot); track(true); rot += STEP / 2; vel = 0; goal = null; Object.assign(whTo, SEAT); Object.assign(wh, SEAT); Object.assign(whV, { x: 0, y: 0, r: 0, m: 0 }); }
        else {
          setLens(i, 1, true);
          goal = angleFor(i, rot) + STEP / 2;
          ctx.later(() => { if (token === my) { Object.assign(whTo, SEAT); whV.m += 4; } }, 130);
        }

        // 제목: "뭐예요?" 자리에 고른 말이 들어선다. 창의 검정 알약이 그리로 날아간다
        line3.classList.remove("hp-rise"); line3.classList.add("hp-leave"); line3.setAttribute("aria-hidden", "true");
        sizeWord(true, instant);
        const pill = ui.pill({ text: label, dot: "pencil", onPress: () => release(), label: `${label}, 다시 고르기` });
        pill.classList.add("hp-pill-answer");
        answer.replaceChildren(pill);
        const text = pill.querySelector(".hp-pill-text"); if (text) fitText(text);
        if (!instant) flyTo(pill, rectOf(lens));
        lensWrap.classList.add("is-gone");

        // 고양이: 바퀴 뒤로 쏙 내려갔다가 별 위로 올라앉는다(한 발짝 더 가까이)
        peek.away = true;
        if (peek.state.pose !== "sit") peek.pose("sit");
        if (instant) { peek.place(DUCK); peek.el.style.opacity = "0"; }
        else { peek.place(DUCK, { ms: 150, easing: "cubic-bezier(.5,0,.9,.5)" }); ctx.later(() => { if (token === my) peek.el.style.opacity = "0"; }, 140); }
        hero.pose("sit");
        if (instant) { hero.place(SIT); hero.el.style.opacity = "1"; }
        else {
          hero.place({ ...SIT, h: 24 });
          ctx.later(() => { if (token !== my) return; hero.el.style.opacity = "1"; hero.place(SIT, { ms: 640, easing: ui.ease.spring }); ui.sfx("pop"); }, 430);
          // 올라앉는 순간 머리 둘레에서 테두리 반짝이 셋이 튄다(q3에서 고양이가 다가와 앉을 때와 같은 조각)
          ctx.later(() => { if (token === my) ui.burst(root, SIT.x, SIT.ground - SIT.h * 0.74, [{ kind: "sparkle", dx: -118, dy: -92, s: 22, r: -10 }, { kind: "sparkle", dx: 150, dy: 44, s: 16, r: 8, delay: 60 }, { kind: "sparkle", dx: -142, dy: 98, s: 14, r: 0, delay: 110 }]); }, 560);
        }

        // 하트 · 반짝이는 별 둘레로
        idleMarks.forEach((m) => m.classList.add("is-out"));
        SEAT_MARKS.forEach(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !instant, d: instant ? o.d : 640 + n * 110 }); root.append(m); extras.push(m); });

        // 아래 패널이 올라오고 고양이의 대답이 적힌다. 화살표는 다음 장면으로
        const line = ui.typed(C.REPLIES.concern[label] || "", "hp-panel-line");
        slot.replaceChildren(line); wrapSentences(line);
        panel.classList.remove("is-hidden"); go.disabled = false;
        if (focused) go.focus({ preventScroll: true });           // 키보드로 정했다면 포커스는 화살표로
        if (instant) { line.finish(); talk.end(ctx.state != null); }
        else {
          talk.begin(() => { if (token === my) line.finish(); });
          ctx.later(() => { if (token !== my || !talk.speaking) return; hero.pop(0.9); line.play({ speed: 40 }).then(() => { if (token === my) talk.end(); }); }, 860);
        }
        if (instant) paint();
      }

      /** 다시 고르기(뒤로 · 고른 말의 ✎): 별이 다시 바퀴로 내려가고 고양이는 바퀴 뒤로 돌아가 고개를 내민다 */
      function release() {
        if (choice < 0) return;
        const i = choice, a = focusedIn(root), refocus = answer.contains(a) || a === go;
        choice = -1; token++;
        root.dataset.state = "idle";
        talk.reset();
        answer.replaceChildren();
        root.querySelectorAll(".hp-ghost").forEach((g) => g.remove());
        extras.forEach((n) => n.remove()); extras = [];
        idleMarks.forEach((m) => m.classList.remove("is-out"));
        line3.classList.remove("hp-leave"); line3.removeAttribute("aria-hidden"); line3.classList.add("hp-rise");
        sizeWord(false);
        radios.forEach((b) => { b.disabled = false; b.setAttribute("aria-checked", "false"); });
        group.inert = false;
        panel.classList.add("is-hidden"); go.disabled = true; slot.replaceChildren();
        dial.classList.remove("is-seat"); lensWrap.classList.remove("is-gone");
        if (!still && lens.animate) lens.animate([{ transform: "scale(.5)", opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: "none", opacity: 1 }], { duration: 520, easing: ui.ease.spring });
        hero.el.style.opacity = "0";
        Object.assign(whTo, DIAL);
        if (still) { rot = angleFor(i, rot); vel = 0; goal = null; Object.assign(wh, DIAL); Object.assign(whV, { x: 0, y: 0, r: 0, m: 0 }); }
        else goal = angleFor(i, rot);
        peek.away = false; peek.el.style.opacity = "1";
        peek.place(PEEK, { ms: 620, easing: ui.ease.soft });
        if (bar.skip) bar.skip.classList.remove("is-off");
        ctx.set({ answers: { concern: null } });
        if (refocus) radios[i].focus({ preventScroll: true });   // 고른 말(다시 고르기)이나 화살표에 있던 포커스는 그 보기로 돌아간다
        if (still) paint();
      }

      /* ── 시작 ── */
      root.classList.add("hp-q2-snap");                               // 처음 그리는 동안에는 CSS 전환이 돌지 않는다(끝에서 푼다)
      answer.style.top = line3.offsetTop + "px";
      sizeWord(false, true); measure();
      const before = Q.options.indexOf(ctx.data.answers.concern);
      if (ctx.state === "chosen") pick(Math.min(1, N - 1), true);
      else if (ctx.state == null && before >= 0) pick(before, true);            // 돌아왔을 때: 골랐던 답 그대로(움직임 없이)
      else {
        if (!ctx.instant) {
          // 바퀴가 아래에서 솟으며 반 바퀴 돌아 들어와 칸에 들어앉고(틱 · 틱), 그 뒤에 고양이가 골 사이로 슬쩍 고개를 내민다
          intro = true; rot = -2.4 * STEP; goal = 0; wh.y = DIAL.y + 230; wh.r = DIAL.r * 0.92;
          group.classList.add("hp-q2-fade"); lens.classList.add("hp-popin"); lens.style.setProperty("--d", "560ms");
          peek.el.style.opacity = "0";
          ctx.later(() => { if (choice < 0) { peek.el.style.opacity = "1"; peek.place(PEEK, { ms: 820, easing: ui.ease.soft }); } }, 1050);
        }
        track(true);
      }
      paint();
      void root.offsetWidth; root.classList.remove("hp-q2-snap");
      if (!still) {
        ctx.loop(frame);
        // 아직 손대지 않았다면 바퀴가 가끔 살짝 흔들린다(돌릴 수 있다는 표시). 바로 보여 주는 상태(스크린샷)에서는 흔들지 않는다
        let side = 1, left = 3;
        const nudge = () => {
          if (touched || !root.isConnected || left-- <= 0) return;
          if (choice < 0 && !drag && goal == null && !intro) { goal = rot; vel = 320 * side; side = -side; }
          ctx.later(nudge, 4200);
        };
        ctx.later(nudge, 3400);
      }
      // 글꼴이 다 오면 너비를 다시 잰다
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
        if (!root.isConnected) return;
        answer.style.top = line3.offsetTop + "px";
        sizeWord(choice >= 0, true); measure();
        const t = lensText.lastElementChild; if (t) { fitText(t, LENS_MAX); lensText.style.width = t.offsetWidth + "px"; }
        const p = answer.querySelector(".hp-pill-text"); if (p) fitText(p);
        if (still) paint();
      });
    },
  });
})();
