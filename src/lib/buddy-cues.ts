// 몽글이 상태가 바뀌는 순간에 한 번만 붙이는 짧은 연결 동작. 앱 상태만 보고, 대화 내용으로 감정을 추측하지 않는다.
// 이름은 buddy-motion.css의 data-cue 값과 같다.
export type CueState = "idle" | "attentive" | "listening" | "thinking" | "speaking";
export type TransitionCue = "press" | "hop" | "lift" | "pop" | "lean" | "settle";

const CUES: Partial<Record<`${CueState}-${CueState}`, TransitionCue>> = {
  "idle-attentive": "press", // 입력창 쪽으로 몸을 숙일 때 살짝 눌렸다 펴진다
  "attentive-thinking": "hop", // 보내는 순간 말풍선 쪽으로 몸을 살짝 튀긴다
  "idle-thinking": "lift",
  "listening-thinking": "lift", // 끄덕임을 멈추고 시선을 위로 옮긴다
  "thinking-speaking": "pop", // 눈을 뜨며 한 번 통 튀어 오른다
  "listening-speaking": "pop",
  "speaking-listening": "lean", // 귀 기울이듯 몸을 기울인다
};

/** 상태 전환에 붙일 동작. 기본 상태로 돌아올 때는 튀지 않고 천천히 가라앉는다(오류 포함). */
export function transitionCue(from: CueState, to: CueState): TransitionCue | null {
  if (from === to) return null;
  if (to === "idle") return "settle";
  return CUES[`${from}-${to}`] ?? null;
}
