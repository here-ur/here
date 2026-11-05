"use client";

import { useEffect, useRef } from "react";
import type { Garden, Plant, SeasonId } from "@/lib/garden";
import { COLORS, type ColorId, type ShapeId } from "@/lib/onboarding";
import type { SkyId } from "@/lib/report";
import Buddy from "./Buddy";
import { SKY_LOOK } from "./sky";

// 구름 정원 3D. 앱의 부드러운 2D 느낌에 맞춰 세 가지를 지킨다.
// 1) 몽글이는 홈과 똑같은 2D 그림을 그대로 섬 위에 세운다(늘 보는 사람을 향하는 그림판).
// 2) 섬·식물은 각지지 않은 매끈한 도형에 말랑한 파스텔 색, 빛은 부드럽고 그림자는 연하게.
// 3) 배경은 그리지 않고 화면 뒤의 밝은 바탕(SkyBackdrop)이 비치게 둔다.
// 손가락으로 좌우로 돌려 볼 수 있고, 동작 줄이기에서는 멈춘 한 장면만 그린다.

type Props = { garden: Garden; season: SeasonId; weather: SkyId | null; color: ColorId; shape?: ShapeId; accessory?: string; transparent?: boolean };

const SEASON = {
  spring: { grass: "#D9F1DE", grass2: "#C6E8CE", leaf: "#A9DEB6", fall: "#F8CDE8", kind: "petal" },
  summer: { grass: "#CFEDD6", grass2: "#BBE4C6", leaf: "#95D6AB", fall: "#FFEAB0", kind: "glint" },
  autumn: { grass: "#E6E8CC", grass2: "#D9DCB2", leaf: "#F3C49A", fall: "#F4B48A", kind: "leaf" },
  winter: { grass: "#F0F3F9", grass2: "#E4EAF3", leaf: "#C4DDD0", fall: "#FFFFFF", kind: "snow" },
} as const;

const SKY_GRADIENT: Record<SkyId | "none", string> = {
  none: "linear-gradient(180deg,#F3F1FF 0%,#FAFCFE 70%)",
  sunny: "linear-gradient(180deg,#FFF3D9 0%,#FFFBF2 70%)",
  cozy: "linear-gradient(180deg,#FFE6DC 0%,#FFF7F3 70%)",
  cloudy: "linear-gradient(180deg,#E9EDF4 0%,#F7F8FB 70%)",
  rain: "linear-gradient(180deg,#DFE8FA 0%,#F3F6FD 70%)",
  thunder: "linear-gradient(180deg,#EAE3FB 0%,#F7F4FE 70%)",
  wind: "linear-gradient(180deg,#DFF4EE 0%,#F4FBF8 70%)",
};

