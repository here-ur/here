/* 장면: q4 (노랑) — "힘들 때 이야기할 수 있는 사람이 있어요?"
 *
 * 1번 톤의 "검정 알약 + 끝의 주황 동그라미"(Speak With [▮▮▮ ●])를 그대로 키워 세 칸짜리 슬라이더로 쓴다.
 *   - 긴 검정 알약이 레일(세 칸의 흰 테두리 동그라미 + 그 사이의 숨소리 막대), 주황 동그라미가 손잡이다.
 *     끌고, 튕기고(flick), 칸이나 이름표를 눌러 세 자리 중 하나에 놓는다. 화살표 키 · 화면 읽기는 진짜 <input type="range">가 받는다.
 *   - 아직 답하지 않았을 때 손잡이는 레일 안이 아니라 알약 위(고양이 옆)에 공처럼 얹혀 있다 → 어느 칸도 고른 것으로 보이지 않는다.
 *     처음 손을 대면 레일 안으로 통 떨어져 들어가고, 그때부터 답이 기록된다.
 *   - 고양이는 질문 장면 가운데 가장 크게, 그 알약 위에 바로 앉아 있다("어느새 바로 옆에 앉았어요"). 손잡이가 가는 쪽으로 몸이 기운다.
 *   - 제목의 마지막 낱말("있어요?")이 줄 안 알약이고, 고르면 그 알약에 고른 말이 크게 담긴다(끝의 동그라미는 빈 테두리 → 주황 체크).
 *   - 고양이의 대답은 제목 바로 아래(고양이 머리 위)에 적힌다. "계속"은 ui.speech()로 지킨다.
 *   - "지금은 없어요"에서는 하트·반짝이를 거두고, 덩어리는 동그라미로 가라앉고, 아무것도 튀지 않는다. 대답은 다른 답과 똑같이 적힌다.
 * 문구는 HereCopy에서만 가져온다(덧붙인 화면 글자는 "계속" · "건너뛰기"와 화면 읽기용 이름표뿐).
 * 참고: tone-1(노란 색면 · 줄 안 알약 · 알약 속 숨소리 막대와 주황 동그라미 · 캐릭터 뒤의 색 덩어리 · 하트와 반짝이 · 검정 알약 버튼).
 */
