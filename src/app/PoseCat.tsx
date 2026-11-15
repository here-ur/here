"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import Buddy from "./Buddy";
import CatArtwork from "./CatArtwork";
import { CAT_POSE_ART, isSoftSwap, poseBox, type CatFx, type CatPose } from "@/lib/cat-poses";
import "./pose-cat.css";

type BuddyProps = Omit<ComponentProps<typeof Buddy>, "size">;

const SQUASH = [{ transform: "scale(1, 1)" }, { transform: "scale(1.06, .9)" }];
const POP = [{ transform: "scale(1.06, .9)" }, { transform: "scale(.96, 1.05)", offset: .45 }, { transform: "scale(1.01, .99)", offset: .75 }, { transform: "scale(1, 1)" }];
const SOFT = [{ transform: "scale(1, 1)" }, { transform: "translateY(-2%) scale(1.02, 1.01)", offset: .4 }, { transform: "scale(1, 1)" }];
const HOP = [{ transform: "scale(1, 1)" }, { transform: "translateY(-7%) scale(.96, 1.05)", offset: .4 }, { transform: "scale(1.03, .97)", offset: .75 }, { transform: "scale(1, 1)" }];
const TILT = [{ transform: "none" }, { transform: "translateY(-2%) rotate(-4deg)", offset: .22 }, { transform: "rotate(-4deg)", offset: .82 }, { transform: "none" }];
const SHAKE = [{ transform: "translateX(0)" }, { transform: "translateX(-2%)" }, { transform: "translateX(2%)" }, { transform: "translateX(-1.2%)" }, { transform: "translateX(0)" }];