/** 2D 몽글이 SVG를 그림판에 올릴 수 있게 여백을 두고 비트맵으로 바꾼다. */
async function rasterize(svg: SVGSVGElement, size: number) {
  // SVG images loaded into a canvas cannot load external resources. Embed the
  // original cat artwork in the detached copy; never mutate the visible Buddy.
  const snapshot = svg.cloneNode(true) as SVGSVGElement;
  await Promise.all(Array.from(snapshot.querySelectorAll("image")).map(async (image) => {
    const href = image.getAttribute("href");
    if (!href || href.startsWith("data:")) return;
    const response = await fetch(href);
    if (!response.ok) throw new Error("buddy artwork");
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("buddy artwork"));
      reader.readAsDataURL(blob);
    });
    image.setAttribute("href", dataUrl);
  }));
  // 뒤쪽 빛(블러)이 필터 영역에서 네모나게 잘리지 않도록 영역을 넉넉히 넓힌다.
  const markup = new XMLSerializer().serializeToString(snapshot)
    .replace(/viewBox="0 0 240 240"/, 'viewBox="-40 -40 320 320"')
    .replace(/<filter([^>]*?) x="-\d+%" y="-\d+%" width="\d+%" height="\d+%"/g, '<filter$1 x="-150%" y="-150%" width="400%" height="400%"')
    // 뒤쪽 빛은 3D에서는 빛과 그림자가 대신하므로 뺀다(투명 영역이 그림판에서 네모처럼 비치는 걸 막는다).
    .replace(/<path[^>]*filter="url\(#[^"]*-glow\)"[^>]*\/>/g, "")
    .replace(/ width="\d+"/, ` width="${size}"`).replace(/ height="\d+"/, ` height="${size}"`);
  const img = new Image();
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error("buddy")); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`; });
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, size, size);
  // 블러 필터가 남기는 거의 투명한 얼룩(알파 1~5)을 완전히 지운다. 안 지우면 3D에서 옅은 네모로 비친다.
  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;
  for (let k = 3; k < px.length; k += 4) if (px[k] < 10) { px[k] = 0; px[k - 1] = 0; px[k - 2] = 0; px[k - 3] = 0; }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export default function Garden3D({ garden, season, weather, color, shape = "cloud", accessory, transparent = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const buddyRef = useRef<HTMLDivElement>(null);
  const plantsKey = garden.plants.map((p) => `${p.topic}${p.stage}${p.sky ?? ""}`).join(",");

  useEffect(() => {
    const host = hostRef.current;
    const buddySvg = buddyRef.current?.querySelector("svg");
    if (!host || !buddySvg) return;
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const [THREE, { OrbitControls }, buddyCanvas] = await Promise.all([
        import("three"),
        import("three/addons/controls/OrbitControls.js"),
        rasterize(buddySvg, 768).catch(() => null),
      ]);
      if (disposed) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const palette = COLORS.find((c) => c.id === color) ?? COLORS[0];
      const look = SEASON[season];
      const warm = weather === "sunny" || weather === "cozy";

      // ── 무대: 색을 그대로 내고(톤매핑 없음), 빛은 넓게 퍼지고 그림자는 연하게 ──
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      host.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "pan-y";

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
      const fit = 10.5 + garden.level.level * 0.9;
      camera.position.set(0, fit * 0.6, fit * 0.92);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0.75, 0);
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.minPolarAngle = 0.82;
      controls.maxPolarAngle = 1.05;
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.45;

      scene.add(new THREE.HemisphereLight("#FFFFFF", palette.light, 1.35));
      scene.add(new THREE.AmbientLight("#FFFFFF", 0.55));
      const sun = new THREE.DirectionalLight(warm ? "#FFF1D6" : "#FFFFFF", warm ? 1.4 : 1.1);
      sun.position.set(4, 9, 5);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.radius = 10;
      sun.shadow.bias = -0.0006;
      sun.shadow.intensity = 0.4;
      sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
      scene.add(sun);
      const fill = new THREE.DirectionalLight(palette.light, 0.5);
      fill.position.set(-6, 3, -4);
      scene.add(fill);

      const disposables: { dispose(): void }[] = [];
      const mats = new Map<string, InstanceType<typeof THREE.MeshStandardMaterial>>();
      const soft = (hex: string) => {
        let m = mats.get(hex);
        if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, metalness: 0 }); mats.set(hex, m); disposables.push(m); }
        return m;
      };
      const tone = (hex: string, toWhite: number) => `#${new THREE.Color(hex).lerp(new THREE.Color("#FFFFFF"), toWhite).getHexString()}`;
      const mesh = (geo: NonNullable<ConstructorParameters<typeof THREE.Mesh>[0]>, material: InstanceType<typeof THREE.Material>, shadow = true) => {
        disposables.push(geo);
        const m = new THREE.Mesh(geo, material);
        m.castShadow = shadow; m.receiveShadow = true;
        return m;
      };

      // ── 구름 섬: 매끈한 잔디 언덕 + 연한 흙 단면 + 받쳐 주는 구름 ──
      const world = new THREE.Group();
      scene.add(world);
      const R = 2.1 + garden.level.level * 0.36;
      const profile = [new THREE.Vector2(0, 0.4)];
      for (let i = 1; i <= 14; i++) { const t = i / 14; profile.push(new THREE.Vector2(R * t, 0.4 * (1 - t * t) + 0.02)); }
      profile.push(new THREE.Vector2(R * 1.01, -0.06), new THREE.Vector2(R * 0.96, -0.18), new THREE.Vector2(0, -0.18));
      const grassMat = new THREE.MeshStandardMaterial({ color: look.grass, roughness: 1, side: THREE.DoubleSide });
      disposables.push(grassMat);
      world.add(mesh(new THREE.LatheGeometry(profile, 72), grassMat, false));
      const soil = mesh(new THREE.CylinderGeometry(R * 0.99, R * 0.84, 0.4, 72, 1, true), soft(season === "winter" ? "#EBE9F2" : "#F1E4D4"), false);
      soil.position.y = -0.3; world.add(soil);
      const soilBottom = mesh(new THREE.CircleGeometry(R * 0.84, 72), soft("#E8D8C4"), false);
      soilBottom.rotation.x = Math.PI / 2; soilBottom.position.y = -0.5; world.add(soilBottom);
      const cloudMat = new THREE.MeshStandardMaterial({ color: "#FFFFFF", roughness: 1, emissive: "#FFFFFF", emissiveIntensity: 0.25 });
      disposables.push(cloudMat);
      const puffs = 14 + garden.level.level * 3;
      for (let i = 0; i < puffs; i++) {
        const a = (i / puffs) * Math.PI * 2 + (i % 2) * 0.2;
        const ring = i % 3 === 0 ? 0.45 : 0.82;
        const r = 0.52 + ((i * 37) % 10) / 26;
        const puff = mesh(new THREE.SphereGeometry(r, 28, 20), cloudMat);
        puff.position.set(Math.cos(a) * R * ring * 0.92, -0.6 - r * 0.35 - ((i * 13) % 5) / 18, Math.sin(a) * R * ring * 0.92);
        puff.scale.y = 0.62;
        world.add(puff);
      }
      const belly = mesh(new THREE.SphereGeometry(R * 0.7, 36, 24), cloudMat);
      belly.position.y = -1.0; belly.scale.set(1, 0.42, 1);
      world.add(belly);
      const topY = (r: number) => 0.4 * (1 - (r / R) ** 2) + 0.02;
      // 풀 무더기·조약돌도 둥글게
      for (let k = 0; k < 22 + garden.level.level * 6; k++) {
        const r = Math.sqrt((k * 0.618) % 1) * R * 0.95;
        const a = k * 2.1;
        if (r < 1.3) continue;
        const pebble = k % 5 === 0;
        const bit = mesh(new THREE.SphereGeometry(pebble ? 0.07 + (k % 3) * 0.02 : 0.08, 14, 10), soft(pebble ? tone("#D8CDBD", 0.3) : look.grass2), false);
        bit.position.set(Math.cos(a) * r, topY(r) + 0.02, Math.sin(a) * r);
        bit.scale.set(1.2, pebble ? 0.7 : 0.6, 1);
        world.add(bit);
      }

      // ── 식물: 매끈한 공으로 만든 나무·꽃·이끼·열매·버섯 ──
      const sway: { obj: InstanceType<typeof THREE.Object3D>; phase: number }[] = [];
      const ball = (r: number, hex: string, segs = 24) => mesh(new THREE.SphereGeometry(r, segs, Math.round(segs * 0.7)), soft(hex));
      const makePlant = (p: Plant) => {
        const g = new THREE.Group();
        const tint = p.sky ? SKY_LOOK[p.sky].tint : "#FFE3EF";
        const accent = tone(p.sky ? SKY_LOOK[p.sky].ink : "#E5719A", 0.45);
        switch (p.topic) {
          case "work": {
            const trunk = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 12), soft("#D6B899"));
            trunk.position.y = 0.25; g.add(trunk);
            const c1 = ball(0.36, look.leaf); c1.position.y = 0.72; g.add(c1);
            const c2 = ball(0.26, look.leaf); c2.position.set(-0.22, 0.6, 0.1); g.add(c2);
            const c3 = ball(0.24, look.leaf); c3.position.set(0.22, 0.64, -0.06); g.add(c3);
            const c4 = ball(0.2, tint); c4.position.set(0.1, 0.98, 0.06); g.add(c4);
            break;
          }
          case "people": {
            const stem = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.45, 8), soft("#A8D8B3"));
            stem.position.y = 0.22; g.add(stem);
            const leaf = ball(0.08, look.leaf, 14); leaf.scale.set(1.6, 0.45, 0.8); leaf.position.set(0.08, 0.2, 0); g.add(leaf);
            for (let k = 0; k < 5; k++) {
              const petal = ball(0.085, tint, 16);
              const a = (k / 5) * Math.PI * 2;
              petal.position.set(Math.cos(a) * 0.1, 0.48, Math.sin(a) * 0.1);
              petal.scale.set(1, 0.6, 1); g.add(petal);
            }
            const center = ball(0.055, accent, 14); center.position.y = 0.5; g.add(center);
            break;
          }
          case "rest": {
            for (let k = 0; k < 4; k++) {
              const moss = ball(0.14 + k * 0.02, k % 2 ? look.leaf : tint, 18);
              moss.position.set(Math.cos(k * 1.7) * 0.12, 0.05, Math.sin(k * 1.7) * 0.12);
              moss.scale.y = 0.5; g.add(moss);
            }
            break;
          }
          case "likes": {
            const bush = ball(0.3, look.leaf); bush.position.y = 0.24; bush.scale.y = 0.85; g.add(bush);
            for (let k = 0; k < 4; k++) {
              const fruit = ball(0.065, accent, 14);
              const a = k * 1.6;
              fruit.position.set(Math.cos(a) * 0.24, 0.26 + (k % 2) * 0.1, Math.sin(a) * 0.24); g.add(fruit);
            }
            break;
          }
          default: {
            const stem = mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.22, 14), soft("#FBF3EA"));
            stem.position.y = 0.11; g.add(stem);
            const cap = mesh(new THREE.SphereGeometry(0.2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), soft(tone(tint, -0.15)));
            cap.position.y = 0.2; cap.scale.y = 0.75; g.add(cap);
            for (let k = 0; k < 3; k++) {
              const dot = ball(0.03, "#FFFFFF", 10);
              const a = k * 2.1;
              dot.position.set(Math.cos(a) * 0.1, 0.31, Math.sin(a) * 0.1); g.add(dot);
            }
          }
        }
        const jitter = 0.9 + ((p.date.charCodeAt(p.date.length - 1) * 7) % 20) / 100;
        return { g, jitter };
      };
      // 키 큰 나무는 바깥쪽에 심어 몽글이를 가리지 않게 하고, 식물이 많을수록 조금씩 작게 그린다.
      const shown = [...garden.plants.slice(-32)].sort((a, b) => Number(a.topic === "work") - Number(b.topic === "work"));
      const crowd = 0.55 + 0.45 * Math.min(1, 12 / Math.max(12, shown.length));
      let placed = 0;
      for (let i = 0; placed < shown.length && i < shown.length * 4; i++) {
        const r = Math.sqrt((i + 0.6) / (shown.length * 1.4 + 2)) * R * 0.9;
        if (r < 1.9) continue; // 가운데는 몽글이 자리
        const a = i * 2.39996;
        const p = shown[placed];
        const { g, jitter } = makePlant(p);
        g.scale.setScalar((p.stage === 3 ? 1.15 : p.stage === 2 ? 0.92 : 0.65) * 1.4 * jitter * crowd);
        g.position.set(Math.cos(a) * r, topY(r), Math.sin(a) * r);
        g.rotation.y = a;
        world.add(g);
        sway.push({ obj: g, phase: i * 0.7 });
        placed++;
      }

      // ── 몽글이: 홈의 2D 그림을 그대로 섬 위에 세운다 ──
      const buddySize = 3.4 + garden.level.level * 0.15;
      let buddy: InstanceType<typeof THREE.Sprite> | null = null;
      if (buddyCanvas) {
        const tex = new THREE.CanvasTexture(buddyCanvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, alphaTest: 0.02 });
        disposables.push(tex, spriteMat);
        buddy = new THREE.Sprite(spriteMat);
        buddy.scale.set(buddySize, buddySize, 1);
        // 그림 안에서 몸 아랫선이 아래에서 30% 지점에 있어, 그만큼 띄워 섬 위에 앉힌다.
        buddy.position.set(0, topY(0) + buddySize * 0.2 + 0.05, 0.2);
        world.add(buddy);
      }
      const shadowCanvas = document.createElement("canvas");
      shadowCanvas.width = shadowCanvas.height = 64;
      const sctx = shadowCanvas.getContext("2d")!;
      const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, "rgba(60,70,120,.22)"); grad.addColorStop(1, "rgba(60,70,120,0)");
      sctx.fillStyle = grad; sctx.fillRect(0, 0, 64, 64);
      const shadowTex = new THREE.CanvasTexture(shadowCanvas);
      const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
      disposables.push(shadowTex, shadowMat);
      const contact = mesh(new THREE.PlaneGeometry(buddySize * 0.8, buddySize * 0.42), shadowMat, false);
      contact.rotation.x = -Math.PI / 2; contact.position.set(0, topY(0) + 0.012, 0.2);
      world.add(contact);

      // ── 내리는 것: 비, 꽃잎·낙엽·눈·반짝임 ──
      const isRain = weather === "rain" || weather === "thunder";
      const fallCount = isRain ? 140 : 60;
      const fallPos = new Float32Array(fallCount * 3);
      for (let k = 0; k < fallCount; k++) { fallPos[k * 3] = (Math.random() - 0.5) * 9; fallPos[k * 3 + 1] = Math.random() * 5; fallPos[k * 3 + 2] = (Math.random() - 0.5) * 7; }
      const fallGeo = new THREE.BufferGeometry();
      fallGeo.setAttribute("position", new THREE.BufferAttribute(fallPos, 3));
      const fallMat = new THREE.PointsMaterial({ color: isRain ? "#A9BFEF" : look.fall, size: isRain ? 0.07 : look.kind === "snow" ? 0.13 : 0.11, transparent: true, opacity: isRain ? 0.75 : 0.95, depthWrite: false });
      disposables.push(fallGeo, fallMat);
      scene.add(new THREE.Points(fallGeo, fallMat));

      // ── 그리기 ──
      const resize = () => {
        const w = host.clientWidth, h = host.clientHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = `${w}px`; renderer.domElement.style.height = `${h}px`;
        camera.aspect = w / h; camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      let visible = true;
      const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
      io.observe(host);

      const clock = new THREE.Clock();
      let raf = 0;
      const buddyBase = buddy?.position.y ?? 0;
      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (!visible) return;
        const t = clock.getElapsedTime();
        controls.update();
        if (!reduce) {
          if (buddy) buddy.position.y = buddyBase + Math.sin(t * 1.6) * 0.05;
          world.position.y = Math.sin(t * 0.7) * 0.05;
          for (const s of sway) s.obj.rotation.z = Math.sin(t * 1.3 + s.phase) * 0.05;
          const pos = fallGeo.attributes.position as InstanceType<typeof THREE.BufferAttribute>;
          for (let k = 0; k < fallCount; k++) {
            let y = pos.getY(k) - (isRain ? 0.09 : look.kind === "glint" ? 0 : 0.012);
            let x = pos.getX(k) + (weather === "wind" ? 0.03 : look.kind === "glint" ? 0 : Math.sin(t + k) * 0.004);
            if (y < -0.5) y = 5;
            if (x > 4.5) x = -4.5;
            pos.setXY(k, x, y);
          }
          pos.needsUpdate = true;
          if (look.kind === "glint" && !isRain) fallMat.opacity = 0.55 + Math.sin(t * 3) * 0.4;
        }
        renderer.render(scene, camera);
        if (reduce) cancelAnimationFrame(raf); // 동작 줄이기: 한 장면만
      };
      frame();
      if (reduce) controls.addEventListener("change", () => renderer.render(scene, camera));

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect(); io.disconnect(); controls.dispose();
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => { disposed = true; cleanup(); };
    // 식물·레벨·날씨·계절·몽글이 모습이 바뀌면 장면을 다시 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantsKey, garden.level.level, season, weather, color, shape, accessory]);

  return (
    <div ref={hostRef} className={`relative aspect-[4/3] w-full overflow-hidden ${transparent ? "" : "rounded-r5"}`} style={transparent ? undefined : { background: SKY_GRADIENT[weather ?? "none"] }} role="img" aria-label={`3D 구름 정원: ${garden.level.name}, 식물 ${garden.plants.length}개`}>
      {/* 섬 위에 세울 2D 몽글이 원본. 화면에는 보이지 않고 그림으로만 옮긴다. */}
      <div ref={buddyRef} hidden><Buddy shape={shape} color={color} accessory={accessory} size={320} look={[0, 0.15]} /></div>
    </div>
  );
}
