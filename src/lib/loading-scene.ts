// 고양이 로딩 장면의 규칙(로딩 화면 시안 기준, 팀 확인 전).
// - 0.4초 안에 끝나면 아무것도 띄우지 않는다(짧게 번쩍이는 화면이 없게).
// - 0.4–8초는 상황에 맞는 장면 하나를 글자 없이 반복한다.
// - 8초가 넘으면 처음으로 한 줄(연결이 느려요)과 다시 시도·로그아웃이 나온다.
// - 한 흐름(로그인 확인 → 설정 불러오기 → 홈) 안에서는 장면을 바꾸지 않는다: 앞 로딩이 끝나자마자 이어지는 로딩은 같은 고양이를 이어 쓴다.

export const LOADING_SHOW_AFTER_MS = 400;
export const LOADING_SLOW_AFTER_MS = 8000;
/** 앞 로딩 화면이 사라진 뒤 이 시간 안에 다음 로딩 화면이 뜨면 같은 흐름으로 본다. */
export const LOADING_SAME_FLOW_MS = 1500;

export type LoadingScene = "nap" | "groom" | "yawn";
export type LoadingPhase = "hidden" | "waiting" | "slow";

/** 기다린 시간에 따른 단계. 느릴 때 나갈 길(다시 시도·로그아웃)이 없으면 8초가 넘어도 장면만 계속 보여 준다. */
export function loadingPhase(elapsedMs: number, canEscape: boolean, continued = false): LoadingPhase {
  if (canEscape && elapsedMs >= LOADING_SLOW_AFTER_MS) return "slow";
  if (continued || elapsedMs >= LOADING_SHOW_AFTER_MS) return "waiting";
  return "hidden";
}

export type LastLoading = { scene: LoadingScene; endedAt: number };

/** 이어지는 로딩이면 앞 장면을 그대로 쓴다. */
export function continuedScene(wanted: LoadingScene, last: LastLoading | null, now: number): { scene: LoadingScene; continued: boolean } {
  if (last && now - last.endedAt >= 0 && now - last.endedAt < LOADING_SAME_FLOW_MS) return { scene: last.scene, continued: true };
  return { scene: wanted, continued: false };
}
