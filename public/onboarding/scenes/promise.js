/* ═════════════════════════ 장면: promise (주황) — 시작 전 약속 ═════════════════════════
 * 동의 두 가지를 받는 화면이라 글이 가장 잘 읽혀야 한다: 약속 세 가지의 제목(17px)과 설명(15px)이 모두 보이고, 잘리는 글이 없다.
 * 이 장면만의 손맛은 "두 가지를 세는 알약"이다. 제목 줄 안의 검정 알약 [두 가지 ○○]의 동그라미가 동의 하나에 하나씩 노랗게 차고,
 * 하얀 카드 오른쪽의 큰 동그라미는 누르면 잉크색으로 통 튀며 체크가 그려진다(딱 — 톡: 카드가 먼저, 한 박자 뒤에 알약).
 * "모두 동의해요"는 제목의 "…필요해요" 바로 옆에 내 대답처럼 놓이고, 누르면 두 카드가 위에서부터 차례로 찍힌다.
 * 둘 다 동의하면 알약이 통 튀고, 고양이 뒤의 라일락 동그라미가 별 모양으로 튀고(뽁), 큰 버튼 너머에서 고개를 갸웃하고 내다보던
 * 고양이가 눈을 동그랗게 뜨며 고개를 바로 든다(오른쪽 귀 위의 반짝이가 하트로 바뀐다). 고양이는 손가락·포커스가 가는 쪽으로 고개를 슬쩍 돌린다.
 * 아직 꺼진 큰 버튼을 누르면 남은 빈 동그라미들이 들썩여서 무엇을 눌러야 하는지 알려 준다.
 * 참고: tone-1(주황 색면 · 큰 제목과 줄 안의 검정 알약 · 캐릭터 뒤의 색 덩어리 · 하트와 반짝이 · 쪽 표시 · 검정 알약 버튼).
 *       짜임은 layout-2(하얀 알약 기둥), layout-4(엿보는 캐릭터), interaction-1(아래 패널 너머의 얼굴 — q1과 같은 생각을 버튼 오른쪽에서, 기울여서).
 * 문구는 HereCopy에서만 온다(consent · promise · sos). 덧붙인 화면 글자는 "전화하기"뿐이다.
 * 고양이는 이 장면에서 말하지 않는다(알림과 109는 서비스의 말이다). 109 줄에는 장식도 통통 튀는 소리도 두지 않는다
 * (반짝이 · 하트 · 별은 아래 고양이 곁에만 있다).
 */
