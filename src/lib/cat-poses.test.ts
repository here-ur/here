import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CAT_POSE_ART, poseBox, tapReaction } from "./cat-poses.ts";

test("모든 포즈 파일이 있다", () => {
  for (const art of Object.values(CAT_POSE_ART)) assert.ok(existsSync(new URL(`../../public${art.src}`, import.meta.url)), art.src);
});

test("영상은 모두 같은 창이라 같은 자리에 놓인다", () => {
  // 그림자 너비만 자세마다 다르고, 자리(높이·너비·바닥)는 같다.
  const clips = Object.entries(CAT_POSE_ART).filter(([, art]) => art.clip).map(([pose]) => {
    const { height, width, bottom } = poseBox(pose as keyof typeof CAT_POSE_ART);
    return { height, width, bottom };
  });
  for (const box of clips) assert.deepEqual(box, clips[0]);
  // 영상 창의 바닥선이 Buddy 칸의 바닥선과 맞도록, 창 아래쪽은 바닥선보다 조금 아래로 내려간다.
  assert.ok(clips[0].bottom < 14.6 && clips[0].bottom > 9);
});

test("누르기: 자면 째려보며 깨고, 연달아 세 번이면 하악, 일반 클릭은 자세 유지", () => {
  assert.deepEqual(tapReaction("sleep", 1).map(([pose]) => pose), ["glare"]);
  assert.deepEqual(tapReaction("base", 3).map(([pose]) => pose), ["hiss"]);
  assert.deepEqual(tapReaction("base", 1).map(([pose]) => pose), []);
});
