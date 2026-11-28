/* ═════════════════════════ 장면: gender (주황) ═════════════════════════
 * 성별. 가볍고 빠르게: 동전 하나를 누르면 끝난다.
 * 두 가지 답은 똑같은 흰 동전이다(색으로 성별을 나누지 않는다).
 * 고양이는 라일락 동그라미 앞에서 그 동전들 위에 길게 누워 있다(동전 둘은 이따금 차례로 톡톡 뛰고, 그 위의 고양이도 같이 들썩인다).
 * 동전을 누르면 고양이가 벌떡 일어나 앉고, 눌린 동전은 톡 튀어 올라 뒤집히며 검정 + 체크가 되고,
 * 그 말이 포물선을 그리며 제목 줄의 검정 알약으로 날아가 담긴다(다른 동전을 누르면 다시 고른다).
 * 고양이의 반응은 어느 답이든 같다(평가하지 않는다): 고른 동전 쪽으로 몸이 살짝 기울 뿐이다.
 * 참고: tone-1(주황 색면 · 큰 제목과 줄 안의 검정 알약 · 캐릭터 뒤의 색 덩어리 · 하트와 반짝이 · 쪽 표시 · 검정 알약 버튼),
 *       동그란 보기와 "고르면 속이 찬다"는 interaction-1-howwefeel-ring(가운데 화면)
 */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP) return;
  const ui = HP.ui, el = ui.el;

  const SEAM = 8, FRAME_MS = 42, REST_MS = 520;      // 영상 끝의 이음매 프레임 수 · 한 프레임의 길이 · 양 끝에서 머무는 시간
  /** 누운 자세로 세운다. 고양이 배우의 glare는 반복 영상인데 끝의 여덟 프레임이 처음과 겹쳐 녹아드는 이음매라(머리와 꼬리가 두 겹으로 보인다)
   *  영상을 그대로 돌리지 않는다. 그 자리에 캔버스를 두고 첫 프레임을 그린다(픽셀을 읽지 않으므로 file://에서도 된다). 자리와 크기는 배우가 잡은 그대로다.
   *  alive면, 프레임을 하나씩 풀 수 있는 브라우저(ImageDecoder)에서는 이음매를 뺀 프레임을 앞으로 갔다 뒤로 돌아오며 그린다(겹쳐 보이는 프레임 없이 움직인다).
   *  풀 수 없으면(사파리 · file://) 첫 프레임 그대로 숨만 쉰다. ready()는 첫 그림이 그려진 뒤에 한 번 불린다. loop = ctx.loop(장면과 함께 멈춘다). → 치우는 함수 */
  function lounge(actor, { ready, alive, loop } = {}) {
    actor.pose("glare");
    const img = actor.el.querySelector(".hc-img"), url = img.getAttribute("src");
    img.removeAttribute("src");
    const cv = el("canvas", "hp-gd-frame"); cv.setAttribute("aria-hidden", "true"); cv.width = cv.height = 2;
    for (const k of ["left", "top", "width", "height"]) cv.style[k] = img.style[k];
    img.after(cv);
    const g = cv.getContext("2d"), im = new Image();
    let dead = false, stop = null, frames = [];
    const clear = () => { dead = true; if (stop) stop(); frames.forEach((f) => f.close()); frames = []; im.onload = null; cv.remove(); delete actor.el.dataset.alive; };
    im.onload = () => {
      if (dead || !cv.isConnected) return;
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      g.drawImage(im, 0, 0);
      if (ready) ready();
      if (alive && loop) unpack().catch(() => {});
    };
    im.src = url;

    async function unpack() {
      const where = new URL(im.currentSrc || im.src);      // 그림이 실제로 받아진 주소
      if (typeof ImageDecoder !== "function" || typeof createImageBitmap !== "function" || !/^(https?|data|blob):$/.test(where.protocol)) return;
      if (!(await ImageDecoder.isTypeSupported("image/webp"))) return;
      const res = await fetch(where.href);
      if (!res.ok || dead) return;
      const dec = new ImageDecoder({ data: await res.arrayBuffer(), type: "image/webp" });
      try {
        await dec.tracks.ready;
        const last = dec.tracks.selectedTrack.frameCount - SEAM - 1, got = [];
        for (let i = 0; i <= last && !dead && cv.isConnected; i++) {
          const { image } = await dec.decode({ frameIndex: i });
          try { got.push(await createImageBitmap(image)); } finally { image.close(); }
        }
        if (dead || !cv.isConnected || got.length < 12) { got.forEach((f) => f.close()); return; }
        frames = got;
      } finally { dec.close(); }
      // 앞으로 갔다가(끝에서 잠깐 머물고) 뒤로 돌아온다(처음에서도 잠깐 머문다)
      const n = frames.length, rest = Math.round(REST_MS / FRAME_MS), lap = 2 * (n - 1 + rest), t0 = performance.now();
      let shown = 0;
      actor.el.dataset.alive = "1";
      stop = loop((dt, now) => {
        if (dead) return;
        if (!cv.isConnected) { clear(); return; }
        const k = Math.floor(Math.max(0, now - t0) / FRAME_MS) % lap;      // 프레임의 시각은 t0보다 조금 이를 수 있다
        const f = k < n ? k : k < n + rest ? n - 1 : k < 2 * n - 1 + rest ? 2 * (n - 1) + rest - k : 0;
        if (f !== shown && frames[f]) { shown = f; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(frames[f], 0, 0); }
      });
    }
    return clear;
  }

  HP.addScene({
    id: "gender", field: "orange", states: ["idle", "chosen"],
    build(ctx) {
      const { el: root, copy: C } = ctx, A = C.about;
      // 누운 그림은 원본이 작아서(493px) h 200까지만 쓴다(open의 자는 영상과 같은 배율). 일어나 앉은 그림은 고해상도라 더 크게 쓴다.
      const LOUNGE = { x: 184, ground: 600, h: 200 }, SIT = { x: 195, ground: 564, h: 282 };
      const SPOT = { x: 195, y: 490, r: 156, m: 0 }, SPOT_UP = { x: 195, y: 450, r: 170, m: 1 };
      const before = A.genders.indexOf(ctx.data.answers.gender);
      const initial = ctx.state === "chosen" ? 0 : ctx.state == null ? before : -1;      // 처음부터 골라져 있는 답(바로가기 · 돌아왔을 때)
      let choice = -1, seq = 0, unlounge = null;

      root.append(ui.topbar(ctx));

      // 제목: "성별도 [알약]" / "알려 줄래요?" + 그 아래 본문 한 줄. 알약은 고르기 전에는 빈 동그라미 셋, 고르면 그 말 + 체크
      const [l1, l2] = ui.lines(A.gender, [1, 2]);
      const slot = el("span", "hp-gd-slot"); slot.setAttribute("aria-hidden", "true");      // 고른 답은 동전(라디오)의 상태로 읽힌다
      const waiting = ui.pill({ content: [el("i"), el("i")] });
      waiting.classList.add("hp-gd-wait"); slot.append(waiting);
      const title = ui.headline([[l1 + " ", slot], l2]);
      const why = el("p", "hp-body hp-rise hp-gd-why"); why.id = "hp-gd-why"; why.style.setProperty("--i", 2);
      A.genderWhy.split(" · ").forEach((part, n) => { if (n) why.append(el("i", "", "·")); why.append(part); });      // 가운뎃점 양옆을 조금 띄운다(문구는 그대로)
      const head = ui.block("hp-head hp-gd-head", { top: 88 }, title, why);
      root.append(head);

      // 고양이 뒤의 라일락 덩어리: 동그라미 → 고르면 다섯 갈래의 말랑한 덩어리로 통 튄다(참고 이미지의 라일락 화면에 있는 덩어리 모양)
      const spot = ui.shape(ctx, { color: "var(--hp-lilac)", shape: [[5, 0.085, -90]], ...SPOT });
      root.append(spot.el);
      if (!ctx.instant && initial < 0) spot.set({ r: 96 }).to(SPOT);

      // 하트·반짝이(참고 이미지의 작은 표시). [종류, 모양, 누워 있을 때의 자리, 앉은 뒤의 자리]
      const MARKS = [["heart", { s: 40, r: 10, float: true }, [334, 306], [346, 276]], ["sparkle", { s: 26, r: -12, twinkle: true, d: 400 }, [46, 362], [36, 352]], ["sparkle", { s: 18, r: 8, twinkle: true, d: 1200 }, [362, 426], [360, 512]]];
      const marks = MARKS.map(([kind, o, at], n) => { const m = ui.mark(kind, { ...o, x: at[0], y: at[1], pop: !ctx.instant, d: ctx.instant ? o.d : 820 + n * 110 }); m.classList.add("hp-gd-mark"); root.append(m); return m; });
      const marksUp = () => marks.forEach((m, n) => { const p = MARKS[n][3]; m.style.setProperty("--x", p[0]); m.style.setProperty("--y", p[1]); });

      // 동전 둘(라디오 묶음: Tab으로 들어와 화살표로 옮기며 고른다. Enter · Space도 된다)
      const group = el("div", "hp-gd-coins"); group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", A.gender); group.setAttribute("aria-describedby", why.id);
      const coins = A.genders.map((label, i) => {
        const words = label.split(" ");
        const rows = words.length > 1 ? [words[0], words.slice(1).join(" ")] : [label];      // "고르지 / 않을래요"
        const disc = el("span", "hp-gd-disc", el("span", "hp-gd-label", rows.map((t) => el("span", "", t))));
        const tick = el("span", "hp-gd-tick", ui.icon("check"));
        const hop = el("span", "hp-gd-hop", disc, tick); hop.style.setProperty("--n", i);      // 고르기 전에는 셋이 차례로 톡톡 뛴다(제목 줄 알약의 동그라미 셋과 같은 박자)
        const b = el("button", "hp-gd-coin", hop);
        b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", "false"); b.setAttribute("aria-label", label);
        b.dataset.sfx = "none";                                    // 고르는 소리(pick)는 이 장면이 직접 낸다
        if (!ctx.instant) { b.classList.add("hp-popin"); b.style.setProperty("--i", i + 3); }
        disc.setAttribute("aria-hidden", "true"); tick.setAttribute("aria-hidden", "true");
        b.disc = disc; b.tick = tick;
        b.addEventListener("click", () => pick(i, false));
        group.append(b);
        return b;
      });
      const rove = () => coins.forEach((c, n) => { c.tabIndex = (choice < 0 ? n === 0 : n === choice) ? 0 : -1; });
      ctx.on(group, "keydown", (e) => {
        const at = coins.indexOf(e.target.closest ? e.target.closest(".hp-gd-coin") : null);
        if (at < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        const to = e.key === "Home" ? 0 : e.key === "End" ? coins.length - 1 : step ? (at + step + coins.length) % coins.length : -1;
        if (to < 0) return;
        e.preventDefault(); coins[to].focus({ preventScroll: true }); pick(to, false);
      });

      const cta = ui.cta({ label: A.next, disabled: initial < 0, pages: ctx, onPress: () => { if (choice >= 0) ctx.next(cta); } });
      root.append(group, cta);

      // 고양이(동전보다 앞에 선다: 누운 채 동전 위에 걸쳐 있다)
      const bob = el("div", "hp-gd-bob"), lay = el("div", "hp-catlayer hp-gd-cat", bob);      // bob = 동전이 뛸 때 그 위에서 같이 들썩이는 겹
      root.append(lay);
      const cat = ctx.cat(initial < 0 ? LOUNGE : SIT, { layer: bob });
      if (initial < 0) {
        const t0 = performance.now();
        // 그림이 준비되면 동전 위로 털썩 내려앉는다(동전이 다 놓인 뒤에)
        unlounge = lounge(cat, { alive: !ctx.instant, loop: ctx.loop, ready: () => { if (ctx.instant || choice >= 0) return; lay.style.animationDelay = Math.max(0, 430 - (performance.now() - t0)).toFixed(0) + "ms"; lay.classList.add("hp-gd-drop"); } });
        if (ctx.onDestroy) ctx.onDestroy(() => { if (unlounge) unlounge(); });      // 장면을 떠나면 풀어 둔 프레임을 바로 내려놓는다
      }

      let faces = null;      // 동전 두 면의 색(토큰에서 읽는다. 처음 뒤집을 때 한 번)
      /** 동전 뒤집기. on = 검정(고른 것)으로. lively면 톡 튀어 오르며 뒤집히고(색은 옆으로 선 순간에 바뀐다), 다 돌아선 뒤에 체크가 통 튀어나온다. */
      function flip(coin, on, lively) {
        coin.classList.toggle("is-on", on); coin.setAttribute("aria-checked", String(on));
        const d = coin.disc, now = performance.now(), fresh = !on && now - (coin.onAt || 0) < 180;      // 방금 눌려 아직 흰 면이 보이는 동전
        coin.onAt = on ? now : 0;
        if (!d.animate) return;
        d.getAnimations().forEach((a) => a.cancel()); coin.tick.getAnimations().forEach((a) => a.cancel());
        if (!lively || fresh || ui.reduced()) return;
        if (!faces) { const t = getComputedStyle(root); faces = { ink: t.getPropertyValue("--hp-ink").trim() || "#131111", white: t.getPropertyValue("--hp-white").trim() || "#fff" }; }
        const INK = faces.ink, WHITE = faces.white;
        const a = on ? { backgroundColor: WHITE, color: INK } : { backgroundColor: INK, color: WHITE }, b = on ? { backgroundColor: INK, color: WHITE } : { backgroundColor: WHITE, color: INK };
        if (on) coin.tick.animate([{ transform: "scale(0)" }, { transform: "scale(1)" }], { duration: 520, delay: 300, easing: ui.ease.spring, fill: "backwards" });
        else coin.tick.animate([{ transform: "scale(1)" }, { transform: "scale(0)" }], { duration: 130, easing: "cubic-bezier(.65,0,.25,1)" });
        if (on) {
          d.animate([
            { transform: "translate3d(0,0,0) scale(1,1)", ...a, offset: 0, easing: "cubic-bezier(.3,0,.6,1)" },
            { transform: "translate3d(0,-24px,0) scale(.03,1.05)", ...a, offset: 0.3 },
            { transform: "translate3d(0,-24px,0) scale(.03,1.05)", ...b, offset: 0.301, easing: "cubic-bezier(.3,0,.7,1)" },
            { transform: "translate3d(0,-10px,0) scale(1.04,1)", ...b, offset: 0.58, easing: "cubic-bezier(.5,0,.8,.6)" },
            { transform: "translate3d(0,0,0) scale(1.08,.92)", ...b, offset: 0.74, easing: "cubic-bezier(.2,.7,.4,1)" },
            { transform: "translate3d(0,0,0) scale(.98,1.03)", ...b, offset: 0.88 },
            { transform: "translate3d(0,0,0) scale(1,1)", ...b, offset: 1 },
          ], { duration: 620 });
        } else {
          d.animate([
            { transform: "scale(1,1)", ...a, offset: 0, easing: "cubic-bezier(.4,0,.8,.6)" },
            { transform: "scale(.03,1)", ...a, offset: 0.45 },
            { transform: "scale(.03,1)", ...b, offset: 0.451, easing: "cubic-bezier(.2,.7,.3,1)" },
            { transform: "scale(1,1)", ...b, offset: 1 },
          ], { duration: 320 });
        }
      }

      /** 고른 말(알약)이 동전에서 포물선을 그리며 제목 줄의 제자리로 날아간다. via = 포물선이 휘는 점(고양이의 얼굴을 가리지 않게 옆으로 돌아간다).
       *  ui.fly와 같은 생각(제자리에 둔 복제본을 옮긴다)이고, 길만 곧지 않다. 무대가 축소돼 있어도 맞는다. → Promise */
      function toss(pill, from, via, duration) {
        const end = ctx.center(pill), w = pill.offsetWidth, h = pill.offsetHeight, N = 18, frames = [];
        const ghost = pill.cloneNode(true);
        ghost.classList.add("hp-ghost"); ghost.setAttribute("aria-hidden", "true");
        ghost.style.cssText = `position:absolute;left:${end.x - w / 2}px;top:${end.y - h / 2}px;margin:0;z-index:40;pointer-events:none`;
        const lean = from.x < end.x ? -1 : 1;
        for (let n = 0; n <= N; n++) {
          const t = n / N, u = 1 - t, s = ui.lerp(0.5, 1, t);
          const x = u * u * from.x + 2 * u * t * via.x + t * t * end.x, y = u * u * from.y + 2 * u * t * via.y + t * t * end.y;
          frames.push({ transform: `translate3d(${(x - end.x).toFixed(1)}px, ${(y - end.y).toFixed(1)}px, 0) rotate(${(lean * 16 * u * u).toFixed(1)}deg) scale(${s.toFixed(3)})`, opacity: n ? 1 : 0, offset: t });
        }
        root.append(ghost); pill.style.visibility = "hidden";
        const done = () => { ghost.remove(); pill.style.visibility = ""; };
        return ghost.animate(frames, { duration, easing: "cubic-bezier(.3,.5,.3,1)", fill: "forwards" }).finished.then(done, done);
      }
      // 동전마다의 길: 왼쪽 동전은 고양이의 왼쪽으로, 가운데·오른쪽 동전은 오른쪽으로 돌아 올라간다
      const VIA = [{ x: -34, y: 340 }, { x: 430, y: 380 }];

      /** 제목 줄의 알약에 고른 말을 담는다. 움직일 때는 동전에서 날아오고, 그동안 앞의 알약은 제자리에 있다가 새 알약이 닿기 직전에 물러난다. */
      function land(i, instant) {
        const my = seq, old = slot.firstElementChild;
        root.querySelectorAll(".hp-ghost").forEach((g) => g.remove());
        const pill = ui.pill({ text: A.genders[i], dot: "check" });
        pill.classList.add("hp-gd-pill");
        const lively = !instant && !ui.reduced() && Boolean(pill.animate);
        // 앞의 알약(빈 동그라미 셋 · 앞서 고른 말)을 그 자리에 띄워 둔다
        let stay = null;
        if (lively && old) {
          const c = ctx.center(old);
          stay = old.cloneNode(true); stay.classList.add("hp-ghost");
          stay.style.cssText = `position:absolute;left:${c.x - old.offsetWidth / 2}px;top:${c.y - old.offsetHeight / 2}px;margin:0;z-index:39;pointer-events:none`;
        }
        slot.replaceChildren(pill);
        // 세 가지 말 모두 같은 크기로 쓴다. 그래도 오른쪽 여백(28px)을 넘으면(글꼴이 다를 때) 들어올 때까지 줄인다
        const t = pill.querySelector(".hp-pill-text"), room = () => pill.offsetLeft + pill.offsetWidth <= ui.W - 28 - head.offsetLeft;
        let px = parseFloat(getComputedStyle(t).fontSize) || 21; while (px > 17 && !room()) { px -= 1; t.style.fontSize = px + "px"; }
        if (!lively) return;
        slot.parentNode.classList.remove("hp-rise");      // 제목 줄이 아직 올라오는 중이어도 알약의 제자리는 끝 자리로 잰다
        const FLY = 660;
        if (stay) { root.append(stay); stay.animate([{ opacity: 1 }, { opacity: 1, offset: 0.66 }, { opacity: 0, offset: 0.84 }, { opacity: 0 }], { duration: FLY, easing: "linear", fill: "forwards" }); }
        toss(pill, ctx.center(coins[i]), VIA[i], FLY).then(() => {
          if (stay) stay.remove();
          if (my !== seq || !root.isConnected) return;
          // 내려앉으며 통 튀고, 알약의 오른쪽 끝 위로 반짝이 둘
          pill.animate([{ transform: "scale(1.09, .93)" }, { transform: "none" }], { duration: 420, easing: ui.ease.spring });
          ui.sfx("slot");
          const p = ctx.center(pill), edge = p.x + pill.offsetWidth / 2;
          ui.burst(root, edge - 8, p.y - 14, [{ kind: "sparkle", dx: 8, dy: -26, s: 20, r: 12 }, { kind: "sparkle", dx: -22, dy: -30, s: 13, r: -10, delay: 70 }]);
        });
      }

      /** 누워 있던 고양이를 앉힌다(동전이 검정이 되기 전에 동전 위에서 비킨다). */
      function sitUp(lively) {
        if (unlounge) { unlounge(); unlounge = null; }
        lay.classList.remove("hp-gd-drop"); lay.style.animationDelay = "";
        cat.pose("sit");
        if (lively) { cat.place({ ...SIT, ground: SIT.ground + 10, h: 240 }).place(SIT, { ms: 560, easing: ui.ease.spring }); cat.pop(1.5); }
        else cat.place(SIT);
      }

      function pick(i, instant) {
        if (choice === i) { if (!instant) { cat.pop(0.6); ui.sfx("tick"); } return; }      // 이미 고른 동전: 고양이만 움찔한다
        const first = choice < 0, my = ++seq, lively = !instant && !ui.reduced();
        // 모양만 바꾸는 것부터(스타일이 한 번이라도 계산되기 전에 끝 상태를 적어 두면, 바로 보여 주는 상태에서는 움직임 없이 그 모습으로 그려진다)
        root.dataset.state = "chosen";
        lay.style.setProperty("--lean", [-5, 5][i] + "deg");      // 고른 동전 쪽으로 기운다
        marksUp();
        if (!first) flip(coins[choice], false, lively);
        choice = i; rove();
        flip(coins[i], true, lively);
        ctx.set({ answers: { gender: A.genders[i] } });
        cta.disabled = false;
        if (!instant) { ui.sfx("pick", i); ui.sfx("buzz", 12); }
        if (!lively) { land(i, true); if (first) sitUp(false); spot.set(SPOT_UP); return; }
        ctx.later(() => { if (my === seq) land(i, false); }, 200);      // 동전이 검정으로 돌아선 뒤에 그 말이 튀어나온다
        if (first) {
          sitUp(true);
          spot.to(SPOT_UP, { kick: 7 });      // 덩어리는 다섯 갈래 모양으로 통 튄다
          ctx.later(() => { if (root.isConnected) ui.sfx("pop"); }, 110);
        } else { cat.pop(0.9); spot.to(SPOT_UP, { kick: 3 }); }
      }

      rove();
      if (initial >= 0) pick(initial, true);
    },
  });
})();
