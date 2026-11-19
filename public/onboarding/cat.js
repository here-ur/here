/* HereCat — 고양이 한 마리를 무대에 세우고, 자세를 바꾸고, 걸어오게 한다.
 *
 * 좌표: 무대(stage) 안의 px. 고양이의 기준점은 '발이 닿는 바닥선의 가운데'다.
 *   x      = 기준점의 가로 위치
 *   ground = 바닥선의 세로 위치(무대 위에서부터)
 *   h      = 앉은 키(px). 모든 자세·영상·걷기가 이 값 하나로 같은 비율이 된다.
 *
 * 쓰는 법:
 *   await HereCat.preload("../../assets/");            // 걷기 스프라이트·정지 그림을 미리 받는다
 *   const cat = HereCat.create(stageEl, { assets: "../../assets/" });
 *   cat.place({ x: 195, ground: 560, h: 150 });        // 바로 놓기 (옵션 { ms: 600 }이면 부드럽게)
 *   cat.pose("sleep");                                  // 자세 바꾸기
 *   await cat.walkTo({ x: 195, ground: 640, h: 230 }, { duration: 2600 });  // 일어나서 걸어와 앉는다
 *   cat.pop();                                          // 작게 통 튀는 반응
 *
 * 자세:
 *   정지 그림  sit(기본, 고해상도) · round(눈이 동그래짐) · grumble(입 벌리고 한마디) · purr(식빵, 눈 감고 골골)
 *   반복 영상  sleep(웅크려 잠) · yawn(하품) · groom(발 핥기) · belly(배 보이기) · glare(엎드려 째려봄) · swat(앞발 툭)
 *
 * 모양 바꾸기(CSS 변수, 무대나 .hc에 준다):
 *   --hc-shadow-bg   그림자 배경(기본 반투명 검정). 예: 하프톤 점무늬 radial-gradient
 *   --hc-shadow-blur 그림자 흐림(기본 3px)
 *   --hc-shadow-o    그림자 불투명도(기본 1)
 * 동작 줄이기 설정에서는 걷지 않고 바로 옮겨 앉힌다.
 */
