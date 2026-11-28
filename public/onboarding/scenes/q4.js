/* 곁에 있는 사람: 검은 세 칸 슬라이더. 몸통은 고정하고 고개만 천천히 낮춘다. */
(() => {
  "use strict";
  const HP = window.HerePhone;
  if (!HP) return;
  const ui = HP.ui, el = ui.el;
  // 같은 원본에서 슬라이더 값에 따라 고개와 시선의 위치를 이어 준다.
  function createCat(ctx, holder) {
    const fallback = el("img", "hp-q4-cat-fallback"); fallback.src = "/characters/motion/sit.webp"; fallback.alt = "";
    const canvas = el("canvas", "hp-q4-cat-canvas");
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(190.8 * density); canvas.height = Math.round(260 * density);
    holder.append(fallback, canvas);
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) { canvas.remove(); return () => {}; }
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `attribute vec2 position; varying vec2 uv; void main(){ uv=vec2((position.x+1.0)*.5,(1.0-position.y)*.5); gl_Position=vec4(position,0.0,1.0); }`);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision highp float;
      varying vec2 uv;
      uniform sampler2D image;
      uniform float amount;
      void main(){
        // Translate the face as one piece. Ease the nod into the ears and neck.
        float head = 1.0 - smoothstep(.63, .79, uv.y);
        float nod = mix(.006, .018, smoothstep(.03, .29, uv.y));
        vec2 p = uv - vec2(0.0, amount * nod * head);
        if (p.y < 0.0) { gl_FragColor = vec4(0.0); return; }

        // Both lids start at y=.346 in the sitting texture. Move only the
        // pupil area inside each iris so the lid and cheek outlines stay put.
        float eyeX = min(abs(p.x - .263), abs(p.x - .649));
        float iris = (1.0 - smoothstep(.038, .047, eyeX))
                   * smoothstep(.348, .361, p.y)
                   * (1.0 - smoothstep(.390, .400, p.y));
        p.y -= amount * .008 * iris;
        gl_FragColor = texture2D(image, p);
      }
    `);
    if (!vertex || !fragment) { canvas.remove(); return () => {}; }
    const program = gl.createProgram(); gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { canvas.remove(); return () => {}; }
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position"); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(program, "image"), 0);
    const amount = gl.getUniformLocation(program, "amount");
    let current=0, target=0, ready=false, alive=true;
    const draw = () => {
      if (!ready || !alive) return;
      gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform1f(amount, current); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      canvas.dataset.pose=current.toFixed(4);
    };
    fallback.onload = () => {
      if (!alive) return;
      gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallback);
      ready=true; draw(); fallback.style.visibility="hidden"; canvas.dataset.renderer="webgl";
    };
    if (fallback.complete && fallback.naturalWidth) fallback.onload();
    ctx.loop(dt => {
      if (Math.abs(current-target)<.0005) { if (current!==target) { current=target; draw(); } return; }
      current=ui.lerp(current,target,1-Math.exp(-dt*14)); draw();
    });
    ctx.onDestroy(() => { alive=false; fallback.onload=null; gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); });
    return (progress, instant) => { target=progress; if (instant) { current=target; draw(); } };
  }
  HP.addScene({
    id: "q4", field: "yellow", states: ["idle", "chosen"],
    build(ctx) {
      const { el: root, copy: C } = ctx, Q = C.Q.support;
      const last = Q.options.length - 1;
      let choice = -1, line = null;
      root.append(ui.topbar(ctx, { pages: true }));
      const title = ui.badgedHeadline(ui.lines(Q.text, [3, 3, 1]), { token: "사람" });
      const say = el("div", "hp-q4-say"); say.setAttribute("aria-live", "polite");
      const hint = el("p", "hp-body hp-q4-sub", C.eyebrows.support); say.append(hint);
      root.append(ui.block("hp-head hp-q4-head", { top: 88 }, title, say));

      const cat = el("div", "hp-q4-cat"); cat.setAttribute("aria-hidden", "true"); root.append(cat);
      const pose = createCat(ctx, cat);

      const slider = el("div", "hp-q4-slider");
      const waveHeights = [5, 9, 15, 22, 26, 20, 12, 17, 24, 18, 10, 14, 8, 4];
      const rail = el("div", "hp-q4-rail");
      rail.setAttribute("aria-hidden", "true");
      Q.options.forEach((_, i) => {
        if (i > 0) {
          const heights = i % 2 ? waveHeights : [...waveHeights].reverse();
          const wave = el("span", "hp-q4-wave", heights.map(height => {
            const bar = el("i"); bar.style.height = height + "px"; return bar;
          }));
          rail.append(wave);
        }
        rail.append(el("i", "hp-q4-ring"));
      });
      const thumb = el("span", "hp-q4-thumb", ui.pawIcon());
      const travel = el("div", "hp-q4-travel", thumb);
      travel.setAttribute("aria-hidden", "true");
      const range = el("input", "hp-q4-range");
      range.type = "range"; range.min = "0"; range.max = String(last); range.step = ".01"; range.value = "0";
      range.setAttribute("aria-label", Q.text); range.setAttribute("aria-orientation", "horizontal");
      range.setAttribute("aria-valuetext", "아직 선택하지 않았어요");
      slider.append(rail, travel, range); root.append(slider);
      const labels = el("div", "hp-q4-labels"); labels.setAttribute("role", "group"); labels.setAttribute("aria-label", Q.text);
      const buttons = Q.options.map((label, i) => {
        const button = el("button", "hp-q4-label", label);
        button.type = "button"; button.setAttribute("aria-pressed", "false");
        ctx.on(button, "click", () => update(i, true)); labels.append(button); return button;
      });
      const next = ui.cta({ label: "다음", disabled: true, pages: ctx, onPress: () => {
        if (choice < 0) return; if (line) line.finish(); ctx.next(next);
      } });
      root.append(labels, ui.questionFooter(ctx, next, Q.id));

      function update(value, commit = false, instant = false) {
        const v = ui.clamp(value, 0, last), progress = v / last, near = Math.round(v);
        range.value = String(v);
        root.classList.toggle("is-q4-instant", instant || ui.reduced());
        travel.style.setProperty("--support-position", `${progress * 100}%`);
        pose(progress, instant || ui.reduced());
        range.setAttribute("aria-valuetext", Q.options[near]);
        buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === near && (commit || choice >= 0))));
        if (!commit) return;
        const changed = choice !== near; choice = near;
        ctx.set({ answers: { support: Q.options[choice] } }); root.dataset.state = "chosen"; next.disabled = false;
        if (!changed) return;
        if (line) line.finish();
        line = ui.typed(C.REPLIES.support[Q.options[choice]], "hp-q4-reply"); say.replaceChildren(line);
        if (instant || ui.reduced()) line.finish(); else line.play({ speed: 30 });
      }
      ctx.on(range, "pointerdown", () => root.classList.add("is-q4-dragging"));
      ctx.on(range, "input", () => update(Number(range.value)));
      const commit = () => { root.classList.remove("is-q4-dragging"); update(Math.round(Number(range.value)), true); };
      ctx.on(range, "pointerup", commit); ctx.on(range, "change", commit);
      ctx.on(range, "pointercancel", () => { root.classList.remove("is-q4-dragging"); update(choice < 0 ? 0 : choice); });
      ctx.on(range, "keydown", event => {
        const direction = ["ArrowUp", "ArrowRight"].includes(event.key) ? 1 : ["ArrowDown", "ArrowLeft"].includes(event.key) ? -1 : 0;
        const at = Math.round(Number(range.value));
        const target = event.key === "Home" ? 0 : event.key === "End" ? last : direction ? ui.clamp(at + direction, 0, last) : -1;
        if (target < 0) return; event.preventDefault(); update(target, true, true);
      });
      ctx.onDestroy(() => { if (line) line.finish(); });
      const before = Q.options.indexOf(ctx.data.answers.support);
      if (ctx.state === "chosen") update(Math.max(0, before), true, true);
      else if (ctx.state == null && before >= 0) update(before, true, true);
    },
  });
})();
