// 홈 고양이 쓰다듬기(2026-11-17, 사용자 요청).
// - 쓰다듬기(고양이 위를 손가락으로 쓸기): 손끝에서 '골골'이 떠오른다. 충분히 쓰다듬으면 식빵 자세로 골골거린다.
// - 누르기: 자고 있으면 조용히 깨기만 한다. 눈 깜박임(느린 눈인사·실눈)·혼잣말·귀 털기는 어색해서 뺐다.
// 사용자의 손짓으로만 움직이고 대화 내용은 보지 않는다. 표정을 바꾸지 않는다.

/** 이만큼 넘게 움직이면 누르기가 아니라 쓰다듬기로 본다(CSS px). */
export const STROKE_START_PX = 14;
/** 이 시간보다 오래 누르고 있다 떼면 누르기로 보지 않는다(ms). */
export const TAP_MAX_MS = 600;
/** 쓸어 간 거리 이만큼마다 '골골'을 하나 띄운다(px). */
export const PURR_EVERY_PX = 46;
/** 쓰다듬은 거리가 이만큼 쌓이면 식빵 자세로 골골거린다(px). */
export const LOAF_AFTER_PX = 700;
export const LOAF_MS = 3400;

export type Gesture = "tap" | "stroke" | "none";

/** 손을 뗐을 때 무엇이었는지. 쓸어 간 거리(moved)와 누른 시간(ms)으로만 판단한다. */
export function classifyGesture(moved: number, ms: number): Gesture {
  if (moved > STROKE_START_PX) return "stroke";
  if (ms <= TAP_MAX_MS) return "tap";
  return "none";
}

/** 쓸어 간 거리가 늘었을 때 새로 띄울 '골골' 개수. */
export function purrsBetween(before: number, after: number): number {
  return Math.max(0, Math.floor(after / PURR_EVERY_PX) - Math.floor(before / PURR_EVERY_PX));
}
