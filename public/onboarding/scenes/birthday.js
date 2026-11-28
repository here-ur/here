/* 장면: birthday (노랑) — 생일
 *
 * 제목("○○의 [생일]은 / 언제예요?") 아래에 세로로 선 알약 세 개가 드럼처럼 구른다: "[2000]년 [1]월 [1]일".
 * 손대기 전에는 테두리만 있는 빈칸(안의 숫자는 자리 표시 색)이고, 한 칸이라도 굴리면 검정 알약으로 차오르면서
 * 제목의 "언제예요?" 자리에 고른 날짜가 글로 적힌다(HereCopy.about.format). 그때 '다음'이 켜진다.
 * 고양이는 피그마와 같은 크기·위치의 정지 이미지로 배치한다.
 * 만 14세가 안 되는 날짜면 흰 안내 카드가 고양이 앞에 올라오고(장식 · 튀는 움직임 · 튀는 소리 없음) '다음'은 꺼진 채로 남는다.
 * 날짜를 다시 굴려 만 14세 이상이 되면 카드가 물러난다.
 *
 * 참고: tone-1의 노란 화면을 그대로 따랐다 — 노란 색면 · 줄 안의 검정 알약(끝에 주황 동그라미) ·
 *       캐릭터 앞에 놓인 검정 덩어리(책상) → 검정 알약 릴 · 테두리 선 그림(유리 돔) → 손대기 전의 빈 알약 · 하트와 반짝이 · 검정 알약 버튼.
 *       짜임은 layout-3(바퀴로 고르는 날짜 + 까닭 한 줄), 손맛은 interaction-1(관성 · 눌림 · 통 튀는 멈춤).
 */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP || !HP.addScene) return;
  const ui = HP.ui, { el, clamp, lerp, reduced, sfx } = ui;

  // 알약 끝 동그라미 안의 초 꽂은 케이크(작게 보여도 읽히게 속을 채운 모양). 촛불은 가만히 일렁인다(birthday.css의 hp-bd-flame)
  const CAKE = '<svg viewBox="0 0 24 24" fill="none"><use href="/icons/iconsax-free.svg?v=20261128-keyline2#cake"/></svg>';

  const mod = (a, n) => ((a % n) + n) % n;
  const daysIn = (y, m) => new Date(y, m, 0).getDate();

  /* ───────────────────────── 드럼 릴 ─────────────────────────
   * 세로로 선 알약 안에서 숫자가 원통처럼 구른다(가운데가 지금 값, 위아래로 앞뒤 값이 작게 눌려 보인다).
   *   끌기 · 튕기기(관성으로 구르다 가까운 칸에 통 멈춘다) · 구르는 릴 잡기
   *   위 · 아래 누르기(한 칸) · 가운데 누르기(보이는 값 그대로 정하기) · 바퀴
   *   ↑ ↓(한 칸. ↑ = 큰 값) · PageUp / PageDown · Home / End · ← →(옆 릴) · 숫자 적기 · Enter / Space(정하기)
   * { label, unit, min, max, value, cyclic(끝에서 처음으로 이어진다), page(PageUp/Down 칸 수), digits(적을 수 있는 자릿수), coast(놓은 뒤 구르는 시간), height, cls,
   *   onGrab(), onDrop(), onStep(누가), onLand(누가), onRest(누가), onConfirm(enter), onTyped(다 적었는지), onSide(±1) }
   *   누가 = "user" | "auto"(없는 날에서 되굴림) | "intro"(들어올 때 · 눈짓)
   * → { el, value, landing, moving, settled, nudge(n), setValue(v), setLimit(v, 바로), settle(), intro(칸, ms), hint(±1) } */
  const STEP = Math.PI / 4;                 // 한 칸 = 원통의 45°(두 칸 떨어진 숫자는 원통 뒤로 넘어가 보이지 않는다)
  const K = 300, DAMP = 19;                 // 칸에 멈추는 스프링(한 칸의 12%쯤 넘쳤다 돌아온다: 통 멈춘다)
  const SLOW = 2.4;                         // 이 속도(칸/초)보다 느려지면 가까운 칸으로 끌려간다
  function makeReel(ctx, o) {
    const { min, max, cyclic = false, page = 1, digits = 2, coast = 0.38, height } = o;      // coast = 놓은 뒤 속도가 줄어드는 시간(초). 길수록 멀리 구른다
    let n = max - min + 1;
    const R = height / 2 - 8, PITCH = R * STEP;
    const box = el("div", "hp-bd-reel" + (o.cls ? " " + o.cls : ""));
    box.tabIndex = 0; box.setAttribute("role", "spinbutton"); box.setAttribute("aria-label", o.label); box.setAttribute("aria-valuemin", min);
    box.dataset.sfx = "none";      // 소리는 장면이 한 칸마다 낸다(onStep)
    const drum = el("span", "hp-bd-drum"); drum.setAttribute("aria-hidden", "true");
    const cells = [];
    for (let i = 0; i < 7; i++) { const c = el("span", "hp-bd-num"); drum.append(c); cells.push({ el: c, idx: null, on: null }); }
    box.append(drum);

    // pos = 가운데에 온 칸(소수). mode: rest(멈춤) · held(손에 잡힘) · free(관성) · spring(target 칸으로 끌려가는 중)
    let pos = o.value - min, vel = 0, mode = "rest", target = pos, limit = max, by = "auto", last = Math.round(pos);
    let stop = null, drag = null, typed = "", typedTimer = 0, stepping = false, landed = true;
    const valueAt = (i) => min + (cyclic ? mod(i, n) : clamp(i, 0, n - 1));
    const exists = (i) => cyclic || (i >= 0 && i < n);
    const nearestOf = (p) => (cyclic ? Math.round(p) : clamp(Math.round(p), 0, n - 1));
    const nearest = () => nearestOf(pos);
    const aria = () => { const v = Math.min(valueAt(mode === "spring" ? target : nearest()), limit); box.setAttribute("aria-valuenow", v); box.setAttribute("aria-valuetext", v + o.unit); box.setAttribute("aria-valuemax", limit); };
    const halt = () => { if (stop) { stop(); stop = null; } };
    const run = () => { if (!stop) stop = ctx.loop(tick); };

    function paint() {
      const base = Math.round(pos);
      for (let k = -3; k <= 3; k++) {
        const i = base + k, cell = cells[mod(i, 7)], d = i - pos, th = d * STEP;
        if (Math.abs(th) >= 1.56 || !exists(i)) { if (cell.on !== false) { cell.el.style.visibility = "hidden"; cell.on = false; } cell.idx = null; continue; }
        if (cell.idx !== i) { cell.el.textContent = valueAt(i); cell.idx = i; }
        cell.el.style.opacity = k === 0 ? "1" : "0.5";
        let a = Math.min(1, Math.abs(d)); a = a * a * (3 - 2 * a);
        const s = lerp(1, 0.56, a);      // 가운데에서 멀어지면 비율을 유지하며 작아진다(0.56배).
        cell.el.style.transform = `translate3d(0, ${(R * Math.sin(th)).toFixed(2)}px, 0) scale(${s.toFixed(4)})`;
        if (cell.on !== true) { cell.el.style.visibility = ""; cell.on = true; }
      }
    }
    /** 가운데 칸이 바뀌었으면 알린다(한 칸에 한 번) */
    function checkStep() {
      const cur = Math.round(pos);
      if (cur === last) return;
      last = cur;
      if (!exists(cur)) return;
      aria();
      if (o.onStep) o.onStep(by);
    }
    /** 멈출 칸에 닿았다(스프링이 다 가라앉기 전에 한 번 알린다: 버튼이 늦지 않게 켜진다) */
    function land() {
      if (landed) return; landed = true;
      if (valueAt(target) > limit) return;      // 없는 날이면 되굴린 뒤에 알린다
      if (o.onLand) o.onLand(by);
    }
    function rest() {
      mode = "rest"; vel = 0; halt();
      if (cyclic) { const p = mod(pos, n); if (p !== pos) { pos = p; last = Math.round(pos); cells.forEach((c) => { c.idx = null; }); } }
      target = pos; paint();
      const v = valueAt(Math.round(pos));
      if (v > limit) { by = "auto"; go(Math.round(pos) - (v - limit)); return; }      // 없는 날(2월 30일…)에 멈췄으면 그 달의 마지막 날로 되굴린다
      aria(); land();
      if (o.onRest) o.onRest(by);
    }
    function tick(dt) {
      if (mode === "free") {
        vel *= Math.exp(-dt / coast); pos += vel * dt;
        if (!cyclic && (pos < -0.4 || pos > n - 0.6)) { target = pos < 0 ? 0 : n - 1; vel = clamp(vel, -6, 6); mode = "spring"; }
        else if (Math.abs(vel) < SLOW) { target = nearestOf(pos + vel * 0.1); mode = "spring"; }
      } else if (mode === "spring") {
        for (let t = dt; t > 0; t -= 1 / 240) { const h = Math.min(t, 1 / 240); vel += (-K * (pos - target) - DAMP * vel) * h; pos += vel * h; }
        if (Math.abs(pos - target) < 0.006 && Math.abs(vel) < 0.08) { pos = target; checkStep(); rest(); return; }
        if (Math.abs(pos - target) < 0.07) land();
      } else return;
      checkStep(); paint();
    }
    /** 그 칸으로 굴러가 멈춘다 */
    function go(to) {
      target = to; landed = false;
      if (reduced()) { pos = to; vel = 0; checkStep(); rest(); return; }
      const far = to - pos;
      if (Math.abs(far) > 10) { pos = to - Math.sign(far) * 10; last = Math.round(pos); }      // 멀면 열 칸 앞에서부터 굴린다
      mode = "spring"; aria(); run();
    }
    function nudge(steps, who = "user") {
      by = who; stepping = true;
      const from = mode === "spring" ? target : Math.round(pos);
      let to = from + steps;
      if (!cyclic) {
        const c = clamp(to, 0, n - 1);
        if (c === clamp(from, 0, n - 1)) { if (!reduced()) { vel += Math.sign(steps) * 3.4; target = c; mode = "spring"; run(); } return; }      // 끝에서 더 가려 하면 살짝 밀렸다 돌아온다
        to = c;
      } else { const dir = Math.sign(steps) || 1; for (let g = 0; g < n && valueAt(to) > limit; g++) to += dir; }      // 없는 날은 건너뛴다
      go(to);
    }
    function setValue(v, who = "user") {
      by = who; stepping = true; v = clamp(v, min, limit);
      const from = mode === "spring" ? target : nearest();
      go(from + (v - valueAt(from)));
    }
    /** 숫자 적기: 자릿수가 다 차거나 더 올 숫자가 없으면 바로, 아니면 잠깐 기다렸다가 정한다 */
    function type(ch) {
      clearTimeout(typedTimer);
      typed += ch;
      if (typed.length >= digits || parseInt(typed, 10) * 10 > max) finishTyped(true);
      else typedTimer = ctx.later(() => finishTyped(false), 1300);
    }
    function finishTyped(full) {
      clearTimeout(typedTimer);
      const s = typed; typed = "";
      if (!s) return;
      let v = parseInt(s, 10);
      if (digits === 4) {
        if (s.length === 3) return;
        if (s.length <= 2) { v += Math.floor(max / 100) * 100; if (v > max) v -= 100; }      // 두 자리 해: 99 → 1999, 05 → 2005
      } else if (v < min) return;
      setValue(v, "user");
      if (o.onTyped) o.onTyped(full);
    }

    // 끌기 · 튕기기 · 누르기
    ctx.on(box, "pointerdown", (e) => {
      if (e.button) return;
      // 빠르게 구르던 릴은 손끝에서 멈춘다. 한 칸씩 넘기는 중이면(톡톡 잇달아 누를 때) 멈추지 않고 다음 누름을 한 칸으로 받는다
      const p = ctx.point(e), caught = mode === "free" || (mode === "spring" && !stepping && Math.abs(target - pos) > 1.2);
      drag = { id: e.pointerId, y0: p.y, pos0: pos, moved: false, caught, trail: [[performance.now(), pos]] };
      try { box.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 된다 */ }
      if (caught) { mode = "held"; vel = 0; halt(); }
      box.classList.add("is-held");
      if (o.onGrab) o.onGrab();
    });
    ctx.on(box, "pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = ctx.point(e);
      if (!drag.moved) {
        if (Math.abs(p.y - drag.y0) < 6) return;
        drag.moved = true; drag.y0 = p.y; drag.pos0 = pos; by = "user"; mode = "held"; stepping = false; landed = false; vel = 0;
        halt();
      }
      let raw = drag.pos0 - (p.y - drag.y0) / PITCH;
      if (!cyclic) {      // 끝에서는 고무줄처럼 조금만 딸려 온다
        const band = (x) => 0.45 * (1 - 1 / (x * 1.2 + 1));
        if (raw < 0) raw = -band(-raw); else if (raw > n - 1) raw = n - 1 + band(raw - (n - 1));
      }
      pos = raw;
      drag.trail.push([performance.now(), pos]); if (drag.trail.length > 8) drag.trail.shift();
      checkStep(); paint();
    });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      box.classList.remove("is-held");
      try { box.releasePointerCapture(e.pointerId); } catch { /* 이미 놓였다 */ }
      if (!d.moved) {
        if (d.caught || e.type === "pointercancel") { if (mode === "held") { by = "user"; go(nearest()); } }
        else {
          const rel = (ctx.point(e).y - ctx.center(box).y) / height + 0.5;      // 릴 안에서 누른 높이(0 = 위 끝, 1 = 아래 끝)
          if (rel < 0.36) nudge(-1); else if (rel > 0.64) nudge(1); else if (o.onConfirm) o.onConfirm(false);
        }
      } else {
        const now = performance.now(), lastT = d.trail[d.trail.length - 1][0];
        let v = 0;
        if (e.type !== "pointercancel" && now - lastT < 90) {      // 놓기 직전 0.1초의 속도
          const old = d.trail.find((t) => now - t[0] <= 110) || d.trail[0];
          if (now - old[0] > 8) v = ((pos - old[1]) / (now - old[0])) * 1000;
        }
        vel = clamp(v, -56, 56); by = "user"; landed = false;
        if (reduced()) go(nearest());
        else {
          if (Math.abs(vel) < SLOW || (!cyclic && (pos < 0 || pos > n - 1))) { vel = clamp(vel, -6, 6); target = nearestOf(pos + vel * 0.1); mode = "spring"; }
          else mode = "free";
          run();
        }
      }
      if (o.onDrop) o.onDrop();
    };
    ctx.on(box, "pointerup", release); ctx.on(box, "pointercancel", release);
    // 바퀴(트랙패드): 36px마다 한 칸
    let wheelAcc = 0, wheelAt = 0;
    ctx.on(box, "wheel", (e) => {
      e.preventDefault();
      const now = performance.now(); if (now - wheelAt > 240) wheelAcc = 0; wheelAt = now;
      wheelAcc += e.deltaMode === 1 ? e.deltaY * 36 : e.deltaY;
      const steps = Math.trunc(wheelAcc / 36);
      if (steps) { wheelAcc -= steps * 36; nudge(clamp(steps, -3, 3)); }
    }, { passive: false });
    ctx.on(box, "keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key;
      if (k === "ArrowUp") nudge(1);
      else if (k === "ArrowDown") nudge(-1);
      else if (k === "PageUp") nudge(page);
      else if (k === "PageDown") nudge(-page);
      else if (k === "Home") setValue(min);
      else if (k === "End") setValue(limit);
      else if (/^[0-9]$/.test(k)) type(k);
      else if (k === "Backspace") { typed = ""; clearTimeout(typedTimer); }
      else if (k === "Enter" || k === " ") { if (typed) finishTyped(false); else if (o.onConfirm) o.onConfirm(k === "Enter"); }
      else if ((k === "ArrowLeft" || k === "ArrowRight") && o.onSide) o.onSide(k === "ArrowRight" ? 1 : -1);
      else return;
      e.preventDefault();
    });
    ctx.on(box, "blur", () => { if (typed) finishTyped(false); });

    paint(); aria();
    return {
      el: box,
      /** 지금 가운데 보이는 값 */
      get value() { return valueAt(nearest()); },
      /** 멈출 값(끌려가는 중이면 가려는 칸). 없는 날이면 그 달의 마지막 날 */
      get landing() { return Math.min(valueAt(mode === "spring" ? target : nearest()), limit); },
      get moving() { return mode !== "rest" || Boolean(drag); },
      /** 멈출 칸이 정해졌는지(손에 잡혀 있거나 관성으로 구르는 중이면 아직 모른다) */
      get settled() { return !drag && (mode === "rest" || mode === "spring"); },
      nudge, setValue,
      /** 달의 실제 일수만 순환한다. 연·월 변경 시 기존 날짜를 유지하거나 말일로 보정한다. */
      setLimit(v) {
        if (v === limit) return;
        const current = valueAt(nearest());
        const destination = valueAt(mode === "spring" ? target : nearest());
        limit = v;
        n = limit - min + 1;
        pos = Math.min(current, limit) - min;
        target = Math.min(destination, limit) - min;
        last = Math.round(pos);
        cells.forEach((c) => { c.idx = null; });
        if (drag) { drag.pos0 = pos; drag.trail = [[performance.now(), pos]]; }
        if (!drag && mode !== "rest") { mode = "spring"; vel = 0; run(); }
        paint(); aria();
      },
      /** 바로 멈춘다(버튼을 누른 순간 구르던 릴) */
      settle() {
        if (drag) { try { box.releasePointerCapture(drag.id); } catch { /* 놓였다 */ } drag = null; box.classList.remove("is-held"); }
        if (typed) { typed = ""; clearTimeout(typedTimer); }
        if (mode === "rest") return;
        let to = mode === "spring" ? target : nearest();
        if (valueAt(to) > limit) to -= valueAt(to) - limit;
        pos = cyclic ? mod(to, n) : to; vel = 0; mode = "rest"; landed = true; halt();
        last = Math.round(pos); target = pos; cells.forEach((c) => { c.idx = null; }); paint(); aria();
      },
      /** 들어올 때: rows칸 앞에서 굴러 들어온다 */
      intro(rows, ms) {
        const home = pos;
        pos = home - rows; last = Math.round(pos); paint();
        ctx.later(() => { if (mode === "rest" && !drag && pos === home - rows) { by = "intro"; go(home); } }, ms);
      },
      /** 굴릴 수 있다는 눈짓: 살짝 밀렸다 돌아온다 */
      hint(dir = 1) { if (mode !== "rest" || drag || reduced()) return; by = "intro"; vel = dir * 6.4; target = pos; landed = true; mode = "spring"; run(); },
    };
  }

  /* ───────────────────────── 장면 ───────────────────────── */
  HP.addScene({
    id: "birthday", field: "yellow", states: ["idle", "set", "under14"],
    build(ctx) {
      const { el: root, copy: C } = ctx, A = C.about;
      const today = new Date(), Y1 = today.getFullYear(), Y0 = Y1 - 100;
      let touched = false, state = "idle", card = null, lastTick = 0;

      // 처음 보여 줄 날짜: 손대기 전의 자리(아직 정하지 않은 날짜) · 바로 가기 상태 · 돌아왔을 때 골랐던 날짜
      const stored = /(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(ctx.data.answers.birth || "");
      let init = { y: Y1 - 26, m: 1, d: 1 }, preset = false;
      if (ctx.state === "set") { init = { y: 1999, m: 1, d: 1 }; preset = true; }
      else if (ctx.state === "under14") { init = { y: Y1 - 10, m: today.getMonth() + 1, d: today.getDate() }; preset = true; }
      else if (ctx.state == null && stored) { init = { y: +stored[1], m: +stored[2], d: +stored[3] }; preset = true; }
      init.y = clamp(init.y, Y0, Y1); init.m = clamp(init.m, 1, 12); init.d = clamp(init.d, 1, daysIn(init.y, init.m));

      // 아래 버튼 위에는 고양이가 있으므로 쪽 표시는 위 줄에. 뒤로 갈 때도 구르던 릴을 멈추고 그 날짜를 적어 둔다(돌아오면 그대로 있다)
      root.append(ui.topbar(ctx, { pages: true, back: (b) => { commit(); ctx.back(b); } }));

      // 제목: "○○의 [생일]은 / 언제예요?" — 정하고 나면 끝 줄의 "언제예요?"가 고른 날짜로 바뀐다. 긴 이름은 이름만 한 줄을 차지한다
      const words = A.birth(ctx.data.nickname).split(" ");
      const askWord = words.pop() || "", dayWord = words.pop() || "", who = words.join(" ");
      const pill = ui.pill({ text: "생일", dot: "star", headline: true });
      pill.classList.add("hp-bd-pill");
      pill.querySelector(".hp-pill-dot").innerHTML = CAKE;
      const ask = el("span", "hp-bd-ask", askWord), said = el("span", "hp-bd-date");
      said.setAttribute("aria-hidden", "true");
      const dayLine = ui.swap(dayWord, "생일", pill);
      const why = el("p", "hp-note hp-bd-why hp-rise", A.why); why.id = "hp-bd-why"; why.style.setProperty("--i", 2);
      const head = ui.block("hp-head hp-bd-head", { top: 88 });
      root.append(head);
      const title = (wide) => {
        const t = ui.headline(wide ? [[el("span", "hp-bd-who", who)], dayLine, [ask, said]] : [[who + " ", ...dayLine], [ask, said]], wide ? { size: 36 } : {});
        t.lastElementChild.classList.add("hp-bd-swap"); head.replaceChildren(t, why);
        return t;
      };
      // 먼저 두 줄로 짜 보고, 첫 줄이 넘치면(긴 이름) 세 줄로 다시 짠다. 글꼴이 아직 안 왔으면 조금 넉넉하게 본다
      let h = title(false);
      const loaded = !document.fonts || !document.fonts.check || document.fonts.check('500 42px "Gothic A1"', who);
      const line = h.firstElementChild; line.style.display = "inline-block";      // 잠깐 글자 너비만큼만 차지하게 해서 잰다
      const long = line.offsetWidth > head.clientWidth - (loaded ? 2 : 12);
      line.style.display = "";
      if (long) h = title(true);
      /** 긴 이름: 한 줄에 들어갈 때까지 글자를 줄인다 */
      const fitWho = () => { const w = h.querySelector(".hp-bd-who"); if (!w || !w.isConnected) return; let px = 36; w.style.fontSize = ""; while (px > 20 && w.scrollWidth > head.clientWidth) { px -= 1; w.style.fontSize = px + "px"; } };
      fitWho(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWho);
      const shift = long ? Math.max(0, head.offsetHeight - 138) : 0;      // 세 줄 제목이면 그만큼 아래로

      const REELS_TOP = 246 + shift, REEL_H = 160;
      // Figma 492:89 (393×852)의 원본 이미지와 하단 그라데이션.
      // 동일한 2배 해상도 원본에 Figma 투명 이미지의 마스크를 사용한다.
      const cat = el("div", "hp-bd-art"); cat.setAttribute("aria-hidden", "true");
      const image = el("img", "hp-bd-art-image");
      image.src = "/characters/black-cat-final.png";
      image.alt = ""; image.draggable = false;
      image.width = 3396; image.height = 1852;
      cat.append(image, el("div", "hp-bd-art-fade"));
      root.append(cat);

      // 릴 세 개: "[년]년 [월]월 [일]일"
      const group = el("div", "hp-bd-reels hp-rise"); group.style.top = REELS_TOP + "px"; group.style.setProperty("--i", 3);
      group.setAttribute("role", "group"); group.setAttribute("aria-label", A.birthLabel); group.setAttribute("aria-describedby", why.id);
      const defs = [
        { unit: A.units.y, min: Y0, max: Y1, value: init.y, page: 10, digits: 4, coast: 0.5, cls: "is-year" },      // 해는 백 칸이라 한 번 튕기면 더 멀리 구른다
        { unit: A.units.m, min: 1, max: 12, value: init.m, page: 3, cyclic: true },
        { unit: A.units.d, min: 1, max: 31, value: init.d, page: 7, cyclic: true },
      ];
      const reels = defs.map((d, i) => {
        const r = makeReel(ctx, {
          ...d, height: REEL_H, label: `${A.birthLabel} ${d.unit}`,
          onStep: (by) => stepped(i, by),
          onLand: (by) => landedOn(i, by),
          onConfirm: (enter) => { touch(i); if (allSettled()) evaluate(false); if (enter) focusNext(i); },
          onTyped: (full) => { touch(i); if (full) focusNext(i, true); },
          onSide: (dir) => { const t = reels[i + dir]; if (t) t.el.focus({ preventScroll: true }); },
        });
        const unit = el("span", "hp-bd-unit", d.unit); unit.setAttribute("aria-hidden", "true");
        group.append(r.el, unit);
        return r;
      });
      const [ry, rm, rd] = reels;
      root.append(group);
      ui.afterTitle(ctx, head, top => { group.style.top = top + "px"; root.style.setProperty("--bd-content-shift", (top - REELS_TOP) + "px"); });

      /** 구르던 릴을 그 자리에서 멈추고, 그 날짜로 상태를 맞춘다(장면을 떠나기 직전) */
      const commit = () => { reels.forEach((r) => r.settle()); rd.setLimit(daysIn(ry.landing, rm.landing), true); evaluate(true); };
      const cta = ui.cta({ label: A.next, disabled: true, onPress: () => { commit(); if (state === "set") ctx.next(cta); } });
      root.append(cta);

      const allRest = () => reels.every((r) => !r.moving);
      const allSettled = () => reels.every((r) => r.settled);
      const dateOf = (landing) => { const y = landing ? ry.landing : ry.value, m = landing ? rm.landing : rm.value; return { y, m, d: Math.min(landing ? rd.landing : rd.value, daysIn(y, m)) }; };
      const show = () => { const t = dateOf(false); said.textContent = A.format(t.y, t.m, t.d); };
      const focusNext = (i, reelOnly) => { const t = reels[i + 1]; if (t) t.el.focus({ preventScroll: true }); else if (!reelOnly && !cta.disabled) cta.focus({ preventScroll: true }); };

      /** 처음 손댄 순간: 빈 알약이 검정으로 차오르고(손댄 것부터 차례로) 날짜가 제목에 적힌다 */
      function touch(i, instant) {
        if (touched) return; touched = true;
        root.classList.add("is-touched");
        said.removeAttribute("aria-hidden"); ask.setAttribute("aria-hidden", "true");
        reels.forEach((r, n) => { const d = instant || reduced() ? 0 : Math.abs(n - i) * 70; if (d) ctx.later(() => r.el.classList.add("is-on"), d); else r.el.classList.add("is-on"); });
        show();
      }
      function stepped(i, by) {
        if (by !== "intro") {
          const now = performance.now();
          if (now - lastTick > 34) { lastTick = now; sfx("slot"); }      // 한 칸에 한 번 "틱"(아주 빠르게 구를 때는 조금 솎는다)
        }
        if (by === "user") touch(i);
        if (i < 2) rd.setLimit(daysIn(ry.value, rm.value));
        if (touched) show();
      }
      function landedOn(i, by) {
        if (i < 2) rd.setLimit(daysIn(ry.landing, rm.landing));      // 해 · 달이 정해지면 그 달의 날 수에 맞춘다(넘는 날에 있었으면 마지막 날로 되굴린다)
        if ((by !== "intro" || touched) && allSettled()) evaluate(false);      // 들어오며 구르는 동안 다른 릴에 손댔다면, 다 굴러온 날짜로 다시 맞춘다
      }

      /** 화면 읽기 프로그램에 한 번 알린다(phone.js의 알림 자리) */
      const say = (text) => { const hp = root.closest(".hp"), live = hp && hp.querySelector(".hp-live"); if (live) live.textContent = text; };
      /** 공통 Dialog와 같은 네이티브 모달: 배경 입력 차단, Escape, 포커스 복귀. */
      function notice() {
        if (card) return;
        const close = el("button", "hp-bd-modal-close", A.under14.close);
        close.type = "button";
        close.autofocus = true;
        const title = el("strong", "hp-bd-modal-title", A.under14.title);
        card = el("dialog", "hp-bd-modal", title, close);
        card.setAttribute("aria-label", A.under14.title);
        const modal = card;
        ctx.on(close, "click", () => unnotice());
        ctx.on(modal, "cancel", (event) => { event.preventDefault(); unnotice(); });
        root.append(modal);
        ctx.later(() => {
          if (card !== modal || !modal.isConnected) return;
          modal.showModal();
          close.focus({ preventScroll: true });
        }, 0);
      }
      function unnotice() {
        const old = card; card = null;
        if (!old) return;
        if (old.open) old.close();
        old.remove();
      }
      ctx.onDestroy(unnotice);

      /** 멈출 날짜가 정해질 때마다: 날짜를 적어 두고(만 14세 미만이면 지우고) 상태를 맞춘다 */
      function evaluate(instant) {
        if (!touched) return;
        const t = dateOf(true), text = A.format(t.y, t.m, t.d);
        const next = A.age(t.y, t.m, t.d) < 14 ? "under14" : "set";
        if (allRest()) said.textContent = text;
        if (next === "set") { if (ctx.data.answers.birth !== text) ctx.set({ answers: { birth: text } }); }
        else if (ctx.data.answers.birth != null) ctx.set({ answers: { birth: null } });
        const quiet = instant || reduced();
        if (next === state) return;
        state = next; root.dataset.state = next;
        cta.disabled = next !== "set";
        if (next === "under14") { notice(quiet); return; }
        if (card) { unnotice(quiet); say(text); }
      }

      // 처음 상태
      if (preset) { touch(1, true); rd.setLimit(daysIn(init.y, init.m), true); evaluate(true); }
      if (!ctx.instant) {
        // 릴만 몇 칸 굴러 들어와 멈춘다. 고양이는 움직이지 않는다.
        if (!preset) {
          reels.forEach((r, i) => r.intro([4, 3, 5][i], 420 + i * 110));
          // 굴릴 수 있다는 눈짓: 손대기 전까지 가끔 릴 하나가 살짝 밀렸다 돌아온다
          let n = 0;
          const wink = () => { if (touched || !root.isConnected) return; if (allRest()) { reels[n % 3].hint(n % 2 ? -1 : 1); n++; } ctx.later(wink, 4200); };
          ctx.later(wink, 3000);
        }
      }
    },
  });
})();