(() => {
  "use strict";
  const ui = HerePhone.ui, { el, icon, lines, swap, reduced, clamp } = ui;
  let serial = 0;                                              // 한 문서에 휴대폰이 여러 대 올라가도 id가 겹치지 않게

  HerePhone.addScene({
    id: "promise", field: "orange", states: ["idle", "agreed"],
    build(ctx) {
      const { el: root, copy: C } = ctx;
      // 알림만 모드(앱): 동의는 가입할 때 따로 받으므로, 여기서는 이야기하기 전에 알아 둘 것(AI · 기록 · 109)만 보여 주고 "알겠어요"로 넘어간다.
      // HereCopy.notice = { title, breaks(제목 줄마다 낱말 수), items: [{ title, desc }], cta, reply(고양이의 한마디) }
      // 동의 모드(앱에서 기억 동의를 받을 때): actions.consent면 알림만 모드를 쓰지 않는다. 항목별 전문은 C.consentDetails에서 온다
      const N = ctx.actions.consent ? null : (C.notice || null);
      const P = N ? N.items : C.promise, K = N ? { ...C.consent, title: N.title, cta: N.cta } : C.consent, S = C.sos, uid = "hp-promise-" + (++serial);
      const asks = P.filter((p) => p.consent), infos = P.filter((p) => !p.consent);      // 동의 두 가지 · 알림 하나
      const on = asks.map(() => false);                         // 값(동의했는지)
      const count = () => on.filter(Boolean).length, all = () => count() === asks.length;
      let agreed = false, seq = 0, alive = true;                // agreed = 화면이 "둘 다 동의" 모습인지, seq = 차례로 찍는 묶음의 번호
      ctx.onDestroy(() => { alive = false; });
      /** 이 장면을 떠나는 중인지(다음 색면이 퍼지는 동안에는 남은 움직임과 소리를 내지 않는다) */
      const gone = () => !alive || root.classList.contains("is-frozen");

      /* ── 자리 ── */
      const CTA_TOP = 756;                                      // 큰 버튼의 윗변
      // 고양이: 큰 버튼 너머에서 고개를 갸웃하고 내다본다(x, y = 발이 닿는 점, r = 기울기°). 입 아래가 버튼 윗변에 걸린다.
      // 갸웃한 쪽(왼쪽) 귀가 낮아서 왼쪽 위의 작은 안내 글 아래로 들어간다. 둘 다 동의하면 고개를 바로 들며 조금 올라온다.
      // 버튼의 둥근 오른쪽 끝 밖으로 몸이 나가지 않게 버튼 안쪽에 세운다
      const CAT_H = 246, PEEK = { x: 316, y: 889, r: -12 }, UP = { x: 326, y: 886, r: -8 }, OUT = { x: 334, y: 1050, r: -18 };
      const DISC = { x: 296, y: 736, r: 88, m: 0 }, STAR = { x: 298, y: 730, r: 100, m: 1 };

      root.append(ui.topbar(ctx, { pages: true, back: !ctx.actions.noBack }));             // 큰 버튼 위에는 고양이가 있으므로 쪽 표시는 위 줄에

      /* ── 제목: "대화를 시작하려면 / [두 가지 ○○] 동의가 / 필요해요" + 그 옆의 "모두 동의해요" ── */
      const TOKEN = "두 가지";
      const pill = ui.pill({ text: TOKEN }); pill.classList.add("hp-promise-pill");
      const dots = asks.map(() => el("i", "", icon("check")));
      const tally = el("span", "hp-promise-count", dots); tally.setAttribute("aria-hidden", "true");
      pill.append(tally);
      const [l1, l2, l3] = lines(K.title, [2, 3, 1]);
      const title = N ? ui.headline(lines(K.title, N.breaks || [2, 2]), { size: 38 })
        : ui.headline(l2 && l2.includes(TOKEN) ? [l1, swap(l2, TOKEN, pill), l3] : [l1, l2, [(l3 || "") + " ", pill]], { size: 38 });
      title.id = uid + "-title";
      const tick = () => { const t = el("span", "hp-promise-tick", icon("check")); t.setAttribute("aria-hidden", "true"); return t; };
      const allBtn = el("button", "hp-promise-all hp-rise", el("span", "hp-promise-all-text", K.all), tick());
      allBtn.type = "button"; allBtn.dataset.sfx = "none"; allBtn.style.setProperty("--i", 3);
      allBtn.setAttribute("role", "checkbox"); allBtn.setAttribute("aria-checked", "false");
      const head = N ? ui.block("hp-head hp-promise-head", { top: 88 }, title) : ui.block("hp-head hp-promise-head", { top: 88 }, title, allBtn);

      /* ── 카드 기둥: 알림 하나(AI · 109) + 동의 둘 ── */
      /** 설명은 사람이 끊을 자리에서 줄이 나뉘게 토막으로 묶는다(문구는 그대로). counts = 줄마다 낱말 수, 맞지 않으면 문장마다.
       *  토막이 칸보다 길면 그 안에서 다시 줄이 바뀐다(잘리지 않는다) */
      const BREAKS = [[4, 5], [6, 5, 5], [4, 6]];
      const phrases = (text, counts) => {
        const words = String(text).split(" ");
        const parts = counts && counts.reduce((a, b) => a + b, 0) === words.length ? lines(text, counts)
          : (String(text).match(/[^.?!]+[.?!]*/g) || [String(text)]).map((t) => t.trim()).filter(Boolean);      // 뒤돌아보기 정규식은 쓰지 않는다(옛 Safari)
        return parts.map((s, i, a) => el("span", "", s + (i < a.length - 1 ? " " : "")));
      };
      const list = ui.block("hp-promise-list", { top: N ? 204 : 246 });
      list.setAttribute("role", "group"); list.setAttribute("aria-labelledby", title.id);

      // 109: 알림 카드 안의 조용한 줄(진짜 전화 링크, 번호가 보인다). 장식도 통통 튀는 소리도 두지 않는다
      const call = el("a", "hp-promise-sos",
        el("span", "hp-promise-sos-top", icon("phone", "hp-promise-sos-ic"), el("b", "", S.title), el("span", "hp-promise-sos-go", "전화하기", icon("chev"))),
        el("span", "hp-promise-sos-line", S.sub), N ? null : el("span", "hp-promise-sos-line", S.note));      // 알림만 모드에서는 바로 위 카드가 같은 말을 한다
      call.href = "tel:109"; call.dataset.sfx = "none";
      call.setAttribute("aria-label", N ? `${S.title}. ${S.sub}. 109에 전화하기` : `${S.title}. ${S.sub}. ${S.note}. 109에 전화하기`);
      (infos.length ? infos : [null]).forEach((p, n) => {
        const card = el("div", "hp-promise-card is-info hp-rise", p && el("strong", "hp-promise-title", p.title), p && el("p", "hp-promise-desc", phrases(p.desc, BREAKS[P.indexOf(p)])));
        card.style.setProperty("--i", 4 + n);
        if (n === (N ? infos.length - 1 : 0)) card.append(call);      // 알림만 모드에서는 109 이야기를 하는 마지막 카드에 붙는다
        list.append(card);
      });

      const cards = asks.map((p, i) => {
        const tId = `${uid}-t${i}`, dId = `${uid}-d${i}`;
        const name = el("span", "hp-promise-title", el("span", "", p.title), " ", el("span", "hp-promise-req", K.required)); name.id = tId;      // 사이의 빈칸은 읽기 프로그램용(화면에는 보이지 않는다)
        const desc = el("span", "hp-promise-desc", phrases(p.desc, BREAKS[P.indexOf(p)])); desc.id = dId;
        const b = el("button", "hp-promise-card is-ask hp-rise", el("span", "hp-promise-text", name, desc), tick());
        b.type = "button"; b.dataset.sfx = "none"; b.style.setProperty("--i", 5 + i);
        b.setAttribute("role", "checkbox"); b.setAttribute("aria-checked", "false");
        b.setAttribute("aria-labelledby", tId); b.setAttribute("aria-describedby", dId);
        b.addEventListener("click", () => press(i));
        const details = C.consentDetails && C.consentDetails[i];
        if (details) {
          // 전문 보기: 카드 전체가 체크 상자라 그 안에 버튼을 넣지 않고 카드 위에 따로 얹는다
          const more = el("button", "hp-promise-more", "보기"); more.type = "button"; more.dataset.sfx = "none";
          more.setAttribute("aria-haspopup", "dialog"); more.setAttribute("aria-label", `${p.title} 내용 보기`);
          more.addEventListener("click", () => openDetails(p.title, details, more));
          list.append(el("div", "hp-promise-ask", b, more));
        } else list.append(b);
        return b;
      });

      /** 동의 항목의 전문. 장면 안의 하얀 시트로 올라오고, 닫으면 누른 버튼으로 포커스가 돌아간다 */
      function openDetails(heading, details, opener) {
        const body = el("div", "hp-promise-sheet-body");
        details.forEach(([term, text]) => { if (term) body.append(el("strong", "", term)); body.append(el("p", "", text)); });
        const close = el("button", "hp-promise-sheet-close", "닫기"); close.type = "button";
        const titleEl = el("h2", "", heading); titleEl.id = uid + "-sheet";
        const panel = el("div", "hp-promise-sheet", titleEl, body, close);
        panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.setAttribute("aria-labelledby", titleEl.id);
        const scrim = el("div", "hp-promise-scrim", panel);
        const shut = () => { scrim.remove(); opener.focus({ preventScroll: true }); };
        close.addEventListener("click", shut);
        scrim.addEventListener("click", (e) => { if (e.target === scrim) shut(); });
        scrim.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); shut(); } else if (e.key === "Tab") { e.preventDefault(); close.focus(); } });
        root.append(scrim); close.focus({ preventScroll: true });
      }

      /* ── 아래: 작은 안내 · 나가기 · 큰 버튼 ── */
      const noteParts = K.note.split(/\s*·\s*/);                 // "…없어요 · 만 14세…" → 가운뎃점 자리에서 줄을 나눈다(읽기 프로그램에는 원문 그대로)
      const note = el("p", "hp-promise-note hp-rise", el("span", "hp-sr", K.note), noteParts.map((t) => { const s = el("span", "", t); s.setAttribute("aria-hidden", "true"); return s; }));
      note.id = uid + "-note"; note.style.setProperty("--i", 7);
      const leave = el("button", "hp-promise-leave hp-rise", K.leave); leave.type = "button"; leave.style.setProperty("--i", 8);
      // "동의하지 않고 나가기": 켜 둔 동의가 있었다면 거두고(답을 지우고) 앞 장면으로 돌아간다. 위 줄의 뒤로 화살표는 고른 것을 그대로 둔다
      leave.addEventListener("click", () => { seq++; if (count()) { on.fill(false); commit(); stampAll(); mood(); } if (ctx.actions.signOut && ctx.actions.consent) ctx.actions.signOut(); else ctx.back(leave); });
      // 알림만 모드: "알겠어요"를 누르면 고양이가 한마디 하고(적히는 동안 다시 누르면 그 줄만 끝까지 보인다) 다음 장면으로 간다
      const talk = ui.speech(); let said = false;
      const say = N && N.reply ? ui.typed(N.reply, "hp-promise-note hp-promise-say") : null;
      function ok() {
        if (!say) { ctx.next(cta); return; }
        if (!said) {
          said = true; cheer();
          talk.begin(() => say.finish());
          say.play({ speed: 40, delay: 140 }).then(() => { talk.end(); ctx.later(() => { if (!gone()) ctx.next(cta); }, 760); });
          return;
        }
        if (talk.pass()) ctx.next(cta);
      }
      const cta = ui.cta({ label: K.cta, disabled: !N, onPress: () => { if (N) ok(); else if (all()) ctx.next(cta); } });
      cta.classList.add("hp-promise-cta"); cta.setAttribute("aria-describedby", note.id);
      // 꺼진 큰 버튼을 눌러도 아무 일도 없으면 답답하다: 버튼 위의 보이지 않는 덮개가 눌림을 받아, 아직 남은 동그라미를 들썩여 알려 준다
      const guard = el("span", "hp-promise-guard"); guard.setAttribute("aria-hidden", "true");
      let nudgedAt = -1e9;
      guard.addEventListener("click", () => {
        const t = performance.now(); if (all() || t - nudgedAt < 420) return; nudgedAt = t;
        ui.sfx("nope");
        if (reduced()) return;
        [allBtn, ...cards.filter((_, i) => !on[i])].forEach((b) => { b.classList.remove("is-nudge"); void b.offsetWidth; b.classList.add("is-nudge"); });
        glanceAt({ x: 332, y: 470 });
      });

      /** 한 줄짜리 작은 글이 제 자리보다 넓으면 글자를 조금 줄여 한 줄에 담는다(글꼴이 달라져도 줄이 늘거나 고양이 귀에 닿지 않게).
       *  min 아래로는 줄이지 않는다: 그래도 넘치면 줄이 바뀔 뿐 잘리지 않는다 */
      const fitLine = (node, max, min = 12.5) => {
        node.style.fontSize = ""; node.style.whiteSpace = "nowrap";
        let px = parseFloat(getComputedStyle(node).fontSize) || 14;
        while (px > min && node.scrollWidth > max) { px -= 0.5; node.style.fontSize = px + "px"; }
        if (node.scrollWidth > max) node.style.whiteSpace = "";
      };
      const NOTE_MAX = [238, 172];                              // 작은 안내 두 줄의 자리(둘째 줄 끝 바로 아래에 고양이의 왼쪽 귀가 온다)
      // 글꼴이 다 온 뒤에 한 번 더 맞춘다. 작은 안내 글은 카드 기둥 바로 아래에 붙는다(카드 높이가 달라져도 겹치지 않게)
      const settle = () => {
        if (!root.isConnected || !list.offsetHeight) return;
        list.querySelectorAll(".hp-promise-sos-line").forEach((n) => fitLine(n, n.clientWidth));
        note.querySelectorAll("span[aria-hidden]").forEach((n, i) => fitLine(n, NOTE_MAX[i] || NOTE_MAX[0]));
        (say || note).style.top = list.offsetTop + list.offsetHeight + (say ? 12 : 8) + "px";
      };

      /* ── 고양이와 라일락 덩어리: 큰 버튼의 가운데 높이에서 잘려서 버튼 아래로는 보이지 않는다 ── */
      const den = el("div", "hp-promise-den");
      const spot = ui.shape(ctx, { color: "var(--hp-lilac)", shape: [[5, 0.12, -90]], ...DISC });
      const stage = el("div", "hp-catlayer hp-promise-stage");
      den.append(spot.el, stage);
      if (N) root.append(head, list, den, ...(say ? [say] : []), cta); else root.append(head, list, den, note, leave, cta, guard);
      settle(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
      const cat = ctx.cat({ x: 0, ground: 0, h: CAT_H }, { layer: stage });
      cat.hitTest = (p) => p.y < CTA_TOP + 4;                    // 버튼에 가려진 몸은 눌리지 않는다
      function stageTo(p, instant) {
        if (instant) stage.style.transition = "none";
        stage.style.setProperty("--sx", p.x + "px"); stage.style.setProperty("--sy", p.y + "px"); stage.style.setProperty("--sr", p.r + "deg");
        if (instant) { void stage.offsetWidth; stage.style.transition = ""; }
      }
      // 눈길: 손가락(포인터)이나 포커스가 가는 쪽으로 고개를 슬쩍 돌린다
      const glanceAt = (p) => {
        if (reduced()) return;
        // 왼쪽 위에는 작은 안내 글이 있어서 그쪽으로는 조금만 움직인다(귀가 글자에 닿지 않게)
        const dx = clamp((p.x - 280) / 230, -1, 0.5), dy = clamp((p.y - 730) / 480, -1, 0.2);
        stage.style.setProperty("--gx", (dx * 4).toFixed(1) + "px"); stage.style.setProperty("--gy", (dy * 5).toFixed(1) + "px"); stage.style.setProperty("--gr", (dx * 2).toFixed(2) + "deg");
      };
      ctx.on(root, "pointermove", (e) => glanceAt(ctx.point(e)));
      ctx.on(root, "pointerdown", (e) => glanceAt(ctx.point(e)));
      ctx.on(root, "focusin", (e) => { if (e.target && e.target !== root && e.target.getBoundingClientRect) glanceAt(ctx.center(e.target)); });

// 고양이 곁의 표시(참고 이미지의 작은 것들): 평소에는 테두리 반짝이 둘. 둘 다 동의하면 오른쪽 위의 작은 반짝이가 하트로 바뀐다
      // (오른쪽 귀 위, 글자에서 먼 자리). 109 줄(맨 위 카드) 곁에는 두지 않는다
      // 알림만 모드에서는 109가 늘 보이는 화면이라 반짝이·하트를 두지 않는다
      (N ? [] : [["sparkle", { x: 152, y: 688, s: 20, r: -10, twinkle: true, d: 300 }, ""], ["sparkle", { x: 366, y: 644, s: 15, r: 12, twinkle: true, d: 1300 }, "hp-promise-spark"]])
        .forEach(([kind, o, cls], n) => { const m = ui.mark(kind, { ...o, pop: !ctx.instant, d: ctx.instant ? o.d : 1000 + n * 130 }); if (cls) m.classList.add(cls); root.append(m); });
      const heart = ui.mark("heart", { x: 376, y: 626, s: 22, r: 12, float: true });
      heart.classList.add("hp-promise-heart"); if (!N) root.append(heart);

      /* ── 상태 ── */
      const COUNT = 120;                                        // 카드의 동그라미가 찍힌 뒤 제목 알약의 동그라미가 차기까지(딱 — 톡)
      const counting = asks.map(() => 0);
      /** i번 카드의 모습을 값(on)에 맞춘다. 방금 켜졌다면 큰 동그라미가 통 튀고, 한 박자 뒤에 제목 알약의 동그라미가 통 튀며 찬다(세어지는 모습) */
      function stamp(i, instant) {
        const b = cards[i], d = dots[i], was = b.classList.contains("is-on"), mine = ++counting[i];
        b.classList.toggle("is-on", on[i]);
        b.classList.remove("is-pop", "is-nudge"); d.classList.remove("is-pop");
        if (!instant && !reduced() && on[i] && !was) {
          void b.offsetWidth; b.classList.add("is-pop");
          ctx.later(() => { if (gone() || mine !== counting[i] || !on[i]) return; d.classList.add("is-on"); void d.offsetWidth; d.classList.add("is-pop"); }, COUNT);
        } else d.classList.toggle("is-on", on[i]);
      }
      const stampAll = (instant) => cards.forEach((_, i) => stamp(i, instant));
      /** 값이 바뀌면 바로: 버튼을 켜고 끄고, 읽기 프로그램에 알리고, 답을 남긴다(차례로 찍히는 모습은 그 뒤에 따라온다) */
      function commit(instant) {
        const now = all();
        cta.disabled = !now; guard.hidden = now;
        cards.forEach((b, n) => b.setAttribute("aria-checked", String(on[n])));
        const was = allBtn.classList.contains("is-on");
        allBtn.classList.toggle("is-on", now); allBtn.setAttribute("aria-checked", now ? "true" : count() ? "mixed" : "false");
        allBtn.classList.remove("is-pop", "is-nudge");
        if (now && !was && !instant && !reduced()) { void allBtn.offsetWidth; allBtn.classList.add("is-pop"); }      // "모두 동의해요"의 동그라미도 같이 통 튄다
        if ((ctx.data.answers.consent === true) !== now) ctx.set({ answers: { consent: now ? true : null } });
      }
      /** 둘 다 동의했는지에 맞춰 알약·덩어리·고양이를 바꾼다 */
      function mood(instant) {
        const now = all();
        if (now === agreed) return;
        agreed = now; root.dataset.state = now ? "agreed" : "idle";
        if (instant || reduced()) { spot.set(now ? STAR : DISC); stageTo(now ? UP : PEEK, true); if (cat.state.pose !== "sit") cat.pose("sit"); return; }
        pill.classList.remove("is-full");
        if (now) {
          // 둘 다 동의한 순간: 알약이 통 튀고, 라일락 동그라미가 별 모양으로 튀고(뽁), 고양이가 눈을 동그랗게 뜨며 고개를 든다
          void pill.offsetWidth; pill.classList.add("is-full");
          ui.sfx("pop");
          spot.to(STAR, { kick: 6 }); stageTo(UP);
          cat.pose("round"); cat.pop(1.5);
          ctx.later(() => { if (!gone() && agreed && cat.state.pose === "round") { cat.pose("sit"); cat.pop(0.6); } }, 1150);
          ui.burst(root, 300, 664, [{ kind: "sparkle", dx: 8, dy: -40, s: 18, r: 12 }, { kind: "sparkle", dx: -112, dy: 6, s: 15, r: -10, delay: 60 }, { kind: "sparkle", dx: 82, dy: 16, s: 12, r: 6, delay: 110 }]);
        } else {
          spot.to(DISC); stageTo(PEEK);
          if (cat.state.pose !== "sit") cat.pose("sit");
        }
      }

      /** 알림만 모드: "알겠어요"를 누른 순간 고양이가 눈을 동그랗게 뜨며 고개를 든다(109가 보이는 화면이라 통통 튀는 소리와 조각은 없다) */
      function cheer(instant) {
        if (agreed) return;
        agreed = true; root.dataset.state = "agreed";
        if (instant || reduced()) { spot.set(STAR); stageTo(UP, true); if (cat.state.pose !== "sit") cat.pose("sit"); return; }
        spot.to(STAR, { kick: 4 }); stageTo(UP);
        cat.pose("round"); cat.pop(1.2);
        ctx.later(() => { if (!gone() && cat.state.pose === "round") { cat.pose("sit"); cat.pop(0.6); } }, 1150);
      }

      /** 카드 하나를 눌렀다 */
      const pressedAt = [];
      function press(i) {
        const t = performance.now(); if (pressedAt[i] != null && t - pressedAt[i] < 240) return; pressedAt[i] = t;      // 빠르게 두 번 눌러도 한 번만
        seq++; stampAll(true);                                  // "모두 동의해요"가 차례로 찍는 중이었다면 남은 것은 바로 찍는다
        on[i] = !on[i]; commit();
        if (on[i]) ui.sfx("pick", i); else ui.sfx("tick");
        stamp(i); if (on[i]) cat.pop(0.5);
        if (all()) { const mine = seq; ctx.later(() => { if (!gone() && mine === seq) mood(); }, COUNT + 110); } else mood();      // 알약의 동그라미가 다 찬 다음에
      }
      /** "모두 동의해요": 아직 안 켠 카드를 위에서부터 차례로 찍는다. 이미 다 켜져 있으면 모두 끈다 */
      let allAt = -1e9;
      allBtn.addEventListener("click", () => {
        const t = performance.now(); if (t - allAt < 320) return; allAt = t;
        const mine = ++seq;
        stampAll(true);
        if (all()) { on.fill(false); commit(); ui.sfx("tick"); stampAll(); mood(); return; }
        const todo = on.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
        on.fill(true); commit();
        if (reduced()) { ui.sfx("pick", todo[todo.length - 1]); stampAll(true); mood(true); return; }
        todo.forEach((i, n) => ctx.later(() => {
          if (gone() || mine !== seq) return;
          ui.sfx("pick", i); stamp(i); cat.pop(0.5);
          if (n === todo.length - 1) ctx.later(() => { if (!gone() && mine === seq) mood(); }, COUNT + 110);
        }, n * 150));
      });

      /* ── 처음 ── */
      if (N) {
        if (ctx.state === "agreed") { cheer(true); if (say) { said = true; say.finish(); } }
        else if (ctx.instant) stageTo(PEEK, true);
        else { stageTo(OUT, true); spot.set({ ...DISC, r: 0, y: 800 }); ctx.later(() => { if (!agreed) { stageTo(PEEK); spot.to(DISC); } }, 460); }
      }
      else if (ctx.state === "agreed" || (ctx.state == null && ctx.data.answers.consent === true)) { on.fill(true); commit(true); stampAll(true); mood(true); }
      else {
        if (ctx.data.answers.consent != null) ctx.set({ answers: { consent: null } });
        if (ctx.instant) stageTo(PEEK, true);
        else {
          // 큰 버튼 뒤에서 쏙 올라온다(뒤의 동그라미도 같이 솟는다)
          stageTo(OUT, true); spot.set({ ...DISC, r: 0, y: 800 });
          ctx.later(() => { if (!agreed) { stageTo(PEEK); spot.to(DISC); } }, 460);
        }
      }
    },
  });
})();
