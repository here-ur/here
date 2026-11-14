"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import Buddy from "./Buddy";
import { CAT_POSE_ART, isSoftSwap, poseBox, type CatFx, type CatPose } from "@/lib/cat-poses";
import "./pose-cat.css";

type BuddyProps = Omit<ComponentProps<typeof Buddy>, "size">;

const SQUASH = [{ transform: "scale(1, 1)" }, { transform: "scale(1.06, .9)" }];
const POP = [{ transform: "scale(1.06, .9)" }, { transform: "scale(.96, 1.05)", offset: .45 }, { transform: "scale(1.01, .99)", offset: .75 }, { transform: "scale(1, 1)" }];
const SOFT = [{ transform: "scale(1, 1)" }, { transform: "translateY(-2%) scale(1.02, 1.01)", offset: .4 }, { transform: "scale(1, 1)" }];
const HOP = [{ transform: "scale(1, 1)" }, { transform: "translateY(-7%) scale(.96, 1.05)", offset: .4 }, { transform: "scale(1.03, .97)", offset: .75 }, { transform: "scale(1, 1)" }];
const TILT = [{ transform: "none" }, { transform: "translateY(-2%) rotate(-4deg)", offset: .22 }, { transform: "rotate(-4deg)", offset: .82 }, { transform: "none" }];
const SHAKE = [{ transform: "translateX(0)" }, { transform: "translateX(-2%)" }, { transform: "translateX(2%)" }, { transform: "translateX(-1.2%)" }, { transform: "translateX(0)" }];

/** 고양이 한 칸(정사각형). 기본 자세는 Buddy(눈 깜박임·입 모양), 동작은 영상·그림을 바꿔 끼운다.
 * 바꿀 때는 살짝 눌렸다가 그 순간 바꾸고(140ms 겹치기) 통 튀어 오른다. 기본↔동그란 눈은 눈만 바뀌게 겹치기만 한다.
 * fx는 바꾼 뒤 한 번 더 하는 몸짓(hop 깜짝, tilt 갸웃, shake 하악)이고, cue가 바뀌면 같은 자세에서도 다시 한다.
 * 처음 그릴 때와 동작 줄이기에서는 움직임 없이 바로 바꾼다. */
export default function PoseCat({ pose, fx, cue = 0, buddy, size = 240, preload }: {
  pose: CatPose; fx?: CatFx; cue?: number; buddy?: BuddyProps; size?: number;
  /** 미리 받아 둘 자세. 없으면 전부 받는다. 영상은 하나에 1MB 가까이 되어, 로그인 전처럼 몇 개만 쓰는 화면은 줄여 둔다. */
  preload?: readonly CatPose[];
}) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const imgA = useRef<HTMLImageElement>(null);
  const imgB = useRef<HTMLImageElement>(null);
  const run = useRef({ shown: "base" as CatPose, front: 0, first: true, latest: 0, queue: Promise.resolve() });

  const preloadList = preload?.join(",");
  useEffect(() => {
    const poses = preloadList === undefined ? Object.keys(CAT_POSE_ART) : preloadList.split(",");
    for (const name of poses) {
      const art = CAT_POSE_ART[name as Exclude<CatPose, "base">];
      if (art) { const img = new Image(); img.src = art.src; }
    }
  }, [preloadList]);

  useEffect(() => {
    const s = run.current;
    // 바꾸는 동안(화면이 가려져 애니메이션이 멈춘 때 포함) 다음 요청이 오면, 밀린 요청은 건너뛰고 마지막 것만 보여 준다.
    const token = ++s.latest;
    async function swap(next: CatPose, effect?: CatFx) {
      const box = root.current, el = body.current, layer = base.current, ground = shadow.current, a = imgA.current, b = imgB.current;
      if (!box || !el || !layer || !ground || !a || !b || token !== s.latest) return;
      const still = s.first || matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    s.queue = s.queue.then(() => swap(pose, fx)).catch(() => {});
  }, [pose, fx, cue]);

  return (
    <div ref={root} className="pose-cat" data-kind="base">
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
    </div>
  );
}