(() => {
  const FW = 493, FH = 398, COLS = 7;             // 걷기 프레임 한 장
  const SIT = 314.9, GROUND = 379.5;              // 프레임 안에서 앉은 키와 바닥선(px)
  const BASE = 300;                               // 내부 배치 기준 앉은 키(px). 실제 크기는 transform scale로 맞춘다
  const SHEETS = [{ src: "walk-a.webp", from: 0, to: 48 }, { src: "walk-b.webp", from: 49, to: 96 }];
  const START = [6, 21], LOOP = [22, 62], STOP = [63, 96];  // 일어서기 · 걷기 한 바퀴 · 멈춰 앉기
  const MOVE_FROM = 15, MOVE_TO = 82;             // 이 프레임 사이에서만 자리를 옮긴다(일어서는 중·앉는 중에는 제자리)
  const FRAME_MS = 42;
  // 정지 그림: rel = 그림 높이 / 앉은 키
  const STILLS = {
    sit: { w: 734, h: 1000, rel: 1 },
    round: { w: 534, h: 717, rel: 1 },
    grumble: { w: 387, h: 414, rel: 0.9059 },
    purr: { w: 428, h: 281, rel: 0.6315 },
  };
  // 그림 파일 이름: 시안 폴더에서는 "cat-sleep.webp"처럼 앞에 cat-가 붙고, 앱에서는 public/characters/motion의 이름(sleep.webp)을 그대로 쓴다
  const fileOf = (name) => (window.HereCatPlainNames ? "" : "cat-") + name + ".webp";
  // 반복 영상(493×381): 그림 높이 = 앉은 키의 1.21배, 바닥선 아래로 0.0587배 내려온다
  const CLIPS = ["sleep", "yawn", "groom", "belly", "glare", "swat"];
  const CLIP = { w: 493, h: 381, rel: 1.21, drop: 0.0587 };

  const cache = new Map();
  function load(url) {
    if (!cache.has(url)) cache.set(url, new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error("이미지를 못 받았어요: " + url)); im.src = url; }));
    return cache.get(url);
  }
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

  // 스타일은 무대가 속한 문서(또는 섀도 루트)마다 한 번 넣는다.
  const styled = new WeakSet();
  function injectStyle(stage) {
    const doc = stage.ownerDocument;
    const root = stage.getRootNode ? stage.getRootNode() : doc;
    const target = root && root.nodeType === 11 ? root : doc.head;   // 11 = 섀도 루트(DocumentFragment)
    if (styled.has(target)) return; styled.add(target);
    const s = doc.createElement("style");
    s.textContent = `
.hc{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;will-change:transform;z-index:2}
.hc-shadow{position:absolute;left:${-0.31 * BASE}px;top:${-0.035 * BASE}px;width:${0.62 * BASE}px;height:${0.07 * BASE}px;border-radius:50%;background:var(--hc-shadow-bg,rgb(0 0 0 / 22%));filter:blur(var(--hc-shadow-blur,3px));opacity:var(--hc-shadow-o,1)}
.hc-body{position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0}
.hc-img,.hc-walk{position:absolute;display:block;max-width:none;user-select:none;-webkit-user-drag:none}
.hc-walk{left:${-(FW / SIT) * BASE / 2}px;top:${-(GROUND / SIT) * BASE}px;width:${(FW / SIT) * BASE}px;height:${(FH / SIT) * BASE}px;opacity:0}
.hc[data-mode="walk"] .hc-walk{opacity:1}
.hc[data-mode="walk"] .hc-img{opacity:0}
.hc-img{transition:opacity 140ms linear}
@media (prefers-reduced-motion:no-preference){
  .hc[data-pose="sit"][data-mode="still"] .hc-body,.hc[data-pose="round"] .hc-body,.hc[data-pose="grumble"] .hc-body,.hc[data-pose="purr"] .hc-body{animation:hc-breathe 3.6s ease-in-out infinite}
}
@keyframes hc-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.006,1.014)}}`;
    target.appendChild(s);
  }

  const HereCat = {
    /** 걷기 스프라이트와 정지 그림을 미리 받는다. clips에 이름을 주면 그 영상도 받는다. */
    preload(assets = "assets/", clips = []) {
      return Promise.all([
        ...SHEETS.map((s) => load(assets + s.src)),
        ...Object.keys(STILLS).map((n) => load(assets + fileOf(n))),
        ...clips.map((c) => load(assets + fileOf(c))),
      ]);
    },
    poses: [...Object.keys(STILLS), ...CLIPS],

    create(stage, { assets = "assets/" } = {}) {
      const doc = stage.ownerDocument;
      injectStyle(stage);
      const el = doc.createElement("div"); el.className = "hc"; el.setAttribute("aria-hidden", "true");
      el.innerHTML = `<span class="hc-shadow"></span><div class="hc-body"><img class="hc-img" alt="" draggable="false"><canvas class="hc-walk" width="${FW}" height="${FH}"></canvas></div>`;
      stage.appendChild(el);
      const body = el.querySelector(".hc-body"), img = el.querySelector(".hc-img"), canvas = el.querySelector(".hc-walk");
      const ctx = canvas.getContext("2d");
      const cur = { x: 0, ground: 0, h: BASE };
      let pose = "sit", raf = 0, walking = null, placeAnim = null;

      function apply() { el.style.transform = `translate(${cur.x}px, ${cur.ground}px) scale(${cur.h / BASE})`; }
      function layoutImg(name) {
        const st = STILLS[name];
        const w = st ? (st.w / st.h) * st.rel * BASE : (CLIP.w / CLIP.h) * CLIP.rel * BASE;
        const h = st ? st.rel * BASE : CLIP.rel * BASE;
        const drop = st ? 0 : CLIP.drop * BASE;
        img.style.width = w + "px"; img.style.height = h + "px"; img.style.left = -w / 2 + "px"; img.style.top = -h + drop + "px";
      }
      function drawFrame(f) {
        const sheet = f <= SHEETS[0].to ? SHEETS[0] : SHEETS[1];
        const im = sheet.img; if (!im) return;
        const k = f - sheet.from;
        ctx.clearRect(0, 0, FW, FH);
        ctx.drawImage(im, (k % COLS) * FW, Math.floor(k / COLS) * FH, FW, FH, 0, 0, FW, FH);
      }
      function setPose(name) {
        if (!STILLS[name] && !CLIPS.includes(name)) throw new Error("모르는 자세: " + name);
        pose = name; el.dataset.pose = name; el.dataset.mode = "still";
        const url = assets + fileOf(name);
        layoutImg(name);
        if (img.getAttribute("src") !== url) img.src = url;
      }
      function finishWalk() {
        cancelAnimationFrame(raf); raf = 0;
        if (!walking) return;
        const w = walking; walking = null;
        Object.assign(cur, w.to); apply(); setPose("sit"); w.resolve();
      }

      const actor = {
        el,
        get state() { return { ...cur, pose, walking: Boolean(walking) }; },
        /** 자리·크기를 정한다. { ms }를 주면 그 시간 동안 부드럽게 옮긴다(걷지 않고 미끄러지듯). */
        place(to, { ms = 0, easing = "cubic-bezier(.2,.8,.2,1)" } = {}) {
          if (walking) finishWalk();
          const from = { ...cur };
          Object.assign(cur, to);
          if (placeAnim) { placeAnim.cancel(); placeAnim = null; }
          if (ms && !reduced() && el.animate) {
            const t = (c) => `translate(${c.x}px, ${c.ground}px) scale(${c.h / BASE})`;
            placeAnim = el.animate([{ transform: t(from) }, { transform: t(cur) }], { duration: ms, easing });
          }
          apply();
          return actor;
        },
        /** 자세를 바꾼다. */
        pose(name) { if (walking) finishWalk(); setPose(name); return actor; },
        /** 일어나서 걸어와 앉는다. duration은 전체 시간(ms, 최소 약 1.7초). 끝나면 sit 자세가 된다. */
        walkTo(to, { duration = 2600 } = {}) {
          if (walking) finishWalk();
          const target = { ...cur, ...to };
          if (reduced() || !SHEETS[0].img) { actor.place(target); setPose("sit"); return Promise.resolve(); }
          const s = START[1] - START[0] + 1, l = LOOP[1] - LOOP[0] + 1, e = STOP[1] - STOP[0] + 1;
          // 걷기 바퀴 수를 시간에 맞춰 고르고, 재생 속도를 조금 조절해 딱 맞춘다(0.85~1.7배).
          let loops = Math.max(0, Math.round((duration / FRAME_MS * 1.2 - (s + e)) / l));
          let total = s + loops * l + e;
          const frameMs = Math.max(FRAME_MS / 1.7, Math.min(FRAME_MS / 0.85, duration / total));
          const seq = [];
          for (let f = START[0]; f <= START[1]; f++) seq.push(f);
          for (let n = 0; n < loops; n++) for (let f = LOOP[0]; f <= LOOP[1]; f++) seq.push(f);
          for (let f = STOP[0]; f <= STOP[1]; f++) seq.push(f);
          const moveA = MOVE_FROM - START[0], moveB = seq.length - 1 - (STOP[1] - MOVE_TO);
          const from = { ...cur };
          el.dataset.mode = "walk"; el.dataset.pose = "walk"; drawFrame(seq[0]);
          return new Promise((resolve) => {
            walking = { to: target, resolve };
            const t0 = performance.now();
            const tick = (now) => {
              if (!walking) return;
              const ft = (now - t0) / frameMs;
              const i = Math.min(seq.length - 1, Math.floor(ft));
              drawFrame(seq[i]);
              const p = ease(clamp01((ft - moveA) / (moveB - moveA)));
              cur.x = from.x + (target.x - from.x) * p;
              cur.ground = from.ground + (target.ground - from.ground) * p;
              cur.h = Math.exp(Math.log(from.h) + (Math.log(target.h) - Math.log(from.h)) * p);
              apply();
              if (ft >= seq.length) finishWalk(); else raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          });
        },
        /** 걷는 중이면 바로 끝자리에 앉힌다. */
        settle() { if (walking) finishWalk(); return actor; },
        /** 작게 통 튀는 반응. */
        pop(scale = 1) {
          if (reduced() || !body.animate) return actor;
          body.animate([{ transform: "scale(1,1)" }, { transform: `scale(${1 + 0.06 * scale},${1 - 0.08 * scale})`, offset: 0.3 }, { transform: `scale(${1 - 0.03 * scale},${1 + 0.05 * scale})`, offset: 0.62 }, { transform: "scale(1,1)" }], { duration: 460, easing: "cubic-bezier(.3,.7,.4,1)" });
          return actor;
        },
        destroy() { cancelAnimationFrame(raf); walking = null; el.remove(); },
      };

      // 스프라이트가 캐시에 있으면 바로 쓰고, 없으면 받는 대로 붙인다.
      SHEETS.forEach((sh) => load(assets + sh.src).then((im) => { sh.img = im; }).catch(() => {}));
      setPose("sit"); apply();
      return actor;
    },
  };
  HereCat.file = fileOf;
  window.HereCat = HereCat;
})();
