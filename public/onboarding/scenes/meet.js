/* ═════════════════════════ 장면: meet (주황) ═════════════════════════
 * "꾹 눌러서 데려가기" — 세 박자.
 *   1) idle   고양이가 조금 떨어진 라일락 동그라미 위에 앉아 첫마디를 한다(적힌다). 맨 앞의 말줄임표는 검정 알약 속 점 세 개다.
 *   2) 꾹     아래 검정 알약을 누르고 있으면 손끝에서 라일락이 번져 알약을 채우고, 눈이 동그래진 고양이가 세 번 폴짝이며 다가와 커지고,
 *             동그라미가 부푼다. 일찍 떼면 모두 제자리로 튕겨 돌아간다. 1.6초를 채우면 동그라미가 꽃 모양으로 튀고 하트·반짝이가 터진다.
 *   3) heard  곁에 앉은 고양이가 들은 것을 되짚는다(C.summary, 적힌다). 아래에 "조금 달라요"(q1으로) · "맞아요"(다음).
 *   tough     "많이 힘들어요"였다면 첫마디 아래에 109 카드가 먼저 보이고, 이 장면에는 하트·반짝이·폴짝임이 없다(끝도 조용하다).
 * 참고: tone-1(주황 색면 · 캐릭터 뒤의 라일락 덩어리 · 줄 안의 검정 알약 · 하트와 반짝이 · 검정 알약 버튼과 끝의 색 동그라미),
 *       interaction-1-howwefeel-ring(차오르는 고리 · 버튼 위의 흰 도움말 풍선), interaction-1-howwefeel-bubbles(눌리면 말랑이는 덩어리)
 * 문구는 HereCopy에서만 온다(덧붙인 화면 글자는 "전화하기"뿐).
 */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP || !HP.ui) return;
  const ui = HP.ui, { el, icon, lerp, clamp, reduced, ease: EASE } = ui;

  const HOLD_MS = 1600;       // 꾹 누르는 시간
  const AUTO_MS = 760;        // 한 번 눌러서 넘어갈 때(화면 읽기 프로그램 등) 저절로 다가오는 시간
  const HOPS = 3;             // 다가오는 동안의 폴짝임 = 말줄임표의 점 = 길 위의 점
  const X = 195;
  // 바로 보여 주는 상태(?state=…)에서 앞의 답이 없을 때만 쓰는 보기용 답(ctx.data에는 적지 않는다). 보기는 HereCopy의 선택지에서 고른다
  const SAMPLE = { nickname: "지우", lately: ["조금 지쳤어요", 1], concern: ["사람·관계", 1], want: ["털어놓고, 들어 주면 좋겠어요", 0] };
  const sample = (C) => { const a = {}; for (const key of ["lately", "concern", "want"]) { const [label, i] = SAMPLE[key], opts = C.Q[key].options; a[key] = opts.includes(label) ? label : opts[i]; } return a; };
  const PETALS = 0.07;                    // 여덟 갈래 꽃의 세기. 위·아래·양옆이 골이라 글과 버튼 쪽이 비고, 갈래는 비스듬히 난다
  const shapeOf = (flower, squash) => [[8, PETALS * flower, 180], [2, squash, 0]];      // squash > 0 이면 납작하게 눌린 모양
  // 버튼 끝 동그라미 안의 고리: 옅은 고리 + 차오르는 호 + 가운데 점
  const RING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="8.4" stroke-opacity=".24"/><circle class="hp-meet-arc" cx="12" cy="12" r="8.4" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" stroke-linecap="round" transform="rotate(-90 12 12)"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>';
  let uid = 0;

  /** 고양이의 첫마디를 줄로 나눈다: 두 문장이면 문장 끝에서, 아니면 마지막 낱말 앞에서(두 낱말뿐이면 한 줄). */
  function headLines(text) {
    const t = String(text).trim(), m = /^(.*?[.?!])\s+(.+)$/.exec(t);
    if (m) return [m[1], m[2]];
    const words = t.split(" ");
    return words.length >= 3 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [t];
  }
  /** 들은 것을 쉼표·마침표·물음표 뒤에서 토막 낸다(토막마다 한 줄씩 차지하려 하고, 짧은 토막끼리는 한 줄에 선다). */
  const clausesOf = (text) => (String(text).match(/[^,.?!]+[,.?!]*\s*/g) || [String(text)]).map((s) => s.trim()).filter(Boolean);

  HP.addScene({
    id: "meet", field: "orange", states: ["idle", "tough", "heard"],
    build(ctx) {
      const { el: root, copy: C } = ctx, M = C.meet;
      const mine = ctx.data.answers || {};
      const demo = !mine.lately && !mine.concern && !mine.want && ctx.state != null;
      const answers = demo ? sample(C) : { ...mine };
      if (ctx.state === "tough") answers.lately = C.TOUGH;
      const nickname = ctx.data.nickname || (demo ? SAMPLE.nickname : "");
      const tough = answers.lately === C.TOUGH;
      // 다음 장면에서 뒤로 돌아왔다면 이미 데려온 뒤다
      const cameBack = ctx.state == null && ctx.fromId != null && ui.flow.indexOf(ctx.fromId) > ui.flow.indexOf("meet");
      const scale = () => (ctx.root.getBoundingClientRect().width || ui.W) / ui.W;      // 화면이 축소돼 있을 때의 배율
      const active = () => { const r = root.getRootNode ? root.getRootNode() : document; return (r && r.activeElement) || document.activeElement; };

      let beat = "meet";                       // "meet"(idle · tough) | "heard"
      let q = 0, qv = 0;                       // 다가온 만큼(0 멀리 ~ 1 곁에)
      let ex = 0, exv = 0;                     // 곁에 자리 잡은 만큼(0 ~ 1): 덩어리가 꽃 모양이 되고 고양이가 한 번 더 커진다
      let lift = 0, hop = 0, jel = 0, jelv = 0;      // 폴짝 뜬 높이 · 몇 번째 폴짝 · 덩어리의 말랑임
      let holding = false, auto = false, said = false, gen = 0, armAt = 0, upAt = -1e9, downAt = 0, pid = null, away = false, viaKey = null, quick = false;
      let stopLoop = null, stopRiser = null, fillR = 400, G = null, arriving = false, lastAt = 0, doneAt = 0, heldKey = null;
      const talk = ui.speech(), intro = ui.speech();      // talk = 들은 것을 되짚는 말, intro = 첫마디를 지키는 문지기
      root.classList.toggle("is-tough", tough);
      root.dataset.state = tough ? "tough" : "idle";

      const bar = ui.topbar(ctx, { back: (b) => (beat === "heard" ? undo() : ctx.back(b)), pages: true });      // 버튼 위에는 도움말 풍선과 고양이가 있으므로 쪽 표시는 위 줄에

      /* ── 첫마디(큰 제목). 맨 앞의 "…"는 줄 안의 검정 알약 = 점 세 개(말을 고르는 중) ── */
      const rows = headLines(M.line(answers));
      const dots = el("span", "hp-pill hp-meet-dots", [0, 1, 2].map((n) => { const d = el("i"); d.style.setProperty("--n", n); return d; }));
      dots.dataset.say = "…"; dots.setAttribute("aria-hidden", "true");
      const dotEls = Array.from(dots.children);
      const hLine = ui.headline(rows.map((r, i) => (i === 0 && r.startsWith("…") ? [dots, r.slice(1)] : r)), { typed: true });
      const sub = tough ? null : el("p", "hp-body hp-meet-sub", M.eyebrow);
      const head = ui.block("hp-head hp-meet-head", { top: 88 }, hLine, sub);

      /* ── 들은 것: 작은 이름표 + 고양이가 되짚는 말(토막마다 줄을 바꾼다). 이름은 검정 알약에 담긴다 ── */
      const clauses = clausesOf(C.summary(nickname, answers));
      const sum = ui.headline(clauses.map((c, i) => {
        if (i || !nickname || !c.startsWith(nickname)) return c;
        const pill = ui.pill({ text: nickname, name: true }); pill.classList.add("hp-meet-name");
        return [pill, c.slice(nickname.length)];
      }), { typed: true, tag: "p", cls: "hp-meet-sum" });
      const label = el("span", "hp-meet-label", M.heard);
      const heard = ui.block("hp-head hp-meet-heard", { top: 88 }, label, sum);

      /* ── 고양이의 자리(라일락 덩어리) · 고양이까지의 길(점 셋) · 고양이 ── */
      const spot = ui.shape(ctx, { color: "var(--hp-lilac)", shape: shapeOf(0, 0), x: X, y: 418, r: 116, m: 1 });
      spot.el.classList.add("hp-meet-spot");
      const path = el("div", "hp-meet-path"); path.setAttribute("aria-hidden", "true");
      if (!tough) [[568, 7], [608, 10], [652, 14]].forEach(([y, s], n) => { const d = el("i"); d.style.cssText = `left:${X - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;--n:${n}`; path.append(d); });
      root.append(bar, head, heard, path, spot.el);
      const cat = ctx.cat({ x: X, ground: 514, h: 192 }, { poke: !tough });      // 109가 보이는 화면에서는 콕 눌러도 반짝이가 튀지 않는다
      const body = cat.el.querySelector(".hc-body"), shadow = cat.el.querySelector(".hc-shadow");
      if (!tough) { const pre = new Image(); pre.src = ctx.assets + window.HereCat.file("round"); if (pre.decode) pre.decode().catch(() => {}); }      // 누르는 순간 바꿔 끼울 동그란 눈 그림을 미리 풀어 둔다

      // 하트 하나 · 반짝이 둘(많이 힘든 날에는 두지 않는다). [종류, 모양, 멀리 있을 때의 자리, 곁에 왔을 때의 자리]
      const MARKS = tough ? [] : [
        ["heart", { s: 40, r: 10, float: true }, [316, 318], [352, 380]],
        ["sparkle", { s: 26, r: -12, twinkle: true, d: 400 }, [68, 366], [34, 406]],
        ["sparkle", { s: 16, r: 8, twinkle: true, d: 1200 }, [322, 492], [356, 702]],
      ];
      const marks = MARKS.map(([kind, o, far], n) => { const m = ui.mark(kind, { ...o, x: far[0], y: far[1], pop: !ctx.instant, d: ctx.instant ? o.d : 820 + n * 110 }); root.append(m); return m; });

      /* ── 109 안내(많이 힘들어요): 첫마디 바로 아래에, 고양이의 말보다 먼저 보인다 ── */
      let sos = null, slim = null;
      if (tough) {
        const call = el("a", "hp-sos-call", el("span", "hp-sos-num", icon("phone"), el("b", "", "109")), el("span", "hp-sos-go", "전화하기", icon("chev")));
        call.href = "tel:109"; call.setAttribute("aria-label", "109에 전화하기");
        sos = el("div", "hp-sos hp-meet-sos" + (ctx.instant ? "" : " hp-rise"), el("strong", "hp-sos-title", C.sos.tough), el("span", "hp-sos-sub", C.sos.sub), el("span", "hp-meet-sos-desc", M.toughDesc), call);
        sos.setAttribute("role", "note");
        // 들은 것을 되짚는 동안에도 109는 한 줄로 남는다
        slim = el("a", "hp-meet-call", icon("phone"), el("span", "", C.sos.tough), icon("chev"));
        slim.href = "tel:109"; slim.setAttribute("aria-label", "109에 전화하기");
        root.append(sos, slim);
      }

      /* ── 아래: 도움말 풍선 + 꾹 누르는 검정 알약(끝의 라일락 동그라미 안에 차오르는 고리) ── */
      const tip = el("p", "hp-meet-tip", el("span", "", M.hint)); tip.id = "hp-meet-tip-" + (++uid);
      const knob = () => { const k = el("span", "hp-meet-knob"); k.innerHTML = RING; return k; };
      const face = (fill) => { const f = el("span", "hp-meet-face" + (fill ? " is-fill" : ""), el("span", "hp-meet-hold-label", M.hold), knob()); if (fill) f.setAttribute("aria-hidden", "true"); return f; };
      const hold = el("button", "hp-meet-hold", face(false), face(true)); hold.type = "button"; hold.dataset.sfx = "none";
      hold.setAttribute("aria-describedby", tip.id);
      hold.querySelectorAll(".hp-meet-knob").forEach((k) => k.setAttribute("aria-hidden", "true"));
      const arcs = Array.from(hold.querySelectorAll(".hp-meet-arc"));

      /* ── 들은 뒤의 두 대답: 조금 달라요(q1으로) · 맞아요(다음) ── */
      // 꾹 누르던 손가락 · 키를 떼기 전에는(떼고 나서도 잠깐은) 새로 나온 두 버튼이 눌리지 않는다: 떼는 순간의 click이 대답이 되지 않게
      const canAnswer = () => { const now = performance.now(), stuck = now - doneAt > 3000; return (pid == null || stuck) && (!heldKey || stuck) && now >= armAt; };
      const no = el("button", "hp-meet-no", icon("pencil"), el("span", "", M.no)); no.type = "button";
      no.setAttribute("aria-label", `${M.no}, ${M.fix}`);
      no.addEventListener("click", () => { if (beat === "heard" && canAnswer() && talk.pass()) ctx.go("q1", undefined, no); });
      const yes = ui.cta({ label: M.yes, onPress: () => { if (beat === "heard" && canAnswer() && talk.pass()) ctx.next(yes); } });
      const row = el("div", "hp-meet-row", no, yes);
      root.append(tip, hold, row);

      /* ── 자리 계산: 멀리(far) → 꾹 누른 끝(near) → 곁에 앉은 자리(seat). 글의 높이를 재서 정한다 ── */
      function fitText() {
        // 첫마디가 한 줄에 다 들어오게(문구가 길어졌을 때만 줄어든다)
        let px = 42; hLine.style.fontSize = "";
        const wide = () => Array.from(hLine.children).some((l) => l.lastElementChild && (l.lastElementChild.getBoundingClientRect().right - l.getBoundingClientRect().left) / scale() > head.clientWidth - 12);      // 오른쪽에도 왼쪽만큼(28px) 비운다
        while (px > 30 && wide()) { px -= 1; hLine.style.fontSize = px + "px"; }
        // 들은 것은 여섯 줄쯤에 들어오게 26px에서 20px까지 줄인다
        let sp = 26; sum.style.fontSize = sp + "px";
        while (sp > 20 && sum.offsetHeight > 216) { sp -= 1; sum.style.fontSize = sp + "px"; }
      }
      function geometry() {
        fitText();
        const heardBottom = 88 + heard.offsetHeight;
        let far, farB, near, nearB, top;
        if (tough) {
          // 카드는 첫마디 바로 아래에, 고양이는 카드와 도움말 풍선 사이에(자리가 좁아지면 작아진다)
          sos.style.top = 88 + head.offsetHeight + 24 + "px";
          const cardBottom = sos.offsetTop + sos.offsetHeight, fr = clamp((690 - cardBottom - 26) / 2, 64, 106);
          farB = { y: cardBottom + 26 + fr, r: fr }; far = { h: fr * 1.68, ground: farB.y + 0.5 * fr * 1.68 };
          nearB = { y: farB.y + 16, r: fr * 1.17 }; near = { h: fr * 1.98, ground: nearB.y + 0.5 * fr * 1.98 };
          slim.style.top = heardBottom + 12 + "px";
          top = heardBottom + 12 + 48 + 22;
        } else {
          farB = { y: 418, r: 116 }; far = { h: 192, ground: 418 + 0.5 * 192 };
          top = heardBottom + 26;
        }
        const r = clamp((740 - top) / 2, 132, 188), seatB = { y: 740 - r, r }, seat = { h: 1.62 * r, ground: 740 - r + 0.72 * r };
        if (!tough) { nearB = { y: seatB.y, r: r * 0.93 }; near = { h: seat.h * 0.93, ground: seat.ground }; }
        G = { far, farB, near, nearB, seat, seatB };
      }

      /* ── 그리기: q(다가온 만큼)와 ex(자리 잡은 만큼) 두 값으로 고양이 · 덩어리 · 표시 · 버튼을 모두 정한다 ── */
      function paint() {
        const a = clamp(q, -0.08, 1), p = clamp(a, 0, 1), e = clamp(ex, 0, 1.1);
        const mix = (f, n, s) => lerp(lerp(f, n, a), s, e);
        const h = Math.exp(mix(Math.log(G.far.h), Math.log(G.near.h), Math.log(G.seat.h)));
        cat.place({ x: X, ground: mix(G.far.ground, G.near.ground, G.seat.ground), h });
        // 폴짝: 몸만 뜨고 납작한 그림자는 바닥에 남아 작아진다
        body.style.translate = lift > 0.05 ? `0 ${(-lift * 300 / h).toFixed(2)}px` : "";
        shadow.style.scale = lift > 0.05 ? (1 - Math.min(0.34, lift / 54)).toFixed(3) : "";
        spot.set({ shape: shapeOf(tough ? 0 : clamp(ex, 0, 1.3), jel), x: X, y: mix(G.farB.y, G.nearB.y, G.seatB.y), r: mix(G.farB.r, G.nearB.r, G.seatB.r) });
        marks.forEach((m, i) => { const far = MARKS[i][2], nr = MARKS[i][3]; m.style.setProperty("--x", lerp(far[0], nr[0], a).toFixed(1)); m.style.setProperty("--y", lerp(far[1], nr[1], a).toFixed(1)); });
        hold.style.setProperty("--fr", (p * fillR).toFixed(1) + "px"); hold.classList.toggle("is-full", p >= 0.999);
        arcs.forEach((arc) => { arc.style.strokeDashoffset = (100 - 100 * p).toFixed(1); arc.style.opacity = p > 0.004 ? "1" : "0"; });
        const lit = beat !== "meet" ? HOPS : p > 0.02 ? Math.min(HOPS, Math.floor(p * HOPS + 0.001) + 1) : 0;      // 누르자마자 첫 점, 한 발 내려앉을 때마다 다음 점
        dotEls.forEach((d, i) => d.classList.toggle("is-lit", i < lit));
        tip.classList.toggle("is-off", beat !== "meet" || holding || p > 0.03);
      }
      function frame(dt, now) {
        let moving = false;
        // 누른 시간은 실제 시계로 잰다(프레임이 느려도 1.6초면 다 찬다). 스프링은 끊어 계산한 dt로 돈다
        const real = lastAt ? Math.min(0.5, Math.max(0, (now - lastAt) / 1000)) : dt; lastAt = now;
        if (holding) {
          q = Math.min(1, q + (real * 1000) / (auto ? AUTO_MS : HOLD_MS)); qv = 0; moving = true;
          const k = Math.min(HOPS - 1, Math.floor(q * HOPS));
          if (k !== hop) { hop = k; if (k > 0) land(); }
          if (q >= 1) { lift = 0; complete(false); }
        } else {
          const goal = beat === "heard" ? 1 : 0;
          qv += ((goal - q) * 170 - qv * (tough ? 26 : 19)) * dt; q += qv * dt;
          if (Math.abs(goal - q) > 0.0015 || Math.abs(qv) > 0.02) moving = true; else { q = goal; qv = 0; }
        }
        const eg = beat === "heard" ? 1 : 0;
        exv += ((eg - ex) * 110 - exv * (tough ? 21 : eg ? 9.5 : 17)) * dt; ex += exv * dt;
        if (Math.abs(eg - ex) > 0.002 || Math.abs(exv) > 0.02) moving = true; else { ex = eg; exv = 0; }
        const up = holding && !tough ? Math.sin(Math.PI * ((q * HOPS) % 1)) * (9 + 9 * q) : 0;
        lift += (up - lift) * Math.min(1, dt * 24);
        if (lift > 0.1) moving = true;
        jelv += (-260 * jel - 13 * jelv) * dt; jel = clamp(jel + jelv * dt, -0.08, 0.08);
        if (Math.abs(jel) > 0.0008 || Math.abs(jelv) > 0.01) moving = true; else { jel = 0; jelv = 0; }
        paint();
        if (!moving && stopLoop) { stopLoop(); stopLoop = null; }
      }
      const run = () => { if (!stopLoop) { lastAt = 0; stopLoop = ctx.loop(frame); } };
      /** 한 발 내려앉았다: 손끝에 톡(진동) + 발소리, 고양이와 덩어리가 살짝 눌렸다 펴진다(많이 힘든 날에는 진동뿐이다). */
      function land() { ui.sfx("buzz", 20); if (!tough) { ui.sfx("step"); cat.pop(0.8); jelv += 1.25; } }

      /* ── 첫마디 ── */
      function sayNow() { if (said) return; said = true; hLine.finish(); dots.classList.remove("is-thinking"); }

      /* ── 꾹 누르기 ── */
      function fillFrom(o) {
        const w = hold.offsetWidth, hh = hold.offsetHeight, x = clamp(o.x, 0, w), y = clamp(o.y, 0, hh);
        hold.style.setProperty("--fx", x.toFixed(1) + "px"); hold.style.setProperty("--fy", y.toFixed(1) + "px");
        fillR = Math.hypot(Math.max(x, w - x), Math.max(y, hh - y)) + 3;
      }
      const knobSpot = () => ({ x: hold.offsetWidth - 29, y: hold.offsetHeight / 2 });
      function press(o, byItself) {
        if (beat !== "meet" || holding) return;
        intro.pass(); sayNow();                                // 고양이의 말이 적히는 중이면 그 줄부터 다 보여 준다(누르는 1.6초 내내 그대로 보이므로 건너뛸 수 없다)
        holding = true; auto = Boolean(byItself); hop = Math.min(HOPS - 1, Math.floor(clamp(q, 0, 1) * HOPS));
        if (q < 0.02) fillFrom(o);                             // 차오르던 중에 다시 누르면 번지던 자리 그대로 이어서 찬다
        hold.classList.add("is-down"); root.classList.add("is-holding");
        if (!tough && cat.state.pose !== "round") { cat.pose("round"); cat.pop(0.9); }      // 손이 닿자 눈이 동그래진다
        if (stopRiser) stopRiser();
        stopRiser = ui.sfx("riser", Math.max(160, (auto ? AUTO_MS : HOLD_MS) * (1 - clamp(q, 0, 1))));
        ui.sfx("buzz", 20);
        run();
      }
      function release() {
        if (!holding) return;
        holding = false; auto = false;
        hold.classList.remove("is-down"); root.classList.remove("is-holding");
        if (stopRiser) { stopRiser(); stopRiser = null; }
        if (cat.state.pose !== "sit") cat.pose("sit");               // 다시 시큰둥한 얼굴로
        run();                                                 // q가 스프링으로 0까지 튕겨 돌아간다
      }
      // pid = 지금 버튼을 누르고 있는 손가락(뗄 때까지 남는다). away = 누른 채 버튼 밖으로 벗어났다(그때 이미 놓은 것으로 쳤다)
      const done = (e) => { if (pid == null || (e && e.pointerId !== pid)) return; pid = null; upAt = performance.now(); quick = !away && upAt - downAt < 25; if (beat === "heard") armAt = Math.max(armAt, upAt + 350); release(); };
      ctx.on(hold, "pointerdown", (e) => {
        if (reduced() || pid != null || (e.pointerType === "mouse" && e.button !== 0)) return;      // 동작 줄이기에서는 한 번 누르면 된다(click)
        pid = e.pointerId; away = false; downAt = performance.now(); quick = false;
        try { hold.setPointerCapture(e.pointerId); } catch { /* 잡지 못해도 window에서 뗀 것을 듣는다 */ }
        const p = ctx.point(e); press({ x: p.x - hold.offsetLeft, y: p.y - hold.offsetTop });
      });
      ctx.on(hold, "pointermove", (e) => {                     // 버튼에서 멀리 벗어나면 놓은 것으로 본다(손가락을 뗀 뒤에 다시 눌러야 한다)
        if (pid == null || e.pointerId !== pid || away) return;
        const p = ctx.point(e), x = p.x - hold.offsetLeft, y = p.y - hold.offsetTop;
        if (x < -36 || x > hold.offsetWidth + 36 || y < -44 || y > hold.offsetHeight + 36) { away = true; release(); }
      });
      ctx.on(window, "pointerup", done); ctx.on(window, "pointercancel", done);
      ctx.on(hold, "lostpointercapture", done);
      ctx.on(hold, "contextmenu", (e) => e.preventDefault());  // 길게 눌러도 메뉴가 뜨지 않게
      ctx.on(hold, "keydown", (e) => {
        if ((e.key !== " " && e.key !== "Enter") || reduced()) return;
        e.preventDefault();
        if (e.repeat || viaKey) return;
        viaKey = e.key; press(knobSpot());
      });
      ctx.on(hold, "keyup", (e) => { if (!viaKey || e.key !== viaKey) return; e.preventDefault(); viaKey = null; upAt = performance.now(); release(); });
      ctx.on(hold, "blur", () => { if (viaKey) { viaKey = null; upAt = performance.now(); release(); } });
      ctx.on(root, "keyup", (e) => { if (heldKey && e.key === heldKey) { heldKey = null; armAt = Math.max(armAt, performance.now() + 350); } });
      // 누르고 있지 않은데 온 click = 화면 읽기 프로그램 · 음성 제어 · 동작 줄이기의 한 번 누르기
      ctx.on(hold, "click", () => {
        if (beat !== "meet" || holding) return;
        if (reduced()) { if (intro.pass()) complete(true); return; }      // 첫마디가 막 보인 참이면 한 번은 그 줄에 머문다
        if (performance.now() - upAt < 500 && !quick) return;  // 꾹 누르다 뗀 뒤에 따라오는 click
        quick = false; press(knobSpot(), true);                // 저절로 다가온다
      });
      ctx.onDestroy(() => { if (stopRiser) stopRiser(); });

      /* ── 다 찼다 → 들은 것 ── */
      const leaving = () => [...hLine.querySelectorAll(".hp-l"), sub].filter(Boolean);
      function reveal() { head.classList.add("is-gone"); heard.classList.add("is-on"); }
      /** still = 움직임 없이 끝 상태로(바로 보여 주는 상태 · 동작 줄이기). byUser = 사람이 눌러서 온 것(소리를 낸다). */
      function complete(still, byUser = true) {
        const g = ++gen, kb = active() === hold;
        doneAt = performance.now(); heldKey = viaKey;      // 키를 누른 채로 다 찼다면 그 키를 뗄 때까지 기억한다
        beat = "heard"; holding = false; auto = false; q = 1; qv = 0; lift = 0;
        root.dataset.state = "heard"; root.classList.remove("is-holding"); hold.classList.remove("is-down");
        if (stopRiser) { stopRiser(); stopRiser = null; }
        sayNow();
        hold.classList.add("is-off"); hold.tabIndex = -1; row.classList.add("is-on");
        if (sos) { sos.classList.add("is-off"); slim.classList.add("is-on"); }
        armAt = performance.now() + (still ? 0 : 450);         // 누르던 손가락이 그대로 새 버튼을 누르지 않게
        if (byUser) { if (tough) ui.sfx("pop"); else { ui.sfx("burst"); ui.sfx("buzz", [40, 60, 120]); } }
        if (kb) yes.focus({ preventScroll: true });
        if (still) {
          if (!byUser) { root.classList.add("is-now"); ctx.later(() => root.classList.remove("is-now"), 80); }      // 바로 보여 주는 상태: 버튼이 바뀌는 짧은 움직임도 없이
          if (cat.state.pose !== "sit") cat.pose("sit");
          ex = 1; exv = 0; reveal(); paint();
          if (byUser) sum.play(); else sum.finish();      // 동작 줄이기에서 눌러 온 경우: 한꺼번에 보이되 화면 읽기 프로그램에는 알린다
          talk.end(ctx.state === "heard" || cameBack);
          return;
        }
        talk.begin(() => { reveal(); sum.finish(); if (cat.state.pose !== "sit") cat.pose("sit"); });
        leaving().forEach((l, n) => { l.classList.remove("hp-rise"); l.style.setProperty("--i", n); l.classList.add("hp-leave"); });
        ctx.later(() => {
          if (g !== gen) return;
          if (cat.state.pose !== "sit") { cat.pose("sit"); cat.pop(0.7); }      // 말하기 전에 평소 얼굴로 돌아온다
          if (!talk.speaking) return;
          label.classList.add("hp-rise"); reveal();
          sum.play({ speed: 32, delay: 60 }).then(() => { if (g === gen) talk.end(); });
        }, 300);
        if (!tough) {
          exv += 5; jelv += 1.2; cat.pop(1.6);
          // 하트 둘 · 반짝이 셋이 고양이 둘레에서 바깥으로 튄다(검은 털 위를 지나가지 않게 윤곽 바깥에서 시작한다)
          const cy = G.seat.ground - G.seat.h * 0.54, rx = G.seat.h * 0.42, ry = G.seat.h * 0.56;
          ui.ring(root, X, cy, { to: 4.2 });
          [["heart", -138, 30, -16, 0], ["heart", -52, 24, 14, 70], ["sparkle", -96, 24, 10, 40], ["sparkle", -14, 26, -12, 100], ["sparkle", -172, 18, 0, 140]].forEach(([kind, deg, s, r, delay]) => {
            const a = (deg * Math.PI) / 180, ox = Math.cos(a), oy = Math.sin(a);
            ui.burst(root, X + ox * rx, cy + oy * ry, [{ kind, dx: ox * 58, dy: oy * 58, s, r, delay }]);
          });
        }
        run();
      }
      /** 들은 것에서 뒤로: 다시 데려오기 전으로(고양이는 제자리로 돌아간다). */
      function undo() {
        if (beat !== "heard") return;
        gen++; beat = "meet"; root.dataset.state = tough ? "tough" : "idle";
        if (cat.state.pose !== "sit") cat.pose("sit");
        const inRow = row.contains(active()) || (slim && active() === slim);
        talk.reset(); sum.finish();
        heard.classList.remove("is-on"); label.classList.remove("hp-rise"); head.classList.remove("is-gone");
        leaving().forEach((l) => l.classList.remove("hp-leave"));
        row.classList.remove("is-on"); hold.classList.remove("is-off"); hold.tabIndex = 0;
        if (sos) { sos.classList.remove("is-off"); slim.classList.remove("is-on"); }
        if (inRow) hold.focus({ preventScroll: true });
        if (reduced()) { q = 0; qv = 0; ex = 0; exv = 0; paint(); } else run();
      }

      /* ── 처음 ── */
      geometry();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!root.isConnected) return; geometry(); if (!arriving) paint(); });      // 글꼴이 다 온 뒤에 한 번 더 잰다
      if (ctx.state === "heard" || cameBack) { intro.end(true); complete(true, false); }
      else if (ctx.instant) { sayNow(); intro.end(ctx.state != null); paint(); }
      else {
        paint();
        // 덩어리가 통 부풀고, 고양이가 그 위로 올라오고, 말줄임표의 점이 잠깐 고른 뒤에 첫마디가 적힌다
        arriving = true;
        dots.classList.add("is-on", "is-set", "is-thinking");
        if (sub) { sub.classList.add("hp-rise"); sub.style.setProperty("--d", "1500ms"); }
        cat.el.style.opacity = "0";
        ctx.later(() => {
          arriving = false; cat.el.style.opacity = "1";
          paint();
          if (holding || beat !== "meet" || q !== 0) return;
          cat.place({ ...G.far, x: X, h: tough ? G.far.h * 0.86 : 24 });
          cat.place({ ...G.far, x: X }, { ms: tough ? 520 : 640, easing: tough ? EASE.out : EASE.spring });
        }, 380);
        intro.begin(() => sayNow());
        hLine.play({ speed: 46, delay: 940 }).then(() => { sayNow(); intro.end(); });
      }
    },
  });
})();
