// 고양이 포즈: 기본(Buddy 그림)과 동작 영상·그림. 모두 같은 키·같은 바닥선으로 맞춰 바꿔 끼운다.
// 크기는 "앉은 키" 기준이다. Buddy 칸(정사각형)에서 고양이 키는 칸의 70.3%, 바닥선은 위에서 85.4%다.
// 영상은 public/characters/motion/에 있고, Magnific으로 뽑은 영상에서 배경을 지우고 처음·끝을 겹쳐 반복되게 만든 것이다.
// 앱 상태와 사용자의 조작(누르기·고르기·기다리기)으로만 바꾸고, 대화 내용으로 고르지 않는다.

// 하품(yawn)·앞발 툭(swat)·배 보이기(belly)·덮칠 준비(ready) 영상은 public/characters/motion/에 남겨 두지만
// 지금 쓰는 장면이 없어 목록에서 뺐다(미리 받지 않게).
export type CatPose = "base" | "round" | "grumble" | "purr" | "sleep" | "glare" | "hiss" | "groom";
export type CatFx = "hop" | "tilt" | "shake";
export type ReactionStep = readonly [CatPose, number, CatFx?];

// rel·relW: 앉은 키 대비 높이·너비, drop: 바닥선 아래로 내려가는 양, shadow: 바닥 그림자 너비(앉은 키 대비)
type PoseArt = { src: string; clip: boolean; rel: number; relW: number; drop: number; shadow: number };

export const CAT_SIT = 0.703;
export const CAT_GROUND = 0.854;

// 영상은 모두 같은 창(앉은 키의 1.21배 높이, 1.566배 너비)으로 잘랐다.
const clip = (name: string, shadow: number): PoseArt => ({ src: `/characters/motion/${name}.webp`, clip: true, rel: 1.21, relW: 1.566, drop: 0.0587, shadow });
const still = (name: string, rel: number, relW: number): PoseArt => ({ src: `/characters/motion/${name}.webp`, clip: false, rel, relW, drop: 0, shadow: relW });

export const CAT_POSE_ART: Record<Exclude<CatPose, "base">, PoseArt> = {
  round: still("round", 1, 0.7448), // 눈이 동그래진 앉은 자세: 깜짝 놀랄 때, 흥미로운 걸 발견했을 때
  grumble: still("grumble", 0.9059, 0.8468), // 귀찮다는 듯 울기
  purr: still("purr", 0.6315, 0.9618), // 식빵 자세로 실눈 골골
  sleep: clip("sleep", 1.06),
  glare: clip("glare", 1.25),
  hiss: clip("hiss", 1),
  groom: clip("groom", 0.72),
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

/** 몸은 같고 눈만 다른 두 자세는 눌림 없이 겹치기만 해서, 눈만 바뀌는 것처럼 보이게 한다. */
export function isSoftSwap(a: CatPose, b: CatPose) {
  return (a === "base" && b === "round") || (a === "round" && b === "base");
}

export const TAP_WINDOW_MS = 1300;

/** 고양이를 눌렀을 때의 반응. 자고 있으면 째려보며 깨고, 연달아 세 번이면 하악, 그 밖에는 깜짝 놀랐다가 귀찮다는 듯 운다. */
export function tapReaction(rest: CatPose, recentTaps: number): ReactionStep[] {
  if (rest === "sleep") return [["glare", 1800]];
  if (recentTaps >= 3) return [["hiss", 1900, "shake"]];
  return [["round", 900, "hop"], ["grumble", 1300]];
}

/** 흥미로운 걸 발견했을 때: 눈이 동그래지고 고개를 살짝 기울인 채 잠깐 빤히 본다. */
export const NOTICE: ReactionStep[] = [["round", 1500, "tilt"]];
