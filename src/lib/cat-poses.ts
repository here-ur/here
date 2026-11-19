// 고양이 포즈: 기본(Buddy 그림)과 동작 영상·그림. 모두 같은 키·같은 바닥선으로 맞춰 바꿔 끼운다.
// 크기는 "앉은 키" 기준이다. Buddy 칸(정사각형)에서 고양이 키는 칸의 70.3%, 바닥선은 위에서 85.4%다.
// 영상은 public/characters/motion/에 있고, Magnific으로 뽑은 영상에서 배경을 지우고 처음·끝을 겹쳐 반복되게 만든 것이다.
// 앱 상태와 사용자의 조작(누르기·고르기·기다리기)으로만 바꾸고, 대화 내용으로 고르지 않는다.

// 하품(yawn)·앞발 툭(swat)·배 보이기(belly)·덮칠 준비(ready) 영상은 public/characters/motion/에 남겨 두지만
// 지금 쓰는 장면이 없어 목록에서 뺐다(미리 받지 않게).
export type CatPose = "base" | "purr" | "sleep" | "glare" | "hiss" | "groom";
export type CatFx = "hop" | "tilt" | "shake";
export type ReactionStep = readonly [CatPose, number, CatFx?];

// rel·relW: 앉은 키 대비 높이·너비, drop: 바닥선 아래로 내려가는 양, shadow: 바닥 그림자 너비(앉은 키 대비)
// tone: 털 밝기를 기본 그림(main-cat.png, 털 평균 밝기 43.8)에 맞추는 배율. 영상·그림마다 털이 12~36% 어두워서,
// 바꿔 끼울 때마다 고양이가 어두워졌다 밝아지는(빛나 보이는) 것을 막는다. 값 = 43.8 / 그 파일의 털 평균 밝기(2026-11-17 측정).
type PoseArt = { src: string; clip: boolean; rel: number; relW: number; drop: number; shadow: number; tone: number };

export const CAT_SIT = 0.703;
export const CAT_GROUND = 0.854;

// 영상은 모두 같은 창(앉은 키의 1.21배 높이, 1.566배 너비)으로 잘랐다.
const clip = (name: string, shadow: number, tone = 1): PoseArt => ({ src: `/characters/motion/${name}.webp`, clip: true, rel: 1.21, relW: 1.566, drop: 0.0587, shadow, tone });
const still = (name: string, rel: number, relW: number, tone = 1): PoseArt => ({ src: `/characters/motion/${name}.webp`, clip: false, rel, relW, drop: 0, shadow: relW, tone });

export const CAT_POSE_ART: Record<Exclude<CatPose, "base">, PoseArt> = {
  purr: still("purr", 0.6315, 0.9618, 1.22), // 식빵 자세로 실눈 골골
  sleep: clip("sleep", 1.06),
  glare: clip("glare", 1.25, 1.36),
  hiss: clip("hiss", 1, 1.25),
  groom: clip("groom", 0.72, 1.2),
};

/** 칸 안에서 그림이 차지할 자리(%). 칸은 정사각형이라 높이·너비 모두 칸 크기 기준이다. */
export function poseBox(pose: Exclude<CatPose, "base">) {
  const art = CAT_POSE_ART[pose];
  return {
    height: art.rel * CAT_SIT * 100,
    width: art.relW * CAT_SIT * 100,
    bottom: (1 - CAT_GROUND - art.drop * CAT_SIT) * 100,
    shadow: art.shadow * CAT_SIT * 78,
  };
}

export const TAP_WINDOW_MS = 1300;

/** 고양이를 눌렀을 때의 반응. 자고 있으면 째려보며 깨고, 연달아 세 번이면 하악, 일반 클릭에는 외형을 바꾸지 않는다. */
export function tapReaction(rest: CatPose, recentTaps: number): ReactionStep[] {
  if (rest === "sleep") return [["glare", 1800]];
  if (recentTaps >= 3) return [["hiss", 1900, "shake"]];
  return [];
}