const REDUCE = "(prefers-reduced-motion: reduce)";
// CatArtwork가 그리는 하품 그림. Buddy(CatFace)의 black-cat-final.png와 같은 고양이·같은 좌표(3396×1852 기준)다.
const YAWN_ART = "/home/main-cat.png";
const subscribeReduce = (onChange: () => void) => {
  const query = matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** 고양이 한 칸(정사각형). 기본 자세는 Buddy(눈 깜박임·입 모양), 동작은 영상·그림을 바꿔 끼운다.
 * 바꿀 때는 살짝 눌렸다가 그 순간 바꾸고(140ms 겹치기) 통 튀어 오른다. 기본↔동그란 눈은 눈만 바뀌게 겹치기만 한다.
 * fx는 바꾼 뒤 한 번 더 하는 몸짓(hop 깜짝, tilt 갸웃, shake 하악)이고, cue가 바뀌면 같은 자세에서도 다시 한다.
 * 처음 그릴 때와 동작 줄이기에서는 움직임 없이 바로 바꾼다. 동작 줄이기에서는 계속 반복되는 영상 자세(잠·째려보기·하악·발 핥기)도
 * 기본 자세(Buddy, 반복 모션은 CSS가 끈다)로 대신하고, 멈춘 그림(동그란 눈·울기·골골)만 바꿔 끼운다. 설정을 바꾸면 바로 따라간다. */
export default function PoseCat({ pose, fx, cue = 0, buddy, size = 240, preload, yawning }: {
  pose: CatPose; fx?: CatFx; cue?: number; buddy?: BuddyProps; size?: number;
  /** 미리 받아 둘 자세. 없으면 전부 받는다. 영상은 하나에 1MB 가까이 되어, 로그인 전처럼 몇 개만 쓰는 화면은 줄여 둔다. */
  preload?: readonly CatPose[];
  /** 음성을 열기 직전의 하품(dev #39, cat-yawn.ts). 켜져 있는 동안만 기본 자세 대신 같은 그림을 움직이는 CatArtwork로 바꿔 끼운다.
   * 홈처럼 하품을 쓰는 곳만 넘기고(undefined면 하품 칸을 만들지 않는다), 하품 시간은 부르는 쪽(waitForCatYawn)이 정한다. */
  yawning?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const imgA = useRef<HTMLImageElement>(null);
  const imgB = useRef<HTMLImageElement>(null);
  const run = useRef({ shown: "base" as CatPose, front: 0, first: true, latest: 0, queue: Promise.resolve(), key: "" });
  // 바뀔 때 다시 그리기만 하는 값이다. 실제로 줄일지는 바꾸는 그 순간의 설정을 다시 읽어 정한다(첫 화면에서 서버 값과 어긋나지 않게).
  const reduced = useSyncExternalStore(subscribeReduce, () => matchMedia(REDUCE).matches, () => false);

  // 바꿔 끼울 때는 한쪽만 흐리게 한다. 시작: 하품 그림을 바로 위에 띄우고 기본 자세는 그 밑에서 사라진다.
  // 끝: 기본 자세를 바로 밑에 되살리고 하품 그림만 흐려지며 사라진다. 그동안(220ms) 하품 그림을 붙여 둔다(pose-cat.css).
  const usesYawn = yawning !== undefined;
  const [lastYawn, setLastYawn] = useState(Boolean(yawning));
  const [yawnLinger, setYawnLinger] = useState(false);
  if (lastYawn !== Boolean(yawning)) { setLastYawn(Boolean(yawning)); setYawnLinger(!yawning); }
  useEffect(() => {
    if (!yawnLinger) return;
    const timer = window.setTimeout(() => setYawnLinger(false), 220);
    return () => window.clearTimeout(timer);
  }, [yawnLinger]);
  // 하품 그림(같은 고양이를 반 크기로 뽑은 투명 PNG)은 미리 받아 두어, 누르자마자 첫 장면이 비지 않게 한다.
  useEffect(() => { if (usesYawn) { const img = new Image(); img.src = YAWN_ART; } }, [usesYawn]);

  const preloadList = preload?.join(",");
  useEffect(() => {
    const poses = preloadList === undefined ? Object.keys(CAT_POSE_ART) : preloadList.split(",");
    // 동작 줄이기에서는 영상 자세를 보여 주지 않으니 받지 않는다. 첫 화면(서버 값 false)에서도 맞게 지금 설정을 읽는다.
    const reduce = matchMedia(REDUCE).matches;
    for (const name of poses) {
      const art = CAT_POSE_ART[name as Exclude<CatPose, "base">];
      if (art && !(reduce && art.clip)) { const img = new Image(); img.src = art.src; }
    }
  }, [preloadList, reduced]);

  useEffect(() => {
    const s = run.current;
    // 바꾸는 동안(화면이 가려져 애니메이션이 멈춘 때 포함) 다음 요청이 오면, 밀린 요청은 건너뛰고 마지막 것만 보여 준다.
    const token = ++s.latest;
    // 동작 줄이기 설정만 바뀐 경우에는 자세만 다시 맞추고, 몸짓(fx)은 되풀이하지 않는다.
    const key = `${pose}|${fx ?? ""}|${cue}`;
    const replay = key !== s.key;
    s.key = key;
    async function swap(want: CatPose, effect?: CatFx) {
      const box = root.current, el = body.current, layer = base.current, ground = shadow.current, a = imgA.current, b = imgB.current;
      if (!box || !el || !layer || !ground || !a || !b || token !== s.latest) return;
      const reduce = matchMedia(REDUCE).matches;
      const still = s.first || reduce;
      const next: CatPose = reduce && want !== "base" && CAT_POSE_ART[want].clip ? "base" : want;
      s.first = false;
      const prev = s.shown;
      if (next === prev && !effect) return;
      const soft = isSoftSwap(prev, next);
      if (next !== prev) {
        if (!still && !soft) await el.animate(SQUASH, { duration: 110, easing: "ease-in", fill: "forwards" }).finished;
        const imgs = [a, b], front = imgs[s.front], back = imgs[1 - s.front];
        if (next === "base") {
          layer.style.opacity = "1"; front.style.opacity = "0"; back.style.opacity = "0";
        } else {
          // 기본 고양이가 걷다가 옆으로 비켜 있으면, 그림도 그만큼 옮겨 같은 자리에서 바뀌게 한다(Buddy는 240 단위 좌표).
          if (prev === "base") {
            const walked = /translateX\((-?[\d.]+)px\)/.exec(layer.querySelector<SVGGElement>(".cat-travel")?.style.transform ?? "");
            el.style.setProperty("--pose-x", `${walked ? (Number(walked[1]) / 240) * 100 : 0}%`);
          }
          const place = poseBox(next);
          back.src = CAT_POSE_ART[next].src;
          back.style.height = `${place.height}%`; back.style.width = `${place.width}%`; back.style.bottom = `${place.bottom}%`;
          ground.style.width = `${place.shadow}%`;
          await back.decode().catch(() => {});
          back.style.opacity = "1"; front.style.opacity = "0"; layer.style.opacity = "0";
          s.front = 1 - s.front;
        }
        box.dataset.kind = next === "base" ? "base" : CAT_POSE_ART[next].clip ? "clip" : "still";
        s.shown = next;
      }
      if (still) { el.getAnimations().forEach((anim) => anim.cancel()); return; }
      const moves = effect === "tilt" ? TILT : effect === "hop" ? HOP : soft ? SOFT : next !== prev ? POP : null;
      if (moves) await el.animate(moves, { duration: effect === "tilt" ? 1400 : effect === "hop" ? 480 : 380, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" }).finished;
      if (effect === "shake") await el.animate(SHAKE, { duration: 320, easing: "linear" }).finished;
    }
    s.queue = s.queue.then(() => swap(pose, replay ? fx : undefined)).catch(() => {});
  }, [pose, fx, cue, reduced]);

  return (
    <div ref={root} className="pose-cat" data-kind="base" data-yawning={yawning || undefined} data-yawn-linger={(!yawning && yawnLinger) || undefined}>
      <div ref={body} className="pose-cat__body">
        <span ref={shadow} className="pose-cat__shadow" aria-hidden="true" />
        <div ref={base} className="pose-cat__base"><Buddy size={size} groundShadow {...buddy} /></div>
        <div className="pose-cat__breath">
          {/* eslint-disable-next-line @next/next/no-img-element -- 움직이는 WebP를 그대로 바꿔 끼운다(최적화 대상 아님) */}
          <img ref={imgA} className="pose-cat__img" alt="" decoding="async" style={{ opacity: 0 }} />
          {/* eslint-disable-next-line @next/next/no-img-element -- 위와 같음 */}
          <img ref={imgB} className="pose-cat__img" alt="" decoding="async" style={{ opacity: 0 }} />
        </div>
      </div>
      {/* 하품 칸은 동작 바꿈(눌림·튀기)이 움직이는 몸 칸 밖에 둔다. 하품하는 동안 몸은 가만히 있어야 한다. */}
      {usesYawn && <div className="pose-cat__yawn" aria-hidden="true">
        {(yawning || yawnLinger) && <div className="pose-cat__yawn-art"><CatArtwork state="yawning" accessory={buddy?.accessory} /></div>}
      </div>}
    </div>
  );
}