(() => {
  "use strict";
  if (typeof HerePhone === "undefined") return;                  // phone.js 다음에 불러온다
  const ui = HerePhone.ui;

  const TRACK = { x: 20, y: 636, w: 350, h: 72 };              // 검정 알약(레일). q4.css의 .hp-q4-track과 같은 자리
  const KNOB = 60;                                               // 주황 손잡이의 지름
  const STOPS = [56, 195, 334];                                  // 손잡이가 멈추는 세 자리(무대 x)
  const RAIL = TRACK.y + TRACK.h / 2;                            // 레일 안에 있을 때의 y
  const DOCK = { x: STOPS[0], y: TRACK.y - KNOB / 2 };           // 답하기 전: 알약 위에 얹혀 있다
  const SEAT = { x: 211, ground: TRACK.y + 5, h: 322 };          // 고양이: 알약의 윗변에 발이 닿는다(질문 장면 가운데 가장 크다)
  const HOP = -700;                                              // 알약 위에서 레일로 뛰어들 때의 첫 속도(px/s)
  const DOCK_LEAN = -0.55;                                       // 답하기 전에는 옆에 놓인 손잡이를 슬쩍 본다(-1 왼쪽 ~ 1 오른쪽)
  // 손잡이 안의 아이콘: 양쪽 화살표(참고 이미지의 주황 동그라미 속 흰 화살표와 같은 선). "옆으로 옮긴다"는 뜻뿐이라 어느 답에서나 같다
  const GRIP = '<svg viewBox="0 0 24 24" fill="none"><use href="/icons/iconsax-free.svg?v=20261128-keyline2#swap"/></svg>';
  const WAVE = [5, 9, 15, 22, 26, 20, 12, 17, 24, 18, 10, 14, 8, 4];      // 숨소리 막대의 높이(open의 알약과 같은 박자)

  HerePhone.addScene({
    id: "q4", field: "yellow", states: ["idle", "chosen"],
    build(ctx) {
      const { el: root, copy: C } = ctx, { el, clamp, sfx } = ui;
      const Q = C.Q.support, N = Q.options.length;
      const CALM = N - 1;                                        // "지금은 없어요": 장식도 튐도 없는 답
      const still = ui.reduced();
      let value = -1, shown = -1, ticked = -1, drag = null, line = null, replyTimer = 0, hintTimer = 0, flowered = false;
      const talk = ui.speech();

      /* ── 위 줄 · 제목(마지막 낱말이 답이 담기는 알약) · 그 아래 한 줄 ── */
      const bar = ui.topbar(ctx, { skip: true, pages: true });   // 큰 버튼 위에는 이름표가 있으므로 쪽 표시는 위 줄에
      const [l1, l2, l3] = ui.lines(Q.text, [3, 3, 1]);
      const ASK = l3.split(" ").pop();                           // "있어요?"
      const word = (t) => el("span", "hp-q4-word", t);
      const ans = el("span", "hp-q4-ans", word(ASK));
      const pill = ui.pill({ content: ans, dot: "check" });
      pill.classList.add("hp-q4-pill", "is-open");
      const dot = pill.querySelector(".hp-pill-dot");
      pill.dataset.say = ASK;
      const title = ui.headline([l1, l2, ui.swap(l3, ASK, pill)], { size: 38 });
      const sub = el("p", "hp-body hp-q4-sub hp-rise", C.eyebrows.support); sub.style.setProperty("--i", 3);
      const say = el("div", "hp-q4-say", sub);
      const head = ui.block("hp-head hp-q4-head", { top: 88 }, title, say);

      /* ── 고양이와 그 뒤의 라일락 덩어리(동그라미 ↔ 여덟 갈래 꽃: 좌우가 골이라 화면 가장자리에 닿지 않는다). 덩어리의 아래쪽은 알약 뒤로 들어간다 ── */
      const SPOT = { x: 195, y: 498, r: 176 }, BLOOM = { r: 184, m: 1 };
      const spot = ui.shape(ctx, { color: "var(--hp-lilac)", shape: [[8, 0.07, 180]], ...SPOT, m: 0 });
      const sp = { r: SPOT.r, m: 0, vr: 0, vm: 0, tr: SPOT.r, tm: 0, calm: false };      // 덩어리의 스프링은 이 장면이 직접 돌린다(가라앉을 때는 튀지 않게)
      const seat = el("div", "hp-catlayer hp-q4-seat");
      root.append(bar, head, spot.el, seat);
      const cat = ctx.cat(SEAT, { layer: seat });
      // 기울기는 고양이 그림(<img>)에 바로 준다(2D 변환, 발끝이 축). 층째로 기울이면 Chrome이 층을 조각내 합칠 때 털 사이로 1px 틈이 비친다
      const fur = cat.el.querySelector(".hc-img");
      if (fur) fur.style.transformOrigin = "50% 100%";
      const UNIT = 300 / SEAT.h;                                 // 무대 px → 고양이 그림 안의 px

      // 하트 하나 · 반짝이 둘(고양이 곁, 노란 바탕 위). "지금은 없어요"에서는 물러난다.
      const marks = [["heart", { x: 350, y: 346, s: 40, r: 10, float: true }], ["sparkle", { x: 38, y: 366, s: 26, r: -12, twinkle: true, d: 400 }], ["sparkle", { x: 368, y: 386, s: 15, r: 8, twinkle: true, d: 1200 }]]
        .map(([kind, o], n) => { const m = ui.mark(kind, { ...o, pop: !ctx.instant, d: ctx.instant ? o.d : 700 + n * 110 }); root.append(m); return m; });

      /* ── 슬라이더: 진짜 <input type="range">(키보드 · 화면 읽기) + 그 위의 그림(레일 · 손잡이 · 이름표) ── */
      const range = el("input", "hp-q4-range");
      Object.assign(range, { type: "range", min: 0, max: N, step: 1, value: 0 });      // 0 = 아직 고르지 않음, 1~N = 답
      range.setAttribute("role", "slider"); range.setAttribute("aria-label", Q.text); range.setAttribute("aria-orientation", "horizontal");
      range.setAttribute("aria-valuetext", "아직 고르지 않았어요");
      const track = el("div", "hp-q4-track"); track.setAttribute("aria-hidden", "true");
      const bars = [];
      STOPS.forEach((sx, n) => {
        const ring = el("i", "hp-q4-ring"); ring.style.left = sx - TRACK.x + "px"; ring.style.setProperty("--n", n); track.append(ring);
        if (n === STOPS.length - 1) return;
        const heights = n % 2 ? WAVE.slice().reverse() : WAVE, gap = (STOPS[n + 1] - sx - 48) / (heights.length - 1);
        heights.forEach((h, j) => { const b = el("i", "hp-q4-bar"), x = sx + 24 + j * gap; b.style.left = x - TRACK.x + "px"; b.style.setProperty("--h", h); track.append(b); bars.push({ el: b, x, g: 0 }); });
      });
      const face = el("span"); face.innerHTML = GRIP;
      const knob = el("div", "hp-q4-knob", face); knob.setAttribute("aria-hidden", "true");
      const ticks = el("div", "hp-q4-ticks");
      const tickEls = Q.options.map((label, i) => {
        const b = el("button", "hp-q4-tick", label); b.type = "button"; b.dataset.i = i;
        b.tabIndex = -1; b.setAttribute("aria-hidden", "true");      // 화면 읽기 · 키보드는 슬라이더 하나로 고른다(이름표는 손가락용 지름길)
        ctx.on(b, "click", () => { commit(i); quietFocus(); });
        ticks.append(b); return b;
      });
      const slider = el("div", "hp-q4-slider", range, track, knob, ticks);
      slider.dataset.sfx = "none";                                // 소리는 이 장면이 알맞은 순간에 낸다
      const cta = ui.cta({ label: "계속", disabled: true, onPress: () => { if (value >= 0 && talk.pass()) ctx.next(cta); } });
      root.append(slider, cta);
      /** 손가락으로 만진 뒤에도 화살표 키로 이어서 옮길 수 있게 포커스를 준다(포커스 고리는 그리지 않는다) */
      const quietFocus = () => { slider.classList.add("is-quiet"); range.focus({ preventScroll: true }); };

      /* ── 움직임: 손잡이(x, y) · 고양이의 기울기 · 덩어리 ── */
      const k = { x: DOCK.x, y: DOCK.y, vx: 0, vy: 0, tx: DOCK.x, inRail: false, calm: false, landing: false };
      const LO = STOPS[0], HI = STOPS[N - 1];
      let lean = DOCK_LEAN, leanV = 0, lastKnob = "", lastSeat = "", lastSpot = "";
      const leanOf = (x) => clamp((x - STOPS[1]) / (HI - STOPS[1]), -1, 1);
      const nearest = (x) => STOPS.reduce((best, sx, i) => (Math.abs(sx - x) < Math.abs(STOPS[best] - x) ? i : best), 0);
      /** 끝을 넘겨 끌면 고무줄처럼 조금만 따라온다 */
      const band = (x) => (x < LO ? LO - Math.min(9, (LO - x) * 0.2) : x > HI ? HI + Math.min(9, (x - HI) * 0.2) : x);

      function paint() {
        const t = `translate3d(${k.x.toFixed(2)}px, ${k.y.toFixed(2)}px, 0)`;
        if (t !== lastKnob) { lastKnob = t; knob.style.transform = t; }
        // 고양이: 발은 알약 위에 그대로 두고 몸이 손잡이 쪽으로 기운다
        const s = `translate(${(lean * 6 * UNIT).toFixed(2)}px, 0) skewX(${(-lean * 4.4).toFixed(3)}deg) rotate(${(lean * 1.4).toFixed(3)}deg)`;
        if (s !== lastSeat && fur) { lastSeat = s; fur.style.transform = s; }
        const b = sp.r.toFixed(2) + "," + sp.m.toFixed(4);
        if (b !== lastSpot) { lastSpot = b; spot.set({ r: sp.r, m: sp.m }); }
        // 숨소리 막대: 손잡이가 지나가는 자리에서 일어선다
        const depth = clamp((k.y - DOCK.y) / (RAIL - DOCK.y), 0, 1);
        for (const bar of bars) {
          const d = Math.abs(bar.x - k.x), g = depth * Math.exp(-((d / 44) ** 2));
          const clear = 1 - depth * clamp((40 - d) / 5, 0, 1);      // 손잡이 바로 곁의 막대는 물러난다(손잡이 둘레에 숨 쉴 틈)
          const key = g * 8 + clear;
          if (Math.abs(key - bar.g) < 0.004) continue;
          bar.g = key; bar.el.style.transform = `scaleY(${(1 + g * 0.8).toFixed(3)})`; bar.el.style.opacity = ((0.48 + g * 0.52) * clear).toFixed(3);
        }
      }

      function step(dt) {
        // 손잡이 x: 끄는 동안에는 손가락을 바짝 따라가고, 놓으면 그 칸으로 스프링(지금은 없어요에서는 넘치지 않는다).
        // 알약 위에서 뛰어드는 동안에는 제자리에서 레일 안으로 내려온 뒤에 옆으로 간다(고양이 발 앞을 가로지르지 않는다)
        const inside = k.y > TRACK.y - 4 || (drag && drag.onKnob);
        if (!inside) k.vx *= Math.exp(-30 * dt);
        else if (drag) k.vx += ((band(drag.x - drag.grab) - k.x) * 1100 - k.vx * 64) * dt;
        else k.vx += ((k.tx - k.x) * 300 - k.vx * (k.calm ? 35 : 23)) * dt;
        k.x += k.vx * dt;
        if (!drag) { if (k.x < LO - 5) { k.x = LO - 5; k.vx = Math.abs(k.vx) * 0.25; } else if (k.x > HI + 5) { k.x = HI + 5; k.vx = -Math.abs(k.vx) * 0.25; } }      // 알약의 끝에 닿으면 더 나가지 않는다
        // 손잡이 y: 레일 안에서는 스프링, 알약 위에서 집어 끄는 동안에는 손가락을 따라오고, 그냥 얹혀 있을 때는 공처럼 떨어져 통 튄다
        if (k.inRail) { k.vy += ((RAIL - k.y) * 240 - k.vy * 29) * dt; k.y += k.vy * dt; }
        else if (drag && drag.moved) { k.vy += ((drag.y - k.y) * 1100 - k.vy * 64) * dt; k.y += k.vy * dt; if (k.y >= RAIL - 3) enter(0); }
        else { k.vy += 2600 * dt; k.y += k.vy * dt; if (k.y >= DOCK.y) { k.y = DOCK.y; k.vy = k.vy > 90 ? -k.vy * 0.34 : 0; } }
        // 고양이의 기울기: 손잡이를 조금 늦게 따라간다
        const goal = k.inRail || drag ? leanOf(k.x) : DOCK_LEAN;
        leanV += ((goal - lean) * 70 - leanV * (k.calm ? 17 : 12)) * dt; lean += leanV * dt;
        // 덩어리
        sp.vr += ((sp.tr - sp.r) * 170 - sp.vr * (sp.calm ? 27 : 19)) * dt; sp.r += sp.vr * dt;
        sp.vm += ((sp.tm - sp.m) * 110 - sp.vm * (sp.calm ? 21 : 9)) * dt; sp.m = Math.max(0, sp.m + sp.vm * dt);
      }
      /** 움직임 없이 끝 상태로(바로가기 · 동작 줄이기) */
      function settle() {
        if (!drag) k.x = k.tx;
        k.vx = k.vy = 0; k.y = k.inRail ? RAIL : DOCK.y;
        lean = k.inRail || drag ? leanOf(k.x) : DOCK_LEAN; leanV = 0;
        sp.r = sp.tr; sp.m = sp.tm; sp.vr = sp.vm = 0;
        if (k.landing) landed();
        paint();
      }
      const DT = 1 / 240;
      let acc = 0;
      if (!still) ctx.loop((dt) => {
        acc = Math.min(acc + dt, 0.05);
        while (acc >= DT) { step(DT); acc -= DT; }
        // 끄는 동안 지나가는 칸을 미리 보여 준다. 손잡이가 손가락 밑에 있을 때만(멀리서 달려오는 동안에는 지나치는 칸을 읽지 않는다)
        if (drag && drag.moved && Math.abs(band(drag.x - drag.grab) - k.x) < 28) { const n = nearest(k.x); if (n !== shown) preview(n); }
        if (k.landing && !drag && Math.abs(k.x - k.tx) < 7 && Math.abs(k.y - RAIL) < 7) landed();
        paint();
      });

      /* ── 보이는 것 맞추기 ── */
      /** 제목 알약의 글자를 바꾼다(오른쪽 칸으로 가면 아래에서, 왼쪽 칸으로 가면 위에서 들어온다) */
      function setWord(text, up, instant) {
        const cur = ans.lastElementChild;
        if (cur && cur.textContent === text && !cur.classList.contains("is-out")) return;
        ans.querySelectorAll(".is-out").forEach((n) => n.remove());
        const next = word(text);
        if (instant || still || !cur) { ans.replaceChildren(next); ans.style.width = next.offsetWidth + "px"; return; }
        ans.style.setProperty("--dir", up ? 1 : -1);
        cur.classList.remove("is-in"); cur.classList.add("is-out"); ctx.later(() => cur.remove(), 200);
        next.classList.add("is-in"); ans.append(next);
        ans.style.width = next.offsetWidth + "px";
      }
      /** 지금 가리키는 칸(i)에 맞춰 이름표 · 제목 알약 · 장식을 맞춘다 */
      function show(i, instant) {
        const up = i > shown, calm = i === CALM; shown = i;
        root.classList.toggle("is-q4-calm", calm);                   // 먼저: 이 답에서는 글자 · 체크도 튀지 않고 들어온다
        tickEls.forEach((b, n) => b.classList.toggle("is-on", n === i));
        setWord(Q.options[i], up, instant);
        pill.classList.remove("is-open");
        if (calm) marks.forEach((m) => m.classList.add("is-out"));      // 하트 · 반짝이는 바로 물러난다(돌아오는 것은 다른 답을 정했을 때)
        cat.away = calm;                                          // 이 답에서는 고양이를 눌러도 반짝이가 튀지 않는다
        if (calm) { Object.assign(sp, { tr: SPOT.r, tm: 0, calm: true }); flowered = false; k.landing = false; if (instant || still) settle(); }
      }
      /** 끄는 동안 다른 칸으로 넘어갔다: 틱 소리와 함께 미리 보여 준다(기록은 손을 뗄 때) */
      function preview(i, quiet) {
        if (!quiet) { sfx("slot"); sfx("buzz", 8); ticked = i; }
        show(i, false);
        if (line && i !== value) dropLine();
      }
      function dropLine() { clearTimeout(replyTimer); talk.reset(); if (line) { line.finish(); line.remove(); line = null; } }

      /** 고양이의 대답이 제목 아래에 적힌다 */
      function speak(i, instant) {
        dropLine();
        const mine = line = ui.typed(C.REPLIES.support[Q.options[i]], "hp-q4-reply");
        say.append(mine); mine.wrap();
        if (instant) { mine.finish(); talk.end(ctx.state != null); return; }
        talk.begin(() => { if (line === mine) mine.finish(); });
        replyTimer = ctx.later(() => {
          if (line !== mine || !talk.speaking) return;
          if (i !== CALM) cat.pop(0.6);
          mine.play({ speed: 40 }).then(() => { if (line === mine) talk.end(); });
        }, still ? 0 : 460);
      }

      /** 손잡이가 칸에 내려앉은 순간(지금은 없어요가 아닐 때만): 덩어리가 꽃으로 피고, 알약 위의 고양이가 움찔하고, 제목의 체크에서 반짝이가 튄다 */
      function landed() {
        k.landing = false;
        Object.assign(sp, { tr: BLOOM.r, tm: BLOOM.m, calm: false }); flowered = true;
        if (still) { sp.r = sp.tr; sp.m = sp.tm; return; }
        sp.vm += 5; cat.pop(0.9); sfx("pop");
        if (face.animate) face.animate([{ transform: "scale(1.16, .86)" }, { transform: "scale(.95, 1.06)", offset: 0.45 }, { transform: "scale(1)" }], { duration: 380, easing: "cubic-bezier(.3,.7,.4,1)" });
        const c = ctx.center(dot);
        ui.burst(root, c.x + 14, c.y - 4, [{ kind: "sparkle", dx: 34, dy: -30, s: 20, r: 12 }, { kind: "sparkle", dx: 50, dy: 12, s: 13, r: -10, delay: 60 }]);
      }

      /** 답을 정한다(손을 뗐을 때 · 칸이나 이름표를 눌렀을 때 · 화살표 키) */
      function commit(i, { instant = false } = {}) {
        i = clamp(Math.round(i), 0, N - 1);
        const changed = i !== value, calm = i === CALM;
        value = i; stopHint();
        if (!k.inRail) enter(calm ? 0 : HOP);                      // 알약 위에서 통 뛰어 레일로 들어간다(지금은 없어요에서는 뛰지 않고 내려앉는다)
        k.tx = STOPS[i]; k.calm = calm;
        if (calm) k.vx = clamp(k.vx, -160, 160);                  // 튕겨서 놓았더라도 이 칸에는 넘치지 않고 들어선다
        range.min = 1; range.value = i + 1; range.setAttribute("aria-valuetext", Q.options[i]);
        root.dataset.state = "chosen";
        if (bar.skip) bar.skip.classList.add("is-off");
        cta.disabled = false;
        show(i, instant);
        if (changed) ctx.set({ answers: { support: Q.options[i] } });
        if (!calm) {
          marks.forEach((m, n) => { if (!ctx.instant) m.style.setProperty("--d", 140 + n * 70); m.classList.remove("is-out"); });      // 물러나 있던 하트 · 반짝이가 다시 통 튀어 나온다
          if (changed || !flowered) { if (instant) { Object.assign(sp, { tr: BLOOM.r, tm: BLOOM.m, calm: false }); flowered = true; } else k.landing = true; }
        }
        if (!instant) { if (!calm) sfx("pick", i); else if (ticked !== i) sfx("slot"); }      // 지금은 없어요: 통통 튀는 소리 없이 칸에 닿는 틱 한 번뿐
        ticked = -1;
        if (changed || !line) speak(i, instant);
        if (instant || still) settle();
      }

      /* ── 손가락 ── */
      /** 손잡이가 알약 위에서 레일 안으로 들어간다. kick = 뛰어오르는 첫 속도(0이면 그대로 내려앉는다) */
      function enter(kick = 0) { if (k.inRail) return; k.inRail = true; knob.classList.add("is-in"); if (still) k.y = RAIL; else if (kick) k.vy = kick; }
      function grab(e, onKnob) {
        if (drag || e.button > 0) return;
        e.preventDefault(); e.stopPropagation();                  // 고양이 '콕 누르기'로 넘어가지 않게
        const p = ctx.point(e);
        stopHint(); ticked = -1;
        drag = { id: e.pointerId, x: p.x, y: k.y, grab: onKnob ? p.x - k.x : 0, grabY: p.y - k.y, sx: p.x, sy: p.y, v: 0, at: performance.now(), moved: false, onKnob, from: value };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 window에서 받는다 */ }
        knob.classList.add("is-held"); slider.classList.add("is-dragging");
        if (!onKnob) {                                            // 레일을 눌렀다: 손잡이가 그 자리로 온다
          const n = nearest(p.x);
          enter(n === CALM ? 0 : HOP);
          if (n !== shown) preview(n, true);                       // 소리는 손을 뗄 때(답이 정해질 때) 난다
          if (still) { k.x = band(p.x); lean = leanOf(k.x); paint(); }
        }
        quietFocus();
      }
      ctx.on(track, "pointerdown", (e) => grab(e, false));
      ctx.on(knob, "pointerdown", (e) => grab(e, true));
      ctx.on(window, "pointermove", (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const p = ctx.point(e), now = performance.now(), dt = Math.max(8, now - drag.at) / 1000;
        drag.v = ui.lerp(drag.v, (p.x - drag.x) / dt, 0.6); drag.x = p.x; drag.at = now;
        drag.y = clamp(p.y - drag.grabY, DOCK.y - 26, RAIL);      // 알약 위에서 집었을 때만 쓴다: 손가락을 따라 레일로 내려온다
        if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true;
        if (still && drag.moved) { enter(0); k.x = band(drag.x - drag.grab); lean = leanOf(k.x); const n = nearest(k.x); if (n !== shown) preview(n); paint(); }
      });
      const drop = (e) => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        const d = drag; drag = null;
        knob.classList.remove("is-held"); slider.classList.remove("is-dragging");
        if (d.onKnob && !d.moved) { if (value < 0) hintLoop(); return; }      // 손잡이를 톡 누르기만 했다: 아직 답이 아니다(통 튀며 칸들을 가리킨다)
        const v = performance.now() - d.at > 90 ? 0 : clamp(d.v, -2400, 2400);
        let i = nearest(clamp(d.x - d.grab + v * 0.16, LO, HI));
        // 제자리로 돌아갈 만큼만 움직였어도: 짧게 튕겼거나(빠르게), 한쪽으로 조금 끌다가 그 방향으로 가는 중에 놓았으면 그 방향의 다음 칸으로
        if (d.moved && d.from >= 0 && i === d.from) {
          const dx = d.x - d.grab - STOPS[d.from];
          if (Math.abs(v) > 420) i = clamp(d.from + Math.sign(v), 0, N - 1);
          else if (Math.abs(dx) > 24 && v * dx > 0 && Math.abs(v) > 80) i = clamp(d.from + Math.sign(dx), 0, N - 1);
        }
        k.vx = clamp(v, -900, 900);
        if (!k.inRail) enter(0);                                  // 알약 위에서 놓았다: 그 아래 칸으로 내려앉는다
        commit(i);
      };
      ctx.on(window, "pointerup", drop); ctx.on(window, "pointercancel", drop);

      /* ── 키보드 · 화면 읽기: 진짜 슬라이더가 받는다(→ ↑ 다음 칸, ← ↓ 앞 칸, Home · End) ── */
      ctx.on(range, "input", () => { const v = +range.value; if (v >= 1) commit(v - 1); });
      ctx.on(range, "keydown", (e) => {
        slider.classList.remove("is-quiet");
        // 아직 고르지 않았을 때 ← ↓ Home 은 값이 바뀌지 않아 input이 오지 않는다: 첫 칸으로 놓는다
        if (value < 0 && (e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "Home")) { e.preventDefault(); commit(0); }
        if (e.key === "Enter" && !e.repeat && value >= 0) { e.preventDefault(); cta.click(); }      // 고른 뒤의 Enter는 '계속'을 누른 것과 같다
      });
      ctx.on(range, "blur", () => slider.classList.remove("is-quiet"));

      /* ── 아직 답하지 않았을 때: 손잡이가 가끔 통 튀고 세 칸이 차례로 깜박인다 ── */
      function hint() {
        if (still || value >= 0 || drag) return;
        if (!k.inRail && k.y >= DOCK.y - 0.5) k.vy = -300;
        track.classList.remove("is-hint"); void track.offsetWidth; track.classList.add("is-hint");
      }
      function stopHint() { clearTimeout(hintTimer); hintTimer = 0; track.classList.remove("is-hint"); }
      function hintLoop() { clearTimeout(hintTimer); hint(); hintTimer = ctx.later(hintLoop, 3800); }

      /* ── 처음 모습 ── */
      // 알약 안 글자의 너비를 잰다(글꼴이 다 온 뒤에 한 번 더. 이때는 너비가 미끄러지지 않고 바로 맞는다)
      const fitWord = () => {
        const w = ans.lastElementChild; if (!w || !ans.isConnected) return;
        ans.style.transition = "none"; ans.style.width = w.offsetWidth + "px"; void ans.offsetWidth; ans.style.transition = "";
      };
      fitWord();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWord);

      const before = Q.options.indexOf(ctx.data.answers.support);
      // chosen = 가운데 칸("가끔 있어요"). yes · none은 나머지 두 칸을 바로 여는 시험용 바로가기(?scene=q4&state=none)
      const jump = ctx.state == null ? before : { chosen: 1, yes: 0, none: CALM }[ctx.state] ?? -1;
      if (jump >= 0) commit(jump, { instant: true });             // 바로가기 · 돌아왔을 때: 골랐던 답 그대로
      else if (ctx.instant) { knob.classList.add("is-in"); settle(); }
      else {
        // 고양이는 처음부터 앉아 있다("어느새"). 덩어리가 부풀고, 손잡이가 알약 위로 통 떨어진다
        sp.r = 70; paint();
        ctx.later(() => { if (value < 0 && !k.inRail && !drag) { knob.classList.add("is-in"); k.y = DOCK.y - 54; k.vy = 0; } }, 620);
        hintTimer = ctx.later(() => { if (value < 0) hintLoop(); }, 3000);
      }
      paint();
    },
  });
})();
