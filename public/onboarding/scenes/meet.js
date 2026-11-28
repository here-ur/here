/* 고양이는 등장하면 걸어오고, 이름 짓기는 냥줍하기 버튼으로 시작한다. */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP || !HP.ui) return;
  const ui = HP.ui, { el, lerp, clamp, reduced } = ui;

  const X = 195;
  const FAR = { h: 192, ground: 514, y: 418, r: 116 };
  const NEAR = { h: 283, ground: 687, y: 552, r: 175 };
  /** 고양이의 첫마디를 줄로 나눈다: 두 문장이면 문장 끝에서, 아니면 마지막 낱말 앞에서(두 낱말뿐이면 한 줄). */
  function headLines(text) {
    const t = String(text).trim(), m = /^(.*?[.?!])\s+(.+)$/.exec(t);
    if (m) return [m[1], m[2]];
    const words = t.split(" ");
    return words.length >= 3 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [t];
  }
  HP.addScene({
    id: "meet", field: "orange", states: ["idle", "tough"],
    build(ctx) {
      const { el: root, copy: C } = ctx, M = C.meet;
      const answers = ctx.state === "tough" ? { ...ctx.data.answers, lately: C.TOUGH } : ctx.data.answers;
      const tough = answers.lately === C.TOUGH;
      const scale = () => (ctx.root.getBoundingClientRect().width || ui.W) / ui.W;
      root.classList.toggle("is-tough", tough);
      root.dataset.state = tough ? "tough" : "idle";

      const bar = ui.topbar(ctx, { pages: true });

      /* ── 첫마디(큰 제목). 맨 앞의 "…"는 줄 안의 검정 알약 = 점 세 개(말을 고르는 중) ── */
      const rows = headLines(M.line(answers));
      const dots = ui.pill({ content: [0, 1, 2].map((n) => { const d = el("i"); d.style.setProperty("--n", n); return d; }), dot: "badgeChat" });
      dots.classList.add("hp-meet-dots");
      dots.dataset.say = "…"; dots.setAttribute("aria-hidden", "true");
      const hLine = ui.headline(rows.map((r, i) => (i === 0 && r.startsWith("…") ? [dots, r.slice(1)] : r)), { typed: true });
      const sub = tough ? null : el("p", "hp-body hp-meet-sub", M.eyebrow);
      const head = ui.block("hp-head hp-meet-head", { top: 88 }, hLine, sub);

      /* ── 고양이의 자리(라일락 덩어리) · 고양이까지의 길(점 셋) · 고양이 ── */
      const spot = ui.shape(ctx, { color: "var(--hp-lilac)", shape: [], x: X, y: FAR.y, r: FAR.r });
      spot.el.classList.add("hp-meet-spot");
      const path = el("div", "hp-meet-path"); path.setAttribute("aria-hidden", "true");
      if (!tough) [[568, 7], [608, 10], [652, 14]].forEach(([y, s], n) => { const d = el("i"); d.style.cssText = `left:${X - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;--n:${n}`; path.append(d); });
      root.append(bar, head, path, spot.el);
      const cat = ctx.cat({ x: X, ground: FAR.ground, h: FAR.h }, { poke: !tough });      // 차분한 장면에서는 콕 눌러도 반짝이가 튀지 않는다
      const body = cat.el.querySelector(".hc-body");
      const walk = el("video", "hp-meet-walk");
      walk.src = "/characters/reactions/meet-walk-front-v1.webm";
      walk.poster = "/characters/reactions/meet-walk-front-v1.png";
      walk.muted = true; walk.playsInline = true; walk.preload = "auto";
      const firstFrame = el("img", "hp-meet-first-frame");
      firstFrame.alt = "";
      firstFrame.src = walk.poster;
      body.append(firstFrame, walk);
      // 하트 하나 · 반짝이 둘(많이 힘든 날에는 두지 않는다). [종류, 모양, 멀리 있을 때의 자리, 곁에 왔을 때의 자리]
      const MARKS = tough ? [] : [
        ["heart", { s: 40, r: 10, float: true }, [316, 318], [352, 380]],
        ["sparkle", { s: 26, r: -12, twinkle: true, d: 400 }, [68, 366], [34, 406]],
        ["sparkle", { s: 16, r: 8, twinkle: true, d: 1200 }, [322, 492], [356, 702]],
      ];
      const marks = MARKS.map(([kind, o, far], n) => { const m = ui.mark(kind, { ...o, x: far[0], y: far[1], pop: !ctx.instant, d: ctx.instant ? o.d : 820 + n * 110 }); root.append(m); return m; });

      const pickup = ui.cta({ label: M.cta, onPress: () => ctx.next(pickup) });
      root.append(pickup);

      function fitText() {
        // 첫마디가 한 줄에 다 들어오게(문구가 길어졌을 때만 줄어든다)
        let px = 42; hLine.style.fontSize = "";
        const wide = () => Array.from(hLine.children).some((l) => l.lastElementChild && (l.lastElementChild.getBoundingClientRect().right - l.getBoundingClientRect().left) / scale() > head.clientWidth - 12);      // 오른쪽에도 왼쪽만큼(28px) 비운다
        while (px > 30 && wide()) { px -= 1; hLine.style.fontSize = px + "px"; }
      }

      function positionCat(progress) {
        const h = Math.exp(lerp(Math.log(FAR.h), Math.log(NEAR.h), progress));
        cat.place({ x: X, ground: lerp(FAR.ground, NEAR.ground, progress), h });
        spot.set({ y: lerp(FAR.y, NEAR.y, progress), r: lerp(FAR.r, NEAR.r, progress) });
        marks.forEach((mark, i) => {
          const [, , far, near] = MARKS[i];
          mark.style.setProperty("--x", lerp(far[0], near[0], progress).toFixed(1));
          mark.style.setProperty("--y", lerp(far[1], near[1], progress).toFixed(1));
        });
      }

      let stopTracking;
      ctx.on(walk, "playing", () => {
        cat.el.classList.add("is-walking-video");
        if (!stopTracking) stopTracking = ctx.loop(() => {
          if (Number.isFinite(walk.duration) && walk.duration > 0) {
            positionCat(clamp(walk.currentTime / walk.duration, 0, 1));
          }
        });
      });
      ctx.on(walk, "pause", () => { stopTracking?.(); stopTracking = null; });
      ctx.on(walk, "ended", () => positionCat(1));

      if (!reduced()) {
        const play = () => walk.play().catch(() => {}); // 재생이 제한된 환경에서는 첫 프레임을 보여 준다.
        if (typeof IntersectionObserver === "function") {
          const visible = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            visible.disconnect();
            play();
          });
          visible.observe(root);
          ctx.onDestroy(() => visible.disconnect());
        } else {
          play();
        }
      }
      ctx.onDestroy(() => { walk.pause(); walk.removeAttribute("src"); walk.load(); });

      fitText();
      document.fonts?.ready.then(() => { if (root.isConnected) fitText(); });
      if (ctx.instant) { hLine.finish(); }
      else {
        dots.classList.add("is-on", "is-set", "is-thinking");
        if (sub) { sub.classList.add("hp-rise"); sub.style.setProperty("--d", "1500ms"); }
        hLine.play({ speed: 46, delay: 940 }).then(() => dots.classList.remove("is-thinking"));
      }
    },
  });
})();
