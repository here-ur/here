/* 관심사: 기존 회전판 선택지. 제목과 선택 결과를 재배치하지 않고 다음 버튼으로 진행한다. */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP) return;
  const ui = HP.ui, el = ui.el;
  const mod = (n, d) => ((n % d) + d) % d;
  HP.addScene({
    id: "q2", field: "lilac", states: ["idle", "chosen"],
    build(ctx) {
      const { el: root, copy: C } = ctx, Q = C.Q.concern;
      const N = Q.options.length, STEP = 360 / N, CX = 195, CY = 574, R = 264;
      const before = Q.options.indexOf(ctx.data.answers.concern);
      let choice = ctx.state === "chosen" ? Math.max(0, before) : ctx.state == null ? before : -1;
      let angle = choice < 0 ? 0 : -choice * STEP, goal = angle, velocity = 0, drag = null, active = Math.max(0, choice), advancing = false;
      const reduced = ui.reduced();
      let intro = choice < 0 && !ctx.instant && !reduced, touched = !intro, motionBlur = 0;
      if (intro) angle = -1.35 * STEP;
      const title = ui.badgedHeadline(ui.lines(Q.text, [2, 4, 1]), { token: "마음" });
      let peekH = 230;
      root.append(ui.topbar(ctx), ui.block("hp-head", { top: 88 }, title));
      const peekLayer = el("div", "hp-catlayer hp-q2-peek"); root.append(peekLayer);
      const peek = ctx.cat({ x: CX, ground: 493, h: 230 }, { layer: peekLayer, poke: false });
      peek.el.querySelector(".hc-img").src = "/characters/roulette-look-down-v1.png";
      const dial = el("div", "hp-q2-dial"), NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("class", "hp-q2-disc"); svg.setAttribute("viewBox", "-100 -100 200 200"); svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(NS, "path"); path.setAttribute("d", ui.blobPath([[N, .2, 90]], 1)); svg.append(path);
      svg.style.cssText = `left:${CX-R}px;top:${CY-R}px;width:${2*R}px;height:${2*R}px`;
      const group = el("div", "hp-q2-opts"); group.setAttribute("role", "radiogroup"); group.setAttribute("aria-label", Q.text);
      const buttons = Q.options.map((label, i) => {
        const words = label === "건강·라이프스타일" ? ["건강·", "라이프스타일"] : label === "그냥 이야기하고 싶어요" ? label.split(" ") : [label];
        const text = el("span", "hp-q2-opt-label", words.length > 1 ? words.map(w => el("span", "", w)) : label);
        text.style.setProperty("--float-delay", `${i * -.73}s`);
        text.style.setProperty("--float-period", `${3.8 + i * .27}s`);
        text.style.setProperty("--float-tilt", `${i % 2 ? -.6 : .6}deg`);
        const button = el("button", "hp-q2-opt", text); button.type = "button";
        button.setAttribute("role", "radio"); button.setAttribute("aria-label", label); button.dataset.sfx = "none";
        ctx.on(button, "click", () => select(i)); group.append(button); return button;
      });
      const lens = el("div", "hp-q2-lens");
      const cta = ui.cta({ label: "다음", disabled: choice < 0, pages: ctx, onPress: () => {
        if (choice >= 0 && !advancing) { advancing = true; ctx.next(cta); }
      } });
      dial.append(svg, group, lens); root.append(dial, ui.questionFooter(ctx, cta, Q.id));
      ui.afterTitle(ctx, title, top => { peekH = ui.clamp(493 - top, 180, 250); render(); });
      function updateLens(animateChanges = true) {
        const key = `${active}:${active === choice}`;
        if (lens.dataset.key === key) return;
        lens.dataset.key = key;
        const animate = animateChanges && Boolean(lens.firstChild) && !reduced;
        const pill = ui.pill({ text: Q.options[active], dot: active === choice ? "checkFilled" : null, onPress: () => select(active), label: `${Q.options[active]}, 선택` });
        if (active === choice) pill.querySelector(".hp-pill-dot").classList.add("is-complete");
        else pill.classList.add("is-unselected");
        lens.replaceChildren(pill);
        if (animate) lens.firstChild.querySelector(".hp-pill-text").animate([{ opacity: .35, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.22,1,.36,1)" });
      }
      function render() {
        svg.style.transform = `rotate(${angle}deg)`;
        const rim = CY - R * (1 - .2 * Math.cos(N * angle * Math.PI / 180)) / 1.2;
        peek.place({ x: CX, ground: 493 + ui.clamp((rim - (CY-R*2/3))*.25, -16, 0), h: peekH });
        peekLayer.style.setProperty("--peek-tilt", `${ui.clamp(velocity/600,-1,1)*1.5}deg`);
        const next = mod(Math.round(-angle / STEP), N);
        if (next !== active || !lens.firstChild) { active = next; updateLens(); }
        const positions = buttons.map((button, i) => {
          const a = (angle + i * STEP) * Math.PI / 180, far = Math.abs(mod(angle + i * STEP + 180, 360) - 180);
          const low = ui.clamp((far - STEP) / STEP, 0, 1), ring = R * ui.lerp(.46, .5, low);
          const tilt = 8*Math.sin(a), radians = Math.abs(tilt)*Math.PI/180;
          // Include the rotated outline and floating motion in each label's collision bounds.
          const w = button.firstChild.offsetWidth, h = button.firstChild.offsetHeight;
          const halfW = (w*Math.cos(radians)+h*Math.sin(radians))/2+5;
          const halfH = (h*Math.cos(radians)+w*Math.sin(radians))/2+6;
          return { button, i, far, tilt, halfW, halfH, x: CX+ring*Math.sin(a), y: CY-ring*Math.cos(a) };
        });
        const visible = positions.filter(p => p.far > 40);
        const contain = p => {
          p.x = ui.clamp(p.x, 18+p.halfW, 372-p.halfW);
          p.y = ui.clamp(p.y, 488+p.halfH, 706-p.halfH);
        };
        for (let pass=0; pass<18; pass++) {
          visible.forEach(contain);
          for (let i=0; i<visible.length; i++) for (let j=i+1; j<visible.length; j++) {
            const a=visible[i], b=visible[j], dx=b.x-a.x, dy=b.y-a.y;
            const ox=a.halfW+b.halfW+10-Math.abs(dx), oy=a.halfH+b.halfH+10-Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            const sx=dx<0?-1:1, sy=dy<0?-1:1;
            const ax=sx>0?a.x-18-a.halfW:372-a.halfW-a.x, bx=sx>0?372-b.halfW-b.x:b.x-18-b.halfW;
            const ay=sy>0?a.y-488-a.halfH:706-a.halfH-a.y, by=sy>0?706-b.halfH-b.y:b.y-488-b.halfH;
            // At the lower boundary, separate wide labels sideways instead of pushing them back into each other.
            const horizontal = ax+bx>=ox && (ox<oy || ay+by<oy);
            const overlap=(horizontal?ox:oy)+.1, roomA=Math.max(0,horizontal?ax:ay), roomB=Math.max(0,horizontal?bx:by);
            let moveA=Math.min(overlap/2,roomA), moveB=Math.min(overlap-moveA,roomB);
            moveA+=Math.min(Math.max(0,overlap-moveA-moveB),roomA-moveA);
            if (horizontal) { a.x-=moveA*sx; b.x+=moveB*sx; }
            else { a.y-=moveA*sy; b.y+=moveB*sy; }
          }
        }
        visible.forEach(contain);
        positions.forEach(({button,i,far,tilt,x,y}) => {
          button.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) rotate(${tilt}deg)`;
          button.style.opacity = String(ui.clamp((far - 40) / 18, 0, 1));
          button.style.pointerEvents = far < 40 ? "none" : "auto";
          button.tabIndex = i === active ? 0 : -1; button.setAttribute("aria-checked", String(i === choice));
        });
      }
      function select(i, instant = false) {
        if (advancing) return;
        touched = true; intro = false;
        choice = i; goal = -i * STEP + 360 * Math.round((angle + i * STEP) / 360);
        if (instant || ui.reduced()) {
          angle = goal; velocity = 0; active = i; motionBlur = 0;
          group.style.filter = "none"; svg.style.filter = "none";
        }
        ctx.set({ answers: { concern: Q.options[i] } }); root.dataset.state = "chosen";
        cta.disabled = false; updateLens(!instant); render();
      }
      ctx.on(group, "keydown", event => {
        const step = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
        const to = event.key === "Home" ? 0 : event.key === "End" ? N-1 : step ? mod(active+step,N) : -1;
        if (to < 0) return; event.preventDefault(); select(to, true); buttons[to].focus({ preventScroll: true });
      });
      ctx.on(dial, "pointerdown", event => {
        if (event.target.closest("button") || ui.reduced()) return;
        const p = ctx.point(event); touched = true; intro = false;
        drag = { previous: Math.atan2(p.y-CY,p.x-CX), time: performance.now() };
        velocity = 0; dial.classList.add("is-dragging"); dial.setPointerCapture(event.pointerId);
      });
      ctx.on(dial, "pointermove", event => {
        if (!drag) return; const p = ctx.point(event), now = Math.atan2(p.y-CY,p.x-CX);
        let delta = now-drag.previous; if (delta > Math.PI) delta -= 2*Math.PI; if (delta < -Math.PI) delta += 2*Math.PI;
        const time = performance.now(), degrees = delta*180/Math.PI;
        velocity = ui.lerp(velocity, degrees/Math.max(.008,(time-drag.time)/1000), .45);
        angle += degrees; goal = angle; drag.previous = now; drag.time = time; render();
      });
      const release = () => {
        if (!drag) return;
        if (performance.now()-drag.time > 90) velocity = 0;
        drag = null; dial.classList.remove("is-dragging");
        velocity = ui.clamp(velocity, -520, 520);
        goal = Math.round((angle+velocity*.16)/STEP)*STEP;
      };
      ctx.on(dial, "pointerup", release); ctx.on(dial, "pointercancel", release);
      if (!reduced) ctx.loop(dt => {
        const moving = Math.abs(goal-angle)>=.01 || Math.abs(velocity)>=.1;
        if (!drag && moving) {
          // Near-critical damping avoids the sharp acceleration and rebound at each stop.
          velocity += ((goal-angle)*(intro ? 34 : 64)-velocity*(intro ? 11.8 : 16))*dt;
          velocity = ui.clamp(velocity, -360, 360); angle += velocity*dt;
          if (Math.abs(goal-angle)<.06 && Math.abs(velocity)<1.2) { angle=goal; velocity=0; intro=false; }
          render();
        }
        const speed = drag && performance.now()-drag.time>80 ? 0 : Math.abs(velocity);
        const targetBlur = ui.clamp((speed-35)/300, 0, 1)*2.2;
        motionBlur = ui.lerp(motionBlur, targetBlur, 1-Math.exp(-dt*14));
        if (targetBlur===0 && motionBlur<.015) motionBlur=0;
        // Blur only the moving disc and orbiting labels; keep the central choice readable.
        group.style.filter = motionBlur ? `blur(${motionBlur.toFixed(3)}px)` : "none";
        svg.style.filter = motionBlur ? `blur(${(motionBlur*.6).toFixed(3)}px)` : "none";
        dial.classList.toggle("is-rotating", Boolean(drag) || moving);
      });
      render();
      if (intro) {
        const entering = dial.animate([{ opacity: 0, transform: "translateY(90px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 1050, easing: ui.ease.soft });
        const peekIn = peekLayer.animate([{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 700, delay: 400, easing: ui.ease.soft, fill: "backwards" });
        ctx.onDestroy(() => { entering.cancel(); peekIn.cancel(); });
      }
      if (!reduced && !ctx.instant) {
        let remaining = 3, side = 1;
        const nudge = () => {
          if (touched || remaining-- <= 0) return;
          if (!drag && !intro && Math.abs(goal-angle)<.06) { goal=angle; velocity=140*side; side=-side; }
          ctx.later(nudge,4200);
        };
        ctx.later(nudge,3400);
      }
    },
  });
})();
